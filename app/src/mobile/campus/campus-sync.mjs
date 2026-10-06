// Mobile campus sync (stage 1).
// Runs the desktop BetterBUCT JwglxtAdapter in the WebView via the browser-compatible
// AcademicApiClient, then merges results with the same mergeSyncResult used by
// the desktop SyncService. Single source of maintenance: core/ is reused
// unchanged; only the orchestration is mobile-specific.
import { AcademicApiClient } from '../../../core/academic-api-client.mjs';
import { AcademicApiFirstAdapter } from '../../../core/academic-api-adapter.mjs';
import { JwglxtAdapter } from '../../../core/adapters/jwglxt.mjs';
import { TheolAdapter } from '../../../core/adapters/theol.mjs';
import { AuthRequiredError } from '../../../core/source-client.mjs';
import { mergeSyncResult } from '../../../core/schema.mjs';
import { aggregateDomainProvenance, sourceDomainOutcome } from '../../../core/domain-provenance.mjs';
import { compactError } from '../../../core/util.mjs';

export const JWGLXT_SYNC_DOMAINS = [
  'profile',
  'terms',
  'schedule',
  'grades',
  'exams',
  'selected-courses',
  'academic-progress',
  'notices',
];

export class CampusSync {
  constructor({
    vault,
    client = null,
    credentialKeys = ['academic-api-credentials'],
    clientFactory = null,
    apiEnabled = false,
    apiCredentialKey = 'academic-api-credentials',
    apiClientFactory = null,
    theolClientFactory = null,
    clientSource = 'browser',
    requestUrl = null,
    fetchImpl = null,
    onProgress,
    onDiagnostic,
  } = {}) {
    this.vault = vault;
    this.credentialKeys = Array.isArray(credentialKeys) && credentialKeys.length
      ? [...new Set(credentialKeys)]
      : ['academic-api-credentials'];
    this.clientFactory = typeof clientFactory === 'function'
      ? clientFactory
      : (credentials) => new AcademicApiClient({
        ...credentials,
        ...(requestUrl ? { requestUrl } : {}),
        ...(fetchImpl ? { fetchImpl } : {}),
      });
    this.apiEnabled = Boolean(apiEnabled);
    this.apiCredentialKey = String(apiCredentialKey || 'academic-api-credentials');
    this.apiClientFactory = typeof apiClientFactory === 'function'
      ? apiClientFactory
      : (credentials) => new AcademicApiClient({
        ...credentials,
        ...(requestUrl ? { requestUrl } : {}),
        ...(fetchImpl ? { fetchImpl } : {}),
      });
    this.theolClientFactory = typeof theolClientFactory === 'function' ? theolClientFactory : null;
    this.clientSource = clientSource === 'academic-api' ? 'academic-api' : 'browser';
    this.onProgress = typeof onProgress === 'function' ? onProgress : () => {};
    this.onDiagnostic = typeof onDiagnostic === 'function' ? onDiagnostic : () => {};
    this.client = client;
    this.adapter = null;
    this.lastError = null;
  }

  async getApiCredentials() {
    try {
      const credentials = await this.vault?.getSecret?.(this.apiCredentialKey);
      return credentials?.username && credentials?.password ? credentials : null;
    } catch {
      return null;
    }
  }

  async createApiFirstAdapter() {
    const credentials = await this.getApiCredentials();
    if (!this.apiEnabled || !credentials) return null;

    const apiClient = await this.apiClientFactory(credentials);
    // A direct API-only login has no browser session to fall back to. When a
    // unified session is present, AcademicApiFirstAdapter can safely reuse
    // this.adapter for only the failed domains, matching the mature BetterBUCT
    // source contract without mixing the two cookie jars.
    const browserAdapter = this.clientSource === 'academic-api'
      ? { async sync() { return { errors: [], source: { connected: false }, domainOutcomes: {} }; } }
      : this.adapter;
    const adapter = new AcademicApiFirstAdapter({
      browserAdapter,
      credentialVault: { async readCredentials() { return credentials; } },
      isEnabled: () => true,
      clientFactory: () => apiClient,
      adapterFactory: (client) => new JwglxtAdapter(client, {
        academicProgressSource: 'api',
        scheduleEndpoints: [
          'kbcx/xskbcx_cxXsKb.html?gnmkdm=N2151',
          'kbcx/xskbcx_cxXsgrkb.html',
        ],
      }),
    });
    adapter.onProgress = (progress) => this.onProgress({ stage: 'jwglxt', ...progress });
    adapter.onDiagnostic = (event, fields) => this.onDiagnostic(event, fields);
    return adapter;
  }

  async getCredentials() {
    for (const key of this.credentialKeys) {
      try {
        const credentials = await this.vault?.getSecret?.(key);
        if (credentials?.username && credentials?.password) return credentials;
      } catch {
        // Try the next compatible credential slot.
      }
    }
    return null;
  }

  async hasCredentials() {
    return Boolean(await this.getCredentials());
  }

  async connect() {
    if (!this.client) {
      const credentials = await this.getCredentials();
      if (!credentials?.username || !credentials?.password) {
        throw new Error('未配置教务 API 账号或密码');
      }
      this.client = await this.clientFactory(credentials);
    }
    this.client.setDiagnostic?.((event, fields) => this.onDiagnostic(event, fields));
    this.adapter = new JwglxtAdapter(this.client, {
      onProgress: (progress) => this.onProgress(progress),
      onDiagnostic: (event, fields) => this.onDiagnostic(event, fields),
      academicProgressSource: 'api',
    });
    return this.adapter;
  }

  // Runs the desktop jwglxt sync and merges into the given state.
  // Additional adapter options (e.g. freeClassroom) pass through unchanged.
  async syncJwglxt(state, { domains = JWGLXT_SYNC_DOMAINS, ...adapterOptions } = {}) {
    if (!this.adapter) await this.connect();
    const runId = state?.sync?.runId || new Date().toISOString();
    const completedAt = new Date().toISOString();
    const apiFirstAdapter = await this.createApiFirstAdapter();
    const adapter = apiFirstAdapter || this.adapter;
    const result = await adapter.sync({ domains, includeAcademicExtras: false, ...adapterOptions });
    const domainOutcomes = result.domainOutcomes || {};
    const merged = mergeSyncResult(state, {
      ...result,
      runId,
      completedAt,
      completed: true,
      domains: aggregateDomainProvenance(state?.sync?.domains, { jwglxt: domainOutcomes }, { runId }),
      sources: {
        ...(state?.sync?.sources || {}),
        jwglxt: {
          ...(state?.sync?.sources?.jwglxt || {}),
          connected: result.source?.connected !== false,
          checkedAt: result.source?.checkedAt || completedAt,
          lastSuccessAt: result.errors?.length ? state?.sync?.sources?.jwglxt?.lastSuccessAt || null : completedAt,
          error: result.errors?.length ? result.errors.join('; ') : undefined,
        },
      },
    });
    this.lastError = result.errors?.length ? result.errors.join('; ') : null;
    return { state: merged, result };
  }

  async status() {
    if (!this.adapter) await this.connect();
    return this.adapter.status();
  }

  // ── THEOL (北化在线) ──────────────────────────────────────────────────
  // The desktop TheolAdapter needs a page()+json() client and a shared CAS
  // session. The mobile flow establishes the session via restricted WebView
  // login (stage 1.2); until then, sync reports auth-required gracefully and
  // the read-only mobile endpoint can still be probed.
  async ensureTheolAdapter() {
    if (this.theolAdapter) return this.theolAdapter
    if (!this.client) await this.connect()
    // TheolAdapter also uses client.json() for the mobile task endpoint,
    // which AcademicApiClient does not expose — add it via a delegating wrapper.
    const base = (this.theolClientFactory
      ? await this.theolClientFactory()
      : null) || this.client
    if (!base) throw new Error('北化在线THEOL客户端未建立')
    this.theolClient = {
      page: (...args) => base.page(...args),
      form: (...args) => base.form(...args),
      binary: (...args) => base.binary(...args),
      assignmentBinary: (...args) => (base.assignmentBinary || base.binary)(...args),
      async json(url, init = {}, options = {}) {
        // A mobile task session and the CAS-backed THEOL HTML session are
        // independent. A composite client may provide a dedicated JSON
        // transport so assignment polling does not replace the browser
        // session used for course/notices pages.
        if (typeof base.json === 'function') return base.json(url, init, options)
        const result = await base.request(url, {
          ...init,
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'Accept': 'application/json',
            ...(init?.headers || {}),
          },
        }, 0)
        try {
          return JSON.parse(result.text)
        } catch {
          throw new Error('THEOL JSON 端点返回了非 JSON 响应')
        }
      },
      setDiagnostic: (cb) => base.setDiagnostic?.(cb),
    }
    this.theolAdapter = new TheolAdapter(this.theolClient)
    return this.theolAdapter
  }

  async syncTheol(state, { domains = ['courses', 'notices'] } = {}) {
    const requestedDomains = [...new Set(Array.isArray(domains) && domains.length ? domains : ['courses', 'notices'])]
    const assignmentRequested = requestedDomains.includes('assignments')
    const theolDomains = requestedDomains.filter((domain) => domain !== 'assignments')
    // Keep the mobile task feed independent from the HTML course roster. THEOL
    // can return a valid pending-task JSON response while its legacy course
    // page has changed shape; assignments must still be shown in that case.
    const syncDomains = theolDomains.length ? theolDomains : ['courses']
    const theolAdapter = await this.ensureTheolAdapter()
    const runId = state?.sync?.runId || new Date().toISOString()
    const completedAt = new Date().toISOString()
    let assignmentResult = null
    let assignmentError = null

    if (assignmentRequested) {
      try {
        assignmentResult = await theolAdapter.syncMobileAssignments(state?.courses || [])
      } catch (error) {
        assignmentError = error
      }
    }

    try {
      let result = null
      let courseSyncError = null
      try {
        result = await theolAdapter.sync({ domains: syncDomains })
      } catch (error) {
        courseSyncError = error
        // A successful task-feed response is useful even if the optional
        // course/notices HTML scan failed. The fallback result below retains
        // cached courses/notices and publishes the fresh assignments.
        if (!assignmentResult) throw error
      }

      const assignmentFailure = assignmentError
        ? sourceDomainOutcome({
          source: 'theol',
          runId,
          attempted: true,
          succeeded: false,
          status: assignmentError instanceof AuthRequiredError ? 'auth-required' : 'failed',
          attemptedAt: completedAt,
          completedAt,
          retainedPrevious: true,
          completeness: 'unknown',
          errorCode: assignmentError instanceof AuthRequiredError ? 'auth_required' : 'assignment_scan_failed',
        })
        : null
      const assignmentScanSource = assignmentResult?.source || (assignmentError ? {
        connected: !(assignmentError instanceof AuthRequiredError),
        checkedAt: completedAt,
        error: compactError(assignmentError),
        captureMode: 'mobile-list',
      } : null)
      // The legacy HTML course shell and the mobile task feed use separate
      // sessions. A stale HTML cookie must not turn a successful mobile task
      // response into a global auth failure: assignments are already valid and
      // the bridge can continue showing them while the optional shell is
      // refreshed later. Still publish an explicit non-auth outcome for the
      // shell domains so an older auth-required outcome cannot linger forever.
      const optionalHtmlAuth = Boolean(
        assignmentResult
        && courseSyncError instanceof AuthRequiredError
        && !assignmentError,
      )
      const shellFailure = optionalHtmlAuth
        ? Object.fromEntries(syncDomains.map((domain) => [domain, sourceDomainOutcome({
          source: 'theol',
          runId,
          attempted: true,
          succeeded: false,
          status: 'failed',
          attemptedAt: completedAt,
          completedAt,
          retainedPrevious: true,
          completeness: 'unknown',
          errorCode: 'theol_html_session_required',
        })]))
        : {}
      const scanErrors = [
        ...(!optionalHtmlAuth && courseSyncError ? [compactError(courseSyncError)] : []),
        ...(assignmentError ? [compactError(assignmentError)] : []),
      ]
      const baseResult = result || {
        ...(assignmentResult ? { assignments: assignmentResult.assignments } : {}),
        errors: scanErrors,
        capturedAt: assignmentResult?.capturedAt || completedAt,
        parserVersion: assignmentResult?.parserVersion || null,
        source: {
          connected: Boolean(assignmentResult),
          checkedAt: completedAt,
          errors: scanErrors,
        },
        domainOutcomes: {},
      }
      const combined = assignmentRequested
        ? {
          ...baseResult,
          ...(assignmentResult ? { assignments: assignmentResult.assignments } : {}),
          errors: [...new Set([
            ...(baseResult.errors || []),
            ...(assignmentResult?.errors || []),
            ...(assignmentError ? [compactError(assignmentError)] : []),
          ])],
          capturedAt: assignmentResult?.capturedAt || baseResult.capturedAt || completedAt,
          parserVersion: assignmentResult?.parserVersion || baseResult.parserVersion,
          source: {
            ...(baseResult.source || {}),
            // A successful mobile task feed is an authenticated THEOL
            // channel even when the optional HTML shell needs its own cookie.
            ...(assignmentResult ? { connected: true } : {}),
            ...(assignmentScanSource ? { assignmentScan: assignmentScanSource } : {}),
          },
          domainOutcomes: {
            ...(baseResult.domainOutcomes || {}),
            ...shellFailure,
            ...(assignmentResult?.domainOutcomes || {}),
            ...(assignmentFailure ? { assignments: assignmentFailure } : {}),
          },
        }
        : baseResult

      // If both channels say the session is gone, let the auth-recovery path
      // below handle it. A successful assignment feed, however, proves that
      // THEOL is still authenticated and should not trigger a needless CAS
      // login just because the optional course page scan failed.
      if (!assignmentResult && assignmentError instanceof AuthRequiredError && courseSyncError instanceof AuthRequiredError) {
        throw courseSyncError
      }

      // The mobile assignment feed is authoritative for assignments even
      // when the legacy HTML shell failed. Ensure the merged result receives
      // the same current run id as the enclosing THEOL scan; otherwise the
      // provenance aggregator intentionally filters out the fresh outcome as
      // stale and keeps the previous auth-required marker.
      const normalizedCombined = {
        ...combined,
        domainOutcomes: Object.fromEntries(Object.entries(combined.domainOutcomes || {}).map(([domain, outcome]) => [
          domain,
          outcome && typeof outcome === 'object' ? { ...outcome, runId } : outcome,
        ])),
      }
      const merged = mergeSyncResult(state, {
        ...normalizedCombined,
        runId,
        completedAt,
        completed: true,
        domains: aggregateDomainProvenance(state?.sync?.domains, { theol: normalizedCombined.domainOutcomes || {} }, { runId }),
        sources: {
          ...(state?.sync?.sources || {}),
          theol: {
            ...(state?.sync?.sources?.theol || {}),
            connected: combined.source?.connected !== false,
            // Clear a previously persisted auth-required marker when either
            // authenticated THEOL channel succeeds (especially the independent
            // mobile assignment endpoint).
            ...(assignmentResult ? { authRequired: false } : {}),
            checkedAt: combined.source?.checkedAt || completedAt,
            lastSuccessAt: combined.errors?.length ? state?.sync?.sources?.theol?.lastSuccessAt || null : completedAt,
            error: combined.errors?.length ? combined.errors.join('; ') : undefined,
            ...(combined.source?.assignmentScan ? { assignmentScan: combined.source.assignmentScan } : {}),
          },
        },
      })
      // The legacy THEOL HTML pages and the mobile task feed are separate
      // session surfaces. A browser SSO cookie can be good enough for the
      // course shell while stuUnDoTaskList.do still returns status=-2. Do not
      // hide that authentication failure inside a partial domain outcome: the
      // mobile bridge must get a chance to run the Courser-compatible direct
      // mobile login and retry the assignment feed automatically.
      const assignmentAuthRequired = assignmentError instanceof AuthRequiredError
      return { state: merged, result: combined, authRequired: assignmentAuthRequired }
    } catch (error) {
      if (error instanceof AuthRequiredError) {
        const outcomes = Object.fromEntries(requestedDomains.map((domain) => [domain, sourceDomainOutcome({
          source: 'theol',
          runId,
          attempted: true,
          succeeded: false,
          status: 'auth-required',
          attemptedAt: completedAt,
          completedAt,
          retainedPrevious: true,
          completeness: 'unknown',
          errorCode: 'auth_required',
        })]))
        const nextState = mergeSyncResult(state, {
          runId,
          completedAt,
          completed: true,
          errors: ['THEOL 需要重新登录'],
          domains: aggregateDomainProvenance(state?.sync?.domains, { theol: outcomes }, { runId }),
          sources: {
            ...(state?.sync?.sources || {}),
            theol: { connected: false, authRequired: true, checkedAt: completedAt, error: 'auth_required' },
          },
        })
        return { state: nextState, result: null, authRequired: true, error }
      }
      throw error
    }
  }
  async getAssignmentDetail(assignment, { signal = null } = {}) {
    const adapter = await this.ensureTheolAdapter()
    return adapter.getMobileAssignmentDetail(assignment, { signal })
  }
  async downloadAssignmentAttachment(assignment, attachment, { signal = null } = {}) {
    const adapter = await this.ensureTheolAdapter()
    if (typeof adapter.getMobileAssignmentAttachment !== 'function') {
      throw new Error('THEOL附件下载功能未建立')
    }
    return adapter.getMobileAssignmentAttachment(assignment, attachment, { signal })
  }

  // Probes the read-only THEOL mobile pending-task endpoint (no session needed
  // to learn the auth state; with a session it returns the task feed).
  async probeTheolMobile() {
    try {
      await this.ensureTheolAdapter();
      const url = 'http://course.buct.edu.cn/mobile/stuUnDoTaskList.do';
      const payload = await this.theolClient?.json?.(url, {}, { source: 'THEOL mobile probe' });
      return { reachable: true, authenticated: payload?.status === 1, payload };
    } catch {
      return { reachable: false, authenticated: false };
    }
  }
}

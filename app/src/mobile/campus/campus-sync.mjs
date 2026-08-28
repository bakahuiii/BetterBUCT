// Mobile campus sync (stage 1).
// Runs the desktop THEIA JwglxtAdapter in the WebView via the browser-compatible
// AcademicApiClient, then merges results with the same mergeSyncResult used by
// the desktop SyncService. Single source of maintenance: core/ is reused
// unchanged; only the orchestration is mobile-specific.
import { AcademicApiClient } from '../../../core/academic-api-client.mjs';
import { JwglxtAdapter } from '../../../core/adapters/jwglxt.mjs';
import { TheolAdapter } from '../../../core/adapters/theol.mjs';
import { AuthRequiredError } from '../../../core/source-client.mjs';
import { mergeSyncResult } from '../../../core/schema.mjs';

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
  constructor({ vault, onProgress, onDiagnostic } = {}) {
    this.vault = vault;
    this.onProgress = typeof onProgress === 'function' ? onProgress : () => {};
    this.onDiagnostic = typeof onDiagnostic === 'function' ? onDiagnostic : () => {};
    this.client = null;
    this.adapter = null;
    this.lastError = null;
  }

  async hasCredentials() {
    try {
      const credentials = await this.vault.getSecret('academic-api-credentials');
      return Boolean(credentials?.username && credentials?.password);
    } catch {
      return false;
    }
  }

  async connect() {
    const credentials = await this.vault.getSecret('academic-api-credentials');
    if (!credentials?.username || !credentials?.password) {
      throw new Error('未配置教务 API 账号或密码');
    }
    this.client = new AcademicApiClient({
      username: credentials.username,
      password: credentials.password,
      onDiagnostic: (event, fields) => this.onDiagnostic(event, fields),
    });
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
    const startedAt = new Date().toISOString();
    const result = await this.adapter.sync({ domains, includeAcademicExtras: false, ...adapterOptions });
    const merged = mergeSyncResult(state, {
      ...result,
      runId: startedAt,
      completed: true,
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
  async syncTheol(state, { domains = ['courses', 'notices'] } = {}) {
    if (!this.theolClient) {
      if (!this.client) await this.connect();
      // TheolAdapter also uses client.json() for the mobile fallback endpoint,
      // which AcademicApiClient does not expose — add it via a delegating wrapper.
      const base = this.client;
      this.theolClient = {
        page: (...args) => base.page(...args),
        form: (...args) => base.form(...args),
        binary: (...args) => base.binary(...args),
        async json(url, init = {}, options = {}) {
          const result = await base.request(url, {
            ...init,
            headers: {
              'X-Requested-With': 'XMLHttpRequest',
              'Accept': 'application/json',
              ...(init?.headers || {}),
            },
          }, 0);
          try {
            return JSON.parse(result.text);
          } catch {
            throw new Error('THEOL JSON 端点返回了非 JSON 响应');
          }
        },
        setDiagnostic: (cb) => base.setDiagnostic(cb),
      };
      this.theolAdapter = new TheolAdapter(this.theolClient);
    }
    try {
      const result = await this.theolAdapter.sync({ domains });
      const merged = mergeSyncResult(state, {
        ...result,
        runId: new Date().toISOString(),
        completed: true,
      });
      return { state: merged, result, authRequired: false };
    } catch (error) {
      if (error instanceof AuthRequiredError) {
        return { state, result: null, authRequired: true, error };
      }
      throw error;
    }
  }

  // Probes the read-only THEOL mobile pending-task endpoint (no session needed
  // to learn the auth state; with a session it returns the task feed).
  async probeTheolMobile() {
    try {
      const url = 'http://course.buct.edu.cn/mobile/stuUnDoTaskList.do';
      const payload = await this.theolClient?.json?.(url, {}, { source: 'THEOL mobile probe' });
      return { reachable: true, authenticated: payload?.status === 1, payload };
    } catch {
      return { reachable: false, authenticated: false };
    }
  }
}

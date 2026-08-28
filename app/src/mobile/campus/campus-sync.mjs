// Mobile campus sync (stage 1).
// Runs the desktop THEIA JwglxtAdapter in the WebView via the browser-compatible
// AcademicApiClient, then merges results with the same mergeSyncResult used by
// the desktop SyncService. Single source of maintenance: core/ is reused
// unchanged; only the orchestration is mobile-specific.
import { AcademicApiClient } from '../../../core/academic-api-client.mjs';
import { JwglxtAdapter } from '../../../core/adapters/jwglxt.mjs';
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
  async syncJwglxt(state, { domains = JWGLXT_SYNC_DOMAINS } = {}) {
    if (!this.adapter) await this.connect();
    const startedAt = new Date().toISOString();
    const result = await this.adapter.sync({ domains, includeAcademicExtras: false });
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
}

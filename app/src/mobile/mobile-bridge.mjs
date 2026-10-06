// window.theia mobile bridge implementation
// Implements the TheiaBridge contract (see src/types.ts) for the Capacitor WebView.
import { MobileStore } from './store/mobile-store.mjs';
import { createWebStorageBackend } from './store/web-storage-backend.mjs';
import { VaultService, VAULT_KEYS } from './vault/vault-service.mjs';
import { SessionService } from './session/session-service.mjs';
import { getMockState } from './mock/mock-data.mjs';
import { nativeFetch } from './native-fetch.mjs';
import { unifiedLoginUrl } from '../../core/adapters/jwglxt-helpers.mjs';
import { cacheMotionVenueCatalog, cacheMotionVenueStatus } from '../../core/data-catalog.mjs';
import { APP_VERSION_LABEL } from './app-identity.mjs';
import { NETWORK_TIMEOUTS, timeoutMs as timeoutMilliseconds } from '../../core/network-config.mjs';
import { checkForMobileUpdate, openMobileUpdateUrl } from './update-checker.ts';

const JWGLXT_HOME = 'https://jwglxt.buct.edu.cn/jwglxt/xtgl/index_initMenu.html';
const THEOL_MOBILE_BASE = 'http://course.buct.edu.cn/mobile/';
// The THEOL mobile gateway validates against the Courser-compatible protocol
// version, which is independent from BetterBUCT's own release version.
const THEOL_PROTOCOL_VERSION = '8.7.1';

function mobileResponseStatus(payload) {
  const value = Array.isArray(payload?.status) ? payload.status[0] : payload?.status;
  const status = Number(value);
  return Number.isFinite(status) ? status : null;
}

function mobileResponseSession(payload) {
  const value = Array.isArray(payload?.sessionid) ? payload.sessionid[0] : payload?.sessionid;
  return String(value || '').trim();
}

function mobileResponseError(payload, fallback = '北化在线移动端登录失败') {
  const value = Array.isArray(payload?.error) ? payload.error[0] : payload?.error;
  const details = payload?.datas && typeof payload.datas === 'object'
    ? (payload.datas.errorMessage || payload.datas.errorCode)
    : null;
  return String(value || payload?.message || details || fallback).trim();
}

function isCampusAuthFailure(error) {
  const text = error instanceof Error ? `${error.message} ${error.code || ''}` : String(error ?? '');
  // Direct academic-API failures are an independent channel. In particular,
  // an API login message containing “登录未完成” must never open the CAS
  // re-login state or make the user re-enter the unified credential.
  if (/教务 API/iu.test(text) && !/统一身份认证|校园会话|THEOL/iu.test(text)) return false;
  return /校园会话已失效|会话已失效|需要重新(?:完成)?统一身份认证|请在设置中重新登录|请先在设置中保存统一身份认证账号和密码|未找到可恢复的校园账号|统一身份认证(?:未建立教务系统会话|已取消)|auth[_-]?required|session.*expired|登录未完成/iu.test(text);
}

function errorText(error) {
  return error instanceof Error ? error.message : String(error ?? '同步失败');
}

function mobileUpdateIdleStatus(currentVersion) {
  return {
    supported: true,
    state: 'idle',
    currentVersion: String(currentVersion || 'mobile'),
    availableVersion: null,
    releaseName: null,
    releaseDate: null,
    lastCheckedAt: null,
    progress: null,
    updateSizeBytes: null,
    error: null,
  };
}

function mobileUpdateStatusFromInfo(info, checkedAt = new Date().toISOString()) {
  return {
    supported: true,
    state: info.hasUpdate ? 'available' : 'not-available',
    currentVersion: info.currentVersion,
    availableVersion: info.hasUpdate ? info.latestVersion : null,
    releaseName: info.releaseName || null,
    releaseDate: info.publishedAt || null,
    lastCheckedAt: checkedAt,
    progress: null,
    updateSizeBytes: info.assetSizeBytes || null,
    error: null,
    downloadUrl: info.downloadUrl,
  };
}

function nativePlatform() {
  try {
    return Boolean(window.Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

function webPreviewRuntime() {
  try {
    // MobileBridge is only constructed by the mobile entry. The entry adds
    // __THEIA_MOBILE__ immediately after construction, so that marker cannot
    // be used during this constructor call.
    return typeof window !== 'undefined' && !nativePlatform();
  } catch {
    return false;
  }
}

function previewRequestUrl(url) {
  const target = new URL(String(url));
  return `/__theia-campus${target.pathname}${target.search}`;
}

function previewFetch(url, init = {}) {
  // Browser JavaScript cannot set Cookie. The Vite proxy rewrites upstream
  // Set-Cookie headers onto localhost, so same-origin fetch carries them.
  const headers = new Headers(init.headers || {});
  headers.delete('Cookie');
  return fetch(url, { ...init, headers, credentials: 'same-origin' });
}

// ── Event Bus ──────────────────────────────────────────────────────────────
class EventBus {
  constructor() {
    this._listeners = new Map();
  }
  on(event, cb) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(cb);
    return () => this._listeners.get(event)?.delete(cb);
  }
  emit(event, ...args) {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const cb of set) {
      try { cb(...args); } catch { /* ignore */ }
    }
  }
  has(event) {
    return this._listeners.has(event) && this._listeners.get(event).size > 0;
  }
}

// ── Auth Helpers ───────────────────────────────────────────────────────────
function disconnectedStatus() {
  return {
    jwglxt: { connected: false, unchecked: true },
    theol: { connected: false, unchecked: true },
  };
}

function connectedStatus() {
  return {
    jwglxt: { connected: true, unchecked: false },
    theol: { connected: true, unchecked: false },
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function bytesAsUint8Array(value) {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  if (Array.isArray(value)) return Uint8Array.from(value)
  if (value?.data !== undefined) return bytesAsUint8Array(value.data)
  if (value?.buffer !== undefined) return bytesAsUint8Array(value.buffer)
  return new Uint8Array()
}

function bytesToBase64(value) {
  const bytes = bytesAsUint8Array(value)
  let output = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    output += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)))
  }
  return btoa(output)
}

function safeDownloadName(value, fallback = '作业附件') {
  const normalized = String(value || fallback).trim().replace(/[\/:*?"<>|\u0000-\u001f]/gu, '_')
  return (normalized || fallback).slice(0, 180)
}

function contentTypeFromName(name) {
  const extension = String(name || '').toLowerCase().match(/\.([a-z0-9]{1,8})$/u)?.[1] || ''
  return {
    pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    txt: 'text/plain', csv: 'text/csv', md: 'text/markdown',
  }[extension] || 'application/octet-stream'
}

function filenameFromDisposition(value) {
  const raw = String(value || '')
  const encoded = raw.match(/filename\*\s*=\s*(?:UTF-8''|utf-8'')([^;]+)/iu)?.[1]
  if (encoded) {
    try { return decodeURIComponent(encoded.trim().replace(/^['"]|['"]$/gu, '')) } catch { return encoded.trim() }
  }
  return raw.match(/filename\s*=\s*["']?([^;"']+)/iu)?.[1]?.trim() || ''
}

function demoAssignmentDetail(assignment) {
  const kind = assignment?.kind === 'online-test' ? 'online-test' : 'assignment';
  const title = String(assignment?.title || (kind === 'online-test' ? '在线测试' : '课程作业'));
  const courseName = String(assignment?.courseName || '示例课程');
  const submitted = assignment?.status === 'submitted';
  const contentText = kind === 'online-test'
    ? `这是「${courseName}」的示例在线测试。真实版本会从北化在线THEOL读取测试说明和题目。`
    : `这是「${courseName}」的示例作业说明。真实版本会从北化在线THEOL读取教师发布的正文和附件。`;
  const contentHtml = [
    `<p><strong>${escapeHtml(title)}</strong></p>`,
    `<p>${escapeHtml(contentText)}</p>`,
    '<p class="theia-demo-note">当前为浏览器演示数据，安装到 Android 后会使用已登录的 THEOL 会话读取真实详情。</p>',
  ].join('');
  return {
    authenticated: true,
    assignmentId: assignment?.id || null,
    courseId: assignment?.courseId || null,
    title,
    kind,
    sourceUrl: assignment?.sourceUrl || null,
    contentHtml,
    contentText,
    hasSubmit: submitted,
    maySubmit: !submitted,
    mayModify: submitted ? 0 : 1,
    status: submitted ? 'submitted' : 'pending',
    attachments: [],
    questions: [],
  };
}

// ── Mobile Bridge Class ────────────────────────────────────────────────────
export class MobileBridge {
  constructor({ storageBackend, vault, session, webPreview = null, academicClientFactory = null, campusSyncFactory = null } = {}) {
    this.events = new EventBus();
    this.backend = storageBackend || createWebStorageBackend();
    this.store = new MobileStore(this.backend);
    this.vault = vault || new VaultService();
    this.session = session || new SessionService();
    this._state = null;
    this._webPreview = webPreview === null ? webPreviewRuntime() : Boolean(webPreview);
    this._native = nativePlatform();
    this._demoMode = this._webPreview && (() => {
      try { return new URLSearchParams(window.location.search).get('demo') === '1'; }
      catch { return false; }
    })();
    this._restoreAttempted = false;
    this._explicitlyLoggedOut = false;
    this._authRecovery = { inFlight: null, lastAt: 0, failures: 0 };
    this._loginInFlight = null;
    this._campusClient = null;
    this._campusSync = null;
    this._theolMobileClient = null;
    this._theolDeviceUuid = crypto.randomUUID ? crypto.randomUUID() : `theia-${Date.now()}`;
    this._academicClientFactory = typeof academicClientFactory === 'function' ? academicClientFactory : null;
    this._campusSyncFactory = typeof campusSyncFactory === 'function' ? campusSyncFactory : null;
    this._auth = { ...disconnectedStatus(), };
    this._syncing = false;
    this._syncProgress = null;
    this._credentialStatus = { saved: false, encryptionAvailable: false };
    this._academicApiCredentialStatus = { saved: false, encryptionAvailable: false, enabled: false };
    this._mailCredentialStatus = { saved: false, encryptionAvailable: false };
    this._modelStatus = {
      configured: false,
      baseUrl: '',
      model: '',
      apiKeySaved: false,
      encryptionAvailable: false,
    };
    this._courseSelection = { active: null, updatedAt: new Date().toISOString() };
    this._courseWorkQueue = { schema: 'theia-course-work-queue/v1', enabled: false, updatedAt: new Date().toISOString(), jobs: [] };
    this._initialized = false;
    this._initPromise = null;
    this._mobileUpdateStatus = null;
  }

  async init() {
    if (this._initialized) return;
    if (this._initPromise) return this._initPromise;
    this._initPromise = this._doInit();
    return this._initPromise;
  }

  async _doInit() {
    try {
      const loaded = await this.store.load();
      if (loaded) {
        // Validate loaded state has essential fields
        this._state = loaded;
        // A previous background auth expiry is recoverable, not a new sync
        // failure. Do not resurrect it as a blocking error dialog on startup.
        if (isCampusAuthFailure(this._state?.sync?.lastError)) {
          this._state.sync.lastError = null;
          await this._persist();
        }
        // If no auth, default disconnected
        this._auth = { ...disconnectedStatus() };
      }
    } catch (error) {
      console.warn('[theia-mobile] store load failed, using mock:', error);
    }
    if (!this._state) {
      // Seed with mock data for first-run or demo
      await this._seedInitialState();
    }
    // Restore credential status from the vault
    try {
      const unified = await this.vault.getSecret(VAULT_KEYS.unified);
      const apiCreds = await this.vault.getSecret(VAULT_KEYS.academicApi);
      const mailCreds = await this.vault.getSecret(VAULT_KEYS.mail);
      const modelKey = await this.vault.getSecret(VAULT_KEYS.modelApiKey);
      const encryptionAvailable = typeof this.vault.isAvailable === 'function'
        ? Boolean(this.vault.isAvailable())
        : true;
      this._credentialStatus = {
        saved: Boolean(unified),
        username: unified?.username || undefined,
        updatedAt: unified?.savedAt || undefined,
        encryptionAvailable,
      };
      this._academicApiCredentialStatus = {
        saved: Boolean(apiCreds),
        username: apiCreds?.username || undefined,
        updatedAt: apiCreds?.savedAt || undefined,
        encryptionAvailable,
        enabled: Boolean(apiCreds) && this._state?.settings?.academicApiEnabled !== false,
      };
      this._mailCredentialStatus = { saved: Boolean(mailCreds), encryptionAvailable };
      this._modelStatus = {
        ...this._modelStatus,
        apiKeySaved: Boolean(modelKey),
        encryptionAvailable: true,
      };
    } catch (error) {
      console.warn('[theia-mobile] vault restore failed:', error);
    }
    this._initialized = true;
    this.events.emit('snapshot', this._state);
    this.events.emit('auth-status', this._auth);
    // Credentials survive process death. Restore the campus session in the
    // background after the cached snapshot has been published, so offline
    // data remains immediately readable even when the network is unavailable.
    if (this._native && !this._demoMode) {
      // Keep the cached-data frame silent; if a saved unified credential is
      // present, the bounded native login activity may recover the session
      // automatically without waiting for a renderer action.
      Promise.resolve().then(() => this._restoreSavedLogin());
    }
    // Install auto-sync triggers (app resume + network reconnect) and the
    // WorkManager periodic reminder once the bridge is fully initialized.
    try {
      const { installAutoSyncTriggers, scheduleBackgroundSync } = await import('./background.mjs');
      installAutoSyncTriggers({
        syncNow: () => this.syncNow({ background: true }),
        getState: () => this._state,
        onMessage: () => this.events.emit('snapshot', this._state),
      });
      if (this._state?.settings?.autoSync) {
        const interval = this._state.settings.syncIntervalMinutes || 30;
        scheduleBackgroundSync(Math.max(15, interval)).catch(() => undefined);
      }
    } catch {
      // Auto-sync is best-effort; the app remains fully usable without it.
    }
  }

  async _seedInitialState() {
    if (this._demoMode) {
      this._state = structuredClone(getMockState());
      this._state.appVersion = `${APP_VERSION_LABEL}-demo`;
    } else {
      const { emptyState } = await import('../../../core/schema.mjs');
      this._state = emptyState();
      this._state.appVersion = APP_VERSION_LABEL;
    }
    const now = new Date().toISOString();
    this._state.createdAt = now;
    this._state.updatedAt = now;
    await this._persist();
  }

  async _restoreSavedLogin() {
    if (this._restoreAttempted || !this._native || this._demoMode) return;
    this._restoreAttempted = true;
    let credentials = null;
    try {
      // Restore either a still-valid WebView cookie or a saved unified/API
      // credential. The two credential slots remain independent.
      credentials = await this._getUnifiedCredentials() || await this._getAcademicApiCredentials();
      const cookies = await this._campusCookieHeader();
      if (!credentials && !cookies) return;
      // A saved unified credential is an explicit automation grant: reuse the
      // cookie first, then let the bounded native login activity refresh the
      // expired CAS session without waiting for a renderer button. Cookie-only
      // sessions still stay non-interactive when their password was not saved.
      await this.login({ silent: true, background: true, autoRecover: Boolean(credentials) });
    } catch (error) {
      // Keep cached data and saved credentials on transient offline/auth errors.
      // The next background/foreground sync can retry through the bounded
      // recovery gate without discarding the saved credential. A network/API
      // failure is not the same thing as a unified-session expiry.
      console.warn('[theia-mobile] saved login restore failed:', error?.message || String(error));
      if (isCampusAuthFailure(error)) this._markCampusAuthRequired(error);
      else this._markCampusConnectionFailure(error, credentials?.source === VAULT_KEYS.academicApi ? 'academic-api' : 'unified');
    }
  }

  async _persist() {
    if (this._state) {
      this._state.updatedAt = new Date().toISOString();
      await this.store.save(this._state);
    }
  }

  _publishState() {
    if (!this._state) return;
    const snapshot = structuredClone(this._state);
    this.events.emit('snapshot', snapshot);
  }

  // ── Bridge Methods (TheiaBridge contract) ──────────────────────────────

  async getSnapshot() {
    await this.init();
    return structuredClone(this._state);
  }

  async getRendererSnapshot() {
    await this.init();
    // projectBrowserRendererSnapshot is applied by the UI; we return raw state
    return structuredClone(this._state);
  }

  async getUserDataOverview() {
    await this.init();
    // Re-export from desktop user-data-view
    const { projectBrowserUserDataOverview } = await import('../user-data-view');
    return projectBrowserUserDataOverview(this._state);
  }

  async getUserDataDomainSummary(domain) {
    await this.init();
    const { projectBrowserUserDataDomainSummary } = await import('../user-data-view');
    return projectBrowserUserDataDomainSummary(this._state, domain);
  }

  async getUserDataRecords(domain, options) {
    await this.init();
    const { projectBrowserUserDataRecords } = await import('../user-data-view');
    const page = projectBrowserUserDataRecords(this._state, domain, options);
    if (!page) throw new Error('资料域不存在');
    return page;
  }

  async getAdvisorOverview() {
    throw new Error('顾问概览在移动端开发中');
  }

  async getAdvisorAcademicWhatIf() {
    throw new Error('顾问情景计算在移动端开发中');
  }

  async getAdvisorCourseDecisions() {
    throw new Error('顾问选课分析在移动端开发中');
  }

  async executeAdvisorAction() {
    throw new Error('顾问动作在移动端开发中');
  }

  async listAdvisorThreads() {
    return [];
  }

  async createAdvisorThread() {
    throw new Error('模型顾问在移动端开发中');
  }

  async prepareAdvisorRequest() {
    throw new Error('模型顾问在移动端开发中');
  }

  async sendAdvisorRequest() {
    throw new Error('模型顾问在移动端开发中');
  }

  async cancelAdvisorRequest() {
    return { cancelled: false, requestId: null };
  }

  async deleteAdvisorThread(threadId) {
    return { deleted: false, threadId };
  }

  onAdvisorStream() {
    return () => undefined;
  }

  async getActivityLog() {
    return [];
  }

  async getIrisStatus() {
    return {
      schema: 'theia-iris-companion/v1',
      enabled: false,
      configured: false,
      encryptionAvailable: false,
      running: false,
      pid: null,
      startedAt: null,
      lastExit: null,
      lastError: null,
      visibleProviders: ['theia'],
      providers: { theia: false },
    };
  }

  async saveIrisSettings() { throw new Error('Iris 桌面专属'); }
  async openIrisControlPanel() { throw new Error('Iris 桌面专属'); }
  async saveIrisCredentials() { throw new Error('Iris 桌面专属'); }
  async clearIrisCredentials() { throw new Error('Iris 桌面专属'); }
  async startIris() { throw new Error('Iris 桌面专属'); }
  async stopIris() { throw new Error('Iris 桌面专属'); }
  async restartIris() { throw new Error('Iris 桌面专属'); }

  async getAuthStatus() {
    await this.init();
    return { ...this._auth };
  }

  async getCredentialStatus() {
    return { ...this._credentialStatus };
  }

  async getAcademicApiCredentialStatus() {
    return { ...this._academicApiCredentialStatus };
  }

  async getMailCredentialStatus() {
    return { ...this._mailCredentialStatus };
  }

  async readSavedSecret(kind) {
    // SecretInput expects only the requested secret value. Never return the
    // whole credential object: doing so would put username/password JSON into
    // a visible text input and makes accidental disclosure very easy.
    const records = {
      'unified-password': [VAULT_KEYS.unified, 'password'],
      'academic-api-password': [VAULT_KEYS.academicApi, 'password'],
      'mail-password': [VAULT_KEYS.mail, 'password'],
      'mail-protocol-password': [VAULT_KEYS.mail, 'protocolPassword'],
      model: [VAULT_KEYS.modelApiKey, null],
    };
    const [key, field] = records[kind] || [kind, null];
    const value = await this.vault.getSecret(key);
    if (value === null || value === undefined) return null;
    if (field) {
      if (!value || typeof value !== 'object') return null;
      const secret = value[field];
      return secret === null || secret === undefined ? null : String(secret);
    }
    return typeof value === 'string' ? value : null;
  }

  async saveCredentials(credentials) {
    await this.init();
    await this.vault.setSecret(VAULT_KEYS.unified, {
      username: String(credentials?.username || ''),
      password: String(credentials?.password || ''),
      savedAt: new Date().toISOString(),
    });
    this._credentialStatus = {
      saved: true,
      username: String(credentials?.username || '').trim() || undefined,
      updatedAt: new Date().toISOString(),
      encryptionAvailable: true,
    };
    this.events.emit('auth-status', this._auth);
    return { ...this._credentialStatus };
  }

  async saveAcademicApiCredentials(credentials) {
    await this.init();
    await this.vault.setSecret(VAULT_KEYS.academicApi, {
      username: String(credentials?.username || ''),
      password: String(credentials?.password || ''),
      savedAt: new Date().toISOString(),
    });
    this._academicApiCredentialStatus = {
      saved: true,
      username: String(credentials?.username || '').trim() || undefined,
      updatedAt: new Date().toISOString(),
      encryptionAvailable: typeof this.vault.isAvailable === 'function' ? Boolean(this.vault.isAvailable()) : true,
      enabled: this._state?.settings?.academicApiEnabled === true,
    };
    return { ...this._academicApiCredentialStatus };
  }

  async clearCredentials() {
    // Unified authentication is an independent channel. Clearing it must not
    // delete the optional direct academic API account or its enable switch.
    await this.vault.removeSecret(VAULT_KEYS.unified);
    this._credentialStatus = { saved: false, encryptionAvailable: false };
    this._auth = { ...disconnectedStatus() };
    await this._persist();
    this.events.emit('auth-status', this._auth);
    return { ...this._credentialStatus };
  }

  async clearAcademicApiCredentials() {
    await this.vault.removeSecret(VAULT_KEYS.academicApi);
    this._academicApiCredentialStatus = { saved: false, encryptionAvailable: false, enabled: false };
    if (this._state) this._state.settings.academicApiEnabled = false;
    await this._persist();
    return { ...this._academicApiCredentialStatus };
  }

  async saveMailCredentials(credentials) {
    await this.vault.setSecret(VAULT_KEYS.mail, {
      username: String(credentials?.username || ''),
      password: String(credentials?.protocolPassword || credentials?.password || ''),
      savedAt: new Date().toISOString(),
    });
    this._mailCredentialStatus = { saved: true, encryptionAvailable: true };
    if (this._state) this._state.settings.mail.enabled = true;
    await this._persist();
    return { ...this._mailCredentialStatus };
  }

  async clearMailCredentials() {
    await this.vault.removeSecret(VAULT_KEYS.mail);
    this._mailCredentialStatus = { saved: false, encryptionAvailable: false };
    if (this._state) this._state.settings.mail.enabled = false;
    await this._persist();
    return { ...this._mailCredentialStatus };
  }

  async refreshMailbox() {
    throw new Error('校园邮箱在移动端开发中');
  }

  async openMailbox() {
    throw new Error('校园邮箱在移动端开发中');
  }

  async readMailboxMessage() {
    throw new Error('校园邮箱在移动端开发中');
  }

  async downloadMailboxAttachment() {
    throw new Error('校园邮箱在移动端开发中');
  }

  // Real API-first campus login (stage 1). Uses the reused desktop
  // core/academic-api-client.mjs in the WebView (via node:crypto polyfill +
  // CapacitorHttp native fetch). Falls back to mock for the demo profile.
  // Mobile-only: restricted WebView CAS login (native plugin). Establishes a
  // shared campus session (jwglxt + theol + mail) when API-first login is not
  // available or a captcha is required.
  async loginWithRestrictedWebView({ url = unifiedLoginUrl(), username = '', password = '', autoFill = true } = {}) {
    this.events.emit('sync-progress', { stage: 'login', status: 'syncing', label: '正在打开统一身份认证页面…' });
    const result = await this.session.openRestrictedLoginWebView({
      url,
      username,
      password,
      whitelist: this.session.whitelist || undefined,
      autoFill,
    });
    if (result?.canceled) return { canceled: true, cookies: '', theolConnected: false };
    this.events.emit('sync-progress', { stage: 'login', status: 'syncing', label: '正在验证登录状态…' });
    return {
      canceled: false,
      cookies: result?.cookies || '',
      theolConnected: Boolean(result?.theolConnected),
    };
  }

  async _getUnifiedCredentials() {
    try {
      const credentials = await this.vault.getSecret(VAULT_KEYS.unified);
      if (credentials?.username && credentials?.password) {
        return { ...credentials, source: VAULT_KEYS.unified };
      }
    } catch {
      // A corrupt/unavailable slot is reported by the normal login path.
    }
    return null;
  }

  async _getAcademicApiCredentials() {
    // The direct academic API is a separate credential/session channel. It is
    // available on Android as well as desktop, but only when explicitly
    // enabled in settings; it never supplies the CAS/WebView password.
    if (this._state?.settings?.academicApiEnabled !== true) return null;
    try {
      const credentials = await this.vault.getSecret(VAULT_KEYS.academicApi);
      if (credentials?.username && credentials?.password) {
        return { ...credentials, source: VAULT_KEYS.academicApi };
      }
    } catch {
      // Keep the unified credential path available when the optional slot is unreadable.
    }
    return null;
  }

  async _getStoredAcademicCredentials() {
    // This helper is retained for API-only operations and compatibility with
    // older callers. Interactive/native login uses _getUnifiedCredentials()
    // explicitly and therefore cannot accidentally submit the API password to
    // the CAS flow.
    return await this._getAcademicApiCredentials() || await this._getUnifiedCredentials();
  }

  async _campusCookieHeader(host = 'jwglxt.buct.edu.cn') {
    // SessionService stores path/host scoped cookies separately. Keep the
    // JWGLXT and THEOL jars independent so two same-named JSESSIONID cookies
    // cannot overwrite one another before a request reaches the campus host.
    const normalizedHost = String(host || 'jwglxt.buct.edu.cn').trim().toLowerCase()
    try { this.session.load?.(normalizedHost) } catch { /* ignore stale local jar */ }
    const headers = []
    try {
      const persisted = this.session.getCookieHeader?.(normalizedHost)
      if (persisted) headers.push(String(persisted))
    } catch { /* ignore unavailable local storage */ }
    try {
      const native = await this.session.getNativeCookies?.(normalizedHost)
      if (native) headers.push(String(native))
    } catch { /* fall back to the adopted in-memory jar */ }
    const merged = new Map()
    for (const header of headers) {
      for (const part of header.split(';')) {
        const separator = part.indexOf('=')
        if (separator <= 0) continue
        const name = part.slice(0, separator).trim()
        if (name) merged.set(name, part.slice(separator + 1).trim())
      }
    }
    return [...merged].map(([name, value]) => `${name}=${value}`).join('; ')
  }

  async _createAcademicClient(credentials = null, { useCampusCookies = false, sourceLabel = null, timeoutMs = null, cookieHost = 'jwglxt.buct.edu.cn' } = {}) {
    const cookieHeader = useCampusCookies ? await this._campusCookieHeader(cookieHost) : '';
    const channelLabel = sourceLabel || (credentials?.source === VAULT_KEYS.academicApi ? '教务 API' : '统一身份认证教务');
    const options = {
      username: String(credentials?.username || ''),
      password: String(credentials?.password || ''),
      sourceLabel: channelLabel,
      // The CAS cookie is shared by JWGLXT and THEOL. Keep the allowlist
      // explicit instead of reusing a client that rejects course.buct.edu.cn.
      allowedHosts: ['jwglxt.buct.edu.cn', 'course.buct.edu.cn'],
      ...(cookieHeader ? { cookieHeader } : {}),
      ...(this._webPreview
        ? { fetchImpl: previewFetch, requestUrl: previewRequestUrl }
        : this._native
          ? { fetchImpl: nativeFetch, timeoutMs: timeoutMs || timeoutMilliseconds(NETWORK_TIMEOUTS.JWGLXT_LOGIN) }
          : {}),
    };
    if (this._academicClientFactory) return this._academicClientFactory(options);
    const { AcademicApiClient } = await import('../../core/academic-api-client.mjs');
    return new AcademicApiClient(options);
  }

  async _loginTheolMobile(credentials) {
    if (!credentials?.username || !credentials?.password) return false;
    const client = await this._createAcademicClient(credentials, {
      sourceLabel: '北化在线THEOL',
      timeoutMs: timeoutMilliseconds(NETWORK_TIMEOUTS.THEOL_COURSE),
    });
    if (typeof client?.form !== 'function' || typeof client?.request !== 'function') return false;
    const loginFields = {
      deviceUuid: this._theolDeviceUuid,
      appVersion: THEOL_PROTOCOL_VERSION,
      j_password: String(credentials.password),
      devicePlatform: 'android',
      deviceVersion: 'Android',
      j_username: String(credentials.username),
      deviceName: 'BetterBUCT Android',
    };
    const sessionRaw = await client.form(`${THEOL_MOBILE_BASE}getSessionId.do`, loginFields, {
      source: '北化在线THEOL 移动登录会话',
    });
    const sessionPayload = JSON.parse(String(sessionRaw).replace(/^\uFEFF/u, "").trim());
    const sessionId = mobileResponseSession(sessionPayload);
    if (mobileResponseStatus(sessionPayload) !== 1 || !sessionId) {
      throw new Error(mobileResponseError(sessionPayload));
    }
    // Courser's mature mobile flow carries the server-issued JSESSIONID on
    // every following request. The mobile endpoint does not reliably expose
    // this path-scoped cookie through Set-Cookie, so adopt the JSON session id
    // explicitly in the same client cookie jar.
    client.adoptCookieHeader(`JSESSIONID=${sessionId}`);

    const loginRaw = await client.form(`${THEOL_MOBILE_BASE}login_check.do`, loginFields, {
      source: '北化在线THEOL 移动登录验证',
    });
    const loginPayload = JSON.parse(String(loginRaw).replace(/^\uFEFF/u, "").trim());
    const loginStatus = mobileResponseStatus(loginPayload);
    const loginSession = mobileResponseSession(loginPayload) || sessionId;
    if (loginStatus !== 1 || !loginSession) {
      throw new Error(mobileResponseError(loginPayload));
    }
    client.adoptCookieHeader(`JSESSIONID=${loginSession}`);

    const probe = await client.request(`${THEOL_MOBILE_BASE}stuUnDoTaskList.do`, {}, 0);
    const probePayload = JSON.parse(String(probe.text).replace(/^\uFEFF/u, "").trim());
    const probeStatus = mobileResponseStatus(probePayload);
    if (probeStatus !== 1) {
      throw new Error(mobileResponseError(probePayload, '北化在线移动端会话未建立'));
    }
    this._theolMobileClient = client;
    return true;
  }

  async _recoverTheolMobileSession() {
    if (!this._native || this._explicitlyLoggedOut) return false;
    const credentials = await this._getUnifiedCredentials();
    if (!credentials) return false;
    try {
      const recovered = await this._loginTheolMobile(credentials);
      if (!recovered) return false;
      // CampusSync caches its TheolAdapter/client. Recreate only the
      // orchestration object, while retaining the already verified JWGLXT
      // client. Setting _campusSync to null here would make the recursive
      // retry reopen the CAS page and can turn a successful THEOL recovery
      // into an unrelated JWGLXT timeout.
      const campusClient = this._campusClient;
      this._campusSync = campusClient
        ? await this._createCampusSync(campusClient, { clientSource: 'browser' })
        : null;
      this._authRecovery.failures = 0;
      this._authRecovery.lastAt = 0;
      return true;
    } catch (error) {
      this._theolMobileClient = null;
      console.warn('[theia-mobile] THEOL mobile login failed:', error?.message || String(error));
      return false;
    }
  }

  async _createCampusSync(client = null, { clientSource = 'browser' } = {}) {
    const apiEnabled = this._state?.settings?.academicApiEnabled === true;
    const credentialKeys = apiEnabled
      ? [VAULT_KEYS.academicApi, VAULT_KEYS.unified]
      : [VAULT_KEYS.unified];
    const options = {
      vault: this.vault,
      client,
      credentialKeys,
      apiEnabled,
      apiCredentialKey: VAULT_KEYS.academicApi,
      clientSource,
      clientFactory: (credentials) => this._createAcademicClient(credentials, {
        sourceLabel: clientSource === 'academic-api' ? '教务 API' : '统一身份认证教务',
      }),
      apiClientFactory: (credentials) => this._createAcademicClient(credentials, { sourceLabel: '教务 API' }),
      theolClientFactory: async () => {
        if (this._webPreview) return client;
        const browserClient = client || this._campusClient || await this._createAcademicClient(null, {
          useCampusCookies: true,
          cookieHost: 'course.buct.edu.cn',
          sourceLabel: '北化在线THEOL',
        });
        const mobileClient = this._theolMobileClient;
        if (!mobileClient || mobileClient === browserClient) return browserClient;
        // Keep legacy HTML/course pages on the verified CAS cookie while the
        // Courser-compatible mobile JSON feed uses its own JSESSIONID.
        return {
          page: (...args) => browserClient.page(...args),
          form: (...args) => browserClient.form(...args),
          binary: (...args) => browserClient.binary(...args),
          // Homework content is served by the Courser-compatible mobile
          // session, not by the legacy CAS HTML session.
          assignmentBinary: (...args) => mobileClient.binary(...args),
          async json(url, init = {}, options = {}) {
            const result = await mobileClient.request(url, {
              ...init,
              headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json',
                ...(init?.headers || {}),
              },
            }, 0);
            try { return JSON.parse(result.text); }
            catch { throw new Error('THEOL JSON 端点返回了非 JSON 响应'); }
          },
          setDiagnostic: (cb) => {
            browserClient.setDiagnostic?.(cb);
            mobileClient.setDiagnostic?.(cb);
          },
        };
      },
      requestUrl: this._webPreview ? previewRequestUrl : null,
      fetchImpl: this._webPreview ? previewFetch : this._native ? nativeFetch : null,
      onProgress: (progress) => {
        if (progress?.stage && progress?.status) {
          this.events.emit('sync-progress', {
            stage: progress.stage,
            status: progress.status,
            label: progress.label || undefined,
            error: progress.error || undefined,
          });
        }
      },
      onDiagnostic: (event, fields) => {
        console.debug('[theia-mobile] campus diagnostic:', event, fields);
      },
    };
    if (this._campusSyncFactory) return this._campusSyncFactory(options);
    const { CampusSync } = await import('./campus/campus-sync.mjs');
    return new CampusSync(options);
  }

  _markCampusAuthRequired(error) {
    this._campusClient = null;
    this._campusSync = null;
    this._theolMobileClient = null;
    const message = errorText(error);
    this._auth = {
      jwglxt: { connected: false, unchecked: false, authRequired: true, error: message, mode: 'unified' },
      theol: { connected: false, unchecked: true, authRequired: true, mode: 'unified' },
    };
    this.events.emit('auth-status', this._auth);
  }

  _markCampusConnectionFailure(error, mode = 'unified') {
    const message = errorText(error);
    this._auth = {
      jwglxt: { connected: false, unchecked: false, error: message, mode },
      theol: { connected: false, unchecked: true, mode: mode === 'academic-api' ? 'academic-api' : 'unified' },
    };
    this.events.emit('auth-status', this._auth);
  }

  _markCampusAuthPending(label = '正在自动恢复校园会话…') {
    this._auth = {
      jwglxt: { connected: false, unchecked: false, authPending: true },
      theol: { connected: false, unchecked: false, authPending: true },
    };
    this.events.emit('auth-status', this._auth);
    this.events.emit('sync-progress', { stage: 'login', status: 'syncing', label });
  }

  _resetAuthRecovery() {
    this._authRecovery = { inFlight: null, lastAt: 0, failures: 0 };
  }

  async _recoverCampusSession({ background = false, reason = 'sync' } = {}) {
    if (!this._native || this._explicitlyLoggedOut) return false;
    const credentials = await this._getUnifiedCredentials();
    if (!credentials) return false;
    if (this._authRecovery.inFlight) return this._authRecovery.inFlight;

    const now = Date.now();
    if (now - this._authRecovery.lastAt >= 60_000) this._authRecovery.failures = 0;
    if (this._authRecovery.failures >= 3) return false;
    this._authRecovery.lastAt = now;
    this._authRecovery.failures += 1;

    const run = (async () => {
      this._markCampusAuthPending(
        reason === 'startup' ? '正在自动恢复校园统一身份认证…' : '会话已失效，正在自动重新登录…',
      );
      this._campusClient = null;
      this._campusSync = null;
      this._theolMobileClient = null;
      this._csService = null;
      try {
        await this.session.clear?.('jwglxt.buct.edu.cn');
        await this._loginWithCas(credentials, {
          silent: true,
          autoRecover: true,
          forceReauth: true,
          sync: false,
          background,
        });
        this._authRecovery.failures = 0;
        return true;
      } catch (error) {
        this._markCampusAuthRequired(error);
        return false;
      }
    })();
    this._authRecovery.inFlight = run;
    try {
      return await run;
    } finally {
      if (this._authRecovery.inFlight === run) this._authRecovery.inFlight = null;
    }
  }

  async _finishCampusLogin(client, credentials = null, { sync = true, background = false, skipLoginWait = false } = {}) {
    this._campusClient = client;
    this._campusSync = await this._createCampusSync(client, {
      clientSource: credentials?.source === VAULT_KEYS.academicApi ? 'academic-api' : 'browser',
    });
    this._authRecovery.failures = 0;
    this._authRecovery.lastAt = 0;
    const channelMode = credentials?.source === VAULT_KEYS.academicApi ? 'academic-api' : 'unified';
    this._auth = {
      jwglxt: { connected: true, unchecked: false, mode: channelMode },
      theol: { connected: false, unchecked: true, mode: channelMode },
    };
    if (credentials?.source === VAULT_KEYS.academicApi) {
      this._academicApiCredentialStatus = {
        ...this._academicApiCredentialStatus,
        saved: true,
        username: credentials.username,
        encryptionAvailable: typeof this.vault.isAvailable === 'function' ? Boolean(this.vault.isAvailable()) : true,
        enabled: true,
      };
    }
    if (credentials?.username) {
      this._credentialStatus = {
        ...this._credentialStatus,
        saved: true,
        username: credentials.username,
        encryptionAvailable: typeof this.vault.isAvailable === 'function' ? Boolean(this.vault.isAvailable()) : true,
      };
    }
    this.events.emit('auth-status', this._auth);
    this.events.emit('sync-progress', { stage: 'all', status: 'done', label: '教务系统登录成功，正在读取校园数据…' });
    if (sync) await this.syncNow({ background, skipLoginWait });
  }

  async _loginWithCas(credentials = null, {
    silent = false,
    sync = true,
    interactive = false,
    background = false,
    autoRecover = false,
    forceReauth = false,
  } = {}) {
    // A WebView cookie may survive process death. Reuse it before opening a
    // new login page; this is the persistent-login path and avoids needless
    // password submissions. Automatic recovery deliberately skips this step
    // after an authoritative expiry so a stale cookie cannot be handed back.
    const existingCookies = forceReauth ? '' : await this._campusCookieHeader();
    if (existingCookies) {
      this.events.emit('sync-progress', { stage: 'login', status: 'syncing', label: '正在尝试恢复已有登录状态…' });
      try {
        const reused = await this._createAcademicClient(credentials, { useCampusCookies: true, timeoutMs: timeoutMilliseconds(NETWORK_TIMEOUTS.JWGLXT_REUSE) });
        await reused.page(JWGLXT_HOME, { source: '教务系统' });
        this.events.emit('sync-progress', { stage: 'login', status: 'syncing', label: '登录状态验证成功' });
        await this._finishCampusLogin(reused, credentials, { sync, background, skipLoginWait: true });
        return;
      } catch {
        // The browser cookie expired; discard only the campus session snapshot
        // before the bounded native login below refreshes it. Saved unified
        // credentials remain untouched.
        this.events.emit('sync-progress', { stage: 'login', status: 'syncing', label: '已有登录状态已失效，重新登录中…' });
        if (autoRecover) {
          try { await this.session.clear?.('jwglxt.buct.edu.cn'); } catch { /* retry below */ }
        }
      }
    }

    // A silent restore without a saved password remains non-interactive. When
    // the user has explicitly saved the unified credential, autoRecover lets
    // the native restricted activity refresh the expired CAS session itself.
    if (silent && !autoRecover) throw new Error('校园会话已失效，请在设置中重新登录');
    const result = await this.loginWithRestrictedWebView({
      url: unifiedLoginUrl(),
      // SessionService strips these values before the real Capacitor call;
      // keeping them here preserves the injectable/test seam while the native
      // activity still reads saved credentials directly from Android Keystore.
      username: credentials?.username || '',
      password: credentials?.password || '',
      // Match the mature BetterBUCT desktop flow: user-initiated recovery still
      // autofills the saved unified credential. Manual entry is used only when
      // no credential was saved (or the caller explicitly has no password).
      autoFill: Boolean(credentials?.username && credentials?.password),
    });
    if (result.canceled) throw new Error('统一身份认证已取消');
    this.events.emit('sync-progress', { stage: 'login', status: 'syncing', label: '正在验证教务系统登录状态…' });
    const cookieHeader = await this._campusCookieHeader();
    if (!cookieHeader) throw new Error('统一身份认证未建立教务系统会话');
    // RestrictedLoginActivity only returns after it has rendered and
    // validated an authenticated JWGLXT page. Do not issue a second native
    // GET to index_initMenu here: that redundant probe was the main source of
    // the 45-second post-login timeout on Android. The first real sync still
    // verifies the returned campus cookie and keeps the cached data on failure.
    this.events.emit('sync-progress', { stage: 'login', status: 'syncing', label: '登录成功，正在初始化数据同步…' });
    const client = await this._createAcademicClient(credentials, { useCampusCookies: true });
    await this._finishCampusLogin(client, credentials, { sync, skipLoginWait: true });
  }

  async login(options = {}) {
    await this.init();
    if (this._loginInFlight) return this._loginInFlight;
    const run = this._loginInternal(options);
    this._loginInFlight = run;
    try {
      return await run;
    } finally {
      if (this._loginInFlight === run) this._loginInFlight = null;
    }
  }

  async _loginInternal({ silent = false, interactive = false, background = false, autoRecover = false } = {}) {
    if (!silent) {
      this._explicitlyLoggedOut = false;
      this._resetAuthRecovery();
      // The banner's manual action is a real re-login, not another silent
      // restore attempt. Drop stale clients, cookies, and saved cookie
      // snapshots before opening the restricted CAS page.
      this._campusClient = null;
      this._campusSync = null;
      this._theolMobileClient = null;
      try { await this.session.clear?.('jwglxt.buct.edu.cn'); } catch { /* retry below */ }
    }
    this.events.emit('sync-progress', { stage: 'all', status: 'syncing', label: '正在连接校园系统…' });
    // Match BetterBUCT's two-channel contract: unified credentials belong to the
    // CAS/browser session; the optional API slot is independent. In a native
    // build, having both slots must never make the unified login submit the API
    // password to Zhengfang's direct-login endpoint.
    const unifiedCredentials = await this._getUnifiedCredentials();
    const apiCredentials = await this._getAcademicApiCredentials();
    const credentials = unifiedCredentials || apiCredentials;
    // Cookie-only sign-in is a supported persistent session when the user
    // chose not to store a password. Verify/reuse that WebView session before
    // deciding that the native CAS route is unavailable.
    const cachedCookies = this._native ? await this._campusCookieHeader() : '';
    const apiOnly = !unifiedCredentials && credentials?.source === VAULT_KEYS.academicApi;
    const canUseCas = !this._webPreview && (!this._native || Boolean(unifiedCredentials) || interactive || Boolean(cachedCookies));
    const canUsePreviewApi = this._webPreview && Boolean(credentials?.username && credentials?.password);
    // Native Android also supports API-only operation. It must not be gated by
    // the CAS/WebView cookie check, because that channel is intentionally
    // independent and may have no browser session at all.
    const canUseApiOnly = apiOnly && Boolean(credentials?.username && credentials?.password);
    if (canUseCas || canUsePreviewApi || canUseApiOnly) {
      try {
        if (this._webPreview) {
          // Preview has no native CAS WebView. Keep its API path for local
          // proxy development, while installed Android uses the CAS path.
          console.debug(`[theia-mobile] campus login mode=preview-api source=${credentials.source || 'unknown'}`);
          const client = await this._createAcademicClient(credentials);
          await client.login();
          await this._finishCampusLogin(client, credentials, { skipLoginWait: true });
        } else if (!apiOnly || interactive) {
          console.debug(`[theia-mobile] campus login mode=cas source=${unifiedCredentials ? 'unified-credentials' : 'manual'}`);
          await this._loginWithCas(unifiedCredentials, { silent, sync: true, interactive, background, autoRecover });
        } else {
          // API-only login remains available only when the user has no saved
          // unified credential and explicitly enabled the API data channel.
          console.debug('[theia-mobile] campus login mode=academic-api source=academic-api-credentials');
          const client = await this._createAcademicClient(apiCredentials);
          await client.login();
          await this._finishCampusLogin(client, credentials, { skipLoginWait: true });
        }
        return;
      } catch (error) {
        console.warn('[theia-mobile] campus login failed:', error);
        if (isCampusAuthFailure(error)) this._markCampusAuthRequired(error);
        else this._markCampusConnectionFailure(error, apiOnly ? 'academic-api' : 'unified');
        this.events.emit('sync-progress', { stage: 'all', status: 'error', label: apiOnly ? '教务 API 连接失败' : '校园登录失败', error: error?.message || String(error) });
        throw error;
      }
    }
    if (this._demoMode) {
      this._auth = { ...connectedStatus() };
      this.events.emit('auth-status', this._auth);
      await this.syncNow();
      return;
    }
    if (this._webPreview) {
      throw new Error('浏览器预览需要先填写统一身份认证账号和密码，无法直接打开原生登录窗口');
    }
    if (interactive) {
      // Manual login is allowed even when no password is stored. The native
      // restricted page remains the source of truth and returns only cookies.
      try {
        await this._loginWithCas(null, { silent: false, sync: true, interactive: true, background: false, autoRecover: false });
        return;
      } catch (error) {
        if (isCampusAuthFailure(error)) this._markCampusAuthRequired(error);
        else this._markCampusConnectionFailure(error, 'unified');
        this.events.emit('auth-status', this._auth);
        throw error;
      }
    }
    const message = silent
      ? '未找到可恢复的校园账号，请在设置中完成登录'
      : '请先在设置中保存统一身份认证账号和密码';
    throw new Error(message);
  }

  async logout() {
    this._explicitlyLoggedOut = true;
    this._resetAuthRecovery();
    this._campusClient = null;
    this._campusSync = null;
    this._theolMobileClient = null;
    this._theolDeviceUuid = crypto.randomUUID ? crypto.randomUUID() : `theia-${Date.now()}`;
    this._csService = null;
    this.session.clear();
    this._auth = { ...disconnectedStatus() };
    this.events.emit('auth-status', this._auth);
    // Leave data intact, just disconnect
  }

  async syncNow({ background = false, authRecoveryAttempted = false, skipLoginWait = false } = {}) {
    await this.init();
    if (this._syncing) return this._state;
    if (!skipLoginWait && !this._campusSync && this._loginInFlight) {
      try { await this._loginInFlight; } catch { /* the current sync path reports the failure */ }
      if (this._campusSync) return this.syncNow({ background, authRecoveryAttempted, skipLoginWait: true });
    }
    if (background && this._auth?.jwglxt?.authRequired && !this._campusSync) {
      const credentials = await this._getUnifiedCredentials();
      if (!credentials) return structuredClone(this._state);
    }
    this._syncing = true;
    const priorLastSuccessAt = this._state.sync.lastSuccessAt || null;
    this._state.sync.lastStartedAt = new Date().toISOString();
    this._state.sync.runId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    this._publishState();

    const emitProgress = (stage, status, label, error, metadata = {}) => {
      this.events.emit('sync-progress', { stage, status, label, error, ...metadata });
    };

    try {
      // Keep the two BetterBUCT authentication channels separate. On native
      // Android, a saved unified credential first restores/reuses the CAS
      // session; it must not silently fall through to the API password path.
      const unifiedCredentials = await this._getUnifiedCredentials();
      const apiCredentials = await this._getAcademicApiCredentials();
      if (!this._campusSync && this._native) {
        const cookies = await this._campusCookieHeader();
        if (unifiedCredentials || cookies) {
          await this._loginWithCas(unifiedCredentials, {
            silent: true,
            autoRecover: Boolean(unifiedCredentials),
            sync: false,
            background: true,
          });
        }
      }
      const apiEligible = !unifiedCredentials && Boolean(apiCredentials);
      const hasRealCredentials = Boolean(this._campusSync || apiEligible || (this._webPreview && (unifiedCredentials || apiCredentials)));
      if (hasRealCredentials) {
        emitProgress('all', 'syncing', '正在更新校园数据…');
        if (!this._campusSync) {
          const credentials = apiEligible ? apiCredentials : (unifiedCredentials || apiCredentials);
          const client = await this._createAcademicClient(credentials);
          await client.login();
          this._campusClient = client;
          this._campusSync = await this._createCampusSync(client, {
            clientSource: apiEligible ? 'academic-api' : 'browser',
          });
        }
        const campusSync = this._campusSync;
        const jwglxtSync = await campusSync.syncJwglxt(this._state, {
          domains: ['profile', 'terms', 'schedule', 'grades', 'exams', 'selected-courses', 'academic-progress', 'notices'],
        });
        this._state = jwglxtSync.state;
        const jwglxtSource = jwglxtSync.result?.source || {};
        const jwglxtError = jwglxtSync.result?.errors?.[0] || jwglxtSource.error || null;
        const jwglxtConnected = jwglxtSource.connected !== false;
        if (!jwglxtConnected && jwglxtError) {
          const authFailure = isCampusAuthFailure(jwglxtError);
          if (authFailure) this._markCampusAuthRequired(jwglxtError);
          else this._markCampusConnectionFailure(jwglxtError, jwglxtSource.api?.enabled ? 'academic-api' : 'unified');
          if (authFailure) this._state.sync.lastError = null;
          await this._persist();
          emitProgress('all', 'error', authFailure ? '校园会话已失效，请重新登录' : '校园数据更新失败', jwglxtError, {
            background: Boolean(background),
            authRequired: authFailure,
          });
          this._publishState();
          if (!authFailure) {
            const { notifySyncResult } = await import('./notify.mjs');
            void notifySyncResult({ ok: false, error: jwglxtError });
          }
          return structuredClone(this._state);
        }

        // THEOL sync is best-effort: needs the shared CAS session (restricted
        // WebView login, stage 1.2). Without it, report auth-required without
        // failing the whole jwglxt sync.
        let theolConnected = false;
        let theolAuthRequired = false;
        try {
          emitProgress('theol', 'syncing', '正在同步北化在线THEOL…');
          const theol = await campusSync.syncTheol(this._state, { domains: ['courses', 'notices', 'assignments'] });
          if (theol.authRequired) {
            // Keep any course/notices data that was successfully merged before
            // the independent mobile task feed reported status=-2. The retry
            // below may recover the mobile JSESSIONID; if it cannot, cached
            // data must still remain visible instead of being discarded.
            if (theol.state) this._state = theol.state;
            theolAuthRequired = true;
            if (!authRecoveryAttempted) {
              const recovered = await this._recoverTheolMobileSession()
                || await this._recoverCampusSession({ background, reason: 'theol' });
              if (recovered) {
                this._syncing = false;
                return await this.syncNow({ background, authRecoveryAttempted: true, skipLoginWait: true });
              }
            }
            emitProgress('theol', 'error', 'THEOL 会话已失效（教务数据已保留）', 'auth_required');
          } else if (theol.state) {
            this._state = theol.state;
            theolConnected = true;
            emitProgress('theol', 'done', 'THEOL 同步完成');
          }
        } catch (theolError) {
          emitProgress('theol', 'error', 'THEOL 同步失败', String(theolError?.message || theolError));
        }

        // JWGLXT may have succeeded while the independent THEOL assignment
        // feed remains expired. Keep the latest attempt timestamp separate
        // from the last fully successful campus refresh.
        if (theolAuthRequired) this._state.sync.lastSuccessAt = priorLastSuccessAt;

        const channelMode = this._academicApiCredentialStatus.enabled && !this._credentialStatus.saved
          ? 'academic-api'
          : 'unified';
        this._auth = {
          jwglxt: { connected: jwglxtConnected, unchecked: false, mode: channelMode },
          theol: theolAuthRequired
            ? { connected: false, unchecked: false, authRequired: true, mode: 'unified' }
            : { connected: theolConnected, unchecked: !theolConnected, mode: channelMode },
        };
        await this._persist();
        this.events.emit('auth-status', this._auth);
        emitProgress('all', 'done', '校园数据更新完成');
        this._publishState();
        const { notifySyncResult } = await import('./notify.mjs');
        void notifySyncResult({
          ok: true,
          scheduleCount: this._state?.schedule?.length || 0,
        });
        import('./background.mjs').then(({ recordSyncNow }) => void recordSyncNow()).catch(() => undefined);
        return structuredClone(this._state);
      }

      if (!this._demoMode) {
        throw new Error('请先在设置中保存统一身份认证账号和密码');
      }
      // Mock/demo sync path is opt-in via ?demo=1 and never used by an installed app.
      emitProgress('all', 'syncing', '正在更新示例校园数据…');
      emitProgress('jwglxt', 'syncing', '正在登录教务系统…');
      await sleep(150);
      emitProgress('jwglxt', 'done', '教务系统同步完成');
      emitProgress('schedule', 'syncing', '正在同步课表…');
      await sleep(100);
      emitProgress('schedule', 'done', '课表同步完成');
      emitProgress('grades', 'syncing', '正在同步成绩…');
      await sleep(100);

      if (!this._state || !this._state.profile) {
        await this._seedInitialState();
      } else {
        this._state.sync.lastCompletedAt = new Date().toISOString();
        this._state.sync.lastRunAt = this._state.sync.lastCompletedAt;
        this._state.sync.lastSuccessAt = this._state.sync.lastCompletedAt;
        this._state.sync.lastError = null;
        this._state.sync.sources = {
          jwglxt: { label: '教务系统', lastSuccessAt: this._state.sync.lastCompletedAt },
          theol: { label: '北化在线THEOL', lastSuccessAt: this._state.sync.lastCompletedAt },
        };
        this._state.sync.domains = {
          profile: { lastSuccessAt: this._state.sync.lastCompletedAt },
          terms: { lastSuccessAt: this._state.sync.lastCompletedAt },
          schedule: { lastSuccessAt: this._state.sync.lastCompletedAt },
          grades: { lastSuccessAt: this._state.sync.lastCompletedAt },
          exams: { lastSuccessAt: this._state.sync.lastCompletedAt },
          'selected-courses': { lastSuccessAt: this._state.sync.lastCompletedAt },
          'academic-progress': { lastSuccessAt: this._state.sync.lastCompletedAt },
          notices: { lastSuccessAt: this._state.sync.lastCompletedAt },
        };
      }

      await this._persist();
      emitProgress('all', 'done', '校园数据更新完成');
      this._publishState();
      const { notifySyncResult } = await import('./notify.mjs');
      void notifySyncResult({ ok: true, scheduleCount: this._state?.schedule?.length || 0 });
      import('./background.mjs').then(({ recordSyncNow }) => void recordSyncNow()).catch(() => undefined);
    } catch (error) {
      const message = errorText(error);
      const authFailure = isCampusAuthFailure(error);
      if (authFailure && !authRecoveryAttempted) {
        const recovered = await this._recoverCampusSession({ background, reason: 'sync' });
        if (recovered) {
          // Release the outer guard before retrying so the bounded retry can
          // execute the real sync instead of returning the stale snapshot.
          this._syncing = false;
          return await this.syncNow({ background, authRecoveryAttempted: true, skipLoginWait: true });
        }
      }
      if (authFailure) {
        this._markCampusAuthRequired(error);
        // Auth expiry is recoverable. Keep cached data and let the UI expose
        // the explicit re-login action instead of opening a blocking dialog.
        this._state.sync.lastError = null;
      } else {
        this._state.sync.lastError = message;
        this._state.sync.lastCompletedAt = new Date().toISOString();
      }
      await this._persist();
      emitProgress(
        'all',
        'error',
        authFailure ? '校园会话已失效，请重新登录' : '校园数据更新失败',
        message,
        { background: Boolean(background), authRequired: authFailure },
      );
      this._publishState();
      if (!authFailure) {
        const { notifySyncResult } = await import('./notify.mjs');
        void notifySyncResult({ ok: false, error: message });
      }
    } finally {
      this._syncing = false;
    }
    return structuredClone(this._state);
  }

  async retrySyncDomain(domain) {
    // For stage 0, just re-trigger a full sync
    return this.syncNow({ background: false });
  }

  async refreshCourseResources() {
    throw new Error('课程资源在移动端开发中');
  }

  async downloadCourseResource() {
    throw new Error('课程资源下载在移动端开发中');
  }

  async queryFreeClassrooms(query) {
    await this.init();
    if (!query?.termId) throw new Error('请选择有效的教务学期');
    const term = (this._state?.terms || []).find((item) => item?.id === query.termId);
    if (!term) throw new Error('请选择有效的教务学期');
    if (!this._campusClient) await this.login({ silent: true });
    if (!this._campusSync) this._campusSync = await this._createCampusSync(this._campusClient);
    const { state } = await this._campusSync.syncJwglxt(this._state, {
      domains: ['free-classroom'],
      freeClassroom: { ...query, term },
    });
    this._state = state;
    await this._persist();
    this._publishState();
    return structuredClone(this._state);
  }

  async getCourseSelection() {
    return { ...this._courseSelection };
  }

  async _courseSelectionService() {
    if (this._csService) return this._csService;
    const { CourseSelectionService } = await import('../../core/course-selection.mjs');
    if (!this._campusClient) {
      const creds = await this._getStoredAcademicCredentials();
      if (creds?.username && creds?.password) {
        this._campusClient = await this._createAcademicClient(creds);
      }
    }
    if (!this._campusClient) throw new Error('选课需要先登录教务系统');
    const service = new CourseSelectionService({
      client: this._campusClient,
      getState: () => this._state || {},
      onChange: (snapshot) => {
        this._courseSelection = snapshot;
        this.events.emit('course-selection', snapshot);
      },
      onDiagnostic: (event, fields) => {},
    });
    this._csService = service;
    return service;
  }

  async discoverCourseSelection() {
    const service = await this._courseSelectionService();
    const portal = await service.discover();
    return portal;
  }

  async getCourseSelectionCandidates(blockId, target, options) {
    const service = await this._courseSelectionService();
    const result = await service.candidates(blockId, target, options);
    return result;
  }

  async searchSchoolSchedule() {
    throw new Error('全校课表查询在移动端开发中');
  }

  async getCachedSchoolSchedule() {
    return null;
  }

  async _motionAdapter() {
    if (this._motion) return this._motion;
    const { MotionVenueAdapter } = await import('../../core/adapters/motion.mjs');
    this._motion = new MotionVenueAdapter({ fetchImpl: this._native ? nativeFetch : globalThis.fetch });
    return this._motion;
  }

  async getMotionVenueCatalog() {
    await this.init();
    const adapter = await this._motionAdapter();
    const catalog = await adapter.discover();
    this._motionCatalog = catalog;
    this._state.dataCatalog = cacheMotionVenueCatalog(this._state.dataCatalog, catalog, catalog?.capturedAt);
    await this._persist();
    this._publishState();
    return catalog;
  }

  async refreshMotionVenueCatalog() {
    await this.init();
    const adapter = await this._motionAdapter();
    const catalog = await adapter.discover();
    this._motionCatalog = catalog;
    this._state.dataCatalog = cacheMotionVenueCatalog(this._state.dataCatalog, catalog, catalog?.capturedAt);
    await this._persist();
    this._publishState();
    return catalog;
  }

  async queryMotionVenueStatus(query) {
    await this.init();
    const adapter = await this._motionAdapter();
    const result = await adapter.queryStatus(query || {});
    this._state.dataCatalog = cacheMotionVenueStatus(this._state.dataCatalog, result, result?.capturedAt);
    await this._persist();
    this._publishState();
    return result;
  }

  async saveCourseSelectionTarget() {
    throw new Error('选课目标在移动端开发中');
  }

  async removeCourseSelectionTarget() {
    throw new Error('选课目标在移动端开发中');
  }

  async setCourseSelectionSentinel() {
    throw new Error('抢课哨兵在移动端开发中');
  }

  async startCourseSelection() {
    throw new Error('抢课在移动端开发中');
  }

  async stopCourseSelection() {
    throw new Error('抢课在移动端开发中');
  }

  async getAcademicCalendarAssets() {
    throw new Error('校历资料在移动端开发中');
  }

  async refreshAcademicCalendarAssets() {
    throw new Error('校历资料在移动端开发中');
  }

  async openSource(url) {
    if (typeof url !== 'string' || !/^https?:\/\//iu.test(url)) {
      throw new Error('仅可打开 HTTP(S) 来源链接');
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  }

  async openAcademicAttachment() {
    return { cached: false };
  }

  async openAssignmentSource(assignmentId) {
    await this.init();
    const assignment = this._state?.assignments?.find((item) => item?.id === assignmentId);
    if (!assignment?.sourceUrl) throw new Error('未找到该作业的来源链接');
    if (!/^https?:\/\/course\.buct\.edu\.cn\//iu.test(assignment.sourceUrl)) {
      throw new Error('作业来源链接不在北化在线THEOL白名单内');
    }
    window.open(assignment.sourceUrl, '_blank', 'noopener,noreferrer');
    return true;
  }

  async downloadAssignmentAttachment(assignmentId, attachment) {
    await this.init()
    const assignment = this._state?.assignments?.find((item) => item?.id === assignmentId)
    if (!assignment) throw new Error('未找到该作业，请先同步作业列表')
    if (!attachment?.url) throw new Error('作业附件链接为空')

    const readAttachment = async () => {
      if (!this._campusSync) await this.syncNow({ background: false })
      if (!this._campusSync?.downloadAssignmentAttachment) {
        throw new Error('北化在线THEOL会话未建立，请先完成统一身份认证登录')
      }
      const currentAssignment = this._state?.assignments?.find((item) => item?.id === assignmentId) || assignment
      return this._campusSync.downloadAssignmentAttachment(currentAssignment, attachment)
    }

    let result
    try {
      result = await readAttachment()
    } catch (error) {
      if (!isCampusAuthFailure(error)) throw error
      const recovered = await this._recoverTheolMobileSession()
        || await this._recoverCampusSession({ background: false, reason: 'theol-detail' })
      if (!recovered) throw error
      result = await readAttachment()
    }

    const bytes = bytesAsUint8Array(result?.buffer)
    if (!bytes.length) throw new Error('作业附件返回为空')
    const filename = safeDownloadName(filenameFromDisposition(result?.contentDisposition) || result?.title || '作业附件')
    const mime = String(result?.contentType || '').split(';', 1)[0].trim() || contentTypeFromName(filename)
    const native = Boolean(window.Capacitor?.isNativePlatform?.())
    if (native) {
      const { Filesystem, Directory } = await import('@capacitor/filesystem')
      const { Share } = await import('@capacitor/share')
      const path = `assignments/${safeDownloadName(assignmentId, 'assignment')}-${filename}`
      // Capacitor Share's Android FileProvider exposes the cache root, while
      // Directory.Data is not shareable on some emulator/API combinations.
      // Keep the fetched attachment in cache and share that URI directly.
      await Filesystem.mkdir({ path: 'assignments', directory: Directory.Cache, recursive: true })
      await Filesystem.writeFile({ path, directory: Directory.Cache, data: bytesToBase64(bytes) })
      const uri = await Filesystem.getUri({ path, directory: Directory.Cache })
      await Share.share({ title: filename, url: uri.uri, dialogTitle: '打开作业附件' })
      return { canceled: false, filePath: path, filename, bytes: bytes.length }
    }
    const blob = new Blob([bytes], { type: mime })
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = filename
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000)
    return { canceled: false, filePath: filename, filename, bytes: bytes.length }
  }

  async getAssignmentDetail(assignmentId) {
    await this.init();
    const assignment = this._state?.assignments?.find((item) => item?.id === assignmentId);
    if (!assignment) throw new Error('未找到该作业，请先同步作业列表');
    if (this._demoMode) return demoAssignmentDetail(assignment);

    const readDetail = async () => {
      // A cached task list can outlive the in-memory client after process death.
      // Re-enter the normal automated sync path so the saved unified session is
      // recovered before the detail request; no password is passed to THEOL here.
      if (!this._campusSync) await this.syncNow({ background: false });
      if (!this._campusSync?.getAssignmentDetail) {
        throw new Error('北化在线THEOL会话未建立，请先完成统一身份认证登录');
      }
      const currentAssignment = this._state?.assignments?.find((item) => item?.id === assignmentId) || assignment;
      return this._campusSync.getAssignmentDetail(currentAssignment);
    };

    let detail;
    try {
      detail = await readDetail();
    } catch (error) {
      // THEOL detail requests can expire independently after the list was
      // loaded. Reuse the same bounded native recovery gate as syncNow so the
      // user never needs to hunt for a second login button.
      if (!isCampusAuthFailure(error)) throw error;
      const recovered = await this._recoverTheolMobileSession()
        || await this._recoverCampusSession({ background: false, reason: 'theol-detail' });
      if (!recovered) throw error;
      detail = await readDetail();
    }
    // homeworkView.do can report hasSubmit=true for a pending task shell.
    // Never let opening a detail card mutate the authoritative task-list
    // status; the next list sync is the only source allowed to change it.
    return detail;
  }

  async openSchedulePdf() {
    throw new Error('课表 PDF 导出在移动端开发中');
  }

  async getCourseWorkQueue() {
    return { ...this._courseWorkQueue };
  }

  async setCourseWorkQueueEnabled() {
    throw new Error('课程任务后台队列在移动端开发中');
  }

  async enqueueCourseWork() {
    throw new Error('课程任务后台队列在移动端开发中');
  }

  async cancelCourseWorkJob() {
    throw new Error('课程任务后台队列在移动端开发中');
  }

  async prepareCourseWork() {
    throw new Error('课程工作包在移动端开发中');
  }

  async openCourseWork() {
    throw new Error('课程工作包在移动端开发中');
  }

  async importCourseWorkFile() {
    throw new Error('课程工作包在移动端开发中');
  }

  async openSubmission() {
    throw new Error('作业提交在移动端开发中');
  }

  async applyTestAnswers() {
    throw new Error('在线测试回填在移动端开发中');
  }

  async exportData(format, collection) {
    await this.init();
    const { toTheiaFeed, toIcs } = await import('./feed.mjs');
    let filename = '';
    let content = '';
    let mime = 'application/json';
    if (format === 'json' || format === 'theia') {
      filename = 'theia-feed.json';
      content = JSON.stringify(toTheiaFeed(this._state), null, 2);
      mime = 'application/json';
    } else if (format === 'ics') {
      filename = 'theia-calendar.ics';
      content = toIcs(this._state);
      mime = 'text/calendar';
    } else if (format === 'csv' && collection) {
      const items = Array.isArray(this._state?.[collection]) ? this._state[collection] : [];
      const keys = [...new Set(items.flatMap((item) => Object.keys(item || {})))]
        .filter((key) => !['raw', 'rawHtml', 'sourceUrl'].includes(key));
      const escape = (value) => {
        const text = value === null || value === undefined ? '' : String(value);
        return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
      };
      content = [keys.join(','), ...items.map((item) => keys.map((key) => escape(item?.[key])).join(','))].join('\r\n') + '\r\n';
      filename = 'theia-' + collection + '.csv';
      mime = 'text/csv';
    } else {
      throw new Error('该导出格式在移动端开发中');
    }

    const native = Boolean(window.Capacitor?.isNativePlatform?.());
    if (native) {
      try {
        const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
        const { Share } = await import('@capacitor/share');
        const path = 'exports/' + filename;
        await Filesystem.mkdir({ path: 'exports', directory: Directory.Data, recursive: true });
        await Filesystem.writeFile({ path, directory: Directory.Data, data: content, encoding: Encoding.UTF8 });
        const uri = await Filesystem.getUri({ path, directory: Directory.Data });
        await Share.share({ title: 'BetterBUCT 数据导出', url: uri.uri, dialogTitle: '分享数据包' });
        return { canceled: false, filePath: path, files: 1 };
      } catch {
        // Fall through to web-style download if share fails
      }
    }
    try {
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      // No DOM available; still report success so callers can proceed.
    }
    return { canceled: false, filePath: filename, files: 1 };
  }

  async openDataDirectory() {
    throw new Error('本地数据目录仅在桌面客户端可用');
  }

  async getModelStatus() {
    return { ...this._modelStatus };
  }

  async saveModelConfig(config) {
    if (config.apiKey) {
      await this.vault.setSecret(VAULT_KEYS.modelApiKey, config.apiKey);
    }
    this._modelStatus = {
      configured: true,
      baseUrl: config.baseUrl || '',
      model: config.model || '',
      apiKeySaved: Boolean(config.apiKey) || this._modelStatus.apiKeySaved,
      encryptionAvailable: true,
    };
    if (this._state) {
      this._state.settings.modelBaseUrl = config.baseUrl || '';
      this._state.settings.modelProvider = config.provider || 'openai-compatible';
      this._state.settings.modelName = config.model || '';
      if (config.modelRouting) this._state.settings.modelRouting = { ...this._state.settings.modelRouting, ...config.modelRouting };
      if (config.advisorConfig) this._state.settings.advisorConfig = { ...this._state.settings.advisorConfig, ...config.advisorConfig };
      await this._persist();
    }
    return { ...this._modelStatus };
  }

  async clearModelApiKey() {
    await this.vault.removeSecret(VAULT_KEYS.modelApiKey);
    this._modelStatus.apiKeySaved = false;
    return { ...this._modelStatus };
  }

  async cancelModelRequests() {
    return { cancelled: 0 };
  }

  async validateModelConnection() {
    throw new Error('模型连接验证在移动端开发中');
  }

  async discoverModels() {
    throw new Error('模型发现在移动端开发中');
  }

  async processCourseWorkWithModel() {
    throw new Error('模型处理在移动端开发中');
  }

  async renderAnswerPdf() {
    throw new Error('PDF 渲染在移动端开发中');
  }

  async openAnswerPdf() {
    throw new Error('PDF 打开在移动端开发中');
  }

  async summarizeNotices() {
    throw new Error('通知摘要仅在桌面客户端可用');
  }

  async generateNotes() {
    throw new Error('笔记生成在移动端开发中');
  }

  async generatePaper() {
    throw new Error('论文生成在移动端开发中');
  }

  async renderMdFile() {
    throw new Error('PDF 渲染在移动端开发中');
  }

  // ── Mobile-only extensions (not part of the desktop TheiaBridge) ─────
  // Import a theia-feed data package (exported by desktop or mobile) into the
  // local sharded store. Enables device-to-device migration without a server.
  async importDataPackage(payload) {
    await this.init();
    const data = typeof payload === 'string'
      ? JSON.parse(payload)
      : payload;
    if (!data || typeof data !== 'object') {
      throw new Error('数据包格式不受支持');
    }
    const academic = data.academic || {};
    const imported = {
      ...this._state,
      profile: data.profile || this._state.profile,
      terms: Array.isArray(academic.terms) && academic.terms.length ? academic.terms : this._state.terms,
      courses: Array.isArray(academic.courses) && academic.courses.length ? academic.courses : this._state.courses,
      schedule: Array.isArray(academic.schedule) && academic.schedule.length ? academic.schedule : this._state.schedule,
      grades: Array.isArray(academic.grades) && academic.grades.length ? academic.grades : this._state.grades,
      selectedCourses: Array.isArray(academic.selectedCourses) && academic.selectedCourses.length
        ? academic.selectedCourses
        : this._state.selectedCourses,
      academicProgress: academic.academicProgress || this._state.academicProgress,
      exams: Array.isArray(academic.exams) && academic.exams.length ? academic.exams : this._state.exams,
      assignments: Array.isArray(academic.assignments) && academic.assignments.length
        ? academic.assignments
        : this._state.assignments,
      notices: Array.isArray(academic.notices) && academic.notices.length ? academic.notices : this._state.notices,
    };
    this._state = imported;
    this._state.updatedAt = new Date().toISOString();
    await this._persist();
    this._publishState();
    return structuredClone(this._state);
  }

  // Mobile-only diagnostics helper (used by tests/devtools)
  async getMobileStorageSummary() {
    await this.init();
    return this.store.storageSummary();
  }

  _unsupportedUpdateStatus() {
    return {
      supported: false,
      state: 'unsupported',
      currentVersion: this._state?.appVersion || 'mobile',
      availableVersion: null,
      releaseName: null,
      releaseDate: null,
      lastCheckedAt: null,
      progress: null,
      updateSizeBytes: null,
      error: null,
    };
  }

  async getUpdateStatus() {
    await this.init();
    return structuredClone(this._mobileUpdateStatus || mobileUpdateIdleStatus(this._state?.appVersion));
  }

  async checkForUpdates() {
    await this.init();
    const currentVersion = String(this._state?.appVersion || APP_VERSION_LABEL).replace(/-mobile$/u, '');
    this._mobileUpdateStatus = { ...mobileUpdateIdleStatus(currentVersion), state: 'checking' };
    this.events.emit('update-status', structuredClone(this._mobileUpdateStatus));
    const info = await checkForMobileUpdate(currentVersion);
    this._mobileUpdateStatus = info
      ? mobileUpdateStatusFromInfo(info)
      : { ...mobileUpdateIdleStatus(currentVersion), state: 'error', lastCheckedAt: new Date().toISOString(), error: '无法读取 Android Release 信息，请稍后重试' };
    this.events.emit('update-status', structuredClone(this._mobileUpdateStatus));
    return structuredClone(this._mobileUpdateStatus);
  }

  async downloadUpdate() {
    await this.init();
    const status = this._mobileUpdateStatus || mobileUpdateIdleStatus(this._state?.appVersion);
    const url = status.downloadUrl;
    if (!url) return structuredClone(status);
    const opened = openMobileUpdateUrl(url);
    this._mobileUpdateStatus = { ...status, state: opened ? 'downloaded' : 'error', error: opened ? null : '无法打开更新下载页' };
    this.events.emit('update-status', structuredClone(this._mobileUpdateStatus));
    return structuredClone(this._mobileUpdateStatus);
  }

  async skipUpdateVersion() { return this.getUpdateStatus(); }
  async installUpdate() { return this.downloadUpdate(); }

  async getApiStatus() {
    return {
      baseUrl: '',
      host: '127.0.0.1',
      port: 0,
      apiEndpoints: [],
      academicCalendarAssets: {},
      academicPlanAssetBaseUrl: '',
    };
  }

  async getFitnessScore(yearKey = undefined) {
    await this.init();
    const fitness = this._state?.dataCatalog?.collections?.fitness;
    const availableYears = fitness?.availableYears || [];
    const selected = yearKey && fitness?.records?.[yearKey]
      ? yearKey
      : availableYears.find((entry) => fitness.records?.[entry.yearKey])?.yearKey;
    const record = selected ? fitness.records?.[selected] : null;
    if (!record?.normalized) throw new Error('手机端暂未缓存体测成绩；可直接手工填写下方项目进行估算');
    return {
      ...record.normalized,
      yearKey: selected,
      availableYears,
      cachedAt: record.capturedAt || null,
      refreshState: record.refreshState || 'cached',
    };
  }

  async updateSettings(settings) {
    await this.init();
    if (this._state) {
      const nextSettings = { ...(settings || {}) };
      // Android supports both independent campus channels. Do not silently
      // rewrite the API toggle or auth mode when another setting is changed.
      Object.assign(this._state.settings, nextSettings);
      await this._persist();
      this._publishState();
    }
    return structuredClone(this._state);
  }

  async installMcpClients() {
    throw new Error('MCP 桌面专属');
  }

  // ── Event Subscriptions ─────────────────────────────────────────────────
  onSyncProgress(cb) {
    return this.events.on('sync-progress', cb);
  }

  onSnapshot(cb) {
    return this.events.on('snapshot', cb);
  }

  onAuthStatus(cb) {
    return this.events.on('auth-status', cb);
  }

  onCourseSelection(cb) {
    return this.events.on('course-selection', cb);
  }

  onCourseWorkQueue(cb) {
    return this.events.on('course-work-queue', cb);
  }

  onNewMail(cb) {
    return this.events.on('new-mail', cb);
  }

  onUpdateStatus(cb) {
    return this.events.on('update-status', cb);
  }

  onAppearanceMode() {
    return () => undefined;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
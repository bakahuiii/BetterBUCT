// window.theia mobile bridge implementation
// Implements the TheiaBridge contract (see src/types.ts) for the Capacitor WebView.
import { MobileStore } from './store/mobile-store.mjs';
import { createWebStorageBackend } from './store/web-storage-backend.mjs';
import { VaultService, VAULT_KEYS } from './vault/vault-service.mjs';
import { SessionService } from './session/session-service.mjs';
import { mockState } from './mock/mock-data.mjs';

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

// ── Mobile Bridge Class ────────────────────────────────────────────────────
export class MobileBridge {
  constructor({ storageBackend, vault, session } = {}) {
    this.events = new EventBus();
    this.backend = storageBackend || createWebStorageBackend();
    this.store = new MobileStore(this.backend);
    this.vault = vault || new VaultService();
    this.session = session || new SessionService();
    this._state = null;
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
        // If no auth, default disconnected
        this._auth = { ...disconnectedStatus() };
      }
    } catch (error) {
      console.warn('[theia-mobile] store load failed, using mock:', error);
    }
    if (!this._state) {
      // Seed with mock data for first-run or demo
      await this._seedMockData();
    }
    // Restore credential status from the vault
    try {
      const unified = await this.vault.getSecret(VAULT_KEYS.unified);
      const apiCreds = await this.vault.getSecret(VAULT_KEYS.academicApi);
      const mailCreds = await this.vault.getSecret(VAULT_KEYS.mail);
      const modelKey = await this.vault.getSecret(VAULT_KEYS.modelApiKey);
      this._credentialStatus = { saved: Boolean(unified), encryptionAvailable: true };
      this._academicApiCredentialStatus = {
        saved: Boolean(apiCreds),
        encryptionAvailable: true,
        enabled: Boolean(apiCreds) && this._state?.settings?.academicApiEnabled !== false,
      };
      this._mailCredentialStatus = { saved: Boolean(mailCreds), encryptionAvailable: true };
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
  }

  async _seedMockData() {
    this._state = structuredClone(mockState);
    this._state.appVersion = '0.5.1-mobile';
    this._state.createdAt = new Date().toISOString();
    this._state.updatedAt = this._state.createdAt;
    await this._persist();
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
    const keys = {
      unified: VAULT_KEYS.unified,
      'academic-api': VAULT_KEYS.academicApi,
      mail: VAULT_KEYS.mail,
      model: VAULT_KEYS.modelApiKey,
    };
    const value = await this.vault.getSecret(keys[kind] || kind);
    if (!value) return null;
    return typeof value === 'string' ? value : JSON.stringify(value);
  }

  async saveCredentials(credentials) {
    await this.init();
    await this.vault.setSecret(VAULT_KEYS.unified, {
      username: String(credentials?.username || ''),
      password: String(credentials?.password || ''),
      savedAt: new Date().toISOString(),
    });
    this._credentialStatus = { saved: true, encryptionAvailable: true };
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
    this._academicApiCredentialStatus = { saved: true, encryptionAvailable: true, enabled: true };
    if (this._state) this._state.settings.academicApiEnabled = true;
    await this._persist();
    return { ...this._academicApiCredentialStatus };
  }

  async clearCredentials() {
    await this.vault.removeSecret(VAULT_KEYS.unified);
    await this.vault.removeSecret(VAULT_KEYS.academicApi);
    await this.vault.removeSecret(VAULT_KEYS.mail);
    this._credentialStatus = { saved: false, encryptionAvailable: false };
    this._academicApiCredentialStatus = { saved: false, encryptionAvailable: false, enabled: false };
    this._auth = { ...disconnectedStatus() };
    if (this._state) this._state.settings.academicApiEnabled = false;
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
  async loginWithRestrictedWebView({ url = 'https://authserver.buct.edu.cn/authserver/login' } = {}) {
    const result = await this.session.openRestrictedLoginWebView({
      url,
      whitelist: this.session.whitelist || undefined,
    });
    if (result?.canceled) return { canceled: true };
    if (result?.cookies) {
      this._auth = { ...connectedStatus() };
      this._credentialStatus = { saved: true, encryptionAvailable: true };
      this.events.emit('auth-status', this._auth);
      return { canceled: false };
    }
    return { canceled: false };
  }

  async login() {
    await this.init();
    this.events.emit('sync-progress', { stage: 'all', status: 'syncing', label: '正在连接教务系统…' });
    let apiCredentials = null;
    try {
      apiCredentials = await this.vault.getSecret(VAULT_KEYS.academicApi);
    } catch {
      apiCredentials = null;
    }
    if (apiCredentials?.username && apiCredentials?.password && this._state?.settings?.academicApiEnabled !== false) {
      try {
        const { AcademicApiClient } = await import('../../core/academic-api-client.mjs');
        const client = new AcademicApiClient({
          username: apiCredentials.username,
          password: apiCredentials.password,
        });
        this._campusClient = client;
        await client.login();
        this._auth = {
          jwglxt: { connected: true, unchecked: false },
          theol: { connected: this._state?.settings?.academicAuthMode !== 'api', unchecked: false },
        };
        this._academicApiCredentialStatus = { saved: true, encryptionAvailable: true, enabled: true };
        this._credentialStatus = { saved: true, encryptionAvailable: true };
        this.events.emit('auth-status', this._auth);
        this.events.emit('sync-progress', { stage: 'all', status: 'done', label: '教务 API 登录成功' });
        return;
      } catch (error) {
        console.warn('[theia-mobile] academic API login failed:', error);
        this.events.emit('sync-progress', { stage: 'all', status: 'error', label: '教务 API 登录失败', error: error?.message || String(error) });
        throw error;
      }
    }
    // No real credentials configured — demo/mock login (stage 0 behavior)
    this._auth = { ...connectedStatus() };
    this._credentialStatus = { saved: true, encryptionAvailable: true };
    this._academicApiCredentialStatus = { saved: true, encryptionAvailable: true, enabled: true };
    if (this._state) this._state.settings.academicApiEnabled = true;
    await this._persist();
    this.events.emit('auth-status', this._auth);
    await this.syncNow();
  }

  async logout() {
    this._campusClient = null;
    this.session.clear();
    this._auth = { ...disconnectedStatus() };
    this.events.emit('auth-status', this._auth);
    // Leave data intact, just disconnect
  }

  async syncNow() {
    await this.init();
    if (this._syncing) return this._state;
    this._syncing = true;
    this._state.sync.lastStartedAt = new Date().toISOString();
    this._state.sync.runId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    this._publishState();

    const emitProgress = (stage, status, label, error) => {
      this.events.emit('sync-progress', { stage, status, label, error });
    };

    try {
      // Real campus sync path: when academic API credentials are stored in the
      // vault, run the desktop JwglxtAdapter inside the WebView (stage 1).
      const hasRealCredentials = await this.vault.hasSecret(VAULT_KEYS.academicApi);
      if (hasRealCredentials && this._state?.settings?.academicApiEnabled !== false) {
        emitProgress('all', 'syncing', '正在更新校园数据…');
        const { CampusSync } = await import('./campus/campus-sync.mjs');
        const campusSync = new CampusSync({
          vault: this.vault,
          onProgress: (progress) => {
            if (progress?.stage && progress?.status) {
              emitProgress(progress.stage, progress.status, progress.label || undefined, progress.error || undefined);
            }
          },
          onDiagnostic: (event, fields) => {
            console.debug('[theia-mobile] campus diagnostic:', event, fields);
          },
        });
        const { state } = await campusSync.syncJwglxt(this._state, {
          domains: ['profile', 'terms', 'schedule', 'grades', 'exams', 'selected-courses', 'academic-progress', 'notices'],
        });
        this._state = state;

        // THEOL sync is best-effort: needs the shared CAS session (restricted
        // WebView login, stage 1.2). Without it, report auth-required without
        // failing the whole jwglxt sync.
        let theolConnected = false;
        try {
          emitProgress('theol', 'syncing', '正在同步北化在线THEOL…');
          const theol = await campusSync.syncTheol(this._state, { domains: ['courses', 'notices'] });
          if (theol.authRequired) {
            emitProgress('theol', 'error', 'THEOL 需要登录（受限 WebView CAS 登录尚未实现）', 'auth_required');
          } else if (theol.state) {
            this._state = theol.state;
            theolConnected = true;
            emitProgress('theol', 'done', 'THEOL 同步完成');
          }
        } catch (theolError) {
          emitProgress('theol', 'error', 'THEOL 同步失败', String(theolError?.message || theolError));
        }

        this._auth = {
          jwglxt: { connected: true, unchecked: false },
          theol: { connected: theolConnected, unchecked: !theolConnected },
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
        return structuredClone(this._state);
      }

      // Mock/demo sync path (no real credentials yet)
      emitProgress('all', 'syncing', '正在更新校园数据…');
      emitProgress('jwglxt', 'syncing', '正在登录教务系统…');
      await sleep(150);
      emitProgress('jwglxt', 'done', '教务系统同步完成');
      emitProgress('schedule', 'syncing', '正在同步课表…');
      await sleep(100);
      emitProgress('schedule', 'done', '课表同步完成');
      emitProgress('grades', 'syncing', '正在同步成绩…');
      await sleep(100);

      if (!this._state || !this._state.profile) {
        await this._seedMockData();
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
    } catch (error) {
      this._state.sync.lastError = String(error);
      this._state.sync.lastCompletedAt = new Date().toISOString();
      await this._persist();
      emitProgress('all', 'error', '校园数据更新失败', String(error));
      this._publishState();
      const { notifySyncResult } = await import('./notify.mjs');
      void notifySyncResult({ ok: false, error: String(error) });
    } finally {
      this._syncing = false;
    }
    return structuredClone(this._state);
  }

  async retrySyncDomain(domain) {
    // For stage 0, just re-trigger a full sync
    return this.syncNow();
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
    if (!this._campusSync) {
      const { CampusSync } = await import('./campus/campus-sync.mjs');
      this._campusSync = new CampusSync({ vault: this.vault });
    }
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
      const { AcademicApiClient } = await import('../../core/academic-api-client.mjs');
      const creds = await this.vault.getSecret(VAULT_KEYS.academicApi);
      if (creds?.username && creds?.password) {
        this._campusClient = new AcademicApiClient({
          username: creds.username,
          password: creds.password,
        });
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
    this._motion = new MotionVenueAdapter({ fetchImpl: globalThis.fetch });
    return this._motion;
  }

  async getMotionVenueCatalog() {
    const adapter = await this._motionAdapter();
    const catalog = await adapter.discover();
    this._motionCatalog = catalog;
    return catalog;
  }

  async refreshMotionVenueCatalog() {
    const adapter = await this._motionAdapter();
    const catalog = await adapter.discover();
    this._motionCatalog = catalog;
    return catalog;
  }

  async queryMotionVenueStatus(query) {
    const adapter = await this._motionAdapter();
    const result = await adapter.queryStatus(query || {});
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

  async openAssignmentSource() {
    throw new Error('作业来源在移动端开发中');
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
        await Share.share({ title: 'THEIA 数据导出', url: uri.uri, dialogTitle: '分享数据包' });
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

  async getApiStatus() {
    return {
      baseUrl: '',
      host: '127.0.0.1',
      port: 0,
      academicCalendarAssets: {},
      academicPlanAssetBaseUrl: '',
    };
  }

  async getFitnessScore() {
    throw new Error('体测在移动端开发中');
  }

  async updateSettings(settings) {
    await this.init();
    if (this._state) {
      Object.assign(this._state.settings, settings);
      await this._persist();
      this._publishState();
    }
    return structuredClone(this._state);
  }

  async installMcpClients() {
    throw new Error('MCP 桌面专属');
  }

  async chooseAppBackground() {
    return new Promise((resolve) => {
      const picker = document.createElement('input');
      picker.type = 'file';
      picker.accept = 'image/png,image/jpeg,image/webp,image/gif,image/avif';
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      picker.addEventListener('change', () => {
        const file = picker.files?.[0];
        if (!file) return finish({ canceled: true });
        finish({
          canceled: false,
          url: URL.createObjectURL(file),
          name: file.name,
        });
      });
      picker.addEventListener('cancel', () => finish({ canceled: true }));
      picker.click();
    });
  }

  async getAppearancePresets() {
    return { exists: false, updatedAt: null, presets: [] };
  }

  async saveAppearancePresets(presets) {
    return { updatedAt: new Date().toISOString(), presets };
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
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

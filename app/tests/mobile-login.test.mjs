import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NETWORK_TIMEOUTS } from '../src/mobile/network-config.ts';
import nodeCrypto from 'node:crypto';

import { MobileBridge } from '../src/mobile/mobile-bridge.mjs';
import { createWebStorageBackend } from '../src/mobile/store/web-storage-backend.mjs';
import { AcademicApiClient } from '../../core/academic-api-client.mjs';
import { createNativeFetch } from '../src/mobile/native-fetch.mjs';
import { CampusSync } from '../src/mobile/campus/campus-sync.mjs';
import { AuthRequiredError } from '../../core/source-client.mjs';
import { emptyState } from '../../core/schema.mjs';
import { htmlLooksLikeLogin } from '../../core/util.mjs';

test('THEOL mobile JSON success is not mistaken for an HTML login page', () => {
  const payload = JSON.stringify({
    datas: { userinfo: { loginTimes: 1 } },
    status: 1,
  });

  assert.equal(
    htmlLooksLikeLogin(payload, 'http://course.buct.edu.cn/mobile/loginSuccess.do'),
    false,
  );
});

test('HTML login pages remain recognized after the JSON guard', () => {
  assert.equal(
    htmlLooksLikeLogin(
      '<html><form><input type="password" name="j_password"></form><span>login</span></html>',
      'http://course.buct.edu.cn/mobile/login.do',
    ),
    true,
  );
});
test('native academic login preserves campus cookies through the first authenticated page', async () => {
  const { publicKey, privateKey } = nodeCrypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' });
  const toBase64 = (value) => Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('base64');
  const requests = [];
  const fetchImpl = createNativeFetch({
    async request(options) {
      requests.push(options);
      const cookie = String(options.headers.cookie || options.headers.Cookie || '');
      let status = 200;
      let contentType = 'text/html; charset=UTF-8';
      let text = '<form action="/jwglxt/xtgl/login_slogin.html"><input type="hidden" name="csrftoken" value="csrf-token"><input type="hidden" name="language" value="zh_CN"><input type="hidden" name="ydType" value=""></form>';
      const headers = { 'content-type': contentType };

      if (options.url.endsWith('login_getPublicKey.html')) {
        assert.match(cookie, /JSESSIONID=login-session/);
        contentType = 'application/json';
        text = JSON.stringify({ modulus: toBase64(jwk.n), exponent: toBase64(jwk.e) });
        headers['content-type'] = contentType;
        headers['set-cookie'] = 'XSRF-TOKEN=xsrf-session; Path=/jwglxt, ROUTEID=campus-node; Path=/jwglxt';
      } else if (options.url.endsWith('login_logoutAccount.html')) {
        assert.equal(options.method, 'POST');
        assert.match(cookie, /JSESSIONID=login-session/);
        assert.equal(new URLSearchParams(options.data).get('csrfTokenLogout'), '');
        text = '<html>logout ok</html>';
      } else if (options.url.includes('login_slogin.html?time=') && options.method === 'POST') {
        assert.match(cookie, /JSESSIONID=login-session/);
        assert.match(cookie, /XSRF-TOKEN=xsrf-session/);
        assert.match(cookie, /ROUTEID=campus-node/);
        const body = new URLSearchParams(options.data);
        assert.equal(body.get('language'), 'zh_CN');
        assert.equal(body.get('ydType'), '');
        assert.equal(body.getAll('mm').length, 2);
        const decrypted = nodeCrypto.privateDecrypt(
          { key: privateKey, padding: nodeCrypto.constants.RSA_PKCS1_PADDING },
          Buffer.from(body.get('mm'), 'base64'),
        );
        assert.equal(decrypted.toString('utf8'), 'Test-Password-123!');
        text = '<html><body>authenticated</body></html>';
        headers['set-cookie'] = 'AUTH-STATE=authenticated; Path=/jwglxt';
      } else if (options.url.endsWith('login_slogin.html')) {
        headers['set-cookie'] = 'JSESSIONID=login-session; Path=/jwglxt; HttpOnly';
      } else if (options.url.endsWith('index_initMenu.html')) {
        assert.match(cookie, /JSESSIONID=login-session/);
        assert.match(cookie, /XSRF-TOKEN=xsrf-session/);
        assert.match(cookie, /ROUTEID=campus-node/);
        assert.match(cookie, /AUTH-STATE=authenticated/);
        text = '<html><body><div id="index">authenticated campus home</div></body></html>';
      }

      return {
        status,
        url: options.url,
        headers,
        data: contentType === 'application/json' ? JSON.parse(text) : Buffer.from(text).toString('base64'),
      };
    },
  });
  const client = new AcademicApiClient({
    username: 'student',
    password: 'Test-Password-123!',
    fetchImpl,
  });

  const home = await client.login();

  assert.match(home.text, /authenticated campus home/);
  assert.equal(requests.length, 5, 'login page, public key, logout, credential POST, and authenticated home');
  assert.equal(client.cookieHeader().includes('AUTH-STATE=authenticated'), true);
});

function createLocalStorageShim() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key(index) { return [...map.keys()][index] ?? null; },
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
  };
}

function createVault(secrets) {
  return {
    async getSecret(key) { return secrets.get(key) ?? null; },
    async setSecret(key, value) { secrets.set(key, value); },
    async removeSecret(key) { secrets.delete(key); },
    async hasSecret(key) { return secrets.has(key); },
  };
}

test('mobile unified and academic API credentials remain independent on native Android', async () => {
  const secrets = new Map([
    ['academic-api-credentials', { username: 'api-user', password: 'old-api-secret', savedAt: '2026-09-29T08:00:00.000Z' }],
    ['unified-credentials', { username: 'unified-user', password: 'new-unified-secret', savedAt: '2026-09-30T08:00:00.000Z' }],
  ]);
  const bridge = new MobileBridge({
    vault: createVault(secrets),
    session: { clear() {} },
    storageBackend: createWebStorageBackend({ storage: createLocalStorageShim() }),
  });
  bridge._state = { settings: { academicApiEnabled: true } };
  bridge._native = true;

  const selected = await bridge._getStoredAcademicCredentials();
  assert.equal(selected?.source, 'academic-api-credentials');
  assert.equal(selected?.username, 'api-user');
  const unified = await bridge._getUnifiedCredentials();
  assert.equal(unified?.source, 'unified-credentials');
  assert.equal(unified?.username, 'unified-user');
});

test('mobile login ignores the optional API slot when API is disabled', async () => {
  const secrets = new Map([
    ['academic-api-credentials', { username: 'api-user', password: 'api-secret', savedAt: '2026-09-30T09:00:00.000Z' }],
    ['unified-credentials', { username: 'unified-user', password: 'unified-secret', savedAt: '2026-09-29T08:00:00.000Z' }],
  ]);
  const bridge = new MobileBridge({
    vault: createVault(secrets),
    session: { clear() {} },
    storageBackend: createWebStorageBackend({ storage: createLocalStorageShim() }),
  });
  bridge._state = { settings: { academicApiEnabled: false } };
  bridge._native = true;

  const selected = await bridge._getStoredAcademicCredentials();
  assert.equal(selected?.source, 'unified-credentials');
  assert.equal(selected?.username, 'unified-user');
});

test('THEOL assignment feed survives a failed HTML course scan', async () => {
  const state = emptyState();
  state.sync.runId = 'theol-assignment-fallback';
  const campus = new CampusSync({
    vault: createVault(new Map()),
    client: { setDiagnostic() {} },
  });
  campus.theolAdapter = {
    async syncMobileAssignments() {
      return {
        assignments: [{
          id: 'theol-assignment:assignment:42',
          kind: 'assignment',
          courseId: '1001',
          courseName: '高等数学 A',
          title: '第一次作业',
          status: 'pending',
          source: 'theol',
          sourceUrl: 'https://course.buct.edu.cn/meol/common/hw/student/hwtask.view.jsp?hwtid=42',
        }],
        capturedAt: '2026-10-02T00:00:00.000Z',
        parserVersion: 'test',
        domainOutcomes: {
          assignments: {
            source: ['theol'], attempted: true, succeeded: true, status: 'succeeded',
            completeness: 'complete', capturedAt: '2026-10-02T00:00:00.000Z',
          },
        },
        errors: [],
        source: { connected: true, captureMode: 'mobile-list' },
      };
    },
    async sync() {
      throw new Error('THEOL 课程列表未解析到课程，未确认课程为空');
    },
  };

  const result = await campus.syncTheol(state, { domains: ['courses', 'notices', 'assignments'] });

  assert.equal(result.authRequired, false);
  assert.equal(result.state.assignments.length, 1);
  assert.equal(result.state.assignments[0].title, '第一次作业');
  assert.equal(result.state.courses.length, 0);
});


test('successful THEOL mobile assignments clear stale HTML-session auth state', async () => {
  const state = emptyState();
  state.sync.runId = 'theol-mobile-success-with-stale-shell';
  state.sync.sources = { theol: { connected: false, authRequired: true, error: 'auth_required' } };
  state.sync.domains = {
    courses: {
      runId: 'old-run',
      status: 'auth-required',
      attempted: true,
      succeeded: false,
      outcomes: { theol: { runId: 'old-run', status: 'auth-required', attempted: true, succeeded: false, source: ['theol'] } },
    },
    assignments: {
      runId: 'old-run',
      status: 'auth-required',
      attempted: true,
      succeeded: false,
      errorCode: 'auth_required',
      outcomes: { theol: { runId: 'old-run', source: ['theol'], status: 'auth-required', attempted: true, succeeded: false, errorCode: 'auth_required' } },
    },
  };
  const campus = new CampusSync({
    vault: createVault(new Map()),
    client: { setDiagnostic() {} },
  });
  campus.theolAdapter = {
    async syncMobileAssignments() {
      return {
        assignments: [{ id: 'assignment-live', source: 'theol', title: '实时作业' }],
        capturedAt: '2026-10-04T00:00:00.000Z',
        parserVersion: 'test',
        domainOutcomes: {
          assignments: {
            source: ['theol'], attempted: true, succeeded: true, status: 'succeeded',
            completeness: 'complete', capturedAt: '2026-10-04T00:00:00.000Z',
          },
        },
        errors: [],
        source: { connected: true, captureMode: 'mobile-list' },
      };
    },
    async sync() {
      throw new AuthRequiredError('北化在线THEOL', 'https://course.buct.edu.cn/meol/homepage');
    },
  };

  const result = await campus.syncTheol(state, { domains: ['courses', 'notices', 'assignments'] });

  assert.equal(result.authRequired, false);
  assert.deepEqual(result.result.errors, []);
  assert.equal(result.result.domainOutcomes.assignments.status, 'succeeded');
  assert.equal(result.result.domainOutcomes.courses.status, 'failed');
  assert.equal(result.result.domainOutcomes.courses.errorCode, 'theol_html_session_required');
  assert.equal(result.state.sync.lastError, null);
  assert.equal(result.state.sync.sources.theol.connected, true);
  assert.equal(result.state.sync.sources.theol.authRequired, false);
  assert.equal(result.state.sync.domains.assignments.status, 'succeeded');
  assert.equal(result.state.sync.domains.assignments.runId, state.sync.runId);
  assert.equal(result.state.sync.domains.assignments.outcomes.theol.status, 'succeeded');
  assert.equal(result.state.sync.domains.assignments.outcomes.theol.runId, state.sync.runId);
  assert.equal(result.state.assignments[0].id, 'assignment-live');
});

test('THEOL mobile session expiry is surfaced even when the HTML course shell succeeds', async () => {
  const state = emptyState();
  state.sync.runId = 'theol-mobile-auth-required';
  state.sync.sources = { theol: { connected: true, authRequired: true, error: 'auth_required' } };
  const campus = new CampusSync({
    vault: createVault(new Map()),
    client: { setDiagnostic() {} },
  });
  campus.theolAdapter = {
    async syncMobileAssignments() {
      throw new AuthRequiredError('北化在线THEOL', 'http://course.buct.edu.cn/mobile/stuUnDoTaskList.do');
    },
    async sync() {
      return {
        courses: [{ id: '1001', title: '高等数学 A', source: 'theol', sourceUrl: 'https://course.buct.edu.cn/meol/homepage/course/course_index.jsp?courseId=1001' }],
        notices: [],
        capturedAt: '2026-10-04T00:00:00.000Z',
        parserVersion: 'test',
        domainOutcomes: {
          courses: { source: ['theol'], attempted: true, succeeded: true, status: 'succeeded', completeness: 'complete' },
          notices: { source: ['theol'], attempted: true, succeeded: true, status: 'succeeded', completeness: 'complete' },
        },
        errors: [],
        source: { connected: true, checkedAt: '2026-10-04T00:00:00.000Z' },
      };
    },
  };

  const result = await campus.syncTheol(state, { domains: ['courses', 'notices', 'assignments'] });

  assert.equal(result.authRequired, true);
  assert.equal(result.state.courses.length, 1);
  assert.equal(result.result.domainOutcomes.assignments.status, 'auth-required');
  assert.equal(result.state.sync.sources.theol.authRequired, true);
});

test('THEOL assignment auth failure advances lastRunAt but preserves last successful campus sync', async () => {
  const bridge = new MobileBridge({
    storageBackend: createWebStorageBackend({ storage: createLocalStorageShim() }),
    vault: createVault(new Map()),
    session: { clear() {} },
    webPreview: false,
  });
  bridge._initialized = true;
  bridge._state = emptyState();
  const priorSuccess = '2026-09-30T00:00:00.000Z';
  bridge._state.sync.lastSuccessAt = priorSuccess;
  bridge._state.sync.lastCompletedAt = priorSuccess;
  bridge._campusSync = {
    async syncJwglxt(state) {
      const completedAt = new Date().toISOString();
      return {
        state: {
          ...state,
          profile: { name: '已更新' },
          sync: {
            ...state.sync,
            lastCompletedAt: completedAt,
            lastRunAt: completedAt,
            lastSuccessAt: completedAt,
          },
        },
        result: { source: { connected: true }, errors: [] },
      };
    },
    async syncTheol(state) {
      return {
        state: {
          ...state,
          sync: {
            ...state.sync,
            sources: { ...state.sync.sources, theol: { connected: false, authRequired: true } },
            domains: {
              ...state.sync.domains,
              assignments: { runId: state.sync.runId, status: 'auth-required', attempted: true, succeeded: false },
            },
          },
        },
        authRequired: true,
      };
    },
  };

  const snapshot = await bridge.syncNow({ background: true });

  assert.equal(snapshot.sync.lastSuccessAt, priorSuccess);
  assert.ok(Date.parse(snapshot.sync.lastRunAt) > Date.parse(priorSuccess));
  assert.equal(snapshot.sync.domains.assignments.status, 'auth-required');
});

test('native THEOL mobile login adopts the Courser session id before probing tasks', async () => {
  const secrets = new Map([
    ['unified-credentials', { username: 'student', password: 'cas-secret' }],
  ]);
  const adopted = [];
  const calls = [];
  const client = {
    adoptCookieHeader(value) { adopted.push(value); },
    async form(url) {
      calls.push(url);
      if (url.endsWith('getSessionId.do')) return JSON.stringify({ status: 1, sessionid: 'mobile-session-1' });
      return JSON.stringify({ status: 1, sessionid: 'mobile-session-2' });
    },
    async request(url) {
      calls.push(url);
      return { text: JSON.stringify({ status: [1], datas: [] }) };
    },
  };
  const bridge = new MobileBridge({
    vault: createVault(secrets),
    session: { clear() {} },
    storageBackend: createWebStorageBackend({ storage: createLocalStorageShim() }),
    academicClientFactory() { return client; },
  });
  bridge._native = true;

  assert.equal(await bridge._recoverTheolMobileSession(), true);
  assert.equal(bridge._theolMobileClient, client);
  assert.deepEqual(adopted, ['JSESSIONID=mobile-session-1', 'JSESSIONID=mobile-session-2']);
  assert.equal(calls.filter((url) => url.endsWith('getSessionId.do')).length, 1);
  assert.equal(calls.filter((url) => url.endsWith('login_check.do')).length, 1);
  assert.equal(calls.filter((url) => url.endsWith('stuUnDoTaskList.do')).length, 1);
});
test('mobile campus sync persists source domain outcomes for the sync settings panel', async () => {
  const state = emptyState();
  state.sync.runId = 'mobile-run-1';
  const campus = new CampusSync({
    vault: createVault(new Map()),
    client: { setDiagnostic() {} },
  });
  campus.adapter = {
    async sync() {
      return {
        schedule: [],
        domainOutcomes: {
          schedule: {
            source: ['jwglxt'], attempted: true, succeeded: true, status: 'succeeded',
            attemptedAt: '2026-09-30T00:00:00.000Z', completedAt: '2026-09-30T00:00:01.000Z',
            capturedAt: '2026-09-30T00:00:01.000Z', sourceSucceededAt: '2026-09-30T00:00:01.000Z',
            emptyConfirmed: true, contentEmptyConfirmed: true, retainedPrevious: false,
            completeness: 'complete', parserVersion: 'test', errorCode: null,
          },
        },
        errors: [],
        source: { connected: true, checkedAt: '2026-09-30T00:00:01.000Z' },
      };
    },
  };

  const result = await campus.syncJwglxt(state, { domains: ['schedule'] });
  assert.equal(result.state.sync.domains.schedule.status, 'succeeded');
  assert.equal(result.state.sync.domains.schedule.runId, 'mobile-run-1');
  assert.equal(result.state.sync.domains.schedule.outcomes.jwglxt.status, 'succeeded');
});

test('preview campus transport keeps canonical URLs while using the same-origin proxy', async () => {
  const requests = [];
  const target = 'https://jwglxt.buct.edu.cn/jwglxt/xtgl/login_slogin.html';
  const client = new AcademicApiClient({
    username: 'probe',
    password: 'probe',
    requestUrl: (url) => `/__theia-campus${new URL(url).pathname}`,
    fetchImpl: async (url) => {
      requests.push(url);
      return new Response('<html>login</html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=UTF-8' },
      });
    },
  });

  const result = await client.request(target);
  assert.equal(requests[0], '/__theia-campus/jwglxt/xtgl/login_slogin.html');
  assert.equal(result.url, target);
});

test('preview unified credentials login and sync reuse the authenticated client', async () => {
  const storage = createLocalStorageShim();
  const secrets = new Map([
    ['unified-credentials', { username: 'student', password: 'secret', savedAt: new Date().toISOString() }],
  ]);
  const clientOptions = [];
  const clients = [];
  const syncOptions = [];
  let syncCalls = 0;
  const client = {
    async login() {},
    setDiagnostic() {},
  };
  const bridge = new MobileBridge({
    storageBackend: createWebStorageBackend({ storage }),
    vault: createVault(secrets),
    session: { clear() {} },
    webPreview: true,
    academicClientFactory(options) {
      clientOptions.push(options);
      clients.push(client);
      return client;
    },
    campusSyncFactory(options) {
      syncOptions.push(options);
      return {
        async syncJwglxt(state) {
          syncCalls += 1;
          return {
            state: {
              ...state,
              profile: { ...state.profile, name: '真实用户' },
              sync: { ...state.sync, lastError: null },
            },
          };
        },
        async syncTheol() {
          return { authRequired: true };
        },
      };
    },
  });

  await bridge.login();
  const snapshot = await bridge.getSnapshot();

  assert.equal(clientOptions.length, 1);
  assert.equal(clientOptions[0].username, 'student');
  assert.equal(clientOptions[0].password, 'secret');
  assert.equal(typeof clientOptions[0].requestUrl, 'function');
  assert.equal(typeof clientOptions[0].fetchImpl, 'function');
  assert.equal(syncOptions.length, 1);
  assert.equal(syncOptions[0].client, clients[0]);
  assert.equal(syncCalls, 1);
  assert.equal(snapshot.profile.name, '真实用户');
  assert.equal(snapshot.sync.lastError, null);
  assert.equal((await bridge.getAuthStatus()).jwglxt.connected, true);
});

test('native unified credentials use CAS and reuse the captured campus cookie', async () => {
  const storage = createLocalStorageShim();
  const secrets = new Map([
    ['unified-credentials', { username: 'student', password: 'cas-secret', savedAt: new Date().toISOString() }],
  ]);
  let cookieHeader = '';
  let openedUrl = '';
  let clientOptions = null;
  let pageCalls = 0;
  const session = {
    whitelist: ['buct.edu.cn'],
    load() {},
    clear() {},
    async getNativeCookies() { return ''; },
    getCookieHeader() { return cookieHeader; },
    async openRestrictedLoginWebView(options) {
      openedUrl = options.url;
      assert.equal(options.username, 'student');
      assert.equal(options.password, 'cas-secret');
      cookieHeader = 'JSESSIONID=cas-session';
      return { canceled: false, cookies: 'jwglxt.buct.edu.cn|JSESSIONID=cas-session' };
    },
  };
  const client = {
    async page(url) {
      pageCalls += 1;
      assert.match(url, /index_initMenu\.html/);
      return { text: '<html><div id="index">authenticated</div></html>', url };
    },
    setDiagnostic() {},
  };
  const bridge = new MobileBridge({
    storageBackend: createWebStorageBackend({ storage }),
    vault: createVault(secrets),
    session,
    webPreview: false,
    academicClientFactory(options) {
      clientOptions = options;
      return client;
    },
    campusSyncFactory(options) {
      assert.equal(options.client, client);
      return {
        async syncJwglxt(state) {
          return { state: { ...state, profile: { ...state.profile, name: 'CAS 用户' } } };
        },
        async syncTheol(state) { return { state }; },
      };
    },
  });
  bridge._native = true;
  bridge._restoreAttempted = true;

  await bridge.login();
  const snapshot = await bridge.getSnapshot();
  assert.match(openedUrl, /experimental-auth-endpoint\.buct\.edu\.cn/);
  assert.equal(clientOptions.cookieHeader, 'JSESSIONID=cas-session');
  assert.equal(pageCalls, 0);
  assert.equal(snapshot.profile.name, 'CAS 用户');
  assert.equal((await bridge.getAuthStatus()).jwglxt.connected, true);
});

test('native unified login never hijacks CAS with optional API credentials', async () => {
  const storage = createLocalStorageShim();
  const secrets = new Map([
    ['unified-credentials', { username: 'student', password: 'cas-secret', savedAt: new Date().toISOString() }],
    ['academic-api-credentials', { username: 'student', password: 'api-secret', savedAt: new Date().toISOString() }],
  ]);
  let opened = false;
  let apiLoginCalls = 0;
  let cookieHeader = '';
  const session = {
    whitelist: ['buct.edu.cn'],
    load() {},
    clear() {},
    async getNativeCookies() { return ''; },
    getCookieHeader() { return cookieHeader; },
    async openRestrictedLoginWebView(options) {
      opened = true;
      assert.equal(options.username, 'student');
      assert.equal(options.password, 'cas-secret');
      cookieHeader = 'JSESSIONID=cas-session';
      return { canceled: false, cookies: 'jwglxt.buct.edu.cn|JSESSIONID=cas-session' };
    },
  };
  const client = {
    async login() { apiLoginCalls += 1; },
    async page(url) { return { url, text: '<nav>课表 成绩 考试</nav>' }; },
    setDiagnostic() {},
  };
  const bridge = new MobileBridge({
    storageBackend: createWebStorageBackend({ storage }),
    vault: createVault(secrets),
    session,
    webPreview: false,
    academicClientFactory() { return client; },
    campusSyncFactory(options) {
      assert.equal(options.client, client);
      return {
        async syncJwglxt(state) { return { state }; },
        async syncTheol(state) { return { state }; },
      };
    },
  });
  await bridge.init();
  bridge._native = true;
  bridge._restoreAttempted = true;
  bridge._state.settings.academicApiEnabled = true;

  await bridge.login();

  assert.equal(opened, true);
  assert.equal(apiLoginCalls, 0);
  assert.equal((await bridge.getAuthStatus()).jwglxt.connected, true);
});

test('interactive native re-login autofills the saved unified credential', async () => {
  const secrets = new Map([
    ['unified-credentials', { username: 'student', password: 'cas-secret', savedAt: new Date().toISOString() }],
  ]);
  let optionsSeen = null;
  const session = {
    clear() {},
    load() {},
    getCookieHeader() { return ''; },
    async getNativeCookies() { return ''; },
    async openRestrictedLoginWebView(options) {
      optionsSeen = options;
      return { canceled: true, cookies: '' };
    },
  };
  const bridge = new MobileBridge({
    storageBackend: createWebStorageBackend({ storage: createLocalStorageShim() }),
    vault: createVault(secrets),
    session,
    webPreview: false,
  });
  bridge._native = true;
  bridge._restoreAttempted = true;
  bridge._state = { settings: { academicApiEnabled: false, academicAuthMode: 'unified' } };

  await assert.rejects(bridge.login({ interactive: true }), /统一身份认证已取消/);
  assert.equal(optionsSeen?.autoFill, true);
});

test('silent native restore automatically refreshes an expired session with saved credentials', async () => {
  const secrets = new Map([
    ['unified-credentials', { username: 'student', password: 'cas-secret', savedAt: new Date().toISOString() }],
  ]);
  let opened = false;
  let cookieHeader = '';
  let pageCalls = 0;
  const session = {
    clear() { cookieHeader = ''; },
    load() {},
    getCookieHeader() { return cookieHeader; },
    async getNativeCookies() { return ''; },
    async openRestrictedLoginWebView(options) {
      opened = true;
      assert.equal(options.autoFill, true);
      cookieHeader = 'JSESSIONID=refreshed-session';
      return { canceled: false, cookies: 'jwglxt.buct.edu.cn|JSESSIONID=refreshed-session' };
    },
  };
  const client = {
    async page(url) {
      pageCalls += 1;
      return { url, text: '<html><nav>课表 成绩 考试</nav></html>' };
    },
    setDiagnostic() {},
  };
  const bridge = new MobileBridge({
    storageBackend: createWebStorageBackend({ storage: createLocalStorageShim() }),
    vault: createVault(secrets),
    session,
    webPreview: false,
    academicClientFactory() { return client; },
    campusSyncFactory() {
      return {
        async syncJwglxt(state) { return { state }; },
        async syncTheol(state) { return { state }; },
      };
    },
  });
  bridge._native = true;
  bridge._restoreAttempted = true;
  bridge._state = emptyState();
  bridge._state.settings.academicApiEnabled = false;
  bridge._state.settings.academicAuthMode = 'unified';

  await bridge.login({ silent: true, autoRecover: true });

  assert.equal(opened, true);
  assert.equal(pageCalls, 0);
  assert.equal((await bridge.getAuthStatus()).jwglxt.connected, true);
});


test('background auth expiry automatically reauthenticates before exposing the login banner', async () => {
  const secrets = new Map([
    ['unified-credentials', { username: 'student', password: 'cas-secret', savedAt: new Date().toISOString() }],
  ]);
  const storage = createLocalStorageShim();
  let opened = false;
  let cookieHeader = 'JSESSIONID=expired-session';
  let syncCalls = 0;
  const session = {
    clear() { cookieHeader = ''; },
    load() {},
    getCookieHeader() { return cookieHeader; },
    async getNativeCookies() { return ''; },
    async openRestrictedLoginWebView(options) {
      opened = true;
      assert.equal(options.autoFill, true);
      cookieHeader = 'JSESSIONID=renewed-session';
      return { canceled: false, cookies: 'jwglxt.buct.edu.cn|JSESSIONID=renewed-session' };
    },
  };
  const client = {
    async page(url) { return { url, text: '<html><nav>课表 成绩 考试</nav></html>' }; },
    setDiagnostic() {},
  };
  const bridge = new MobileBridge({
    storageBackend: createWebStorageBackend({ storage }),
    vault: createVault(secrets),
    session,
    webPreview: false,
    academicClientFactory() { return client; },
    campusSyncFactory() {
      return {
        async syncJwglxt(state) {
          syncCalls += 1;
          if (syncCalls === 1) throw new Error('Academic system 需要重新完成统一身份认证');
          return { state: { ...state, profile: { name: '自动恢复用户' } } };
        },
        async syncTheol(state) { return { state }; },
      };
    },
  });
  bridge._native = true;
  bridge._restoreAttempted = true;
  await bridge.init();
  bridge._campusSync = await bridge._createCampusSync({ setDiagnostic() {} });

  const snapshot = await bridge.syncNow({ background: true });

  assert.equal(opened, true);
  assert.equal(syncCalls, 2);
  assert.equal(snapshot.profile.name, '自动恢复用户');
  assert.equal((await bridge.getAuthStatus()).jwglxt.connected, true);
});


test('THEOL-only auth expiry also reuses the shared automatic recovery path', async () => {
  const secrets = new Map([
    ['unified-credentials', { username: 'student', password: 'cas-secret', savedAt: new Date().toISOString() }],
  ]);
  let opened = false;
  let cookieHeader = 'JSESSIONID=expired-session';
  let factoryCalls = 0;
  const session = {
    clear() { cookieHeader = ''; },
    load() {},
    getCookieHeader() { return cookieHeader; },
    async getNativeCookies() { return ''; },
    async openRestrictedLoginWebView(options) {
      opened = true;
      assert.equal(options.autoFill, true);
      cookieHeader = 'JSESSIONID=renewed-session';
      return { canceled: false, cookies: 'jwglxt.buct.edu.cn|JSESSIONID=renewed-session' };
    },
  };
  const client = {
    async page(url) { return { url, text: '<html><nav>课表 成绩 考试</nav></html>' }; },
    setDiagnostic() {},
  };
  const bridge = new MobileBridge({
    storageBackend: createWebStorageBackend({ storage: createLocalStorageShim() }),
    vault: createVault(secrets),
    session,
    webPreview: false,
    academicClientFactory() { return client; },
    campusSyncFactory() {
      factoryCalls += 1;
      if (factoryCalls === 1) {
        return {
          async syncJwglxt(state) { return { state }; },
          async syncTheol() { return { authRequired: true }; },
        };
      }
      return {
        async syncJwglxt(state) { return { state }; },
        async syncTheol(state) { return { state: { ...state, courses: [{ id: 'theol-recovered', title: 'THEOL', source: 'theol' }] } }; },
      };
    },
  });
  bridge._native = true;
  bridge._restoreAttempted = true;
  await bridge.init();
  bridge._campusSync = await bridge._createCampusSync({ setDiagnostic() {} });

  const snapshot = await bridge.syncNow({ background: true });

  assert.equal(opened, true);
  assert.equal(snapshot.courses[0].id, 'theol-recovered');
  assert.equal((await bridge.getAuthStatus()).theol.connected, true);
});

test('THEOL mobile recovery retry does not wait on its own login promise', async () => {
  const bridge = new MobileBridge({
    storageBackend: createWebStorageBackend({ storage: createLocalStorageShim() }),
    vault: createVault(new Map([
      ['unified-credentials', { username: 'student', password: 'cas-secret' }],
    ])),
    session: { clear() {}, load() {}, getCookieHeader() { return 'JSESSIONID=campus'; }, async getNativeCookies() { return ''; } },
    webPreview: false,
  });
  await bridge.init();
  bridge._native = true;
  bridge._restoreAttempted = true;
  bridge._campusClient = { setDiagnostic() {} };

  const recoveredState = {
    ...bridge._state,
    assignments: [{ id: 'assignment-recovered', title: '恢复后的作业' }],
  };
  bridge._campusSync = {
    async syncJwglxt(state) { return { state, result: { source: { connected: true }, errors: [] } }; },
    async syncTheol(state) { return { state, authRequired: true }; },
  };
  bridge._recoverTheolMobileSession = async () => {
    bridge._campusSync = await bridge._createCampusSync(bridge._campusClient, { clientSource: 'browser' });
    return true;
  };
  bridge._createCampusSync = async () => ({
    async syncJwglxt(state) { return { state, result: { source: { connected: true }, errors: [] } }; },
    async syncTheol() { return { state: recoveredState, authRequired: false }; },
  });
  // This is the login promise that used to deadlock the recursive retry after
  // _recoverTheolMobileSession cleared the cached CampusSync instance.
  bridge._loginInFlight = new Promise(() => {});

  const snapshot = await Promise.race([
    bridge.syncNow(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('THEOL retry deadlocked')), 1_000)),
  ]);

  assert.equal(snapshot.assignments[0].id, 'assignment-recovered');
  assert.equal(snapshot.sync.lastError, null);
});

test('background auth expiry keeps cached data and exposes re-login state', async () => {
  const bridge = new MobileBridge({
    storageBackend: createWebStorageBackend({ storage: createLocalStorageShim() }),
    vault: createVault(new Map()),
    session: { clear() {} },
    webPreview: false,
  });
  await bridge.init();
  bridge._state.profile = { name: '缓存用户' };
  bridge._state.sync.lastSuccessAt = '2026-09-30T00:00:00.000Z';
  bridge._state.sync.lastCompletedAt = '2026-09-30T00:00:00.000Z';
  bridge._campusSync = {
    async syncJwglxt() {
      throw new Error('校园会话已失效，请在设置中重新登录');
    },
  };
  const progress = [];
  bridge.onSyncProgress((event) => progress.push(event));

  const snapshot = await bridge.syncNow({ background: true });

  assert.equal(snapshot.profile.name, '缓存用户');
  assert.equal(snapshot.sync.lastError, null);
  assert.equal((await bridge.getAuthStatus()).jwglxt.authRequired, true);
  assert.equal(progress.some((event) => event.background && event.authRequired), true);
});

test('academic API timeout identifies the exact endpoint', async () => {
  const client = new AcademicApiClient({
    username: 'student',
    password: 'secret',
    timeoutMs: 10,
    fetchImpl: async (_url, { signal }) => await new Promise((_resolve, reject) => {
      const abort = () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      };
      if (signal?.aborted) abort();
      else signal?.addEventListener('abort', abort, { once: true });
    }),
  });

  await assert.rejects(
    client.request('https://jwglxt.buct.edu.cn/jwglxt/xtgl/login_slogin.html'),
    /教务 API 请求超时（\/jwglxt\/xtgl\/login_slogin\.html，1 秒）/,
  );
});

test('API-only login failure stays on the API channel instead of requesting CAS re-login', async () => {
  const bridge = new MobileBridge({
    storageBackend: createWebStorageBackend({ storage: createLocalStorageShim() }),
    vault: createVault(new Map([
      ['academic-api-credentials', { username: 'api-student', password: 'api-secret' }],
    ])),
    session: { clear() {} },
    webPreview: false,
    academicClientFactory() {
      return {
        async login() {
          throw new Error(`教务 API 请求超时（/jwglxt/xtgl/login_slogin.html，${NETWORK_TIMEOUTS.JWGLXT_LOGIN} 秒）`);
        },
      };
    },
  });
  bridge._native = true;
  bridge._restoreAttempted = true;
  await bridge.init();
  bridge._state.settings.academicApiEnabled = true;

  await assert.rejects(bridge.login(), /教务 API 请求超时/);

  const auth = await bridge.getAuthStatus();
  assert.equal(auth.jwglxt.authRequired, undefined);
  assert.equal(auth.jwglxt.mode, 'academic-api');
  assert.match(auth.jwglxt.error, /教务 API 请求超时/);
});

test('API sync transport failure does not publish a false connected status', async () => {
  const bridge = new MobileBridge({
    storageBackend: createWebStorageBackend({ storage: createLocalStorageShim() }),
    vault: createVault(new Map()),
    session: { clear() {} },
    webPreview: false,
  });
  bridge._native = true;
  bridge._initialized = true;
  bridge._state = emptyState();
  bridge._state.settings.academicApiEnabled = true;
  bridge._campusSync = {
    async syncJwglxt(state) {
      return {
        state: { ...state, sync: { ...state.sync, lastError: `教务 API 请求超时（/jwglxt/xtgl/index_initMenu.html，${NETWORK_TIMEOUTS.JWGLXT_LOGIN} 秒）` } },
        result: {
          errors: [`教务 API 请求超时（/jwglxt/xtgl/index_initMenu.html，${NETWORK_TIMEOUTS.JWGLXT_LOGIN} 秒）`],
          source: { connected: false, api: { enabled: true } },
        },
      };
    },
  };

  const snapshot = await bridge.syncNow();
  const auth = await bridge.getAuthStatus();
  assert.equal(snapshot.sync.lastError, `教务 API 请求超时（/jwglxt/xtgl/index_initMenu.html，${NETWORK_TIMEOUTS.JWGLXT_LOGIN} 秒）`);
  assert.equal(auth.jwglxt.connected, false);
  assert.equal(auth.jwglxt.authRequired, undefined);
});

test('academic client can seed a browser-established campus cookie', () => {
  const client = new AcademicApiClient({ username: 'student', password: 'secret', cookieHeader: 'JSESSIONID=seeded; ROUTEID=node-a' });
  assert.match(client.cookieHeader(), /JSESSIONID=seeded/);
  assert.match(client.cookieHeader(), /ROUTEID=node-a/);
});

test('live Android CookieManager values override stale persisted campus cookies', async () => {
  const bridge = new MobileBridge({
    storageBackend: createWebStorageBackend({ storage: createLocalStorageShim() }),
    vault: createVault(new Map()),
    session: {
      load() {},
      getCookieHeader() { return 'JSESSIONID=stale-session; LOCAL_ONLY=fallback'; },
      async getNativeCookies() { return 'JSESSIONID=current-session; NATIVE_ONLY=live'; },
    },
    webPreview: false,
  });
  bridge._native = true;

  const header = await bridge._campusCookieHeader();

  assert.match(header, /JSESSIONID=current-session/);
  assert.match(header, /LOCAL_ONLY=fallback/);
  assert.match(header, /NATIVE_ONLY=live/);
  assert.doesNotMatch(header, /JSESSIONID=stale-session/);
});

test('preview login without credentials does not silently switch to mock data', async () => {
  const bridge = new MobileBridge({
    storageBackend: createWebStorageBackend({ storage: createLocalStorageShim() }),
    vault: createVault(new Map()),
    session: { clear() {} },
    webPreview: true,
  });

  await assert.rejects(
    bridge.login(),
    /浏览器预览需要先填写统一身份认证账号和密码/,
  );
});

test('mobile saved-secret aliases resolve to their vault records', async () => {
  const secrets = new Map([
    ['unified-credentials', { username: 'student', password: 'secret' }],
    ['academic-api-credentials', { username: 'api-student', password: 'api-secret' }],
  ]);
  const bridge = new MobileBridge({
    vault: createVault(secrets),
    session: { clear() {} },
    storageBackend: createWebStorageBackend({ storage: createLocalStorageShim() }),
  });

  assert.equal(await bridge.readSavedSecret('unified-password'), 'secret');
  assert.equal(await bridge.readSavedSecret('academic-api-password'), 'api-secret');
});


test('saved-secret reveal returns only the password, never a credential JSON object', async () => {
  const secrets = new Map([
    ['unified-credentials', { username: 'student', password: 'secret' }],
  ]);
  const bridge = new MobileBridge({
    vault: createVault(secrets),
    session: { clear() {} },
    storageBackend: createWebStorageBackend({ storage: createLocalStorageShim() }),
  });

  const revealed = await bridge.readSavedSecret('unified-password');
  assert.equal(revealed, 'secret');
  assert.equal(revealed.includes('student'), false);
  assert.equal(revealed.startsWith('{'), false);
});


test('academic native transport validates every redirect and rejects off-campus targets', async () => {
  const requested = [];
  const client = new AcademicApiClient({
    username: 'probe',
    password: 'probe',
    fetchImpl: createNativeFetch({
      async request(options) {
        requested.push(options);
        return {
          status: 302,
          url: options.url,
          headers: { location: 'https://example.com/collect' },
          data: '',
        };
      },
    }),
  });

  await assert.rejects(
    client.request('https://jwglxt.buct.edu.cn/jwglxt/xtgl/login_slogin.html'),
    /拒绝重定向到非校园网地址/,
  );
  assert.equal(requested.length, 1);
  assert.equal(requested[0].disableRedirects, true);
});

test('native fetch preserves explicit Cookie headers for CapacitorHttp', async () => {
  let requestOptions = null;
  const nativeFetch = createNativeFetch({
    async request(options) {
      requestOptions = options;
      return {
        status: 200,
        url: options.url,
        headers: { 'content-type': 'text/plain; charset=UTF-8' },
        data: Buffer.from('ok', 'utf8').toString('base64'),
      };
    },
  });

  await nativeFetch('https://jwglxt.buct.edu.cn/jwglxt/xtgl/index_initMenu.html', {
    headers: { Cookie: 'JSESSIONID=academic-session' },
  });

  assert.equal(requestOptions.headers.Cookie || requestOptions.headers.cookie, 'JSESSIONID=academic-session');
});

test('academic cookie jar accepts Android joined Set-Cookie response headers', async () => {
  const requests = [];
  const client = new AcademicApiClient({
    username: 'probe',
    password: 'probe',
    fetchImpl: createNativeFetch({
      async request(options) {
        requests.push(options);
        return {
          status: 200,
          url: options.url,
          headers: {
            'content-type': 'text/html; charset=UTF-8',
            'set-cookie': 'JSESSIONID=joined-session; Path=/jwglxt, XSRF-TOKEN=joined-token; Path=/jwglxt',
          },
          data: Buffer.from('<html>ok</html>', 'utf8').toString('base64'),
        };
      },
    }),
  });

  await client.request('https://jwglxt.buct.edu.cn/jwglxt/xtgl/login_slogin.html');
  await client.request('https://jwglxt.buct.edu.cn/jwglxt/xtgl/index_initMenu.html');

  assert.match(requests[1].headers.Cookie || requests[1].headers.cookie || '', /JSESSIONID=joined-session/);
  assert.match(requests[1].headers.Cookie || requests[1].headers.cookie || '', /XSRF-TOKEN=joined-token/);
});

test('academic redirects rebuild the request Cookie header after Set-Cookie rotation', async () => {
  const requests = [];
  const client = new AcademicApiClient({
    username: 'student',
    password: 'secret',
    cookieHeader: 'JSESSIONID=old-session',
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), cookie: new Headers(init.headers).get('Cookie') });
      if (requests.length === 1) {
        return new Response(null, {
          status: 302,
          headers: {
            Location: 'https://jwglxt.buct.edu.cn/jwglxt/next.html',
            'Set-Cookie': 'JSESSIONID=new-session; Path=/jwglxt',
          },
        });
      }
      return new Response('<html>authenticated</html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=UTF-8' },
      });
    },
  });

  await client.request('https://jwglxt.buct.edu.cn/jwglxt/start.html', {
    headers: { Cookie: 'JSESSIONID=old-session' },
  });

  assert.equal(requests.length, 2);
  assert.equal(requests[0].cookie, 'JSESSIONID=old-session');
  assert.equal(requests[1].cookie, 'JSESSIONID=new-session');
});

test('native fetch disables automatic redirects for academic URL validation', async () => {
  let requestOptions = null;
  const nativeFetch = createNativeFetch({
    async request(options) {
      requestOptions = options;
      return {
        status: 302,
        url: 'https://jwglxt.buct.edu.cn/jwglxt/xtgl/login_slogin.html',
        headers: { Location: 'https://jwglxt.buct.edu.cn/jwglxt/xtgl/login_slogin.html' },
        data: '',
      };
    },
  });

  const response = await nativeFetch('https://jwglxt.buct.edu.cn/jwglxt/xtgl/login_slogin.html', {
    redirect: 'manual',
  });

  assert.equal(requestOptions.disableRedirects, true);
  assert.equal(requestOptions.url, 'https://jwglxt.buct.edu.cn/jwglxt/xtgl/login_slogin.html');
  assert.equal(response.status, 302);
  assert.equal(response.url, requestOptions.url);
});


test('demo assignment detail can expand without a campus session', async () => {
  const bridge = new MobileBridge({
    storageBackend: createWebStorageBackend({ storage: createLocalStorageShim() }),
    vault: createVault(new Map()),
    session: { clear() {} },
    webPreview: false,
  });
  bridge._demoMode = true;
  await bridge.init();

  const detail = await bridge.getAssignmentDetail('a1');

  assert.equal(detail.authenticated, true);
  assert.equal(detail.assignmentId, 'a1');
  assert.match(detail.contentText, /示例作业说明/);
  assert.match(detail.contentHtml, /当前为浏览器演示数据/);
});

test('THEOL assignment detail expiry retries through automatic recovery', async () => {
  const bridge = new MobileBridge({
    storageBackend: createWebStorageBackend({ storage: createLocalStorageShim() }),
    vault: createVault(new Map()),
    session: { clear() {} },
    webPreview: false,
  });
  bridge._initialized = true;
  bridge._state = emptyState();
  bridge._state.assignments = [{
    id: 'a1',
    title: '第一次作业',
    courseId: '1001',
    courseName: '高等数学 A',
    source: 'theol',
    status: 'pending',
  }];
  let detailCalls = 0;
  let recoveryCalls = 0;
  bridge._campusSync = {
    async getAssignmentDetail() {
      detailCalls += 1;
      if (detailCalls === 1) throw new Error('北化在线THEOL 需要重新完成统一身份认证');
      return {
        authenticated: true,
        assignmentId: 'a1',
        title: '第一次作业',
        status: 'submitted',
        contentText: '题目正文',
      };
    },
  };
  bridge._recoverCampusSession = async ({ reason }) => {
    recoveryCalls += 1;
    assert.equal(reason, 'theol-detail');
    return true;
  };

  const detail = await bridge.getAssignmentDetail('a1');

  assert.equal(detail.status, 'submitted');
  assert.equal(detailCalls, 2);
  assert.equal(recoveryCalls, 1);
  // homeworkView.do may expose a submit-capable shell as submitted; keep the task-list state.
  assert.equal(bridge._state.assignments[0].status, 'pending');
});
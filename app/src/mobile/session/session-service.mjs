// TheiaSession — campus cookie/session handling for the WebView.
// Provides the cookie jar used by the API-first client and scaffolding for the
// restricted WebView CAS login (stage 1.2).
const COOKIE_PREFIX = 'theia-mobile/session/cookies/v1/';

export class SessionService {
  constructor({ storage = globalThis.localStorage } = {}) {
    this.storage = storage;
    this.cookies = new Map();
  }

  keyFor(domain) {
    return COOKIE_PREFIX + (domain || 'default');
  }

  load(domain) {
    try {
      const raw = this.storage.getItem(this.keyFor(domain));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const [name, value] of parsed) this.cookies.set(name, value);
        }
      }
    } catch { /* ignore corrupt cookie jars */ }
    return this.cookies;
  }

  save(domain) {
    try {
      this.storage.setItem(this.keyFor(domain), JSON.stringify([...this.cookies.entries()]));
    } catch { /* storage may be unavailable */ }
  }

  setCookie(name, value, domain = 'default') {
    this.cookies.set(name, value);
    this.save(domain);
  }

  getCookieHeader() {
    return [...this.cookies].map(([name, value]) => name + '=' + value).join('; ');
  }

  clear(domain) {
    this.cookies.clear();
    try {
      this.storage.removeItem(this.keyFor(domain));
    } catch { /* ignore */ }
  }

  async openRestrictedLoginWebView(options) {
    // Stage 1.2: opens a native WebView restricted to whitelisted campus
    // domains (no address bar, no downloads, no arbitrary navigation).
    // The native theia-session plugin will implement this; here we return a
    // structured error so callers degrade gracefully.
    throw new Error('受限 WebView 登录尚未在原生插件中实现（阶段1.2）');
  }
}

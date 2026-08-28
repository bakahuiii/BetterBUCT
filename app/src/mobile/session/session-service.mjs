// TheiaSession — campus cookie/session handling for the WebView.
// Native builds use the TheiaSession Capacitor plugin (restricted WebView CAS
// login, whitelist enforcement, cookie capture); web preview falls back to
// localStorage cookie jars for dev.
const COOKIE_PREFIX = 'theia-mobile/session/cookies/v1/';

function nativeSession() {
  try {
    if (window.Capacitor?.isNativePlatform?.() && window.Capacitor.Plugins?.TheiaSession) {
      return window.Capacitor.Plugins.TheiaSession;
    }
  } catch { /* ignore */ }
  return null;
}

export class SessionService {
  constructor({ storage = globalThis.localStorage } = {}) {
    this.storage = storage;
    this.cookies = new Map();
    this._native = null;
    this.whitelist = [...CAMPUS_WHITELIST];
  }

  get native() {
    if (this._native === undefined) this._native = nativeSession();
    return this._native;
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

  async getNativeCookies(host) {
    if (!this.native) return '';
    try {
      const result = await this.native.getCookies({ host });
      return result?.cookies || '';
    } catch {
      return '';
    }
  }

  clear(domain) {
    this.cookies.clear();
    try {
      this.storage.removeItem(this.keyFor(domain));
    } catch { /* ignore */ }
  }

  // Opens a restricted native WebView for CAS login.
  // - url: the campus login page (whitelisted)
  // - whitelist: campus domains allowed to load
  // Returns { canceled, cookies } where cookies is a "host|cookie; cookie" map.
  async openRestrictedLoginWebView({ url, whitelist = CAMPUS_WHITELIST } = {}) {
    if (this.native) {
      const result = await this.native.openRestrictedLogin({
        url,
        whitelist,
      });
      // Adopt captured cookies into the session jar.
      if (result?.cookies) {
        for (const line of String(result.cookies).split('\n')) {
          const separator = line.indexOf('|');
          if (separator <= 0) continue;
          const host = line.slice(0, separator);
          const cookieLine = line.slice(separator + 1);
          for (const pair of cookieLine.split(';')) {
            const eq = pair.indexOf('=');
            if (eq <= 0) continue;
            this.setCookie(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim(), host);
          }
        }
      }
      return result || { canceled: true, cookies: '' };
    }
    // Web preview: no native WebView. Keep the throw so callers degrade.
    throw new Error('受限 WebView 登录仅原生可用（请安装 APK 后重试）');
  }
}

export const CAMPUS_WHITELIST = [
  'buct.edu.cn', 'jwglxt.buct.edu.cn', 'course.buct.edu.cn',
  'authserver.buct.edu.cn', 'mail.buct.edu.cn', 'motion.buct.edu.cn',
  'xsfw.buct.edu.cn', 'ehall.buct.edu.cn', 'lib.buct.edu.cn',
];

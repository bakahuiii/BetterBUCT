import { registerPlugin } from '@capacitor/core';

const RegisteredTheiaSession = registerPlugin('TheiaSession');

// TheiaSession — campus cookie/session handling for the WebView.
// Native builds use the TheiaSession Capacitor plugin (restricted WebView CAS
// login, whitelist enforcement, cookie capture); web preview falls back to
// localStorage cookie jars for dev.
const COOKIE_PREFIX = 'theia-mobile/session/cookies/v1/';

function nativeSession() {
  try {
    // Custom Capacitor plugins registered with registerPlugin are resolved
    // through the returned proxy; they are not guaranteed to be enumerable in
    // window.Capacitor.Plugins on every Capacitor Android version.
    if (window.Capacitor?.isNativePlatform?.()) return RegisteredTheiaSession;
  } catch { /* ignore */ }
  return null;
}

export class SessionService {
  constructor({ storage = globalThis.localStorage } = {}) {
    this.storage = storage;
    this.cookies = new Map();
    this.hostCookies = new Map();
    this._native = undefined;
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
          for (const [name, value] of parsed) {
            if (name) this.setCookie(name, value, domain);
          }
        }
      }
    } catch { /* ignore corrupt cookie jars */ }
    return this.cookies;
  }

  save(domain) {
    try {
      const key = this.keyFor(domain);
      this.storage.setItem(key, JSON.stringify([...this.cookies.entries()]));
    } catch { /* storage may be unavailable */ }
  }

  setCookie(name, value, domain = 'default') {
    const normalizedDomain = String(domain || 'default').trim().toLowerCase();
    this.cookies.set(name, value);
    if (!this.hostCookies.has(normalizedDomain)) this.hostCookies.set(normalizedDomain, new Map());
    this.hostCookies.get(normalizedDomain).set(name, value);
    this.save(domain);
  }

  getCookieHeader(host = null) {
    const normalizedHost = String(host || '').trim().toLowerCase();
    if (normalizedHost) {
      const direct = this.hostCookies.get(normalizedHost);
      if (direct?.size) return [...direct].map(([name, value]) => name + '=' + value).join('; ');
    }
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

  async clear(domain) {
    this.cookies.clear();
    this.hostCookies.clear();
    try {
      await this.native?.clearCookies?.({ host: 'jwglxt.buct.edu.cn' });
    } catch { /* native cookie cleanup is best-effort */ }
    try {
      this.storage.removeItem(this.keyFor(domain));
    } catch { /* ignore */ }
  }

  // Opens a restricted native WebView for CAS login.
  // - url: the campus login page (whitelisted)
  // - whitelist: campus domains allowed to load
  // Returns { canceled, cookies } where cookies is a "host|cookie; cookie" map.
  async openRestrictedLoginWebView({ url, whitelist = CAMPUS_WHITELIST, username = '', password = '', autoFill = true } = {}) {
    if (this.native) {
      // Never include credentials in Capacitor methodData. The native plugin
      // reads the encrypted unified credential from Android Keystore.
      const result = await this.native.openRestrictedLogin({ url, whitelist, autoFill });
      // Adopt captured cookies into the session jar.
      if (result?.cookies) {
        for (const line of String(result.cookies).split('\n')) {
          const separator = line.indexOf('|');
          if (separator <= 0) continue;
          const host = line.slice(0, separator).trim().toLowerCase();
          const cookieLine = line.slice(separator + 1);
          for (const pair of cookieLine.split(';')) {
            const eq = pair.indexOf('=');
            if (eq <= 0) continue;
            const name = pair.slice(0, eq).trim();
            const value = pair.slice(eq + 1).trim();
            if (name) this.setCookie(name, value, host);
          }
        }
      }
      return result || { canceled: true, cookies: '', theolConnected: false };
    }
    // Web preview: no native WebView. Keep the throw so callers degrade.
    throw new Error('受限 WebView 登录仅原生可用（请安装 APK 后重试）');
  }
}

export const CAMPUS_WHITELIST = [
  'buct.edu.cn', 'jwglxt.buct.edu.cn', 'course.buct.edu.cn',
  'authserver.buct.edu.cn', 'experimental-auth-endpoint.buct.edu.cn', 'portal.buct.edu.cn',
  'mail.buct.edu.cn', 'motion.buct.edu.cn',
  'xsfw.buct.edu.cn', 'ehall.buct.edu.cn', 'lib.buct.edu.cn',
];

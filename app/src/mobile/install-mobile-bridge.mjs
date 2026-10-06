import { initCrashReporter } from './crash-reporter.ts'
import { APP_VERSION_LABEL } from './app-identity.mjs'
initCrashReporter(APP_VERSION_LABEL)

// Installs the mobile bridge as window.theia synchronously at module
// evaluation time, before src/main.tsx (which reads window.theia in bridge.ts)
// is evaluated. This is the core platformAdapter for the mobile WebView.
//
// ── Polyfills (must run before any import that uses them) ──────────────
// structuredClone is used by src/bridge.ts at module evaluation time.
// Android WebView < Chromium 98 (2022) does not support it natively.
// Safe global access (globalThis may be missing on very old WebViews).
const G = (typeof globalThis !== 'undefined') ? globalThis
  : (typeof self !== 'undefined') ? self
  : (typeof window !== 'undefined') ? window
  : {};

if (typeof G.structuredClone !== 'function') {
  G.structuredClone = function structuredClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    return JSON.parse(JSON.stringify(obj));
  };
}

// Runtime API polyfills for older Android WebViews (Chromium < 92).
if (typeof Object.hasOwn !== 'function') {
  Object.hasOwn = function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  };
}
if (typeof Array.prototype.at !== 'function') {
  Array.prototype.at = function at(index) {
    const length = this.length;
    const relative = Number(index) || 0;
    const k = relative >= 0 ? relative : length + relative;
    return k < 0 || k >= length ? undefined : this[k];
  };
}
if (typeof String.prototype.replaceAll !== 'function') {
  String.prototype.replaceAll = function replaceAll(search, replacement) {
    return this.split(search).join(replacement);
  };
}

// Global error capture — catch and display JS errors on screen so the user
// sees an error message instead of a white screen when something goes wrong.
try {
  const errorDiv = document.createElement('div');
  errorDiv.id = 'theia-error-overlay';
  errorDiv.style.cssText = 'display:none;position:fixed;inset:0;z-index:9999;background:#0b1220;color:#e74c3c;padding:48px 24px;font-family:system-ui,sans-serif;font-size:14px;overflow:auto;white-space:pre-wrap;word-break:break-all;';
  document.documentElement.appendChild(errorDiv);

  function showError(msg, source, line, col, error) {
    const text = [
      'BetterBUCT 遇到错误无法启动',
      '',
      msg || '',
      source ? 'at: ' + source + ':' + line + ':' + col : '',
      error?.stack || '',
      '',
      '请截图或记录此信息，然后重试或联系开发者。',
    ].join('\n');
    errorDiv.textContent = text;
    errorDiv.style.display = 'block';
  }

  window.addEventListener('error', (event) => {
    showError(event.message, event.filename, event.lineno, event.colno, event.error);
    return true;
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason?.message || String(reason);
    // Cancelling the native CAS dialog is a normal user action. Never turn it
    // into the fatal bootstrap overlay; the React shell and cached data remain
    // usable and the auth banner can offer another attempt.
    if (/(?:统一身份认证|登录|请求)已取消|用户取消|cancell?ed|aborted/iu.test(message)) {
      event.preventDefault?.();
      return;
    }
    showError(message, null, null, null, reason instanceof Error ? reason : null);
  });
} catch (e) {
  // Error capture itself must never crash.
}

import { Buffer } from 'buffer';
import { MobileBridge } from './mobile-bridge.mjs';
import { createWebStorageBackend } from './store/web-storage-backend.mjs';
import { createCapacitorFilesystemBackend } from './store/capacitor-filesystem-backend.mjs';

// Global Buffer polyfill must be set before any Node-dependent core module is
// imported dynamically (e.g. academic-api-client.mjs uses Buffer globally).
// Static imports at the top of this file are safe because they run before any
// dynamic import that references Buffer.
G.Buffer = G.Buffer || Buffer;

function isNativePlatform() {
  try {
    return Boolean(
      typeof window !== 'undefined' &&
      window.Capacitor &&
      typeof window.Capacitor.isNativePlatform === 'function' &&
      window.Capacitor.isNativePlatform(),
    );
  } catch {
    return false;
  }
}

export const mobileBridge = (() => {
  if (window.theia) return window.theia;
  const native = isNativePlatform();
  const backend = native
    ? createCapacitorFilesystemBackend()
    : createWebStorageBackend();
  const bridge = new MobileBridge({ storageBackend: backend });
  window.theia = bridge;
  window.__THEIA_MOBILE__ = {
    platform: native ? 'native' : 'web',
    bridge,
  };
  void bridge.init();
  return bridge;
})();

export default mobileBridge;

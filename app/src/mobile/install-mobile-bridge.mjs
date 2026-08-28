// Installs the mobile bridge as window.theia synchronously at module
// evaluation time, before src/main.tsx (which reads window.theia in bridge.ts)
// is evaluated. This is the core platformAdapter for the mobile WebView.
import { Buffer } from 'buffer';
import { MobileBridge } from './mobile-bridge.mjs';
import { createWebStorageBackend } from './store/web-storage-backend.mjs';
import { createCapacitorFilesystemBackend } from './store/capacitor-filesystem-backend.mjs';

// Global Buffer polyfill must be set before any Node-dependent core module is
// imported dynamically (e.g. academic-api-client.mjs uses Buffer globally).
// Static imports at the top of this file are safe because they run before any
// dynamic import that references Buffer.
globalThis.Buffer = globalThis.Buffer || Buffer;

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

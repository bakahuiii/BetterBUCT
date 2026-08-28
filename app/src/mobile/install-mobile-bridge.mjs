// Installs the mobile bridge as window.theia synchronously at module
// evaluation time, before src/main.tsx (which reads window.theia in bridge.ts)
// is evaluated. This is the core platformAdapter for the mobile WebView.
import { MobileBridge } from './mobile-bridge.mjs';
import { createWebStorageBackend } from './store/web-storage-backend.mjs';
import { createCapacitorFilesystemBackend } from './store/capacitor-filesystem-backend.mjs';

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

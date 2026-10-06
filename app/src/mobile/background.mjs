// Mobile background sync service.
// Native: TheiaBackground plugin (WorkManager periodic reminder).
// JS: auto-sync triggers on app resume and network reconnect.
import { Network } from '@capacitor/network';
import { App } from '@capacitor/app';

let nativePlugin = null;

function getNative() {
  if (nativePlugin === undefined) {
    try {
      if (window.Capacitor?.isNativePlatform?.() && window.Capacitor.Plugins?.TheiaBackground) {
        nativePlugin = window.Capacitor.Plugins.TheiaBackground;
      } else {
        nativePlugin = null;
      }
    } catch { nativePlugin = null; }
  }
  return nativePlugin;
}

// Schedule periodic sync reminder via WorkManager (native only).
export async function scheduleBackgroundSync(intervalMinutes = 180, staleAfterMs = 6 * 60 * 60 * 1000) {
  const plugin = getNative();
  if (plugin) {
    await plugin.scheduleSync({ intervalMinutes, staleAfterMs });
  }
}

// Cancel the periodic reminder.
export async function cancelBackgroundSync() {
  const plugin = getNative();
  if (plugin) await plugin.cancelSync();
}

// Record that a sync just happened (so the worker knows data is fresh).
export async function recordSyncNow() {
  const plugin = getNative();
  if (plugin) await plugin.recordSyncNow();
}

// Install auto-sync triggers: app resume + network reconnect.
// Call once on app startup.
export function installAutoSyncTriggers({ syncNow, getState, onMessage } = {}) {
  if (typeof syncNow !== 'function') return () => {};

  const cleanups = [];

  // App resume: check freshness and auto-sync if configured stale.
  if (window.Capacitor?.isNativePlatform?.()) {
    const handler = App.addListener('appStateChange', async (state) => {
      if (!state.isActive) return;
      const s = typeof getState === 'function' ? getState() : null;
      if (!s?.settings?.autoSync) return;
      const interval = (s.settings.syncIntervalMinutes || 30) * 60 * 1000;
      const lastCompleted = s.sync?.lastCompletedAt ? new Date(s.sync.lastCompletedAt).getTime() : 0;
      const age = Date.now() - lastCompleted;
      if (age > interval) {
        if (typeof onMessage === 'function') onMessage('数据已过期，正在自动同步…');
        await syncNow({ background: true }).catch(() => undefined);
      }
    });
    cleanups.push(() => handler.remove());
  }

  // Network reconnect: auto-sync if stale.
  if (window.Capacitor?.isNativePlatform?.()) {
    const handler = Network.addListener('networkStatusChange', async (status) => {
      if (!status.connected) return;
      const s = typeof getState === 'function' ? getState() : null;
      if (!s?.settings?.autoSync) return;
      const interval = (s.settings.syncIntervalMinutes || 30) * 60 * 1000;
      const lastCompleted = s.sync?.lastCompletedAt ? new Date(s.sync.lastCompletedAt).getTime() : 0;
      const age = Date.now() - lastCompleted;
      if (age > interval) {
        if (typeof onMessage === 'function') onMessage('网络已恢复，正在自动同步…');
        await syncNow({ background: true }).catch(() => undefined);
      }
    });
    cleanups.push(() => handler.remove());
  }

  return () => cleanups.forEach((fn) => fn());
}

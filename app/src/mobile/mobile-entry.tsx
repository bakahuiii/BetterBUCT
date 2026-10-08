// Mobile entry: install the mobile bridge FIRST (synchronously) so that
// src/bridge.ts resolves window.theia to our adapter, then mount the desktop
// React app unchanged, plus mobile-only enhancements.
import './install-mobile-bridge.mjs';
if (typeof document !== 'undefined') {
  document.documentElement.dataset.theiaMobile = 'true';
}
// Modules are executing — disarm the boot watchdog.
declare global {
  interface Window {
    __THEIA_BOOTED__?: boolean;
    Capacitor?: {
      isNativePlatform?: () => boolean;
      Plugins?: Record<string, unknown>;
    };
  }
}
window.__THEIA_BOOTED__ = true;

// 初始化崩溃收集
import { initCrashReporter } from './crash-reporter';
initCrashReporter('0.2.27');

// 初始化开机自启动监听
import { initBootReceiver } from './boot-receiver';
initBootReceiver();

import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import MobileActions from './MobileActions';
import MobileTabBar from './MobileTabBar';
import { installPullToRefreshBlocker } from './mobile-gestures.mjs';
import '../main';
// mobile.css must load AFTER '../main' (which pulls desktop styles.css) so our
// mobile overrides win the cascade.
import './mobile.css';
import { bridge } from '../bridge';

// Android WebView versions differ in how reliably they honor
// overscroll-behavior. Install the narrow DOM boundary guard before React
// mounts so the edge gesture cannot become a refresh action.
installPullToRefreshBlocker();

// Native status bar theming — follows the app's light/dark appearance.
async function applyStatusBar() {
  try {
    if (!window.Capacitor?.isNativePlatform?.()) return;
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    const isDark = document.documentElement.classList.contains('dark');
    await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
    await StatusBar.setBackgroundColor({ color: isDark ? '#141b26' : '#f5f7f7' });
  } catch {
    // Status bar theming is best-effort.
  }
}
applyStatusBar();
// Keep the status bar in sync when the appearance changes.
try {
  new MutationObserver(() => applyStatusBar()).observe(
    document.documentElement,
    { attributes: true, attributeFilter: ['class'] },
  );
} catch { /* ignore */ }

// Mount mobile-only UI (FAB) after the desktop app mounts.
function MobileEnhancements() {
  const [message, setMessage] = useState<{ text: string; kind: string } | null>(null);
  const [syncProgress, setSyncProgress] = useState<string | null>(null);

  useEffect(() => {
    // 监听同步进度事件
    const handleProgress = (progress: import('../types').SyncProgressEvent) => {
      if (progress?.status === 'syncing' && progress?.label) {
        setSyncProgress(progress.label);
      } else if (progress?.status === 'done') {
        // 成功完成，2秒后清除
        setTimeout(() => setSyncProgress(null), 2000);
      } else if (progress?.status === 'error') {
        // 错误信息显示更久，让用户有时间看清
        setTimeout(() => setSyncProgress(null), 5000);
      }
    };

    const bridgeAny = bridge as any;
    const offProgress = bridgeAny.events?.on('sync-progress', handleProgress);
    return () => {
      offProgress?.();
    };
  }, []);

  return (
    <>
      <MobileActions
        bridge={bridge}
        onMessage={(text: string, kind?: string) => {
          setMessage({ text, kind: kind || "info" });
          setTimeout(() => setMessage(null), 5000);
        }}
      />
      <MobileTabBar />
      {message && (
        <div
          style={{
            position: 'fixed',
            top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
            left: '50%',
            transform: 'translateX(-50%)',
            background: message.kind === 'error' ? '#c0392b' : message.kind === 'success' ? '#1e7e34' : '#234',
            color: '#fff',
            padding: '10px 16px',
            borderRadius: '10px',
            zIndex: 300,
            fontSize: '14px',
            boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
            maxWidth: '88vw',
          }}
        >
          {message.text}
        </div>
      )}
      {syncProgress && (
        <div
          style={{
            position: 'fixed',
            top: 'calc(env(safe-area-inset-top, 0px) + 60px)',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(18, 150, 182, 0.95)',
            color: '#fff',
            padding: '12px 20px',
            borderRadius: '12px',
            zIndex: 400,
            fontSize: '14px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            maxWidth: '88vw',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <div
            style={{
              width: '16px',
              height: '16px',
              border: '2px solid rgba(255,255,255,0.3)',
              borderTopColor: '#fff',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <span>{syncProgress}</span>
        </div>
      )}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}

function mountMobileEnhancements() {
  if (document.getElementById('theia-mobile-enhancements')) return;
  const host = document.createElement('div');
  host.id = 'theia-mobile-enhancements';
  document.body.appendChild(host);
  createRoot(host).render(<MobileEnhancements />);
}

// The native WebView can resume this entry after DOMContentLoaded has already
// fired. Mount immediately in that case; otherwise the one-shot listener is
// enough for the enhancement host.
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', mountMobileEnhancements, { once: true });
} else {
  mountMobileEnhancements();
}

export {};

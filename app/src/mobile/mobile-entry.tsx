// Mobile entry: install the mobile bridge FIRST (synchronously) so that
// src/bridge.ts resolves window.theia to our adapter, then mount the desktop
// React app unchanged, plus mobile-only enhancements.
import './install-mobile-bridge.mjs';
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
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import MobileActions from './MobileActions';
import MobileTabBar from './MobileTabBar';
import '../main';
// mobile.css must load AFTER '../main' (which pulls desktop styles.css) so our
// mobile overrides win the cascade.
import './mobile.css';
import { installPullToRefresh } from './mobile-gestures.mjs';
import { bridge } from '../bridge';

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
    </>
  );
}

window.addEventListener('DOMContentLoaded', () => {
  const host = document.createElement('div');
  host.id = 'theia-mobile-enhancements';
  document.body.appendChild(host);
  createRoot(host).render(<MobileEnhancements />);
  installPullToRefresh({
    onRefresh: () => bridge.syncNow().catch(() => undefined),
  } as never);
});

export {};
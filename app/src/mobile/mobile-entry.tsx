// Mobile entry: install the mobile bridge FIRST (synchronously) so that
// src/bridge.ts resolves window.theia to our adapter, then mount the desktop
// React app unchanged.
import './install-mobile-bridge.mjs';
import './mobile.css';
import '../main';
export {};

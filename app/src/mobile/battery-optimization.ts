import { registerPlugin } from '@capacitor/core';

interface BatteryStatus {
  supported: boolean;
  ignoringBatteryOptimizations: boolean;
}

interface BatteryPlugin {
  getStatus(): Promise<BatteryStatus>;
  requestIgnoreBatteryOptimizations(): Promise<BatteryStatus>;
  openSettings(): Promise<BatteryStatus>;
}

const TheiaBattery = registerPlugin<BatteryPlugin>('TheiaBattery');

// Android 6+ exposes the actual optimization state through the native plugin.
// Browser preview is treated as already optimized because it has no background worker.
export async function checkBatteryOptimization(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.Capacitor?.isNativePlatform?.()) return true;
  try {
    const status = await TheiaBattery.getStatus();
    return !status.supported || status.ignoringBatteryOptimizations;
  } catch {
    // Fail open: a missing optional plugin must not block the application.
    return true;
  }
}

export async function requestBatteryOptimizationExemption(): Promise<boolean> {
  try {
    const status = await TheiaBattery.requestIgnoreBatteryOptimizations();
    return !status.supported || status.ignoringBatteryOptimizations;
  } catch {
    return false;
  }
}

export async function openBatteryOptimizationSettings(): Promise<boolean> {
  try {
    await TheiaBattery.openSettings();
    return true;
  } catch {
    return false;
  }
}

export function showBatteryOptimizationGuide(): string {
  return `
为了确保后台同步正常运行，建议将 BetterBUCT 加入电池优化白名单：

1. 点击“立即设置”并允许 BetterBUCT 忽略电池优化
2. 如果系统不支持直接授权，请打开系统的电池优化列表
3. 将 BetterBUCT 设置为“不限制”或“不优化”

不同手机厂商的路径可能略有不同：
- 小米：设置 → 应用设置 → 应用管理 → BetterBUCT → 省电策略 → 无限制
- 华为：设置 → 应用 → 应用启动管理 → BetterBUCT → 手动管理（全部开启）
- OPPO/vivo：设置 → 电池 → 应用耗电管理 → BetterBUCT → 允许后台运行
  `.trim();
}

const BATTERY_GUIDE_SHOWN_KEY = 'theia-battery-guide-shown';
const BATTERY_MANUAL_CONFIRMED_KEY = 'theia-battery-manual-confirmed';

export function shouldShowBatteryGuide(): boolean {
  try {
    // 如果用户已手动确认加入白名单，不再显示指引
    if (localStorage.getItem(BATTERY_MANUAL_CONFIRMED_KEY) === 'true') {
      return false;
    }
    return localStorage.getItem(BATTERY_GUIDE_SHOWN_KEY) !== 'true';
  }
  catch { return false; }
}

export function markBatteryGuideShown() {
  try { localStorage.setItem(BATTERY_GUIDE_SHOWN_KEY, 'true'); }
  catch { /* 忽略 */ }
}

export function markBatteryManualConfirmed() {
  try { localStorage.setItem(BATTERY_MANUAL_CONFIRMED_KEY, 'true'); }
  catch { /* 忽略 */ }
}

export function resetBatteryManualConfirmation() {
  try { localStorage.removeItem(BATTERY_MANUAL_CONFIRMED_KEY); }
  catch { /* 忽略 */ }
}

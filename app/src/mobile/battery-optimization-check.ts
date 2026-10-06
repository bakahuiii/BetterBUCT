// 电池优化检查与主动请求豁免
// Android 6.0+ 的 Doze 模式会影响 AlarmManager 的精确性
// 我们需要引导用户将应用加入白名单

/**
 * 检查是否在电池优化白名单中
 * 注意：Capacitor 没有直接 API，这里是示意性实现
 * 实际需要通过自定义插件实现
 */
export async function checkBatteryOptimization(): Promise<{
  isIgnoringOptimizations: boolean;
  canRequest: boolean;
}> {
  if (typeof window === 'undefined' || !window.Capacitor?.isNativePlatform?.()) {
    return { isIgnoringOptimizations: true, canRequest: false };
  }

  try {
    // 这里需要自定义原生插件来实现
    // PowerManager.isIgnoringBatteryOptimizations(packageName)

    // 临时返回 false，提示用户手动设置
    return {
      isIgnoringOptimizations: false,
      canRequest: true,
    };
  } catch {
    return { isIgnoringOptimizations: false, canRequest: false };
  }
}

/**
 * 请求电池优化豁免
 * 注意：会打开系统设置页面，需要用户手动操作
 */
export async function requestBatteryOptimizationExemption(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.Capacitor?.isNativePlatform?.()) {
    return false;
  }

  try {
    // 打开电池优化设置页面
    // 注意：Capacitor App 插件没有 openUrl，使用 Capacitor 的 Plugins

    // 方案1: 使用 window.open（在 WebView 中可能被拦截）
    // window.open('android-settings://settings/APPLICATION_DETAILS_SETTINGS', '_system');

    // 方案2: 告诉用户手动打开设置
    console.log('[Battery] 请手动打开：设置 → 应用 → BetterBUCT → 电池');
    return false;
  } catch (error) {
    console.warn('[Battery] 打开设置失败:', error);
    return false;
  }
}

/**
 * 获取电池优化状态描述
 */
export function getBatteryOptimizationStatus(isIgnoring: boolean): string {
  if (isIgnoring) {
    return '✅ 已加入电池优化白名单，通知将准时送达';
  }
  return '⚠️ 应用可能被系统限制，建议加入电池优化白名单';
}

/**
 * 检查 SCHEDULE_EXACT_ALARM 权限（Android 12+）
 */
export async function checkExactAlarmPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.Capacitor?.isNativePlatform?.()) {
    return true;
  }

  try {
    // Android 12+ 需要用户授予 SCHEDULE_EXACT_ALARM 权限
    // AlarmManager.canScheduleExactAlarms()

    // 临时返回 true，假设已授予
    return true;
  } catch {
    return false;
  }
}

/**
 * 请求 SCHEDULE_EXACT_ALARM 权限
 */
export async function requestExactAlarmPermission(): Promise<void> {
  if (typeof window === 'undefined' || !window.Capacitor?.isNativePlatform?.()) {
    return;
  }

  try {
    // 打开精确闹钟设置页面
    // 告诉用户手动打开设置
    console.log('[Battery] 请手动打开：设置 → 应用 → 特殊应用权限 → 闹钟和提醒');
  } catch (error) {
    console.warn('[Battery] 打开精确闹钟设置失败:', error);
  }
}

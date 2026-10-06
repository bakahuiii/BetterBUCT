// 开机自启动处理：重新调度所有通知
// 当设备重启后，所有 AlarmManager 调度会被清除
// 我们需要在 BOOT_COMPLETED 后重新调度

import { App } from '@capacitor/app';
import { getNotificationSettings } from './notification-config';
import { scheduleAllNotifications } from './notification-scheduler';

/**
 * 初始化开机监听器
 * 在应用启动时调用，确保重启后能重新调度通知
 */
export function initBootReceiver() {
  // Capacitor 没有直接的 BOOT_COMPLETED 监听
  // 但我们可以在应用每次启动时检查是否需要重新调度

  // 监听应用状态变化
  App.addListener('appStateChange', async ({ isActive }) => {
    if (isActive) {
      await recheckAndRescheduleIfNeeded();
    }
  });

  // 应用启动时立即检查一次
  recheckAndRescheduleIfNeeded().catch(() => {
    // 忽略启动时的调度错误
  });
}

/**
 * 检查并重新调度通知（如果需要）
 */
async function recheckAndRescheduleIfNeeded() {
  const settings = getNotificationSettings();
  if (!settings.enabled) return;

  try {
    // 检查上次调度时间
    const lastScheduledKey = 'theia-last-scheduled-at';
    const lastScheduled = localStorage.getItem(lastScheduledKey);
    const now = Date.now();

    // 如果超过12小时未调度，或者从未调度过，重新调度
    if (!lastScheduled || now - Number(lastScheduled) > 12 * 60 * 60 * 1000) {
      console.log('[BootReceiver] 检测到需要重新调度通知');

      // 注意：这里需要获取完整的应用状态
      // 实际使用时需要从 bridge 获取数据
      // 这里只是标记需要重新调度的意图
      localStorage.setItem('theia-notification-needs-resync', 'true');
      localStorage.setItem(lastScheduledKey, String(now));
    }
  } catch (error) {
    console.warn('[BootReceiver] 检查调度状态失败:', error);
  }
}

/**
 * 清除重新调度标记
 * 在成功调度通知后调用
 */
export function clearResyncFlag() {
  localStorage.removeItem('theia-notification-needs-resync');
}

/**
 * 检查是否需要重新调度
 */
export function needsResync(): boolean {
  return localStorage.getItem('theia-notification-needs-resync') === 'true';
}

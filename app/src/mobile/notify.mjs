// Mobile notification service — sync completion / reminder notifications
// via @capacitor/local-notifications (native). No-op on web preview.
import { LocalNotifications } from '@capacitor/local-notifications';

let checkedPermissions = false;

async function ensurePermissions() {
  try {
    if (checkedPermissions) return true;
    if (!window.Capacitor?.isNativePlatform?.()) return false;
    const status = await LocalNotifications.checkPermissions();
    if (status.display === 'granted') {
      checkedPermissions = true;
      return true;
    }
    if (status.display === 'prompt' || status.display === 'prompt-with-rationale') {
      const request = await LocalNotifications.requestPermissions();
      checkedPermissions = request.display === 'granted';
      return checkedPermissions;
    }
    return false;
  } catch {
    return false;
  }
}

export async function notifySyncResult({ ok, error = null, scheduleCount = 0 }) {
  if (!await ensurePermissions()) return false;
  try {
    const title = ok ? '校园数据已更新' : '校园数据更新失败';
    const body = ok
      ? `课表 ${scheduleCount} 条已同步到本地`
      : (error || '请稍后重试');
    await LocalNotifications.schedule({
      notifications: [{
        id: Date.now() % 1000000,
        title,
        body,
        schedule: { at: new Date(Date.now() + 500) },
        smallIcon: 'ic_stat_theia',
        iconColor: '#1296b6',
      }],
    });
    return true;
  } catch {
    return false;
  }
}

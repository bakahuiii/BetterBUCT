# TheiaBackgroundPlugin

后台同步 / 通知。

**职责**：使用 WorkManager（Android）调度定时后台同步，在数据更新时
发送本地通知。

**接口**：
- `scheduleSync(intervalMinutes: number): Promise<void>`
- `cancelSync(): Promise<void>`
- `showNotification(title: string, body: string): Promise<void>`
- `cancelAllNotifications(): Promise<void>`

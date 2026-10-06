// 本地通知配置
export interface NotificationSettings {
  enabled: boolean;
  classReminder: {
    enabled: boolean;
    minutesBefore: number; // 上课前 N 分钟提醒
  };
  assignmentReminder: {
    enabled: boolean;
    daysBefore: number; // 截止前 N 天提醒
    hoursBefore: number; // 截止前 N 小时提醒
  };
  examReminder: {
    enabled: boolean;
    daysBefore: number[]; // 考试前多个时间点提醒，如 [3, 1]
    hoursBefore: number; // 考试前 N 小时提醒
  };
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  classReminder: {
    enabled: true,
    minutesBefore: 15,
  },
  assignmentReminder: {
    enabled: true,
    daysBefore: 1,
    hoursBefore: 2,
  },
  examReminder: {
    enabled: true,
    daysBefore: [3, 1],
    hoursBefore: 2,
  },
};

const SETTINGS_KEY = 'theia-notification-settings';

export function getNotificationSettings(): NotificationSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (!stored) return DEFAULT_NOTIFICATION_SETTINGS;
    return { ...DEFAULT_NOTIFICATION_SETTINGS, ...JSON.parse(stored) };
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

export function saveNotificationSettings(settings: NotificationSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // 忽略存储失败
  }
}

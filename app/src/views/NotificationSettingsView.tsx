import { Bell, BellOff, Check, Clock, Info, RefreshCw, Settings2, AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import {
  getNotificationSettings,
  saveNotificationSettings,
  type NotificationSettings,
} from "../mobile/notification-config";
import {
  requestNotificationPermission,
  checkNotificationPermission,
  scheduleAllNotifications,
  cancelAllNotifications,
  getPendingNotificationCount,
} from "../mobile/notification-scheduler";
import { shouldShowBatteryGuide, markBatteryGuideShown, showBatteryOptimizationGuide, markBatteryManualConfirmed } from "../mobile/battery-optimization";
import { checkBatteryOptimization, requestBatteryOptimizationExemption, getBatteryOptimizationStatus } from "../mobile/battery-optimization-check";
import { needsResync } from "../mobile/boot-receiver";
import type { CampusState } from "../types";
import { isMobile } from "../bridge";

export function NotificationSettingsView({
  state,
  terms,
}: {
  state: CampusState;
  terms: Array<{ id: string }>;
}) {
  const [settings, setSettings] = useState<NotificationSettings>(getNotificationSettings);
  const [hasPermission, setHasPermission] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [showBatteryGuide, setShowBatteryGuide] = useState(false);
  const [showBatteryGuideDialog, setShowBatteryGuideDialog] = useState(false);
  const [batteryOptimizationStatus, setBatteryOptimizationStatus] = useState<string>('检查中...');

  useEffect(() => {
    checkPermissionStatus();
    loadPendingCount();
    checkBatteryGuideStatus();
    checkBatteryStatus();
    checkResyncNeeded();
  }, []);

  const checkBatteryStatus = async () => {
    if (!isMobile) return;
    const status = await checkBatteryOptimization();
    setBatteryOptimizationStatus(getBatteryOptimizationStatus(status.isIgnoringOptimizations));
  };

  const checkResyncNeeded = async () => {
    if (!isMobile) return;
    if (needsResync() && hasPermission && settings.enabled) {
      setSyncMessage('检测到需要重新调度（设备可能重启过）');
      await handleSyncNotifications();
    }
  };

  const checkPermissionStatus = async () => {
    if (!isMobile) return;
    const granted = await checkNotificationPermission();
    setHasPermission(granted);
  };

  const loadPendingCount = async () => {
    if (!isMobile) return;
    const count = await getPendingNotificationCount();
    setPendingCount(count);
  };

  const checkBatteryGuideStatus = () => {
    if (!isMobile) return;
    setShowBatteryGuide(shouldShowBatteryGuide());
  };

  const handleRequestPermission = async () => {
    if (!isMobile) return;
    const granted = await requestNotificationPermission();
    setHasPermission(granted);
    if (granted) {
      setSyncMessage('已授予通知权限');
      setTimeout(() => setSyncMessage(null), 2000);
      // 自动同步通知
      await handleSyncNotifications();
    }
  };

  const handleSyncNotifications = async () => {
    if (!isMobile || !hasPermission) return;

    setSyncing(true);
    setSyncMessage(null);

    try {
      const result = await scheduleAllNotifications({
        schedule: state.schedule,
        assignments: state.assignments,
        exams: state.exams,
        terms,
        calendar: state.dataCatalog.collections.academicCalendar.calendar || null,
      });

      if (result.errors.length > 0) {
        setSyncMessage(`调度失败：${result.errors[0]}`);
      } else {
        setSyncMessage(`已调度 ${result.scheduled} 条通知`);
        setPendingCount(result.scheduled);
      }

      setTimeout(() => setSyncMessage(null), 3000);
    } catch (error) {
      setSyncMessage(`同步失败：${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleEnabled = async (enabled: boolean) => {
    const updated = { ...settings, enabled };
    setSettings(updated);
    saveNotificationSettings(updated);

    if (!isMobile) return;

    if (!enabled) {
      await cancelAllNotifications();
      setPendingCount(0);
      setSyncMessage('已取消所有通知');
      setTimeout(() => setSyncMessage(null), 2000);
    } else if (hasPermission) {
      await handleSyncNotifications();
    }
  };

  const handleUpdateSetting = async <K extends keyof NotificationSettings>(
    key: K,
    value: NotificationSettings[K]
  ) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    saveNotificationSettings(updated);

    // 如果启用状态，自动重新同步
    if (settings.enabled && hasPermission && isMobile) {
      await handleSyncNotifications();
    }
  };

  const handleDismissBatteryGuide = () => {
    markBatteryGuideShown();
    setShowBatteryGuide(false);
  };

  const handleManualConfirmBattery = async () => {
    markBatteryManualConfirmed();
    await checkBatteryStatus();
  };

  if (!isMobile) {
    return (
      <div className="data-page">
        <div className="empty-state">
          <Info size={48} />
          <h2>通知功能仅在移动端可用</h2>
          <p>本地通知需要 Android 原生环境支持</p>
        </div>
      </div>
    );
  }

  return (
    <div className="data-page notification-settings-page tools-notification-view">
      <div className="view-toolbar">
        <h1>
          <Bell size={20} />
          通知提醒
        </h1>
        {hasPermission && settings.enabled && (
          <button
            className="sync-button"
            onClick={handleSyncNotifications}
            disabled={syncing}
          >
            <RefreshCw size={16} className={syncing ? 'spinning' : ''} />
            {syncing ? '同步中' : '同步通知'}
          </button>
        )}
      </div>

      {syncMessage && (
        <div className="sync-message">
          <Check size={16} />
          {syncMessage}
        </div>
      )}

      {showBatteryGuide && (
        <div className="battery-guide-banner">
          <Info size={20} />
          <div>
            <strong>电池优化提示</strong>
            <p>为确保通知送达，建议将 BetterBUCT 加入电池优化白名单</p>
          </div>
          <button onClick={() => setShowBatteryGuideDialog(true)}>查看指南</button>
          <button onClick={handleDismissBatteryGuide} className="dismiss">
            不再提示
          </button>
        </div>
      )}

      {!batteryOptimizationStatus.startsWith('✅') && (
        <div className="warning-banner killed-warning">
          <AlertTriangle size={20} />
          <div>
            <strong>重要提示</strong>
            <p>
              从最近任务滑掉应用可能导致通知失效。建议：
              <br />• 加入电池优化白名单
              <br />• 允许后台运行
              <br />• 设备重启后重新打开应用
            </p>
            <small style={{ marginTop: '8px', display: 'block', opacity: 0.7 }}>
              {batteryOptimizationStatus}
            </small>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button onClick={() => requestBatteryOptimizationExemption()}>
              打开设置
            </button>
            <button onClick={handleManualConfirmBattery} style={{ fontSize: '12px', padding: '6px 10px' }}>
              已手动设置
            </button>
          </div>
        </div>
      )}

      <div className="settings-section">
        <div className="setting-row main-toggle">
          <div className="setting-info">
            <Settings2 size={20} />
            <div>
              <strong>启用通知提醒</strong>
              <span>本地调度，无需网络连接</span>
            </div>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => handleToggleEnabled(e.target.checked)}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>

        {!hasPermission && (
          <div className="permission-prompt">
            <BellOff size={24} />
            <p>需要授予通知权限才能使用此功能</p>
            <button onClick={handleRequestPermission}>授予权限</button>
          </div>
        )}

        {hasPermission && pendingCount > 0 && (
          <div className="pending-info">
            <Clock size={16} />
            当前已调度 {pendingCount} 条通知
          </div>
        )}
      </div>

      {settings.enabled && hasPermission && (
        <>
          <div className="settings-section">
            <h3>上课提醒</h3>
            <div className="setting-row">
              <div className="setting-info">
                <strong>启用上课提醒</strong>
                <span>在上课前提醒你课程信息</span>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings.classReminder.enabled}
                  onChange={(e) =>
                    handleUpdateSetting('classReminder', {
                      ...settings.classReminder,
                      enabled: e.target.checked,
                    })
                  }
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            {settings.classReminder.enabled && (
              <div className="setting-row">
                <div className="setting-info">
                  <strong>提前时间</strong>
                  <span>上课前 {settings.classReminder.minutesBefore} 分钟提醒</span>
                </div>
                <select
                  value={settings.classReminder.minutesBefore}
                  onChange={(e) =>
                    handleUpdateSetting('classReminder', {
                      ...settings.classReminder,
                      minutesBefore: Number(e.target.value),
                    })
                  }
                >
                  <option value="5">5 分钟</option>
                  <option value="10">10 分钟</option>
                  <option value="15">15 分钟</option>
                  <option value="20">20 分钟</option>
                  <option value="30">30 分钟</option>
                </select>
              </div>
            )}
          </div>

          <div className="settings-section">
            <h3>作业提醒</h3>
            <div className="setting-row">
              <div className="setting-info">
                <strong>启用作业提醒</strong>
                <span>在截止日期前提醒未提交的作业</span>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings.assignmentReminder.enabled}
                  onChange={(e) =>
                    handleUpdateSetting('assignmentReminder', {
                      ...settings.assignmentReminder,
                      enabled: e.target.checked,
                    })
                  }
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            {settings.assignmentReminder.enabled && (
              <>
                <div className="setting-row">
                  <div className="setting-info">
                    <strong>提前天数</strong>
                    <span>截止前 {settings.assignmentReminder.daysBefore} 天提醒</span>
                  </div>
                  <select
                    value={settings.assignmentReminder.daysBefore}
                    onChange={(e) =>
                      handleUpdateSetting('assignmentReminder', {
                        ...settings.assignmentReminder,
                        daysBefore: Number(e.target.value),
                      })
                    }
                  >
                    <option value="1">1 天</option>
                    <option value="2">2 天</option>
                    <option value="3">3 天</option>
                  </select>
                </div>

                <div className="setting-row">
                  <div className="setting-info">
                    <strong>提前小时</strong>
                    <span>截止前 {settings.assignmentReminder.hoursBefore} 小时提醒</span>
                  </div>
                  <select
                    value={settings.assignmentReminder.hoursBefore}
                    onChange={(e) =>
                      handleUpdateSetting('assignmentReminder', {
                        ...settings.assignmentReminder,
                        hoursBefore: Number(e.target.value),
                      })
                    }
                  >
                    <option value="2">2 小时</option>
                    <option value="4">4 小时</option>
                    <option value="6">6 小时</option>
                    <option value="12">12 小时</option>
                  </select>
                </div>
              </>
            )}
          </div>

          <div className="settings-section">
            <h3>考试提醒</h3>
            <div className="setting-row">
              <div className="setting-info">
                <strong>启用考试提醒</strong>
                <span>在考试前多个时间点提醒</span>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings.examReminder.enabled}
                  onChange={(e) =>
                    handleUpdateSetting('examReminder', {
                      ...settings.examReminder,
                      enabled: e.target.checked,
                    })
                  }
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            {settings.examReminder.enabled && (
              <>
                <div className="setting-row">
                  <div className="setting-info">
                    <strong>提前天数</strong>
                    <span>
                      考试前{' '}
                      {settings.examReminder.daysBefore.join('、')} 天提醒
                    </span>
                  </div>
                  <div className="days-checkboxes">
                    {[1, 2, 3, 7].map((day) => (
                      <label key={day}>
                        <input
                          type="checkbox"
                          checked={settings.examReminder.daysBefore.includes(day)}
                          onChange={(e) => {
                            const days = e.target.checked
                              ? [...settings.examReminder.daysBefore, day].sort(
                                  (a, b) => b - a
                                )
                              : settings.examReminder.daysBefore.filter((d) => d !== day);
                            handleUpdateSetting('examReminder', {
                              ...settings.examReminder,
                              daysBefore: days,
                            });
                          }}
                        />
                        {day} 天
                      </label>
                    ))}
                  </div>
                </div>

                <div className="setting-row">
                  <div className="setting-info">
                    <strong>提前小时</strong>
                    <span>考试前 {settings.examReminder.hoursBefore} 小时提醒</span>
                  </div>
                  <select
                    value={settings.examReminder.hoursBefore}
                    onChange={(e) =>
                      handleUpdateSetting('examReminder', {
                        ...settings.examReminder,
                        hoursBefore: Number(e.target.value),
                      })
                    }
                  >
                    <option value="2">2 小时</option>
                    <option value="4">4 小时</option>
                    <option value="6">6 小时</option>
                  </select>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {showBatteryGuideDialog && (
        <div className="battery-guide-dialog">
          <div className="dialog-content">
            <h3>电池优化白名单指南</h3>
            <pre>{showBatteryOptimizationGuide()}</pre>
            <button onClick={() => setShowBatteryGuideDialog(false)}>知道了</button>
          </div>
        </div>
      )}
    </div>
  );
}

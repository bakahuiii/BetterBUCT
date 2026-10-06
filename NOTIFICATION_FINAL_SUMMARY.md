# 本地提醒功能说明

BetterBUCT 的提醒功能在 Android 设备本地调度课程、作业和考试提醒，不依赖开发者的推送服务器。

## 功能范围

- 课程提醒：根据周次、星期和节次计算上课时间。
- 作业提醒：根据截止时间调度提前提醒，并跳过已提交或已过期项目。
- 考试提醒：支持按天和按小时设置提前提醒，并展示考场相关信息。
- 滚动调度：默认维护未来一段时间的提醒，减少系统一次性保存过多任务。
- 权限引导：提供通知权限、精确闹钟和电池优化设置引导。
- 状态恢复：应用再次打开或设备重启后，尝试恢复本地提醒调度。

## 可靠性边界

提醒是否准时到达仍受 Android 系统和厂商后台策略影响。用户需要根据系统提示完成通知权限和电池优化设置；部分厂商还需要允许应用自启动或后台运行。

应用不会把提醒是否送达夸大为固定百分比。实际结果取决于设备型号、系统版本、用户权限和校园数据是否已经同步。

## 相关实现

- `app/src/mobile/notification-config.ts`：提醒配置和本地持久化
- `app/src/mobile/notification-scheduler.ts`：课程、作业和考试调度
- `app/src/mobile/battery-optimization.ts`：电池优化引导
- `app/src/mobile/boot-receiver.ts`：设备重启后的恢复逻辑
- `app/src/views/NotificationSettingsView.tsx`：提醒设置界面

## 验证

代码验证使用以下命令：

```powershell
cd app
npm run typecheck
npm test
```

通知的真实到达情况应在目标 Android 设备上分别验证运行中、锁屏、后台、设备重启和厂商省电策略等场景。

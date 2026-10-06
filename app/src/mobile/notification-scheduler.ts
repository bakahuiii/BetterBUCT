import { LocalNotifications } from '@capacitor/local-notifications';
import type { ScheduleItem, Assignment, Exam, AcademicCalendar } from '../types';
import { getNotificationSettings } from './notification-config';
import { parseExamTime } from '../ui/app-shared';
import { currentAcademicWeekForTerms, occursInWeek, currentAcademicVacation } from '../ui/calendar';
import { clearResyncFlag } from './boot-receiver';

// 通知 ID 前缀，避免与其他模块冲突
const CLASS_NOTIFICATION_ID_BASE = 10000;
const ASSIGNMENT_NOTIFICATION_ID_BASE = 20000;
const EXAM_NOTIFICATION_ID_BASE = 30000;

// 课程时间映射（北化校区标准作息）
const CLASS_TIMES: Record<string, { hour: number; minute: number }> = {
  '1': { hour: 8, minute: 0 },
  '2': { hour: 8, minute: 50 },
  '3': { hour: 10, minute: 0 },
  '4': { hour: 10, minute: 50 },
  '5': { hour: 13, minute: 30 },
  '6': { hour: 14, minute: 20 },
  '7': { hour: 15, minute: 30 },
  '8': { hour: 16, minute: 20 },
  '9': { hour: 18, minute: 30 },
  '10': { hour: 19, minute: 20 },
  '11': { hour: 20, minute: 10 },
};

/**
 * 请求通知权限
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const result = await LocalNotifications.requestPermissions();
    return result.display === 'granted';
  } catch (error) {
    console.warn('[Notification] 请求权限失败:', error);
    return false;
  }
}

/**
 * 检查通知权限状态
 */
export async function checkNotificationPermission(): Promise<boolean> {
  try {
    const result = await LocalNotifications.checkPermissions();
    return result.display === 'granted';
  } catch {
    return false;
  }
}

/**
 * 调度所有通知（课程、作业、考试）
 */
export async function scheduleAllNotifications(data: {
  schedule: ScheduleItem[];
  assignments: Assignment[];
  exams: Exam[];
  terms: Array<{ id: string }>;
  calendar?: AcademicCalendar | null;
}): Promise<{ scheduled: number; errors: string[] }> {
  const settings = getNotificationSettings();
  if (!settings.enabled) {
    return { scheduled: 0, errors: [] };
  }

  const hasPermission = await checkNotificationPermission();
  if (!hasPermission) {
    return { scheduled: 0, errors: ['未授予通知权限'] };
  }

  // 取消所有现有通知
  await cancelAllNotifications();

  const errors: string[] = [];
  let scheduled = 0;

  try {
    // 1. 调度课程提醒
    if (settings.classReminder.enabled) {
      const classCount = await scheduleClassNotifications(
        data.schedule,
        data.terms,
        data.calendar,
        settings.classReminder.minutesBefore
      );
      scheduled += classCount;
    }

    // 2. 调度作业提醒
    if (settings.assignmentReminder.enabled) {
      const assignmentCount = await scheduleAssignmentNotifications(
        data.assignments,
        settings.assignmentReminder
      );
      scheduled += assignmentCount;
    }

    // 3. 调度考试提醒
    if (settings.examReminder.enabled) {
      const examCount = await scheduleExamNotifications(
        data.exams,
        settings.examReminder
      );
      scheduled += examCount;
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  // 记录最后调度时间
  if (scheduled > 0) {
    try {
      localStorage.setItem('theia-last-scheduled-at', String(Date.now()));
      clearResyncFlag();
    } catch {
      // 忽略
    }
  }

  return { scheduled, errors };
}

/**
 * 调度课程提醒
 */
async function scheduleClassNotifications(
  schedule: ScheduleItem[],
  terms: Array<{ id: string }>,
  calendar: AcademicCalendar | null | undefined,
  minutesBefore: number = 15
): Promise<number> {
  const now = Date.now();
  const twoWeeksLater = now + 14 * 24 * 60 * 60 * 1000; // 只调度未来两周的课程
  const notifications: Array<{
    id: number;
    title: string;
    body: string;
    schedule: { at: Date };
  }> = [];

  const termIds = terms.map(t => t.id);
  const currentWeek = currentAcademicWeekForTerms(calendar, termIds);
  const vacation = currentAcademicVacation(calendar);

  if (vacation) {
    // 检查假期是否在2周内结束
    const vacationEnd = new Date(vacation.endDate).getTime();
    if (vacationEnd > twoWeeksLater) {
      // 假期太长，2周内不会有课
      return 0;
    }
    // 否则继续调度假期后的课程
  }

  // 预计算未来2周的周次列表
  const weeksList = currentWeek
    ? [currentWeek.week, currentWeek.week + 1, currentWeek.week + 2]
    : [1, 2, 3];

  // 预先筛选出在这3周内有课的课程
  const relevantSchedule = schedule.filter(item => {
    if (!item.period || !item.weekday || String(item.period).trim() === '') return false;
    return weeksList.some(week => occursInWeek(item.weeks, week));
  });

  relevantSchedule.forEach((item, index) => {
    const classTime = CLASS_TIMES[String(item.period).split('-')[0]] || CLASS_TIMES['1'];
    const weekday = Number(item.weekday);

    // 计算未来两周内该课程的所有上课时间
    for (let weeksAhead = 0; weeksAhead <= 2; weeksAhead++) {
      const targetWeek = currentWeek ? currentWeek.week + weeksAhead : weeksAhead + 1;

      // 检查该周是否有课
      if (!occursInWeek(item.weeks, targetWeek)) continue;

      // 计算具体日期时间
      const daysAhead = (weekday - new Date().getDay() + 7) % 7 + weeksAhead * 7;
      if (daysAhead < 0) continue;

      const classDate = new Date();
      classDate.setDate(classDate.getDate() + daysAhead);
      classDate.setHours(classTime.hour, classTime.minute, 0, 0);

      const notificationDate = new Date(classDate.getTime() - minutesBefore * 60 * 1000);

      if (notificationDate.getTime() > now && notificationDate.getTime() < twoWeeksLater) {
        notifications.push({
          id: CLASS_NOTIFICATION_ID_BASE + index * 1000 + weeksAhead,
          title: `${minutesBefore} 分钟后上课`,
          body: `${item.title}${item.room ? ` · ${item.room}` : ''}`,
          schedule: { at: notificationDate },
        });
      }
    }
  });

  if (notifications.length > 0) {
    await LocalNotifications.schedule({ notifications });
  }

  return notifications.length;
}

/**
 * 调度作业提醒
 */
async function scheduleAssignmentNotifications(
  assignments: Assignment[],
  config: { daysBefore: number; hoursBefore: number }
): Promise<number> {
  const now = Date.now();
  const notifications: Array<{
    id: number;
    title: string;
    body: string;
    schedule: { at: Date };
  }> = [];

  assignments.forEach((item, index) => {
    if (!item.dueAt || item.status === 'submitted') return;

    const dueTime = new Date(item.dueAt).getTime();
    if (dueTime < now) return; // 已过期

    // 提前 N 天提醒
    const dayBeforeTime = dueTime - config.daysBefore * 24 * 60 * 60 * 1000;
    if (dayBeforeTime > now) {
      notifications.push({
        id: ASSIGNMENT_NOTIFICATION_ID_BASE + index * 10,
        title: `作业将在 ${config.daysBefore} 天后截止`,
        body: item.title,
        schedule: { at: new Date(dayBeforeTime) },
      });
    }

    // 提前 N 小时提醒
    const hourBeforeTime = dueTime - config.hoursBefore * 60 * 60 * 1000;
    if (hourBeforeTime > now && hourBeforeTime !== dayBeforeTime) {
      notifications.push({
        id: ASSIGNMENT_NOTIFICATION_ID_BASE + index * 10 + 1,
        title: `作业将在 ${config.hoursBefore} 小时后截止`,
        body: item.title,
        schedule: { at: new Date(hourBeforeTime) },
      });
    }
  });

  if (notifications.length > 0) {
    await LocalNotifications.schedule({ notifications });
  }

  return notifications.length;
}

/**
 * 调度考试提醒
 */
async function scheduleExamNotifications(
  exams: Exam[],
  config: { daysBefore: number[]; hoursBefore: number }
): Promise<number> {
  const now = Date.now();
  const notifications: Array<{
    id: number;
    title: string;
    body: string;
    schedule: { at: Date };
  }> = [];
  const skippedExams: string[] = [];

  exams.forEach((item, index) => {
    const examTime = parseExamTime(item.startAt, item.examTime);

    // 区分解析失败和已过期
    if (examTime === 0) {
      skippedExams.push(item.courseName || '未知考试');
      return;
    }

    if (examTime < now) {
      // 已过期，不是错误
      return;
    }

    // 提前多天提醒（如 3 天、1 天）
    config.daysBefore.forEach((days, dayIndex) => {
      const reminderTime = examTime - days * 24 * 60 * 60 * 1000;
      if (reminderTime > now) {
        notifications.push({
          id: EXAM_NOTIFICATION_ID_BASE + index * 10 + dayIndex,
          title: `考试将在 ${days} 天后开始`,
          body: `${item.courseName}${item.location ? ` · ${item.location}` : ''}`,
          schedule: { at: new Date(reminderTime) },
        });
      }
    });

    // 提前 N 小时提醒
    const hourBeforeTime = examTime - config.hoursBefore * 60 * 60 * 1000;
    if (hourBeforeTime > now) {
      notifications.push({
        id: EXAM_NOTIFICATION_ID_BASE + index * 10 + 9,
        title: `考试将在 ${config.hoursBefore} 小时后开始`,
        body: `${item.courseName}${item.seat ? ` · 座号 ${item.seat}` : ''}`,
        schedule: { at: new Date(hourBeforeTime) },
      });
    }
  });

  if (notifications.length > 0) {
    await LocalNotifications.schedule({ notifications });
  }

  // 如果有解析失败的考试，记录到控制台
  if (skippedExams.length > 0) {
    console.warn('[Notification] 以下考试时间解析失败，未调度提醒:', skippedExams.join(', '));
  }

  return notifications.length;
}

/**
 * 取消所有通知
 */
export async function cancelAllNotifications(): Promise<void> {
  try {
    await LocalNotifications.cancel({ notifications: [] }); // 空数组表示取消所有
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel({ notifications: pending.notifications });
    }
  } catch (error) {
    console.warn('[Notification] 取消通知失败:', error);
  }
}

/**
 * 获取待发送的通知数量
 */
export async function getPendingNotificationCount(): Promise<number> {
  try {
    const pending = await LocalNotifications.getPending();
    return pending.notifications.length;
  } catch {
    return 0;
  }
}


// 轻量级崩溃收集 - 仅本地存储，不上传
export interface CrashReport {
  timestamp: string;
  message: string;
  stack?: string;
  userAgent: string;
  appVersion: string;
  url: string;
}

const MAX_CRASH_REPORTS = 10;
const CRASH_STORAGE_KEY = 'theia-crash-reports';

declare global {
  interface Window {
    __THEIA_CRASH_REPORTER_INITIALIZED__?: boolean;
  }
}

export function initCrashReporter(appVersion: string) {
  if (typeof window === 'undefined') return;
  if (window.__THEIA_CRASH_REPORTER_INITIALIZED__) return;
  window.__THEIA_CRASH_REPORTER_INITIALIZED__ = true;

  // 捕获未处理的错误
  window.addEventListener('error', (event) => {
    saveCrashReport({
      timestamp: new Date().toISOString(),
      message: event.message,
      stack: event.error?.stack,
      userAgent: navigator.userAgent,
      appVersion,
      url: window.location.href,
    });
  });

  // 捕获未处理的 Promise 拒绝
  window.addEventListener('unhandledrejection', (event) => {
    saveCrashReport({
      timestamp: new Date().toISOString(),
      message: `Unhandled Promise Rejection: ${reasonText(event.reason)}`,
      stack: event.reason instanceof Error ? event.reason.stack : undefined,
      userAgent: navigator.userAgent,
      appVersion,
      url: window.location.href,
    });
  });
}

function reasonText(reason: unknown): string {
  if (reason instanceof Error) return reason.message || reason.name;
  if (typeof reason === 'string') return reason;
  try { return JSON.stringify(reason); } catch { return String(reason); }
}

function saveCrashReport(report: CrashReport) {
  try {
    const stored = localStorage.getItem(CRASH_STORAGE_KEY);
    const reports: CrashReport[] = stored ? JSON.parse(stored) : [];

    reports.unshift(report);

    // 只保留最近的崩溃记录
    const trimmed = reports.slice(0, MAX_CRASH_REPORTS);

    localStorage.setItem(CRASH_STORAGE_KEY, JSON.stringify(trimmed));

    // 在控制台输出，方便调试
    console.error('[Crash Report]', report.message, report.stack);
  } catch (e) {
    // 静默失败，不影响应用运行
  }
}

export function getCrashReports(): CrashReport[] {
  try {
    const stored = localStorage.getItem(CRASH_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function clearCrashReports() {
  try {
    localStorage.removeItem(CRASH_STORAGE_KEY);
  } catch {
    // 静默失败
  }
}

// Shared network timeout policy used by the Android bridge and campus clients.
// Keep values in seconds at the boundary so diagnostics and UI messages stay human-readable.
export const NETWORK_TIMEOUTS = Object.freeze({ JWGLXT_LOGIN: 45, JWGLXT_SYNC: 30, JWGLXT_REUSE: 8, SOURCE_DEFAULT: 25, ACADEMIC_CALENDAR: 30, THEOL_COURSE: 30, THEOL_ASSIGNMENT: 25, DEFAULT: 20 })
export function timeoutMs(seconds) { const value=Number(seconds); if (!Number.isFinite(value) || value < 0) throw new TypeError('timeout seconds must be a non-negative number'); return Math.round(value * 1000) }
export function formatTimeoutError(endpoint, timeoutSeconds) { return '教务 API 请求超时（' + endpoint + '，' + timeoutSeconds + ' 秒）' }

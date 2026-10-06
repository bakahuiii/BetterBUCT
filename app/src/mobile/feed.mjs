import { APP_NAME } from './app-identity.mjs';
// Minimal theia-feed/v1 export used by exportData('theia'|'json') and the
// future import-data flow. Mirrors the desktop ai-export structure.
export const THEIA_FEED_SCHEMA = 'theia-campus-feed/v1';

function icsEscape(value) {
  return String(value ?? '').replace(/[\\;,\n\r]/g, (match) => ({ '\\': '\\\\', ';': '\\;', ',': '\\,', '\n': '\\n', '\r': '\\r' }[match]));
}

function icsDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function toIcs(state) {
  const now = new Date().toISOString();
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${APP_NAME}//Campus Client//CN`, 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${APP_NAME} 校园日历`];
  for (const item of [...(state.exams || []), ...(state.assignments || [])]) {
    const start = icsDate(item.startAt || item.examTime || item.dueAt);
    if (!start) continue;
    const end = icsDate(item.endAt || new Date(new Date(item.startAt || item.examTime || item.dueAt).getTime() + 60 * 60 * 1000).toISOString());
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:theia-${icsEscape(item.id)}`);
    lines.push(`DTSTAMP:${icsDate(now)}`);
    lines.push(`DTSTART:${start}`);
    if (end) lines.push(`DTEND:${end}`);
    lines.push(`SUMMARY:${icsEscape(item.courseName ? `${item.courseName} · ${item.title || (item.examType ? '考试' : '事项')}` : item.title || 'BetterBUCT事项')}`);
    lines.push(`DESCRIPTION:${icsEscape([item.location, item.campus, item.status, item.sourceUrl].filter(Boolean).join(' · '))}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

export function toTheiaFeed(state) {
  const generatedAt = new Date().toISOString();
  const events = [];
  for (const item of state.schedule || []) {
    if (!item.title) continue;
    events.push({
      id: `theia:schedule:${item.id}`,
      version: 1,
      kind: 'calendar',
      source: 'theia',
      startAt: item.startAt || null,
      endAt: item.endAt || null,
      title: item.title,
      summary: [item.teacher, item.room, item.weeks].filter(Boolean).join(' · '),
      values: { weekday: item.weekday, period: item.period, courseId: item.courseId, termId: item.termId },
      capturedAt: item.capturedAt || generatedAt,
      privacy: 'coarse',
      sourceUrl: item.sourceUrl,
    });
  }
  for (const item of state.exams || []) {
    const startAt = item.startAt || item.examTime || generatedAt;
    events.push({
      id: `theia:exam:${item.id}`,
      version: 1,
      kind: 'calendar',
      source: 'theia',
      startAt,
      endAt: item.endAt || null,
      title: `${item.courseName || '考试'} · 考试`,
      summary: [item.location, item.campus, item.seat ? `座位 ${item.seat}` : ''].filter(Boolean).join(' · '),
      values: { courseId: item.courseId, termId: item.termId, examType: item.examType },
      capturedAt: item.capturedAt || generatedAt,
      privacy: 'coarse',
      sourceUrl: item.sourceUrl,
    });
  }
  return {
    schema: THEIA_FEED_SCHEMA,
    generatedAt,
    producer: { name: APP_NAME, version: state.appVersion || '0.0.0', layout: 'normalized-campus-v1' },
    source: { account: state.profile?.studentId ? state.profile.studentId : null },
    profile: state.profile,
    events,
    tasks: (state.assignments || []).map((item) => ({
      id: item.id,
      title: item.title,
      dueAt: item.dueAt,
      status: item.status,
      courseName: item.courseName,
      sourceUrl: item.sourceUrl,
    })),
    academic: {
      terms: state.terms,
      courses: state.courses,
      schedule: state.schedule,
      grades: state.grades,
      selectedCourses: state.selectedCourses,
      academicProgress: state.academicProgress,
      academicExtras: state.academicExtras,
      exams: state.exams,
      assignments: state.assignments,
      workspaces: state.workspaces || [],
      notices: state.notices,
    },
    localData: { ...state.dataCatalog, mail: { messages: state.emails || [] } },
  };
}

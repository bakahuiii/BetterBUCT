import type { AcademicCalendar } from "../types";

const TERM_CODES = ["3", "12", "16"];
const SHANGHAI_TIME_ZONE = "Asia/Shanghai";
const SHANGHAI_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: SHANGHAI_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function currentShanghaiDate(now = new Date()) {
  const parts = Object.fromEntries(
    SHANGHAI_DATE_FORMATTER.formatToParts(now)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function currentShanghaiWeekday(now = new Date()) {
  const weekday = new Date(`${currentShanghaiDate(now)}T00:00:00Z`).getUTCDay();
  return weekday || 7;
}

export function currentAcademicVacation(calendar?: AcademicCalendar | null, now = new Date()) {
  const day = currentShanghaiDate(now);
  return calendar?.vacations.find((vacation) => vacation.startDate <= day && day <= vacation.endDate) || null;
}

export function currentAcademicWeek(calendar?: AcademicCalendar | null, now = new Date()) {
  if (!calendar?.schoolYear) return null;
  const day = currentShanghaiDate(now);
  const index = calendar.semesters.findIndex((semester) => semester.startDate <= day && day <= semester.endDate);
  if (index < 0) return null;
  const semester = calendar.semesters[index];
  const start = Date.parse(`${semester.startDate}T00:00:00Z`);
  const target = Date.parse(`${day}T00:00:00Z`);
  const week = Math.min(semester.weeks, Math.max(1, Math.floor((target - start) / 604800000) + 1));
  return { key: `${calendar.schoolYear}:${index}`, termId: `${calendar.schoolYear.slice(0, 4)}-${TERM_CODES[index] || ""}`, week, of: semester.weeks, label: semester.label };
}

export function occursInWeek(weeks: string | null | undefined, week: number) {
  if (!weeks || !Number.isInteger(week) || week < 1) return true;

  // Zhengfang emits several inconsistent forms for a split teaching period.
  // In particular, parentheses are sometimes left open:
  // "1-3周(单,4-6周双,7-9周(单".  Treat every numeric segment as its
  // own rule. A parity flag must only apply until the next segment, never to
  // the whole source string.
  const text = String(weeks)
    .replace(/\s+/g, "")
    .replace(/[～—–－]/g, "-");
  const matches = [...text.matchAll(/(\d+)(?:[-~至到](\d+))?/g)];
  if (!matches.length) return true;

  return matches.some((match, index) => {
    const start = Number(match[1]);
    const end = Number(match[2] || match[1]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || week < start || week > end) {
      return false;
    }
    // Zhengfang may concatenate segments such as "1-3周(单,4-6周双".
    // Look only at this segment's suffix so the next segment's parity does
    // not leak into the current one.
    const nextStart = matches[index + 1]?.index ?? text.length;
    const suffix = text.slice((match.index || 0) + match[0].length, nextStart);
    const odd = /单|奇/.test(suffix);
    const even = /双|偶/.test(suffix);
    // "单双周" is used by some timetable exports to mean every week.
    if (odd !== even) return odd ? week % 2 === 1 : week % 2 === 0;
    return true;
  });
}


function firstMondayOnOrAfter(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day))
  const weekday = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + ((8 - weekday) % 7))
  return date
}

function inferredTermCandidate(termIds: string[], now = new Date()) {
  const date = currentShanghaiDate(now)
  const [yearText, monthText] = date.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const expectedYear = month >= 8 ? year : year - 1
  const expectedCode = month >= 8 || month <= 2 ? '3' : '12'
  const normalized = [...new Set(termIds.map((value) => String(value || '').trim()).filter(Boolean))]
  const exact = normalized.find((value) => value === `${expectedYear}-${expectedCode}`)
  if (exact) return exact
  // Prefer the newest term that is not later than the current academic term.
  const rank = (value: string) => {
    const [rawYear, rawCode] = value.split('-')
    const code = rawCode === '1' ? '3' : rawCode === '2' ? '12' : rawCode
    const codeRank = code === '3' ? 1 : code === '12' ? 2 : code === '16' ? 3 : 0
    return (Number(rawYear) || 0) * 10 + codeRank
  }
  const target = rank(`${expectedYear}-${expectedCode}`)
  return normalized
    .filter((value) => rank(value) <= target)
    .sort((left, right) => rank(right) - rank(left))[0] || normalized.sort((left, right) => rank(right) - rank(left))[0] || null
}

/**
 * The mobile client may have a fresh JWGLXT timetable before the optional
 * desktop-only OCR calendar has been downloaded. Infer a conservative teaching
 * week from the current academic term in that case, so the dashboard does not
 * mix courses from old terms or blindly show every week of the timetable.
 */
export function inferredAcademicWeek(termIds: string[], now = new Date()) {
  const termId = inferredTermCandidate(termIds, now)
  if (!termId) return null
  const [rawYear, rawCode] = termId.split('-')
  const year = Number(rawYear)
  const code = rawCode === '1' ? '3' : rawCode === '2' ? '12' : rawCode
  if (!Number.isFinite(year)) return null
  const start = code === '3'
    ? firstMondayOnOrAfter(year, 9, 1)
    : code === '12'
      ? firstMondayOnOrAfter(year + 1, 3, 1)
      : firstMondayOnOrAfter(year + 1, 7, 1)
  const target = Date.parse(`${currentShanghaiDate(now)}T00:00:00Z`)
  const elapsed = target - start.getTime()
  if (!Number.isFinite(elapsed) || elapsed < 0) return null
  return {
    key: `inferred:${termId}`,
    termId: `${year}-${code}`,
    week: Math.floor(elapsed / 604800000) + 1,
    of: 30,
    label: `${year}-${year + 1} ${code === '3' ? '第一学期' : code === '12' ? '第二学期' : '第三学期'}`,
    inferred: true,
  }
}

export function currentAcademicWeekForTerms(
  calendar: AcademicCalendar | null | undefined,
  termIds: string[],
  now = new Date(),
) {
  const authoritative = currentAcademicWeek(calendar, now)
  const known = new Set(termIds.map((value) => String(value || '').trim()).filter(Boolean))
  if (authoritative?.termId && (!known.size || known.has(authoritative.termId))) return authoritative
  return inferredAcademicWeek(termIds, now)
}

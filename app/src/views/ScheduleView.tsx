import { CalendarDays, ChevronLeft, ChevronRight, Grid3X3, List, MapPin, SlidersHorizontal, UserRound, X } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { matchTerm, TermSelector, type Term } from "../ui/app-shared";
import {
  currentAcademicVacation,
  currentAcademicWeekForTerms,
  currentShanghaiWeekday,
  occursInWeek,
} from "../ui/calendar";
import type { AcademicCalendar, ScheduleItem } from "../types";

type SchedulePopover = {
  items: ScheduleItem[];
  label: string;
  x: number;
  y: number;
};

// Ordered by hue distance rather than semantic category. A timetable normally
// has fewer than 16 distinct courses, so neighbouring assignments never look
// like two shades of the same colour.
const COURSE_ACCENTS = [
  "#1296b6", "#d4674e", "#725dc4", "#409d6a",
  "#bd8526", "#396eb8", "#bc4f83", "#547f3d",
  "#9a5eae", "#b56630", "#217b82", "#c04755",
  "#5573a4", "#808a2f", "#9a633d", "#4f7393",
  "#9c436f", "#327f56", "#856036", "#5254a2",
  "#a74832", "#277f9e", "#765b79", "#597341",
];

const POPOVER_WIDTH = 352;
const POPOVER_MARGIN = 14;
const DAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const DEFAULT_PERIOD_COUNT = 12;
const MAX_PERIOD_COUNT = 16;
// BUCT/THEIA current teaching-period timetable.  Mobile builds may not have
// the optional OCR academic-calendar asset, so keep the display stable by
// using the same fixed periods as the desktop THEIA timetable.
const FIXED_PERIOD_TIMES = [
  { period: 1, startTime: "08:00", endTime: "08:45" },
  { period: 2, startTime: "08:50", endTime: "09:35" },
  { period: 3, startTime: "09:45", endTime: "10:30" },
  { period: 4, startTime: "10:40", endTime: "11:25" },
  { period: 5, startTime: "11:30", endTime: "12:15" },
  { period: 6, startTime: "13:30", endTime: "14:15" },
  { period: 7, startTime: "14:20", endTime: "15:05" },
  { period: 8, startTime: "15:15", endTime: "16:00" },
  { period: 9, startTime: "16:05", endTime: "16:50" },
  { period: 10, startTime: "18:00", endTime: "18:45" },
  { period: 11, startTime: "18:50", endTime: "19:35" },
  { period: 12, startTime: "19:40", endTime: "20:25" },
] as const;

type ScheduleSlot = {
  weekday: number;
  start: number;
  end: number;
  period: string;
  items: ScheduleItem[];
};

type PopoverDragState = {
  pointerId: number;
  offsetX: number;
  offsetY: number;
};

function firstScheduledTermId(items: ScheduleItem[], terms: Term[]) {
  const knownTerms = new Set(
    items
      .map((item) => item.termId)
      .filter((termId): termId is string => Boolean(termId)),
  );
  return terms.find((term) => knownTerms.has(term.id))?.id || terms[0]?.id || "";
}

function parsePeriodRange(period?: string | null) {
  const values = (String(period || "").match(/\d+/g) || [])
    .map(Number)
    .filter((value) => Number.isFinite(value));
  const start = values[0];
  const end = values[1] ?? start;
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 1 ||
    start > MAX_PERIOD_COUNT
  ) {
    return null;
  }
  return {
    start,
    end: Math.min(MAX_PERIOD_COUNT, Math.max(start, end)),
  };
}

function periodLabel(period: number) {
  const numerals = [
    "零",
    "一",
    "二",
    "三",
    "四",
    "五",
    "六",
    "七",
    "八",
    "九",
    "十",
    "十一",
    "十二",
    "十三",
    "十四",
    "十五",
    "十六",
  ];
  return `第${numerals[period] || period}节`;
}

function periodTimeLabel(calendar: AcademicCalendar | null | undefined, period: number) {
  const fixed = FIXED_PERIOD_TIMES.find((item) => item.period === period);
  if (fixed) return `${fixed.startTime}-${fixed.endTime}`;
  const time = calendar?.periodTimes?.find((item) => item.period === period);
  return time ? `${time.startTime}-${time.endTime}` : "时间待解析";
}

const DAY_MILLISECONDS = 86_400_000;
const TERM_SEMESTER_INDEX: Record<string, number> = { "3": 0, "12": 1, "16": 2 };

function scheduleDayDates(
  calendar: AcademicCalendar | null | undefined,
  termId: string,
  week: number,
) {
  if (!calendar?.schoolYear || !Number.isInteger(week) || week < 1) return null;
  const [year, term] = termId.split("-");
  if (year !== calendar.schoolYear.slice(0, 4)) return null;
  const semester = calendar.semesters[TERM_SEMESTER_INDEX[term]];
  if (!semester?.startDate) return null;
  const start = Date.parse(semester.startDate + "T00:00:00Z");
  if (!Number.isFinite(start)) return null;
  return DAY_LABELS.map((_day, index) => {
    const date = new Date(start + ((week - 1) * 7 + index) * DAY_MILLISECONDS);
    return (date.getUTCMonth() + 1) + "月" + date.getUTCDate() + "日";
  });
}

function isSelfStudyScheduleItem(item: ScheduleItem) {
  return /^\s*(?:\[|【)\s*自修\s*(?:\]|】)/u.test(String(item.title || ""));
}

function clampPopoverPosition(x: number, y: number, height = 420) {
  const viewportWidth = window.innerWidth;
  const availableWidth = Math.max(0, viewportWidth - POPOVER_MARGIN * 2);
  const width = Math.min(POPOVER_WIDTH, availableWidth);
  const maxLeft = Math.max(POPOVER_MARGIN, viewportWidth - width - POPOVER_MARGIN);
  const maxTop = Math.max(
    POPOVER_MARGIN,
    window.innerHeight - Math.min(height, window.innerHeight - POPOVER_MARGIN * 2) - POPOVER_MARGIN,
  );
  return {
    x: Math.max(POPOVER_MARGIN, Math.min(x, maxLeft)),
    y: Math.max(POPOVER_MARGIN, Math.min(y, maxTop)),
  };
}

export function ScheduleView({
  items,
  terms,
  calendar,
}: {
  items: ScheduleItem[];
  terms: Term[];
  calendar?: AcademicCalendar | null;
}) {
  const days = DAY_LABELS;
  const [termFilter, setTermFilter] = useState(
    () => firstScheduledTermId(items, terms),
  );
  const [weekMode, setWeekMode] = useState<"week" | "all">("week");
  // Keep the original grid as the default; the complete agenda remains one tap away.
  const [scheduleLayout, setScheduleLayout] = useState<"grid" | "agenda">("grid");
  const [weekNum, setWeekNum] = useState(1);
  const [calendarKey, setCalendarKey] = useState<string | null>(null);
  const [todayNotice, setTodayNotice] = useState<string | null>(null);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [popover, setPopover] = useState<SchedulePopover | null>(null);
  const [draggingPopover, setDraggingPopover] = useState(false);
  const controlsRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverDragRef = useRef<PopoverDragState | null>(null);

  useEffect(() => {
    if (terms.length && !termFilter) setTermFilter(firstScheduledTermId(items, terms));
  }, [items, terms, termFilter]);

  const currentWeek = useMemo(
    () => currentAcademicWeekForTerms(calendar, terms.map((term) => term.id)),
    [calendar, terms],
  );
  useEffect(() => {
    if (!currentWeek || calendarKey === currentWeek.key) return;
    setTermFilter(currentWeek.termId);
    setWeekNum(currentWeek.week);
    setWeekMode("week");
    setCalendarKey(currentWeek.key);
  }, [calendarKey, currentWeek]);
  useEffect(() => {
    if (!todayNotice) return;
    const timeout = window.setTimeout(() => setTodayNotice(null), 4_000);
    return () => window.clearTimeout(timeout);
  }, [todayNotice]);
  const changeWeek = (delta: number) => {
    setWeekMode("week");
    setWeekNum((current) => Math.min(30, Math.max(1, current + delta)));
    setPopover(null);
  };

  useEffect(() => {
    if (weekMode !== "week") return;
    const handleWeekKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable
      ) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        changeWeek(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        changeWeek(1);
      }
    };
    window.addEventListener("keydown", handleWeekKeyDown);
    return () => window.removeEventListener("keydown", handleWeekKeyDown);
  }, [weekMode]);

  const todayWeekday = currentShanghaiWeekday();
  const isShowingToday = Boolean(
    currentWeek
      && weekMode === "week"
      && termFilter === currentWeek.termId
      && weekNum === currentWeek.week,
  );
  const dayDates = useMemo(
    () => scheduleDayDates(calendar, termFilter, weekNum),
    [calendar, termFilter, weekNum],
  );
  const showToday = () => {
    const vacation = currentAcademicVacation(calendar);
    if (vacation) {
      setTodayNotice(`${vacation.label}中，无今日课表`);
      return;
    }
    if (!currentWeek) {
      setTodayNotice("当前校历尚未提供今天所在学期");
      return;
    }
    setTermFilter(currentWeek.termId);
    setWeekMode("week");
    setWeekNum(currentWeek.week);
    setPopover(null);
    setControlsOpen(false);
  };

  useEffect(() => {
    if (!controlsOpen) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!controlsRef.current?.contains(event.target as Node)) setControlsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setControlsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [controlsOpen]);

  useEffect(() => {
    if (!popover) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (popoverRef.current?.contains(event.target as Node)) return;
      setPopover(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPopover(null);
    };
    const closeOnViewportChange = () => setPopover(null);
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnViewportChange);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnViewportChange);
    };
  }, [popover]);

  // Older local snapshots did not persist termId for schedule entries. They
  // still belong to the currently loaded timetable and must remain visible.
  const { slots, unscheduledItems, periodCount } = useMemo(() => {
    const filtered = items.filter(
      (item) => !item.termId || matchTerm(item.termId, termFilter),
    );
    const visible = filtered.filter((item) => {
      return weekMode === "all" || occursInWeek(item.weeks, weekNum);
    });

    const groupedSlots = new Map<string, ScheduleSlot>();
    const unscheduledItems: ScheduleItem[] = [];
    visible.forEach((item) => {
      const weekday = Number(item.weekday);
      const range = parsePeriodRange(item.period);
      if (!range || weekday < 1 || weekday > days.length) {
        unscheduledItems.push(item);
        return;
      }
      const key = `${weekday}-${range.start}-${range.end}`;
      const slot = groupedSlots.get(key);
      if (slot) {
        slot.items.push(item);
        return;
      }
      groupedSlots.set(key, {
        weekday,
        start: range.start,
        end: range.end,
        period: String(item.period || `${range.start}-${range.end}`),
        items: [item],
      });
    });
    const slots = [...groupedSlots.values()].map((slot) => ({
      ...slot,
      // Keep every overlapping class in the popover, but make the primary
      // card deterministic: a taught course takes precedence over a marked
      // self-study entry when both occupy the same timetable slot.
      items: [...slot.items].sort(
        (left, right) => Number(isSelfStudyScheduleItem(left)) - Number(isSelfStudyScheduleItem(right)),
      ),
    })).sort(
      (left, right) =>
        left.start - right.start ||
        left.weekday - right.weekday ||
        left.end - right.end,
    );
    const periodCount = Math.max(
      DEFAULT_PERIOD_COUNT,
      ...slots.map((slot) => slot.end),
    );
    return { slots, unscheduledItems, periodCount };
  }, [items, termFilter, weekMode, weekNum, days]);

  const mobileDaySlots = useMemo(
    () => days
      .map((day, index) => ({
        day,
        date: dayDates?.[index] || "日期待定",
        weekday: index + 1,
        slots: slots.filter((slot) => slot.weekday === index + 1),
      }))
      .filter((entry) => entry.slots.length > 0),
    [days, dayDates, slots],
  );

  const openCourseDetails = (
    event: React.MouseEvent<HTMLButtonElement>,
    group: ScheduleItem[],
    day: string,
    period: string,
  ) => {
    const estimatedHeight = Math.min(388, 112 + group.length * 112);
    const { x, y } = clampPopoverPosition(
      event.clientX + 12,
      event.clientY + 12,
      estimatedHeight,
    );
    setPopover({
      items: group,
      label: day + " " + (period ? period + " 节" : "节次待定"),
      x,
      y,
    });
  };

  const startPopoverDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    const rect = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    popoverDragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    setDraggingPopover(true);
  };

  const movePopoverDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = popoverDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const position = clampPopoverPosition(
      event.clientX - drag.offsetX,
      event.clientY - drag.offsetY,
    );
    setPopover((current) =>
      current ? { ...current, ...position } : current,
    );
  };

  const finishPopoverDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      event.currentTarget.hasPointerCapture(event.pointerId)
    )
      event.currentTarget.releasePointerCapture(event.pointerId);
    popoverDragRef.current = null;
    setDraggingPopover(false);
  };

  return (
    <div className={`schedule-scroll schedule-layout-${scheduleLayout}`}>
      {todayNotice && createPortal(
        <div className="schedule-today-notice" role="status">
          <CalendarDays size={17} />
          <span>{todayNotice}</span>
          <button type="button" onClick={() => setTodayNotice(null)} aria-label="关闭提示"><X size={15} /></button>
        </div>,
        document.body,
      )}
      {popover &&
        createPortal(
        <div
          className={`schedule-popover${draggingPopover ? " is-dragging" : ""}`}
          ref={popoverRef}
          role="dialog"
          aria-modal="false"
          aria-label={popover.label + "课程详情"}
          style={{ left: popover.x, top: popover.y }}
        >
          <div
            className="schedule-popover-header"
            onPointerDown={startPopoverDrag}
            onPointerMove={movePopoverDrag}
            onPointerUp={finishPopoverDrag}
            onPointerCancel={finishPopoverDrag}
          >
            <div>
              <span>课程详情</span>
              <strong>{popover.label}</strong>
            </div>
            <button
              type="button"
              onClick={() => setPopover(null)}
              aria-label="关闭课程详情"
              autoFocus
            >
              <X size={16} />
            </button>
          </div>
          <div className="schedule-popover-list">
            {popover.items.map((item) => (
              <article className="popover-course" key={item.id}>
                <strong>{item.title}</strong>
                <small>{item.weeks || "周次待定"}</small>
                <div>
                  <span>
                    <UserRound size={14} />
                    {item.teacher || "教师待定"}
                  </span>
                  <span>
                    <MapPin size={14} />
                    {item.room || "教室待定"}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </div>,
          document.body,
        )}

      <div className="schedule-toolbar">
        {weekMode === "week" && (
          <div className="schedule-week-toolbar">
            <div className="week-navigator" role="group" aria-label="切换课表周次">
              <button type="button" className="week-step-button" onClick={() => changeWeek(-1)} disabled={weekNum <= 1} aria-label="上一周" title="上一周（键盘 ←）"><ChevronLeft size={17} aria-hidden="true" /></button>
              <div className="week-navigator-current"><strong>第 {weekNum} 周</strong><small>{isShowingToday ? "本周 · 今天" : dayDates ? `${dayDates[0]} – ${dayDates[6]}` : "左右切换周次"}</small></div>
              <button type="button" className="week-step-button" onClick={() => changeWeek(1)} disabled={weekNum >= 30} aria-label="下一周" title="下一周（键盘 →）"><ChevronRight size={17} aria-hidden="true" /></button>
            </div>
          </div>
        )}
        <div className="schedule-toolbar-main">
          <button
            type="button"
            className={`schedule-today-button${isShowingToday ? " active" : ""}`}
            onClick={showToday}
            title={currentWeek ? `${currentWeek.label}第 ${currentWeek.week} 周` : "查看今日课表"}
          >
            <CalendarDays size={16} />
            <span>今日课表</span>
          </button>
          <div className="schedule-controls-wrap" ref={controlsRef}>
            <button
              type="button"
              className="schedule-controls-trigger"
              onClick={() => setControlsOpen((open) => !open)}
              aria-expanded={controlsOpen}
              aria-controls="schedule-controls-panel"
              aria-label="打开课表设置"
              title="打开学期、视图和范围设置"
            >
              <SlidersHorizontal size={16} aria-hidden="true" />
            </button>
            {controlsOpen && (
              <section id="schedule-controls-panel" className="schedule-controls-panel" role="dialog" aria-label="课表视图和周次设置">
                <header className="schedule-controls-panel-header">
                  <div><strong>课表设置</strong><span>调整学期、显示方式和范围</span></div>
                  <button type="button" onClick={() => setControlsOpen(false)} aria-label="关闭课表设置"><X size={16} aria-hidden="true" /></button>
                </header>
                <div className="schedule-controls-term">
                  <span>学期</span>
                  <TermSelector terms={terms} value={termFilter} onChange={setTermFilter} />
                </div>
                <div className="schedule-controls-row">
                  <span>显示方式</span>
                  <div className="schedule-layout-switch segmented" role="group" aria-label="课表显示方式">
                    <button type="button" className={scheduleLayout === "grid" ? "active" : ""} onClick={() => setScheduleLayout("grid")} aria-pressed={scheduleLayout === "grid"}><Grid3X3 size={14} aria-hidden="true" /><span>课表</span></button>
                    <button type="button" className={scheduleLayout === "agenda" ? "active" : ""} onClick={() => setScheduleLayout("agenda")} aria-pressed={scheduleLayout === "agenda"}><List size={14} aria-hidden="true" /><span>清单</span></button>
                  </div>
                </div>
                <div className="schedule-controls-row">
                  <span>范围</span>
                  <div className="schedule-range-switch segmented" role="group" aria-label="课表范围">
                    <button type="button" className={weekMode === "week" ? "active" : ""} onClick={() => setWeekMode("week")}>按周</button>
                    <button type="button" className={weekMode === "all" ? "active" : ""} onClick={() => setWeekMode("all")}>全学期</button>
                  </div>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>

      <section
        className="schedule-board"
        style={{ "--schedule-period-count": periodCount } as CSSProperties}
        aria-label="按节次排列的课程表"
      >
        <div className="schedule-corner">节次</div>
        {days.map((day, index) => (
          <header
            className={`schedule-day-header${isShowingToday && index + 1 === todayWeekday ? " is-today" : ""}`}
            key={day}
            style={{ gridColumn: index + 2, gridRow: 1 }}
          >
            <strong>{day}</strong>
            {weekMode === "week" && <span>{dayDates?.[index] || "日期待定"}</span>}
          </header>
        ))}
        {Array.from({ length: periodCount }, (_value, index) => {
          const period = index + 1;
          return (
            <div
              className="schedule-period-label"
              key={`period-${period}`}
              style={{ gridColumn: 1, gridRow: period + 1 }}
              aria-label={`${periodLabel(period)} ${periodTimeLabel(calendar, period)}`}
            >
              <span className="schedule-period-number">{periodLabel(period)}</span>
              <small className="schedule-period-time">{periodTimeLabel(calendar, period)}</small>
            </div>
          );
        })}
        {Array.from({ length: periodCount * days.length }, (_value, index) => {
          const period = Math.floor(index / days.length) + 1;
          const weekday = (index % days.length) + 1;
          return (
            <div
              aria-hidden="true"
              className="schedule-grid-cell"
              key={`cell-${weekday}-${period}`}
              style={{ gridColumn: weekday + 1, gridRow: period + 1 }}
            />
          );
        })}
        {slots.map((slot) => {
          const first = slot.items[0];
          const stacked = slot.items.length > 1;
          const isSinglePeriod = slot.end === slot.start;
          const isToday = isShowingToday && slot.weekday === todayWeekday;
          return (
            <button
              type="button"
              className={[
                "course-slot",
                stacked ? "stacked" : "",
                isSinglePeriod ? "single-period" : "",
                isToday ? "is-today" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              key={`${slot.weekday}-${slot.start}-${slot.end}`}
              style={{
                gridColumn: slot.weekday + 1,
                gridRow: `${slot.start + 1} / ${slot.end + 2}`,
                "--course-accent": first.color || COURSE_ACCENTS[0],
              } as CSSProperties}
              onClick={(event) =>
                openCourseDetails(
                  event,
                  slot.items,
                  days[slot.weekday - 1],
                  slot.period,
                )
              }
              aria-haspopup="dialog"
              aria-label={first.title + "，查看课程详情"}
            >
              <span>
                {slot.period ? slot.period + "节" : "节次待定"}
                {stacked && (
                  <span className="stack-badge">{slot.items.length}</span>
                )}
              </span>
              <h3>
                {first.title}
                {stacked && <small> +{slot.items.length - 1}</small>}
              </h3>
              <p className="course-teacher">
                <UserRound size={14} />
                {first.teacher || "教师待定"}
              </p>
              <p className="course-room">
                <MapPin size={14} />
                {first.room || "教室待定"}
              </p>
              <small>{first.weeks || ""}</small>
            </button>
          );
        })}
      </section>
      <section className="schedule-agenda" aria-label="移动端完整课程列表">
        {mobileDaySlots.length > 0 ? mobileDaySlots.map((day) => (
          <section className="schedule-mobile-day" key={day.day}>
            <header className="schedule-mobile-day-header">
              <div>
                <strong>{day.day}</strong>
                <span>{weekMode === "week" ? day.date : "本学期课程"}</span>
              </div>
              <small>{day.slots.length} 门课程</small>
            </header>
            <div className="schedule-mobile-day-list">
              {day.slots.flatMap((slot) => slot.items.map((item, itemIndex) => (
                <button
                  type="button"
                  className="schedule-mobile-course"
                  key={`${slot.weekday}-${slot.start}-${slot.end}-${item.id}-${itemIndex}`}
                  style={{ "--course-accent": item.color || COURSE_ACCENTS[0] } as CSSProperties}
                  onClick={(event) => openCourseDetails(event, slot.items, day.day, slot.period)}
                  aria-haspopup="dialog"
                  aria-label={`${item.title}，查看课程详情`}
                >
                  <span className="schedule-mobile-course-time">
                    <strong>{slot.period ? `${slot.period}节` : "节次待定"}</strong>
                    <small>{periodTimeLabel(calendar, slot.start)}{slot.end !== slot.start ? ` — ${periodTimeLabel(calendar, slot.end).split("-")[1] || ""}` : ""}</small>
                  </span>
                  <span className="schedule-mobile-course-main">
                    <strong>{item.title}</strong>
                    <span className="schedule-mobile-course-meta"><UserRound size={13} />{item.teacher || "教师待定"}</span>
                    <span className="schedule-mobile-course-meta"><MapPin size={13} />{item.room || "教室待定"}</span>
                    <small className="schedule-mobile-course-weeks">{item.weeks || "周次待定"}</small>
                  </span>
                  <ChevronRight className="schedule-mobile-course-arrow" size={17} aria-hidden="true" />
                </button>
              ))) }
            </div>
          </section>
        )) : (
          <div className="schedule-mobile-empty">本周暂无课程安排</div>
        )}
      </section>
      {unscheduledItems.length > 0 && (
        <section className="schedule-unscheduled">
          <strong>节次待定</strong>
          <span>
            {unscheduledItems.map((item) => item.title).join(" · ")}
          </span>
        </section>
      )}
    </div>
  );
}

import { useMemo } from "react";
import {
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  MapPin,
  Sparkles,
} from "lucide-react";
import { AssignmentRow } from "../components/AssignmentRow";
import {
  EmptyState,
  formatDate,
  isExpiredAssignment,
  parseExamTime,
  relativeTime,
  sourceLabel,
  type ViewId,
} from "../ui/app-shared";
import {
  currentAcademicVacation,
  currentAcademicWeekForTerms,
  currentShanghaiWeekday,
  occursInWeek,
} from "../ui/calendar";
import type { AdvisorUrgentItem, CampusState, ScheduleItem } from "../types";
import { isMobile } from "../bridge";

const DASHBOARD_PREVIEW_LIMIT = 5;

function DashboardAdvisorTop({
  item,
  loading,
  error,
  onNavigate,
}: {
  item: AdvisorUrgentItem | null;
  loading: boolean;
  error: string | null;
  onNavigate: (view: ViewId) => void;
}) {
  return (
    <section className="dashboard-advisor-top span-full" aria-label="首要行动" role="region">
      <span className="dashboard-advisor-icon" aria-hidden="true"><Sparkles size={17} /></span>
      <span className="dashboard-advisor-copy">
        <small>本地顾问 · Top 1</small>
        <strong>
          {loading && !item
            ? "正在计算首要行动"
            : error && !item
              ? "首要行动暂时无法计算"
              : item?.title || "当前没有已确认的首要行动"}
        </strong>
        <span>
          {item?.reasons[0]
            || (error ? "请进入工作台检查数据质量。" : "未知或不完整数据不会被解释为没有事项。")}
        </span>
      </span>
      {item && <em data-severity={item.severity} aria-label={`优先级：${item.severity === "urgent" ? "紧急" : item.severity === "attention" ? "需关注" : "提示"}`}>{item.severity === "urgent" ? "紧急" : item.severity === "attention" ? "需关注" : "提示"}</em>}
      <button type="button" onClick={() => onNavigate("advisor")} aria-label="打开本地顾问工作台">
        打开顾问 <ChevronRight size={15} aria-hidden="true" />
      </button>
    </section>
  );
}

function QuickActions({ onNavigate }: { onNavigate: (view: ViewId) => void }) {
  const actions: Array<{
    id: ViewId;
    label: string;
    detail: string;
    icon: typeof CalendarDays;
  }> = [
    {
      id: "schedule",
      label: "本周课表",
      detail: "按周次查看课程",
      icon: CalendarDays,
    },
    {
      id: "exams",
      label: "考试安排",
      detail: "时间、地点与座号",
      icon: ClipboardCheck,
    },
    {
      id: "grades",
      label: "成绩与 GPA",
      detail: "查看趋势与记录",
      icon: BarChart3,
    },
  ];
  const visibleActions = isMobile ? actions.filter(({ id }) => id !== "assignments") : actions;
  return (
    <section className="quick-actions span-full" aria-label="快速访问" role="navigation">
      {visibleActions.map(({ id, label, detail, icon: Icon }) => (
        <button key={id} onClick={() => onNavigate(id)} aria-label={`${label}：${detail}`}>
          <span className="quick-action-icon" aria-hidden="true">
            <Icon size={17} />
          </span>
          <span>
            <strong>{label}</strong>
            <small>{detail}</small>
          </span>
          <ChevronRight size={15} aria-hidden="true" />
        </button>
      ))}
    </section>
  );
}

function ScheduleRow({ item }: { item: ScheduleItem }) {
  return (
    <div className="timeline-row" role="listitem">
      <div className="period-pill" aria-label={`第 ${item.period || '待定'} 节`}>
        {item.period ? `${item.period} 节` : "待定"}
      </div>
      <div>
        <strong>{item.title}</strong>
        <span>
          {[item.teacher, item.room].filter(Boolean).join(" · ") ||
            "课程信息待补充"}
        </span>
      </div>
      <small>{item.weeks || "周次待定"}</small>
    </div>
  );
}

export function DashboardView({
  state,
  onNavigate,
  onOpenSource,
  advisorItem,
  advisorLoading,
  advisorError,
}: {
  state: CampusState;
  onNavigate: (view: ViewId) => void;
  onOpenSource: (assignmentId: string) => void;
  advisorItem: AdvisorUrgentItem | null;
  advisorLoading: boolean;
  advisorError: string | null;
}) {
  const academicCourseCount = useMemo(() => {
    const identities = new Set<string>();
    state.courses
      .filter((course) => course.source === "jwglxt")
      .forEach((course) => {
        const code = String(course.code || "").replace(/\s+/g, "").toUpperCase();
        const fallback = String(course.title || course.id).replace(/\s+/g, "").toUpperCase();
        identities.add(code ? `code:${code}` : `course:${fallback}`);
      });
    return identities.size;
  }, [state.courses]);
  const {
    today,
    pending,
    pendingPreview,
    nextExam,
    noticePreview,
    scheduleEmptyState,
  } = useMemo(() => {
    const weekday = currentShanghaiWeekday();
    const calendar = state.dataCatalog.collections.academicCalendar.calendar;
    const timetableTermIds = [
      ...state.terms.map((term) => term.id),
      ...state.schedule.map((item) => item.termId || ""),
    ].filter(Boolean);
    const academicWeek = currentAcademicWeekForTerms(calendar, timetableTermIds);
    const calendarHasSemesters = Boolean(calendar?.semesters.length);
    const vacation = currentAcademicVacation(calendar);
    const activeTermId = academicWeek?.termId || timetableTermIds[0] || null;
    const today = state.schedule
      .filter((item) => {
        if (item.weekday !== weekday || vacation) return false;
        if (activeTermId && item.termId && item.termId !== activeTermId) return false;
        return academicWeek ? occursInWeek(item.weeks, academicWeek.week) : true;
      })
      .sort((left, right) =>
        String(left.period).localeCompare(String(right.period), "zh-CN", {
          numeric: true,
        }),
      );
    const pending = state.assignments
      .filter((item) => item.status !== "submitted" && !isExpiredAssignment(item))
      .sort(
        (left, right) =>
          (left.dueAt ? new Date(left.dueAt).getTime() : Infinity) -
          (right.dueAt ? new Date(right.dueAt).getTime() : Infinity),
      );
    const pendingPreview = pending.slice(0, DASHBOARD_PREVIEW_LIMIT);
    const nextExam = [...state.exams]
      .sort(
        (left, right) =>
          parseExamTime(left.startAt, left.examTime) -
          parseExamTime(right.startAt, right.examTime),
      )
      .find((exam) => parseExamTime(exam.startAt, exam.examTime) > Date.now());
    const notices = [...state.notices].sort((left, right) => {
      const leftTime = left.publishedAt ? Date.parse(left.publishedAt) : Number.NEGATIVE_INFINITY;
      const rightTime = right.publishedAt ? Date.parse(right.publishedAt) : Number.NEGATIVE_INFINITY;
      return (Number.isFinite(rightTime) ? rightTime : Number.NEGATIVE_INFINITY)
        - (Number.isFinite(leftTime) ? leftTime : Number.NEGATIVE_INFINITY);
    });
    const noticePreview = notices.slice(0, DASHBOARD_PREVIEW_LIMIT);
    const scheduleEmptyState = !today.length
      ? vacation
        ? { title: `${vacation.label || "假期"}中`, detail: "当前处于校历假期，今天没有教学安排" }
        : calendarHasSemesters && !academicWeek
          ? { title: "当前不在教学周", detail: "校历未将今天归入教学学期，课表不会被解释为没有课程" }
          : activeTermId
            ? { title: "今天没有课程", detail: (academicWeek && "inferred" in academicWeek && academicWeek.inferred) ? "按当前学期与推算教学周检查，校历同步后会自动校正" : "当前学期今天没有匹配的课程" }
            : null
      : null;
    return { today, pending, pendingPreview, nextExam, noticePreview, scheduleEmptyState };
  }, [state.schedule, state.terms, state.assignments, state.exams, state.notices, state.dataCatalog]);

  return (
    <div className="dashboard-grid">
      {!isMobile && (
        <DashboardAdvisorTop
          item={advisorItem}
          loading={advisorLoading}
          error={advisorError}
          onNavigate={onNavigate}
        />
      )}
      <QuickActions onNavigate={onNavigate} />
      <section className="metric-strip span-full">
        <button onClick={() => onNavigate("courses")}>
          <BookOpen aria-hidden="true" />
          <span>课程</span>
          <strong>{academicCourseCount}</strong>
        </button>
        {!isMobile && (
          <button onClick={() => onNavigate("assignments")}>
            <CheckCircle2 aria-hidden="true" />
            <span>待完成</span>
            <strong>{pending.length}</strong>
          </button>
        )}
        <button onClick={() => onNavigate("exams")}>
          <ClipboardCheck aria-hidden="true" />
          <span>考试</span>
          <strong>{state.exams.length}</strong>
        </button>
        <button onClick={() => onNavigate("grades")}>
          <BarChart3 aria-hidden="true" />
          <span>成绩记录</span>
          <strong>{state.grades.length}</strong>
        </button>
      </section>
      <section className="panel panel-large dashboard-schedule-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">今天</span>
            <h2>课程安排</h2>
          </div>
          <button
            className="text-command"
            onClick={() => onNavigate("schedule")}
          >
            完整课表 <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
        {today.length ? (
          <div className="timeline-list" role="list" aria-label="今日课程安排">
            {today.map((item) => (
              <ScheduleRow key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={CalendarDays}
            title={scheduleEmptyState?.title || "今天没有课程"}
            detail={scheduleEmptyState?.detail || "当前课表中没有今天的课程安排"}
          />
        )}
      </section>
{!isMobile && (
      <section className="panel panel-large dashboard-assignments-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">截止时间</span>
            <h2>待办作业</h2>
          </div>
          <button
            className="text-command"
            onClick={() => onNavigate("assignments")}
          >
            全部任务 <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
        {pending.length ? (
          <div className="task-list">
            {pendingPreview.map((item) => (
              <AssignmentRow key={item.id} item={item} onOpenSource={onOpenSource} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={CheckCircle2}
            title="没有待办作业"
            detail="北化在线THEOL中未发现未提交任务"
          />
        )}
      </section>
      )}
      <section className="panel dashboard-exam-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">最近安排</span>
            <h2>下一场考试</h2>
          </div>
        </div>
        {nextExam ? (
          <div className="exam-focus">
            <div className="date-block">
              <strong>
                {
                  formatDate(
                    nextExam.startAt || nextExam.examTime,
                    false,
                  ).split("月")[0]
                }
              </strong>
              <span>
                {formatDate(
                  nextExam.startAt || nextExam.examTime,
                  false,
                ).includes("月")
                  ? formatDate(
                      nextExam.startAt || nextExam.examTime,
                      false,
                    ).split("月")[1]
                  : ""}
              </span>
            </div>
            <div>
              <h3>{nextExam.courseName}</h3>
              <p>
                <Clock3 size={15} />{" "}
                {formatDate(nextExam.startAt || nextExam.examTime)}
              </p>
              <p>
                <MapPin size={15} />{" "}
                {[nextExam.campus, nextExam.location]
                  .filter(Boolean)
                  .join(" · ") || "地点待公布"}
              </p>
              {nextExam.seat && (
                <span className="seat-badge">座号 {nextExam.seat}</span>
              )}
            </div>
          </div>
        ) : (
          <EmptyState
            icon={ClipboardCheck}
            title="暂无考试安排"
            detail="同步后将在这里显示最近考试"
          />
        )}
      </section>
      <section className="panel dashboard-notices-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">最新动态</span>
            <h2>通知</h2>
          </div>
          <button
            className="icon-button"
            data-tooltip="全部通知"
            aria-label="全部通知"
            onClick={() => onNavigate("notices")}
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
        {noticePreview.length ? (
          <div className="notice-compact">
            {noticePreview.map((notice) => (
              <button
                type="button"
                key={notice.id}
                onClick={() => onNavigate("notices")}
                aria-label={`查看通知：${notice.title}`}
              >
                <span className={`source-pin ${notice.source}`} />
                <span>
                  <strong>{notice.title}</strong>
                  <small>
                    {sourceLabel(notice.source)} ·{" "}
                    {relativeTime(notice.publishedAt)}
                  </small>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Bell}
            title="暂无通知"
            detail="教务系统通知会在同步后显示在这里"
          />
        )}
      </section>
    </div>
  );
}

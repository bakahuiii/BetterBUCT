import { CheckCircle2, ChevronDown, ClipboardCheck, Download, FileText, RefreshCw, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { bridge } from "../bridge";
import { EmptyState, formatDate, isExpiredAssignment, relativeTime } from "../ui/app-shared";
import type { Assignment, AssignmentDetail } from "../types";

type MobileAssignmentsViewProps = {
  items: Assignment[];
  refreshing?: boolean;
  onRefresh?: () => void;
};

type KindFilter = "all" | "assignment" | "online-test";
type StatusFilter = "pending" | "submitted" | "all";

function assignmentKind(item: Assignment) {
  return item.kind === "online-test" ? "在线测试" : "作业";
}

function assignmentIcon(item: Assignment) {
  return item.kind === "online-test" ? ClipboardCheck : FileText;
}

function statusLabel(item: Assignment) {
  if (item.status === "submitted") return "已提交";
  if (isExpiredAssignment(item)) return "已截止";
  return "待完成";
}

export function MobileAssignmentsView({
  items,
  refreshing = false,
  onRefresh,
}: MobileAssignmentsViewProps) {
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, AssignmentDetail>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [attachmentErrors, setAttachmentErrors] = useState<Record<string, string>>({});
  const [downloadingAttachment, setDownloadingAttachment] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const visibleItems = useMemo(() => {
    return [...items]
      .filter((item) => kindFilter === "all" || item.kind === kindFilter)
      .filter((item) => {
        if (statusFilter === "submitted") return item.status === "submitted";
        if (statusFilter === "all") return true;
        return item.status !== "submitted";
      })
      .sort((left, right) => {
        const leftDue = left.dueAt ? Date.parse(left.dueAt) : Number.POSITIVE_INFINITY;
        const rightDue = right.dueAt ? Date.parse(right.dueAt) : Number.POSITIVE_INFINITY;
        return leftDue - rightDue || String(left.courseName || "").localeCompare(String(right.courseName || ""), "zh-CN");
      });
  }, [items, kindFilter, statusFilter]);

  useEffect(() => {
    if (!expandedId) return undefined;
    const assignment = items.find((item) => item.id === expandedId);
    if (!assignment || details[expandedId]) return undefined;
    const sequence = ++requestSequence.current;
    setLoadingId(expandedId);
    setErrors((current) => {
      const next = { ...current };
      delete next[expandedId];
      return next;
    });
    void bridge.getAssignmentDetail(expandedId)
      .then((detail) => {
        if (requestSequence.current !== sequence) return;
        setDetails((current) => ({ ...current, [expandedId]: detail }));
      })
      .catch((error) => {
        if (requestSequence.current !== sequence) return;
        setErrors((current) => ({
          ...current,
          [expandedId]: error instanceof Error ? error.message : String(error),
        }));
      })
      .finally(() => {
        if (requestSequence.current === sequence) setLoadingId(null);
      });
    return () => {
      requestSequence.current += 1;
    };
  }, [details, expandedId, items]);

  const toggle = (assignmentId: string) => {
    setExpandedId((current) => current === assignmentId ? null : assignmentId);
  };

  const downloadAttachment = async (assignmentId: string, attachment: { title: string; url: string }) => {
    const key = `${assignmentId}:${attachment.url}`;
    setDownloadingAttachment(key);
    setAttachmentErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    try {
      await bridge.downloadAssignmentAttachment(assignmentId, attachment);
    } catch (error) {
      setAttachmentErrors((current) => ({
        ...current,
        [key]: error instanceof Error ? error.message : String(error),
      }));
    } finally {
      setDownloadingAttachment(null);
    }
  };

  return (
    <div className="data-page mobile-assignments-page">
      <div className="mobile-assignment-toolbar">
        <div className="mobile-assignment-filters" role="group" aria-label="作业类型">
          {(["all", "assignment", "online-test"] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              className={kindFilter === filter ? "active" : ""}
              onClick={() => setKindFilter(filter)}
            >
              {filter === "all" ? "全部" : filter === "assignment" ? "作业" : "测试"}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="mobile-assignment-refresh"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="刷新作业"
        >
          <RefreshCw size={15} className={refreshing ? "spinning" : ""} />
          {refreshing ? "刷新中" : "刷新"}
        </button>
      </div>
      <div className="mobile-assignment-status" role="group" aria-label="作业状态">
        {(["pending", "submitted", "all"] as const).map((filter) => (
          <button
            key={filter}
            type="button"
            className={statusFilter === filter ? "active" : ""}
            onClick={() => setStatusFilter(filter)}
          >
            {filter === "pending" ? "待完成" : filter === "submitted" ? "已提交" : "全部"}
          </button>
        ))}
        <span>{visibleItems.length} 项</span>
      </div>

      {visibleItems.length ? (
        <div className="mobile-assignment-list">
          {visibleItems.map((item) => {
            const Icon = assignmentIcon(item);
            const expanded = expandedId === item.id;
            const detail = details[item.id];
            const error = errors[item.id];
            return (
              <article className={`mobile-assignment-card${expanded ? " expanded" : ""}`} key={item.id}>
                <button
                  type="button"
                  className="mobile-assignment-summary"
                  onClick={() => toggle(item.id)}
                  aria-expanded={expanded}
                >
                  <span className={`mobile-assignment-icon ${item.kind === "online-test" ? "test" : "homework"}`}>
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  <span className="mobile-assignment-copy">
                    <span className="mobile-assignment-meta">
                      <span>{item.courseName || "未关联课程"}</span>
                      <span>{assignmentKind(item)}</span>
                    </span>
                    <strong>{item.title}</strong>
                    <span className="mobile-assignment-due">
                      {item.dueAt ? `截止 ${formatDate(item.dueAt)}` : "未提供截止时间"}
                      <em>{statusLabel(item)}</em>
                    </span>
                  </span>
                  <span className="mobile-assignment-disclosure" aria-hidden="true">
                    <ChevronDown size={18} />
                  </span>
                </button>
                {expanded && (
                  <div className="mobile-assignment-detail">
                    {loadingId === item.id && (
                      <div className="mobile-assignment-detail-state">正在读取作业详情…</div>
                    )}
                    {error && (
                      <div className="mobile-assignment-detail-state error">
                        <RotateCcw size={16} />
                        <span>{error}</span>
                      </div>
                    )}
                    {!loadingId && !error && detail && (
                      <>
                        <div className="mobile-assignment-detail-facts">
                          <span>{detail.status === "submitted" ? "已提交" : item.status === "pending" ? "待完成" : detail.maySubmit ? "可以提交" : "仅查看"}</span>
                          {detail.contentText && <span>{detail.contentText.length} 字</span>}
                        </div>
                        {detail.contentHtml ? (
                          <div
                            className="mobile-assignment-detail-html"
                            dangerouslySetInnerHTML={{ __html: detail.contentHtml }}
                          />
                        ) : (
                          <p className="mobile-assignment-detail-text">{detail.contentText || "THEOL 未返回作业说明。"}</p>
                        )}
                        {detail.attachments?.length ? (
                          <div className="mobile-assignment-attachments">
                            <strong>附件</strong>
                            {detail.attachments.map((attachment) => {
                              const attachmentKey = `${item.id}:${attachment.url}`;
                              return (
                                <div className="mobile-assignment-attachment" key={attachment.url}>
                                  <button
                                    type="button"
                                    onClick={() => void downloadAttachment(item.id, attachment)}
                                    disabled={downloadingAttachment === attachmentKey}
                                  >
                                    <Download size={14} />
                                    <span>{attachment.title}</span>
                                    <em>{downloadingAttachment === attachmentKey ? "获取中" : "获取"}</em>
                                  </button>
                                  {attachmentErrors[attachmentKey] && (
                                    <small>{attachmentErrors[attachmentKey]}</small>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </>
                    )}
                    {!loadingId && !error && !detail && (
                      <div className="mobile-assignment-detail-state">展开后读取作业详情。</div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={CheckCircle2}
          title={statusFilter === "submitted" ? "暂无已提交作业" : "暂无作业"}
          detail={statusFilter === "pending" ? "同步北化在线THEOL后会显示待完成作业。" : "当前筛选条件下没有可显示的课程任务。"}
        />
      )}
      <p className="mobile-assignment-footnote">
        作业列表来自北化在线THEOL待办接口；展开卡片后才读取详情，不会自动提交作业。
        {items.length > 0 && ` 最近截止：${relativeTime(visibleItems[0]?.dueAt)}`}
      </p>
    </div>
  );
}

import {
  AlertCircle,
  ChevronRight,
  Clock3,
  LogIn,
  Menu,
  RefreshCw,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { navItems } from "../ui/navigation";
import { StatusDot, type ViewId } from "../ui/app-shared";
import type { AuthStatus, CampusState, GithubUpdateStatus } from "../types";
import { ThemeMenu } from "../components/ThemeMenu";
import { GithubUpdateIndicator } from "../components/GithubUpdateIndicator";

type WorkspaceChromeProps = {
  state: CampusState;
  view: ViewId;
  title: { title: string; subtitle: string };
  auth: AuthStatus;
  syncing: boolean;
  syncPercent: number;
  syncProgress: string | null;
  hasSession: boolean;
  allSourcesConnected: boolean;
  credentialsSaved: boolean;
  academicApiEnabled?: boolean;
  academicApiConfigured?: boolean;
  query: string;
  message: string | null;
  messageKind: "info" | "error" | "success";
  syncFailure: string | null;
  updateStatus: GithubUpdateStatus;
  syncFreshness: {
    kind: "syncing" | "failed" | "idle" | "ready";
    label: string;
    detail: string;
  };
  paletteOpen: boolean;
  paletteQuery: string;
  paletteItems: typeof navItems;
  onOpenSidebar: () => void;
  onOpenAppearanceSettings: () => void;
  onQueryChange: (value: string) => void;
  onSync: () => void;
  onRequestLogin: () => void;
  onDismissMessage: () => void;
  onDismissSyncFailure: () => void;
  onPaletteQueryChange: (value: string) => void;
  onClosePalette: () => void;
  onNavigate: (view: ViewId) => void;
  children: ReactNode;
};

export function WorkspaceChrome({
  state,
  view,
  title,
  auth,
  syncing,
  syncPercent,
  syncProgress,
  hasSession,
  allSourcesConnected,
  credentialsSaved,
  academicApiEnabled = false,
  academicApiConfigured = false,
  query,
  message,
  messageKind,
  syncFailure,
  updateStatus,
  syncFreshness,
  paletteOpen,
  paletteQuery,
  paletteItems,
  onOpenSidebar,
  onOpenAppearanceSettings,
  onQueryChange,
  onSync,
  onRequestLogin,
  onDismissMessage,
  onDismissSyncFailure,
  onPaletteQueryChange,
  onClosePalette,
  onNavigate,
  children,
}: WorkspaceChromeProps) {
  const theolExpected = credentialsSaved || auth.theol.connected;
  const sourceEntries = [
    { label: "教务系统", connected: auth.jwglxt.connected },
    ...(theolExpected ? [{ label: "北化在线THEOL", connected: auth.theol.connected }] : []),
  ];
  const connectedSources = sourceEntries
    .filter((source) => source.connected)
    .map((source) => source.label);
  const missingSources = sourceEntries
    .filter((source) => !source.connected)
    .map((source) => source.label);
  const connectedLabel = connectedSources.join("、");
  const missingLabel = missingSources.join("、");
  const authVerificationPending = Boolean(
    auth.jwglxt.authPending || auth.theol.authPending,
  );
  const paletteRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!paletteOpen || !paletteRef.current) return;
    const el = paletteRef.current;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = Array.from(
        el.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled])",
        ),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [paletteOpen]);
  const authRequired = Boolean(auth.jwglxt.authRequired || auth.theol.authRequired);
  const backgroundAuthPending = credentialsSaved
    && !allSourcesConnected
    && !syncFailure
    && !authRequired
    && !auth.jwglxt.error
    && !auth.theol.error;
  // An expired session must remain actionable even while the failed sync is
  // winding down. The mature desktop client always exposes the auth recovery
  // action after the bounded automatic attempt has stopped.
  const apiOnlyConnection = Boolean(academicApiEnabled && academicApiConfigured && !credentialsSaved);
  const showLoginBanner = authRequired || (!syncing && !backgroundAuthPending && (!hasSession || !allSourcesConnected));
  return (
    <main className="workspace">
      {syncing && (
        <div
          className="sync-progress-overlay"
          role="progressbar"
          aria-valuenow={syncPercent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <i style={{ width: `${syncPercent}%` }} />
        </div>
      )}
      <header className="topbar">
        <div className="page-title">
          <button
            className="mobile-menu"
            onClick={onOpenSidebar}
            aria-label="打开导航"
          >
            <Menu size={21} />
          </button>
          <div>
            <h1>{title.title}</h1>
            <p>{title.subtitle}</p>
          </div>
        </div>
        {syncing && (
          <section className="sync-live-banner topbar-sync-banner" role="status" aria-live="polite">
            <RefreshCw size={17} className="spinning" />
            <div>
              <strong>正在更新校园数据</strong>
              <span>{syncProgress || "正在连接教务系统…"}</span>
              <small>
                当前页面暂显示上次同步结果；新课表、成绩和考试数据完成后会自动替换。
              </small>
            </div>
          </section>
        )}
        {!syncing && authVerificationPending && (
          <section className="login-banner topbar-login-banner auth-pending-banner" role="status" aria-live="polite">
            <RefreshCw size={17} className="spinning" />
            <div>
              <strong>正在自动恢复统一身份认证会话</strong>
              <span>BetterBUCT 正在使用已保存凭据确认教务系统和北化在线THEOL；完成后会自动继续同步。</span>
            </div>
          </section>
        )}
        {!authVerificationPending && showLoginBanner && (
          <section className="login-banner topbar-login-banner" role="status">
            <AlertCircle size={17} />
            <div>
              <strong>
                {authRequired
                  ? "校园会话已失效"
                  : hasSession
                  ? connectedSources.length
                  ? "校园数据源未完全连接"
                    : "校园数据源未连接"
                  : "连接校园数据"}
              </strong>
              <span>
                {authRequired
                  ? "BetterBUCT 已先尝试自动重新登录；仍未完成时，请点击“重新登录”再次恢复校园数据。"
                  : syncFailure
                  ? "后台恢复未完成；可以继续查看本机已有数据，或重新连接校园数据源。"
                  : !hasSession
                  ? "一次统一身份认证即可连接教务系统和北化在线THEOL；两个来源会分别验证。"
                  : connectedSources.length
                    ? `${connectedLabel}已连接；${missingLabel || "其余来源"}暂未连接，已连接的数据仍可使用。`
                    : "当前没有可用的校园数据源；可以重新连接，或继续查看本机已有数据。"}
              </span>
            </div>
            <button onClick={apiOnlyConnection && !authRequired ? onSync : onRequestLogin}>
              {apiOnlyConnection && !authRequired ? <RefreshCw size={15} /> : <LogIn size={15} />}{" "}
              {apiOnlyConnection && !authRequired
                ? "重试教务 API"
                : authRequired
                  ? "重新登录"
                  : hasSession
                  ? "继续登录"
                  : credentialsSaved
                    ? "重新登录"
                    : "设置账号"}
            </button>
          </section>
        )}
        {!authVerificationPending && !authRequired && syncFailure && (
          <section className="login-banner topbar-login-banner sync-failure-banner" role="alert" aria-live="polite">
            <AlertCircle size={17} />
            <div>
              <strong>校园数据更新失败</strong>
              <span>{syncFailure}</span>
              <small>{syncFreshness.detail}；已保留本机已有数据。</small>
            </div>
            <button type="button" onClick={onSync} disabled={syncing}>
              <RefreshCw size={15} className={syncing ? "spinning" : undefined} />
              {syncing ? "重试中" : "重试同步"}
            </button>
            <button type="button" className="login-banner-dismiss" onClick={onDismissSyncFailure} aria-label="关闭更新失败提示" title="关闭提示">
              <X size={16} />
            </button>
          </section>
        )}
        <div className="top-actions">
          {view === "courses" && (
            <label className="search-box">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="搜索课程"
              />
            </label>
          )}
          <div className="source-group">
            <StatusDot source="jwglxt" status={auth.jwglxt} />
            <StatusDot source="theol" status={auth.theol} />
          </div>
          <div
            className={`sync-freshness ${syncFreshness.kind}`}
            role="status"
            title={syncFreshness.detail}
          >
            <Clock3 size={15} />
            <span>
              <strong>{syncFreshness.label}</strong>
              <small>{syncFreshness.detail}</small>
            </span>
          </div>
          <ThemeMenu onOpenAppearanceSettings={onOpenAppearanceSettings} />
          <button
            className="icon-button sync-button"
            data-tooltip={hasSession ? "立即同步" : "统一身份认证"}
            aria-label={hasSession ? "立即同步" : "统一身份认证"}
            onClick={onSync}
            disabled={syncing}
          >
            {hasSession ? (
              <RefreshCw size={19} className={syncing ? "spinning" : ""} />
            ) : (
              <LogIn size={19} />
            )}
          </button>
          <div className="profile-chip">
            <div>
              {state.profile?.name?.slice(0, 1) || <UserRound size={17} />}
            </div>
            <span>
              {state.profile?.name || (hasSession ? "已认证" : "未登录")}
            </span>
          </div>
        </div>
      </header>
      <GithubUpdateIndicator status={updateStatus} />
      {message && (
        <section className="message-bar" data-kind={messageKind}>
          <AlertCircle size={17} />
          <span>{message}</span>
          <button onClick={onDismissMessage} aria-label="关闭消息">
            <X size={16} />
          </button>
        </section>
      )}
      <div className="content-area">{children}</div>
      {paletteOpen && (
        <div
          className="command-palette-backdrop"
          role="presentation"
          onMouseDown={onClosePalette}
        >
          <section
            className="command-palette"
            role="dialog"
            aria-modal="true"
            aria-label="快速跳转"
            ref={paletteRef}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="command-palette-search">
              <Search size={17} />
              <input
                autoFocus
                value={paletteQuery}
                onChange={(event) => onPaletteQueryChange(event.target.value)}
                placeholder="跳转到页面"
                aria-label="搜索页面"
              />
              <button
                className="icon-button"
                onClick={onClosePalette}
                aria-label="关闭快速跳转"
              >
                <X size={16} />
              </button>
            </div>
            <div className="command-palette-list">
              {paletteItems.length ? (
                paletteItems.map(({ id, label, icon: Icon }) => (
                  <button key={id} onClick={() => onNavigate(id)}>
                    <Icon size={17} />
                    <span>{label}</span>
                    <ChevronRight size={15} />
                  </button>
                ))
              ) : (
                <div className="command-palette-empty">没有匹配的页面</div>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

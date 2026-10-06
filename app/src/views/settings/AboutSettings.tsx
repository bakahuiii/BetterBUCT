import { AlertCircle, Braces, CheckCircle2, CircleHelp, Database, Download, ExternalLink, Github, Hash, HeartHandshake, LoaderCircle, Mail, MessagesSquare, Monitor, RotateCw, ShieldCheck } from "lucide-react";
import { bridge, isMobile } from "../../bridge";
import { useGithubUpdateStatus } from "../../hooks/useGithubUpdateStatus";
import authorAvatar from "../../assets/bakahuiii-avatar.jpg";
import theiaMark from "../../assets/theia-mark.png";
import type { ApiStatus, CampusState, GithubUpdateStatus } from "../../types";

const PROJECT_URL = "https://github.com/bakahuiii/BetterBUCT";
const WINDOWS_PROJECT_URL = "https://github.com/bakahuiii/THEIA";
const RELEASES_URL = `${PROJECT_URL}/releases`;

function formatUpdateTime(value: string | null) {
  if (!value) return "尚未检查";
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? value : time.toLocaleString("zh-CN", { hour12: false });
}

function formatUpdateBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  if (value < 1024) return `${Math.round(value)} B`;
  const units = ["KB", "MB", "GB"];
  let amount = value;
  let unit = "B";
  for (const nextUnit of units) {
    amount /= 1024;
    unit = nextUnit;
    if (amount < 1024 || nextUnit === units.at(-1)) break;
  }
  return `${amount.toFixed(amount >= 10 ? 0 : 1)} ${unit}`;
}

function describeUpdate(status: GithubUpdateStatus, mobile = false) {
  if (!status.supported) return mobile ? "移动端可在 GitHub 发行页手动下载更新。" : "仅移动端正式安装包支持 GitHub 自动更新。";
  if (status.state === "checking") return "正在连接 GitHub 更新服务。";
  if (status.state === "available") {
    return "发现新版本 " + (status.availableVersion || "未知版本") + "，准备下载。";
  }
  if (status.state === "downloading") {
    const percent = Number.isFinite(status.progress?.percent) ? Math.max(0, Math.min(100, status.progress?.percent || 0)) : 0;
    return "正在下载更新 " + Math.round(percent) + "%。";
  }
  if (status.state === "downloaded") {
    return mobile
      ? "更新包已下载，点击安装更新并按系统提示确认。"
      : "更新 " + (status.availableVersion || "") + " 已下载，重启即可安装。";
  }
  if (status.installPermissionRequired) return "已打开系统设置，请允许 BetterBUCT 安装应用，然后再次点击安装更新。";
  if (status.state === "error") return "检查更新失败：" + (status.error || "未知错误");
  if (status.state === "not-available") return "当前已是最新版本 " + status.currentVersion + "。";
  return "当前版本 " + status.currentVersion;
}

function updateTone(status: GithubUpdateStatus) {
  if (!status.supported) return "unsupported";
  if (status.state === "error") return "error";
  if (status.state === "downloaded") return "ready";
  if (status.state === "checking" || status.state === "available" || status.state === "downloading") return "progress";
  if (status.state === "not-available") return "current";
  return "idle";
}

export function AboutSettings({
  state,
  apiBase,
  apiStatus,
}: {
  state: CampusState;
  apiBase: string;
  apiStatus: ApiStatus;
}) {
  // App.tsx performs the single startup check; this page only observes its
  // status and keeps the explicit manual check action available.
  const updateStatus = useGithubUpdateStatus(state.appVersion || "web");

  const apiOnline = Boolean(apiStatus.baseUrl && apiStatus.host && apiStatus.port > 0);
  const updateAvailable = updateStatus.state === "available";
  const updateInProgress = updateStatus.state === "checking" || updateStatus.state === "downloading";
  const updateProgressVisible = updateInProgress || updateAvailable;
  const downloading = updateStatus.state === "downloading";
  const updatePercent = Number.isFinite(updateStatus.progress?.percent)
    ? Math.max(0, Math.min(100, updateStatus.progress?.percent || 0))
    : 0;
  const updateSize = updateStatus.updateSizeBytes || updateStatus.progress?.totalBytes || 0;
  const canInstall = updateStatus.supported && updateStatus.state === "downloaded";
  const installPermissionRequired = Boolean(updateStatus.installPermissionRequired);
  const primaryLabel = installPermissionRequired
    ? "打开安装权限设置"
    : !updateStatus.supported
    ? "仅安装包可用"
    : canInstall
      ? (isMobile ? "安装更新" : "重启并安装更新")
      : updateStatus.state === "checking"
        ? "检查中"
        : updateAvailable
          ? (isMobile ? "下载更新" : "更新")
          : isMobile && updateStatus.state === "downloaded"
            ? "安装更新"
            : downloading
              ? "下载中"
              : "检查更新";
  const UpdateIcon = !updateStatus.supported
    ? CircleHelp
    : updateStatus.state === "error"
      ? AlertCircle
      : canInstall
        ? CheckCircle2
        : updateStatus.state === "checking"
          ? LoaderCircle
          : updateStatus.state === "available" || downloading
            ? Download
            : RotateCw;
  const ActionIcon = !updateStatus.supported
    ? CircleHelp
    : canInstall
      ? Download
      : updateInProgress
        ? UpdateIcon
        : RotateCw;

  const runUpdateAction = async () => {
    if (!updateStatus.supported || updateInProgress) return;
    if (canInstall || installPermissionRequired) {
      await bridge.installUpdate();
      return;
    }
    if (isMobile && (updateAvailable || updateStatus.state === "downloaded")) {
      await bridge.downloadUpdate();
      return;
    }
    if (updateAvailable) {
      await bridge.downloadUpdate();
      return;
    }
    if (updateStatus.supported) {
      await bridge.checkForUpdates();
    }
  };

  return (
    <section className="settings-section about-settings">
      <div className="about-brand-row">
        <div className="about-hero">
          <div className="about-mark">
            <img src={theiaMark} alt="BetterBUCT" />
          </div>
          <div>
            <span>校园信息工作台</span>
            <h2>BetterBUCT</h2>
          </div>
        </div>

        <section className="about-me" aria-labelledby="about-me-title">
          <div className="about-me-avatar-shell">
            <img className="about-me-avatar" src={authorAvatar} alt="头像" />
          </div>
          <div className="about-me-copy">
            <div className="about-me-heading">
              <h3 id="about-me-title">关于我</h3>
            </div>
            <div className="about-me-contacts" aria-label="联系方式">
              <a href="mailto:1411575779@qq.com"><Mail size={13} aria-hidden="true" />1411575779@qq.com</a>
              <span><Hash size={13} aria-hidden="true" />QQ 1411575779</span>
              <span><MessagesSquare size={13} aria-hidden="true" />微信 bakahui0225</span>
            </div>
          </div>
        </section>
      </div>

      <div className="about-facts">
        <div className="about-fact about-fact-security">
          <ShieldCheck size={17} aria-hidden="true" />
          <span>
            <strong>本机优先</strong>
            <small>账号凭据由当前 Windows 账户保护。</small>
          </span>
        </div>
        <div className={`about-fact about-fact-api ${apiOnline ? "is-online" : "is-offline"}`}>
          {apiOnline ? <CheckCircle2 size={17} aria-hidden="true" /> : <Database size={17} aria-hidden="true" />}
          <span>
            <strong>本地数据接口</strong>
            <small>{apiStatus.baseUrl || apiBase || "尚未启动"}</small>
          </span>
        </div>
        <div className="about-fact about-fact-format">
          <Braces size={17} aria-hidden="true" />
          <span>
            <strong>数据格式</strong>
            <small>{state.schema}{apiStatus.mcp?.schema ? ` · MCP ${apiStatus.mcp.schema}` : ""}</small>
          </span>
        </div>
        <div className="about-fact about-fact-version">
          <HeartHandshake size={17} aria-hidden="true" />
          <span>
            <strong>版本</strong>
            <small>BetterBUCT {state.appVersion || "开发版本"}</small>
          </span>
        </div>
      </div>

      <div className={`about-update is-${updateTone(updateStatus)}`}>
        <div className="about-update-icon" aria-hidden="true">
          <UpdateIcon size={17} className={updateInProgress ? "spinning" : undefined} />
        </div>
        <div className="about-update-copy">
          <strong>GitHub 自动更新</strong>
          <small>{describeUpdate(updateStatus, isMobile)}</small>
          <span>当前版本：BetterBUCT {updateStatus.currentVersion || state.appVersion || "开发版本"}</span>
          <span>上次检查：{formatUpdateTime(updateStatus.lastCheckedAt)}</span>
            {updateProgressVisible && (
            <div className={`about-update-progress ${downloading ? "" : "is-indeterminate"}`}>
              <div className="about-update-progress-label">
                <span>{downloading ? "下载进度" : updateStatus.state === "available" ? "准备下载" : "检查进度"}</span>
                {updateSize > 0 && <span>文件大小：{formatUpdateBytes(updateSize)}</span>}
                <strong>{downloading ? `${Math.round(updatePercent)}%` : "进行中"}</strong>
              </div>
              <div
                className="about-update-progress-track"
                role="progressbar"
                aria-label="更新下载进度"
                aria-valuenow={downloading ? Math.round(updatePercent) : undefined}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <i style={downloading ? { width: `${updatePercent}%` } : undefined} />
              </div>
            </div>
          )}
        </div>
        <div className="about-update-actions">
          <button
            type="button"
            className={canInstall || installPermissionRequired ? "primary-button" : "secondary-button"}
            onClick={() => void runUpdateAction()}
            disabled={!updateStatus.supported || updateInProgress}
          >
            <ActionIcon size={16} className={updateInProgress ? "spinning" : undefined} aria-hidden="true" />
            {primaryLabel}
          </button>
        </div>
      </div>

      <section className="about-theia" aria-labelledby="about-theia-title">
        <div className="about-theia-icon" aria-hidden="true">
          <Monitor size={19} aria-hidden="true" />
        </div>
        <div className="about-theia-copy">
          <div className="about-theia-heading">
            <strong id="about-theia-title">THEIA</strong>
            <span>Windows</span>
          </div>
          <p>独立的 Windows 校园工作台项目，提供本地数据同步、课表、成绩、课程资源和学习工具。</p>
          <small>项目源码、发行版本和问题反馈均在 GitHub 管理。</small>
        </div>
        <a
          className="secondary-button about-theia-link"
          href={WINDOWS_PROJECT_URL}
          target="_blank"
          rel="noreferrer"
          title="打开 THEIA Windows 项目"
        >
          <ExternalLink size={15} aria-hidden="true" />
          查看 Windows 项目
        </a>
      </section>

      <div className="about-boundary">
        <ShieldCheck size={16} aria-hidden="true" />
        <span><strong>本地数据边界</strong><small>校园数据、凭据和模型配置由本机能力管理；公开 API 和 MCP 只提供脱敏、只读数据，不包含密码、Cookie、令牌或任意学校侧写入。</small></span>
      </div>

      <div className="about-links" aria-label="项目链接">
        <a href={PROJECT_URL} target="_blank" rel="noreferrer"><Github size={15} aria-hidden="true" />GitHub 源码</a>
        <a href={RELEASES_URL} target="_blank" rel="noreferrer"><Download size={15} aria-hidden="true" />发行版本</a>
        <span>MIT License</span>
      </div>

      <div className="about-footer">
        <span>BetterBUCT CAMPUS CLIENT</span>
        <small>
          {state.profile?.studentId
            ? "已为 " + state.profile.studentId + " 准备本地工作区"
            : "等待统一身份认证连接校园平台"}
        </small>
      </div>
    </section>
  );
}

import { ArrowLeft, BrainCircuit, Check, ChevronDown, CircleHelp, Database, Palette, RefreshCw, Server, X } from "lucide-react";
import { useEffect, useState } from "react";
import { bridge, isMobile } from "../bridge";
import theiaMark from "../assets/theia-mark.png";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../components/ui/dialog";
import type {
  AcademicApiCredentialStatus,
  ActivityLogEntry,
  ApiStatus,
  AuthStatus,
  CampusState,
  CredentialStatus,
  MailCredentialStatus,
  ModelStatus,
} from "../types";
import { AboutSettings } from "./settings/AboutSettings";
import { AdvancedModelSettings } from "./settings/AdvancedModelSettings";
import { AppearanceSettings } from "./settings/AppearanceSettings";
import { DataSettings, type DataExportFormat } from "./settings/DataSettings";
import { IrisCompanionSettings } from "./settings/IrisCompanionSettings";
import { InterfaceSettings } from "./settings/InterfaceSettings";
import { McpIntegrationSettings } from "./settings/McpIntegrationSettings";
import { SyncSettings } from "./settings/SyncSettings";
import { SYNC_ERROR_LABELS, syncRecord, type SyncDataDefinition } from "./settings/SyncSettingsModel";

export type SettingsSection = "appearance" | "sync" | "data" | "interfaces" | "model" | "about";

const SETTINGS_NAV = [
  { id: "appearance", label: "外观", icon: Palette },
  { id: "sync", label: "同步", icon: RefreshCw },
  { id: "data", label: "数据", icon: Database },
  { id: "interfaces", label: "接口与集成", icon: Server },
  { id: "model", label: "模型服务", icon: BrainCircuit },
] as const;

type SettingsViewProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSection?: SettingsSection;
  state: CampusState;
  apiBase: string;
  apiStatus: ApiStatus;
  auth: AuthStatus;
  credentials: CredentialStatus;
  academicApiCredentials: AcademicApiCredentialStatus;
  mailCredentials: MailCredentialStatus;
  modelStatus: ModelStatus;
  syncing: boolean;
  syncProgress: string | null;
  onSync: () => void;
  activityLog: ActivityLogEntry[];
  activityLoading: boolean;
  onRefreshActivity: () => void;
  onAuthChange: (status: AuthStatus) => void;
  onCredentialChange: (status: CredentialStatus) => void;
  onAcademicApiCredentialChange: (status: AcademicApiCredentialStatus) => void;
  onMailCredentialChange: (status: MailCredentialStatus) => void;
  onModelStatus: (status: ModelStatus) => void;
  onMessage: (message: string) => void;
};

export function SettingsView({
  open,
  onOpenChange,
  initialSection = "appearance",
  state,
  apiBase,
  apiStatus,
  credentials,
  academicApiCredentials,
  mailCredentials,
  modelStatus,
  syncing,
  syncProgress,
  onSync,
  activityLog,
  activityLoading,
  onRefreshActivity,
  onCredentialChange,
  onAcademicApiCredentialChange,
  onMailCredentialChange,
  onModelStatus,
  onMessage,
}: SettingsViewProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>("appearance");
  const [mobilePickerOpen, setMobilePickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const mobileSettingsNav = [
    ...SETTINGS_NAV.filter(({ id }) => id !== "interfaces" && id !== "model"),
    { id: "about" as const, label: "关于", icon: CircleHelp },
  ];
  const [retryingDomain, setRetryingDomain] = useState<SyncDataDefinition["id"] | null>(null);
  useEffect(() => {
    if (!open) return;
    const mobileCanShow = mobileSettingsNav.some(({ id }) => id === initialSection);
    setActiveSection(isMobile && !mobileCanShow ? "appearance" : initialSection);
    setMobilePickerOpen(false);
  }, [initialSection, open]);
  useEffect(() => {
    if (!open) setMobilePickerOpen(false);
  }, [open]);
  useEffect(() => {
    if (!isMobile || !open) return;
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(".settings-page-shell")?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeSection, open]);

  const update = async (settings: Partial<CampusState["settings"]>) => {
    setSaving(true);
    try {
      await bridge.updateSettings(settings);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "设置保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  const exportFile = async (format: DataExportFormat, collection?: string) => {
    try {
      const result = await bridge.exportData(format, collection);
      if (result.canceled) return;
      if (format === "ai") {
        onMessage(`AI 数据包已导出至 ${result.filePath || "所选目录"}（${result.files || 0} 个已校验文件）。`);
        return;
      }
      onMessage(`数据已导出至 ${result.filePath || "所选位置"}。`);
    } catch (error) {
      onMessage(error instanceof Error ? `导出失败：${error.message}` : "导出失败。");
    }
  };

  const retryDomain = async (definition: SyncDataDefinition) => {
    if (syncing || retryingDomain) return;
    setRetryingDomain(definition.id);
    try {
      const snapshot = await bridge.retrySyncDomain(definition.id);
      const record = syncRecord(snapshot, definition);
      if (record?.status === "failed" || record?.status === "auth-required") {
        const reason = record.errorCode ? SYNC_ERROR_LABELS[record.errorCode] || record.errorCode : "请求失败";
        throw new Error(reason);
      }
      const partial = record && (
        record.completeness !== "complete" ||
        record.retainedPrevious ||
        Boolean(record.errorCode)
      );
      onMessage(partial ? `${definition.label}部分获取成功，详情已更新。` : `${definition.label}已重新获取。`);
    } catch (error) {
      onMessage(error instanceof Error ? `${definition.label}获取失败：${error.message}` : `${definition.label}获取失败。`);
    } finally {
      setRetryingDomain(null);
    }
  };

  const sectionMeta: Record<SettingsSection, { title: string; description: string }> = {
    appearance: { title: "外观", description: "调整 BetterBUCT 的主题、配色与阅读密度。" },
    sync: { title: "同步", description: "控制校园数据的更新频率、来源和失败重试。" },
    data: { title: "数据", description: "管理校园数据来源、凭据、邮箱、日志与本地导出。" },
    interfaces: { title: "接口与集成", description: "查看本地 API、MCP 和 Iris 的当前运行能力。" },
    model: { title: "模型服务", description: "配置模型连接、角色路由和顾问行为边界。" },
    about: { title: "关于 BetterBUCT", description: "版本、发布渠道、客户端和本地数据边界。" },
  };
  const activeMeta = sectionMeta[activeSection];

  const settingsContent = (
    <>
      {activeSection === "appearance" && <AppearanceSettings onMessage={onMessage} />}
      {activeSection === "sync" && (
        <SyncSettings state={state} saving={saving} syncing={syncing} syncProgress={syncProgress} retryingDomain={retryingDomain} onUpdate={(settings) => { void update(settings); }} onSync={onSync} onRetry={(definition) => { void retryDomain(definition); }} />
      )}
      {activeSection === "data" && (
        <DataSettings state={state} credentials={credentials} academicApiCredentials={academicApiCredentials} mailCredentials={mailCredentials} activityLog={activityLog} activityLoading={activityLoading} onRefreshActivity={onRefreshActivity} onCredentialChange={onCredentialChange} onAcademicApiCredentialChange={onAcademicApiCredentialChange} onMailCredentialChange={onMailCredentialChange} onMessage={onMessage} onExport={(format, collection) => { void exportFile(format, collection); }} onOpenDataDirectory={() => { void bridge.openDataDirectory().catch((error) => onMessage(error instanceof Error ? `无法打开数据目录：${error.message}` : "无法打开数据目录。")); }} />
      )}
      {!isMobile && activeSection === "interfaces" && <><InterfaceSettings status={apiStatus} onMessage={onMessage} /><McpIntegrationSettings onMessage={onMessage} /><IrisCompanionSettings onMessage={onMessage} /></>}
      {!isMobile && activeSection === "model" && <AdvancedModelSettings state={state} status={modelStatus} onStatus={onModelStatus} onMessage={onMessage} />}
      {activeSection === "about" && <AboutSettings state={state} apiBase={apiBase} apiStatus={apiStatus} />}
    </>
  );

  const surface = (
    <>
      <aside className="settings-modal-nav" aria-label="设置分类">
        <div className="settings-modal-brand">
          <img className="settings-modal-brand-mark" src={theiaMark} alt="BetterBUCT" />
          <div>
            <strong>设置</strong>
            <small>BetterBUCT 工作区偏好</small>
          </div>
        </div>
        <nav>
          {SETTINGS_NAV.map(({ id, label, icon: Icon }) => (
            <button type="button" key={id} className={activeSection === id ? "active" : ""} onClick={() => setActiveSection(id)} aria-label={label} title={label} aria-current={activeSection === id ? "page" : undefined} data-section={id}>
              <Icon className={["settings-nav-icon", id === "sync" && syncing ? "is-syncing spinning" : ""].filter(Boolean).join(" ")} size={17} strokeWidth={activeSection === id ? 2.2 : 1.8} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="settings-nav-bottom">
          <button type="button" className={activeSection === "about" ? "active" : ""} onClick={() => setActiveSection("about")} aria-label="关于" title="关于" aria-current={activeSection === "about" ? "page" : undefined} data-section="about">
            <CircleHelp className="settings-nav-icon" size={17} strokeWidth={activeSection === "about" ? 2.2 : 1.8} aria-hidden="true" />
            <span>关于</span>
          </button>
        </div>
      </aside>
      <div className="settings-dialog-main">
        <header className="settings-dialog-header">
          <div>
            <DialogTitle>{activeMeta.title}</DialogTitle>
            <DialogDescription>{activeMeta.description}</DialogDescription>
          </div>
          <button type="button" className="settings-dialog-close" onClick={() => onOpenChange(false)} aria-label="关闭设置" title="关闭设置"><X size={18} aria-hidden="true" /></button>
        </header>
        <div className="settings-dialog-scroll">{settingsContent}</div>
      </div>
    </>
  );

  const activeMobileNav = mobileSettingsNav.find(({ id }) => id === activeSection) || mobileSettingsNav[0];
  const ActiveMobileIcon = activeMobileNav.icon;
  const mobileSurface = (
    <main className="settings-page-shell settings-mobile-shell" aria-label="设置">
      <header className="settings-mobile-header">
        <button type="button" className="settings-mobile-back" onClick={() => onOpenChange(false)} aria-label="返回" title="返回">
          <ArrowLeft size={19} aria-hidden="true" />
        </button>
        <div className="settings-mobile-brand">
          <span className="settings-mobile-brand-mark"><img src={theiaMark} alt="BetterBUCT" /></span>
          <div>
            <strong>设置</strong>
            <small>BetterBUCT</small>
          </div>
        </div>
        <button
          type="button"
          className={`settings-mobile-section-trigger${mobilePickerOpen ? " is-open" : ""}`}
          onClick={() => setMobilePickerOpen((value) => !value)}
          aria-expanded={mobilePickerOpen}
          aria-haspopup="listbox"
        >
          <ActiveMobileIcon size={16} aria-hidden="true" />
          <span>{activeMobileNav.label}</span>
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      </header>
      {mobilePickerOpen && (
        <>
          <button type="button" className="settings-mobile-picker-backdrop" aria-label="关闭设置分类" onClick={() => setMobilePickerOpen(false)} />
          <section className="settings-mobile-picker" role="listbox" aria-label="设置分类">
            <div className="settings-mobile-picker-heading">
              <strong>切换设置</strong>
              <small>选择要查看的分类</small>
            </div>
            <div className="settings-mobile-picker-list">
              {mobileSettingsNav.map(({ id, label, icon: Icon }) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={activeSection === id}
                  key={id}
                  className={activeSection === id ? "active" : ""}
                  onClick={() => {
                    setActiveSection(id);
                    setMobilePickerOpen(false);
                  }}
                >
                  <span className="settings-mobile-picker-icon"><Icon size={18} aria-hidden="true" /></span>
                  <span className="settings-mobile-picker-copy">
                    <strong>{label}</strong>
                    <small>{sectionMeta[id].description}</small>
                  </span>
                  {activeSection === id && <Check size={18} aria-hidden="true" />}
                </button>
              ))}
            </div>
          </section>
        </>
      )}
      <section className="settings-mobile-intro">
        <span className="settings-mobile-kicker">BetterBUCT / SETTINGS</span>
        <h1>{activeMeta.title}</h1>
        <p>{activeMeta.description}</p>
      </section>
      <div className="settings-mobile-content">{settingsContent}</div>
    </main>
  );

  if (isMobile) {
    if (!open) return null;
    return mobileSurface;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="settings-dialog" showCloseButton={false}>{surface}</DialogContent>
    </Dialog>
  );
}
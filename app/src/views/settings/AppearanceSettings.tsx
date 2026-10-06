import { Check, Monitor, Moon, Palette, RotateCcw, Sun } from "lucide-react";
import { type AppearanceMode, useAppearance } from "../../hooks/useAppearance";
import { usePersonalization, type BackgroundPreset } from "../../hooks/usePersonalization";

type ModeOption = {
  id: AppearanceMode;
  label: string;
  description: string;
  icon: typeof Sun;
};

const MODE_OPTIONS: ModeOption[] = [
  { id: "light", label: "浅色", description: "清晰明亮", icon: Sun },
  { id: "dark", label: "深色", description: "低眩光", icon: Moon },
  { id: "system", label: "跟随系统", description: "自动切换", icon: Monitor },
];

const ACCENT_OPTIONS = [
  { id: "buct-blue", label: "北化蓝", shadow: "#071b32", highlight: "#1296b6" },
  { id: "teal", label: "青绿色", shadow: "#071c1c", highlight: "#1d8278" },
  { id: "violet", label: "紫罗兰", shadow: "#17132f", highlight: "#725dc4" },
  { id: "amber", label: "琥珀金", shadow: "#2a1a08", highlight: "#bd8526" },
  { id: "rose", label: "玫瑰粉", shadow: "#2b1022", highlight: "#bc4f83" },
  { id: "slate", label: "雾蓝灰", shadow: "#101722", highlight: "#396eb8" },
] as const;

const BACKGROUND_OPTIONS: Array<{
  id: BackgroundPreset;
  label: string;
  light: string;
  dark: string;
}> = [
  { id: "slate", label: "雾蓝", light: "#f3f6fa", dark: "#0e1622" },
  { id: "graphite", label: "石墨", light: "#f3f3f4", dark: "#111318" },
  { id: "indigo", label: "靛蓝", light: "#f2f4fb", dark: "#0d1323" },
  { id: "warm", label: "暖沙", light: "#faf6f0", dark: "#1a1513" },
  { id: "paper", label: "纸白", light: "#fffdf8", dark: "#171715" },
];

function selectedAccentId(highlight: string) {
  return ACCENT_OPTIONS.find((item) => item.highlight.toLowerCase() === String(highlight || "").toLowerCase())?.id || "custom";
}

export function AppearanceSettings({ onMessage }: { onMessage: (message: string) => void }) {
  const { mode, resolvedMode, setMode } = useAppearance();
  const { preferences, setBackground, setGradientMap, reset } = usePersonalization();
  const selectedAccent = selectedAccentId(preferences.gradientMap.highlight);
  const activeMode = MODE_OPTIONS.find((option) => option.id === mode) || MODE_OPTIONS[2];
  const ActiveModeIcon = activeMode.icon;

  const applyAccent = (accent: (typeof ACCENT_OPTIONS)[number]) => {
    setGradientMap({ shadow: accent.shadow, highlight: accent.highlight });
    onMessage(`已切换强调色：${accent.label}`);
  };

  const resetAppearance = () => {
    reset();
    setMode("system");
    onMessage("外观已恢复默认设置");
  };

  return (
    <section className="settings-section appearance-settings-v2" aria-labelledby="appearance-v2-title">
      <header className="appearance-v2-header">
        <div className="appearance-v2-heading-icon" aria-hidden="true"><Palette size={20} /></div>
        <div>
          <span className="appearance-v2-kicker">APPEARANCE</span>
          <h2 id="appearance-v2-title">外观</h2>
          <p>只保留稳定、常用的显示选项，修改会立即应用并自动保存在本机。</p>
        </div>
      </header>

      <div className="appearance-v2-layout">
        <section className="appearance-v2-card appearance-v2-mode-card" aria-labelledby="appearance-mode-title">
          <div className="appearance-v2-card-heading">
            <div>
              <h3 id="appearance-mode-title">显示模式</h3>
              <p>选择应用的明暗显示方式</p>
            </div>
            <span className="appearance-v2-current-badge"><ActiveModeIcon size={14} />{activeMode.label}</span>
          </div>
          <div className="appearance-v2-mode-grid" role="radiogroup" aria-label="显示模式">
            {MODE_OPTIONS.map(({ id, label, description, icon: Icon }) => (
              <button
                type="button"
                key={id}
                className={`appearance-v2-mode-option${mode === id ? " active" : ""}`}
                role="radio"
                aria-checked={mode === id}
                onClick={() => setMode(id)}
              >
                <span className="appearance-v2-option-icon"><Icon size={18} aria-hidden="true" /></span>
                <span className="appearance-v2-option-copy"><strong>{label}</strong><small>{description}</small></span>
                {mode === id && <Check className="appearance-v2-check" size={17} aria-hidden="true" />}
              </button>
            ))}
          </div>
          <p className="appearance-v2-help">{mode === "system" ? `当前跟随系统，正在使用${resolvedMode === "dark" ? "深色" : "浅色"}模式。` : "当前模式会立即应用到全部页面。"}</p>
        </section>

        <section className="appearance-v2-card appearance-v2-background-card" aria-labelledby="appearance-background-title">
          <div className="appearance-v2-card-heading">
            <div>
              <h3 id="appearance-background-title">背景色</h3>
              <p>更换页面底色，卡片和文字会自动保持对比度</p>
            </div>
            <span className="appearance-v2-custom-note">5 个预设</span>
          </div>
          <div className="appearance-v2-background-grid" role="radiogroup" aria-label="背景色">
            {BACKGROUND_OPTIONS.map((background) => (
              <button
                type="button"
                key={background.id}
                className={`appearance-v2-background-option${preferences.background === background.id ? " active" : ""}`}
                role="radio"
                aria-checked={preferences.background === background.id}
                onClick={() => {
                  setBackground(background.id);
                  onMessage(`已切换背景色：${background.label}`);
                }}
              >
                <span className={`appearance-v2-background-swatch ${background.id}`} aria-hidden="true">
                  <i style={{ background: background.light }} />
                  <i style={{ background: background.dark }} />
                </span>
                <span className="appearance-v2-option-copy"><strong>{background.label}</strong></span>
                {preferences.background === background.id && <Check className="appearance-v2-check" size={17} aria-hidden="true" />}
              </button>
            ))}
          </div>
        </section>

        <section className="appearance-v2-card appearance-v2-accent-card" aria-labelledby="appearance-accent-title">
          <div className="appearance-v2-card-heading">
            <div>
              <h3 id="appearance-accent-title">强调色</h3>
              <p>应用于按钮、选中状态和重点信息</p>
            </div>
            <span className="appearance-v2-custom-note">6 个预设</span>
          </div>
          <div className="appearance-v2-accent-grid" role="radiogroup" aria-label="强调色">
            {ACCENT_OPTIONS.map((accent) => (
              <button
                type="button"
                key={accent.id}
                className={`appearance-v2-accent-option${selectedAccent === accent.id ? " active" : ""}`}
                role="radio"
                aria-label={`强调色：${accent.label}`}
                title={accent.label}
                aria-checked={selectedAccent === accent.id}
                onClick={() => applyAccent(accent)}
              >
                <span className="appearance-v2-accent-swatch" style={{ background: `linear-gradient(135deg, ${accent.shadow}, ${accent.highlight})` }} aria-hidden="true" />
                {selectedAccent === accent.id && <Check size={15} aria-hidden="true" />}
              </button>
            ))}
          </div>
        </section>
      </div>

      <footer className="appearance-v2-footer">
        <div>
          <strong><ActiveModeIcon size={15} />当前配置</strong>
          <span>{BACKGROUND_OPTIONS.find((item) => item.id === preferences.background)?.label} · {activeMode.label} · {selectedAccent === "custom" ? "自定义强调色" : ACCENT_OPTIONS.find((item) => item.id === selectedAccent)?.label}</span>
        </div>
        <button type="button" className="appearance-v2-reset" onClick={resetAppearance}><RotateCcw size={15} />恢复默认</button>
      </footer>
    </section>
  );
}

// Mobile bottom navigation. The sidebar stays in the DOM as the app's existing
// navigation event target, but is not shown on phone layouts.
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  CalendarDays,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Settings,
  Wrench,
} from "lucide-react";

const TABS = [
  { id: "dashboard", label: "概览", navLabel: "概览", icon: LayoutDashboard },
  { id: "schedule", label: "课表", navLabel: "课表", icon: CalendarDays },
  { id: "assignments", label: "作业", navLabel: "作业与测试", icon: CheckCircle2 },
  { id: "grades", label: "成绩", navLabel: "成绩", icon: BarChart3 },
  { id: "exams", label: "考试", navLabel: "考试", icon: BookOpen },
  { id: "tools", label: "工具", navLabel: "学习工具", icon: Wrench },
  { id: "settings", label: "设置", navLabel: "设置与接入", icon: Settings },
];

function clickSidebarButton(label: string) {
  const buttons = document.querySelectorAll<HTMLButtonElement>(".sidebar nav button");
  for (const button of buttons) {
    if (button.getAttribute("aria-label") === label || button.textContent?.trim() === label) {
      button.click();
      return true;
    }
  }
  return false;
}

export default function MobileTabBar() {
  const [active, setActive] = useState("dashboard");

  useEffect(() => {
    const check = () => {
      const buttons = document.querySelectorAll<HTMLButtonElement>(".sidebar nav button");
      for (const button of buttons) {
        if (!button.classList.contains("active")) continue;
        const navLabel = button.getAttribute("aria-label") || button.textContent?.trim();
        const tab = TABS.find((item) => item.navLabel === navLabel || item.label === navLabel);
        if (tab) setActive(tab.id);
        break;
      }
    };
    check();
    const root = document.querySelector(".app-shell") || document.body;
    const observer = new MutationObserver(check);
    observer.observe(root, { attributes: true, subtree: true, childList: true });
    return () => observer.disconnect();
  }, []);

  const handleTab = (tab: (typeof TABS)[number]) => {
    clickSidebarButton(tab.navLabel);
    setActive(tab.id);
  };

  return (
    <>
      <nav className="theia-mobile-tabbar" aria-label="主导航">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              className={"theia-mobile-tab" + (isActive ? " active" : "")}
              onClick={() => handleTab(tab)}
              aria-label={tab.label}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon size={19} aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
      <style>{`
        .theia-mobile-tabbar {
          position: fixed;
          left: 0; right: 0;
          bottom: 0;
          z-index: 150;
          display: flex;
          align-items: stretch;
          justify-content: space-around;
          height: calc(env(safe-area-inset-bottom, 0px) + 56px);
          padding: 0 2px env(safe-area-inset-bottom, 0px);
          background: color-mix(in srgb, var(--card, #fff) 92%, transparent);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          border-top: 1px solid var(--border, #e2e7ec);
        }
        .theia-mobile-tab {
          display: flex;
          flex: 1 1 0;
          min-width: 0;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2px;
          padding: 5px 1px;
          border: none;
          background: transparent;
          color: var(--muted-foreground, #687780);
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
        }
        .theia-mobile-tab.active { color: var(--primary, #176c64); }
        .theia-mobile-tab:active { transform: scale(.95); }
        .theia-mobile-tab span {
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 0;
          white-space: nowrap;
        }
        .dark .theia-mobile-tabbar {
          background: color-mix(in srgb, var(--card, #1a2230) 94%, transparent);
          border-top-color: var(--border, #2a3545);
        }
        .dark .theia-mobile-tab.active { color: var(--mobile-accent, var(--primary, #176c64)); }
        .content-area {
          padding-bottom: calc(env(safe-area-inset-bottom, 0px) + var(--mobile-bottom-v7, 64px) + 20px) !important;
        }
      `}</style>
    </>
  );
}

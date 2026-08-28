// Mobile bottom tab bar — navigates by clicking the corresponding sidebar buttons.
// Mounted in mobile-entry alongside the desktop app; doesn't modify desktop source.
import { useState, useEffect } from "react";
import { LayoutDashboard, CalendarDays, BarChart3, BookOpen, Menu } from "lucide-react";

const TABS = [
  { id: "dashboard", label: "概览", icon: LayoutDashboard },
  { id: "schedule", label: "课表", icon: CalendarDays },
  { id: "grades", label: "成绩", icon: BarChart3 },
  { id: "exams", label: "考试", icon: BookOpen },
  { id: "more", label: "更多", icon: Menu, isMenu: true },
];

function clickSidebarButton(label: string) {
  const buttons = document.querySelectorAll<HTMLButtonElement>('.sidebar nav button');
  for (const btn of buttons) {
    if (btn.textContent?.trim() === label) { btn.click(); return true; }
  }
  return false;
}

export default function MobileTabBar() {
  const [active, setActive] = useState("dashboard");

  useEffect(() => {
    const check = () => {
      const buttons = document.querySelectorAll<HTMLButtonElement>('.sidebar nav button');
      for (const btn of buttons) {
        if (btn.classList.contains('active')) {
          const text = btn.textContent?.trim();
          const tab = TABS.find((t) => t.label === text);
          if (tab) setActive(tab.id);
        }
      }
    };
    check();
    const root = document.querySelector('.app-shell') || document.body;
    const observer = new MutationObserver(check);
    observer.observe(root, { attributes: true, subtree: true, childList: true });
    return () => observer.disconnect();
  }, []);

  const handleTab = (tab: { id: string; label: string; icon: typeof LayoutDashboard; isMenu?: boolean }) => {
    if (tab.isMenu) {
      const menuBtn = document.querySelector<HTMLButtonElement>('.mobile-menu');
      if (menuBtn) { menuBtn.click(); return; }
      return;
    }
    clickSidebarButton(tab.label);
    setActive(tab.id);
  };

  return (
    <>
      <nav className="theia-mobile-tabbar">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              className={"theia-mobile-tab" + (isActive ? " active" : "")}
              onClick={() => handleTab(tab)}
              aria-label={tab.label}
            >
              <Icon size={21} />
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
          padding-bottom: env(safe-area-inset-bottom, 0px);
          background: color-mix(in srgb, var(--card, #fff) 92%, transparent);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          border-top: 1px solid var(--border, #e2e7ec);
        }
        .theia-mobile-tab {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2px;
          flex: 1;
          min-width: 0;
          padding: 6px 0;
          border: none;
          background: transparent;
          color: var(--muted-foreground, #687780);
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
        }
        .theia-mobile-tab.active { color: var(--primary, #176c64); }
        .theia-mobile-tab:active { transform: scale(.95); }
        .theia-mobile-tab span {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: .02em;
        }
        .dark .theia-mobile-tabbar {
          background: color-mix(in srgb, var(--card, #1a2230) 94%, transparent);
          border-top-color: var(--border, #2a3545);
        }
        .dark .theia-mobile-tab.active { color: #87d1c8; }
        .content-area {
          padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 120px) !important;
        }
      `}</style>
    </>
  );
}
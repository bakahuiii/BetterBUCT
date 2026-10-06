// Mobile-only floating action button: 数据包导入 + 快捷同步。
// Mounted by mobile-entry.tsx alongside the desktop App without touching
// desktop source files.
import { useState } from "react";
import { Download, RefreshCw, Upload, X } from "lucide-react";

export default function MobileActions({ bridge, onMessage }: { bridge: any; onMessage: (text: string, kind?: string) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const importDataPackage = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      setBusy(true);
      try {
        const content = await file.text();
        const result = await bridge.importDataPackage(content);
        const msg = "数据包导入成功：课表 " + (result.schedule?.length || 0) + " 条，成绩 " + (result.grades?.length || 0) + " 条";
        onMessage(msg, "success");
        setOpen(false);
      } catch (error) {
        onMessage((error as Error)?.message || "数据包导入失败", "error");
      } finally {
        setBusy(false);
      }
    });
    input.click();
  };

  const syncNow = async () => {
    setBusy(true);
    try {
      await bridge.syncNow();
      onMessage("校园数据更新完成", "success");
    } catch (error) {
      onMessage((error as Error)?.message || "同步失败", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="theia-mobile-actions">
      {open && (
        <div className="theia-mobile-action-sheet">
          <button onClick={importDataPackage} disabled={busy} aria-label="导入数据包">
            <Upload size={16} /> 导入数据包
          </button>
          <button onClick={syncNow} disabled={busy} aria-label="立即同步">
            <RefreshCw size={16} className={busy ? "spin" : ""} /> 立即同步
          </button>
          <button onClick={() => setOpen(false)} aria-label="关闭">
            <X size={16} /> 关闭
          </button>
        </div>
      )}
      <button
        className="theia-mobile-fab"
        onClick={() => setOpen((value) => !value)}
        aria-label="移动端操作"
        aria-expanded={open}
      >
        <Download size={20} />
      </button>
      <style>{`
        .theia-mobile-actions { position: fixed; right: calc(env(safe-area-inset-right, 0px) + 16px); bottom: calc(env(safe-area-inset-bottom, 0px) + 76px); z-index: 200; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
        .theia-mobile-fab { width: 52px; height: 52px; border-radius: 50%; background: var(--color-primary, #1296b6); color: #fff; display: flex; align-items: center; justify-content: center; border: none; box-shadow: 0 4px 14px rgba(0,0,0,0.35); cursor: pointer; }
        .theia-mobile-action-sheet { display: flex; flex-direction: column; gap: 6px; background: var(--color-card, #1a2233); border: 1px solid var(--color-border, #333); border-radius: 12px; padding: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.4); }
        .theia-mobile-action-sheet button { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-radius: 8px; background: transparent; color: var(--color-foreground, #eee); border: none; cursor: pointer; font-size: 14px; min-height: 40px; width: 100%; }
        .theia-mobile-action-sheet button:hover { background: var(--color-muted, #26314a); }
        .theia-mobile-action-sheet button:disabled { opacity: 0.5; }
        .spin { animation: theia-spin 0.8s linear infinite; }
      `}</style>
    </div>
  );
}

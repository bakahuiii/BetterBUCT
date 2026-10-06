import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { defaults, normalize, type GradientMap, type Personalization } from "./personalization-model";

export type { BackgroundPreset, GradientMap, Personalization } from "./personalization-model";

const STORAGE_KEY = "theia-personalization-v1";

type PersonalizationApi = {
  preferences: Personalization;
  setBackground: (background: Personalization["background"]) => void;
  setGradientMap: (partial: Partial<GradientMap>) => void;
  reset: () => void;
};

const PersonalizationContext = createContext<PersonalizationApi | null>(null);

function readPreferences(): Personalization {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const saved = raw ? JSON.parse(raw) : null;
    const preferences = normalize(saved);
    // Rewrite legacy background URLs and 3D scene settings out of storage.
    if (raw !== JSON.stringify(preferences)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    }
    return preferences;
  } catch {
    return defaults;
  }
}

function persist(value: Personalization) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // The selected appearance still applies for this session without storage.
  }
}

function colorLuminance(hex: string) {
  const value = String(hex || "").replace("#", "");
  if (!/^[0-9a-f]{6}$/iu.test(value)) return 0.35;
  const channels = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function applyPreferences(value: Personalization) {
  const root = document.documentElement;
  const accent = value.gradientMap.highlight;
  const foreground = colorLuminance(accent) > 0.52 ? "#071c31" : "#ffffff";
  root.dataset.backgroundPreset = value.background;
  // Explicitly neutralize visual state left by older releases.
  root.dataset.scenePreset = "none";
  root.dataset.appBackground = "none";
  root.dataset.gradientMap = "disabled";
  root.dataset.gradientPalette = "disabled";
  root.dataset.backgroundMotion = "disabled";
  // Keep the mobile shell on the same accent token as the desktop surfaces.
  // The mobile stylesheet has its own tokens for performance and compact
  // layouts, so updating only --primary would leave the tab bar and mobile
  // selection states on the old teal color.
  const accentSoft = `color-mix(in srgb, ${accent} 17%, var(--card))`;
  const accentStrong = `color-mix(in srgb, ${accent} 34%, var(--border))`;
  root.style.setProperty("--theme-primary", accent);
  root.style.setProperty("--teal", accent);
  root.style.setProperty("--teal-soft", accentSoft);
  root.style.setProperty("--mobile-accent", accent);
  root.style.setProperty("--mobile-accent-soft", `color-mix(in srgb, ${accent} 17%, var(--mobile-card, var(--card)))`);
  root.style.setProperty("--primary", accent);
  root.style.setProperty("--accent", accentSoft);
  root.style.setProperty("--accent-foreground", accent);
  root.style.setProperty("--ring", accent);
  root.style.setProperty("--sidebar-primary", accent);
  root.style.setProperty("--sidebar-ring", accentStrong);
  root.style.setProperty("--primary-foreground", foreground);
  root.style.setProperty("--sidebar-primary-foreground", foreground);
  root.style.setProperty("--theia-accent-color", accent);
  for (const property of [
    "--theia-app-background-image",
    "--theia-app-background-texture-image",
    "--theia-background-image-blur",
    "--theia-background-glass-blur",
    "--theia-background-image-opacity",
    "--theia-background-image-opacity-dark",
    "--theia-background-image-brightness",
    "--theia-background-image-contrast",
    "--theia-background-image-saturation",
    "--theia-background-workspace-opacity",
    "--theia-background-sidebar-opacity",
    "--theia-background-topbar-opacity",
    "--theia-background-surface-opacity",
    "--theia-background-surface-strong-opacity",
    "--theia-background-control-opacity",
    "--theia-background-zoom",
    "--theia-background-offset-x",
    "--theia-background-offset-y",
    "--theia-classical-texture-opacity",
    "--theia-classical-texture-height",
  ]) root.style.removeProperty(property);
}

function usePersonalizationState(): PersonalizationApi {
  const [preferences, setPreferences] = useState<Personalization>(readPreferences);
  const update = useCallback((partial: Partial<Personalization>) => {
    setPreferences((current) => {
      const next = normalize({ ...current, ...partial });
      persist(next);
      return next;
    });
  }, []);

  useEffect(() => {
    applyPreferences(preferences);
  }, [preferences]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      try {
        setPreferences(normalize(event.newValue ? JSON.parse(event.newValue) : null));
      } catch {
        setPreferences(defaults);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setBackground = useCallback((background: Personalization["background"]) => update({ background }), [update]);
  const setGradientMap = useCallback((partial: Partial<GradientMap>) => {
    setPreferences((current) => {
      const next = normalize({ ...current, gradientMap: { ...current.gradientMap, ...partial } });
      persist(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    const next = normalize(defaults);
    persist(next);
    setPreferences(next);
  }, []);

  return { preferences, setBackground, setGradientMap, reset };
}

export function PersonalizationProvider({ children }: { children: ReactNode }) {
  const value = usePersonalizationState();
  return createElement(PersonalizationContext.Provider, { value }, children);
}

export function usePersonalization() {
  const context = useContext(PersonalizationContext);
  if (!context) throw new Error("usePersonalization must be used inside PersonalizationProvider");
  return context;
}
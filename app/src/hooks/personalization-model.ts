export type BackgroundPreset = "slate" | "graphite" | "indigo" | "warm" | "paper";

/** Accent colors retained for the lightweight, image-free appearance settings. */
export type GradientMap = {
  shadow: string;
  highlight: string;
};

export type Personalization = {
  background: BackgroundPreset;
  gradientMap: GradientMap;
};

export const defaults: Personalization = {
  background: "slate",
  gradientMap: {
    shadow: "#080d1b",
    highlight: "#244a9a",
  },
};

function normalizeColor(value: unknown, fallback: string): string {
  const raw = String(value ?? "").trim();
  const candidate = raw.startsWith("#") ? raw : `#${raw}`;
  return /^#[0-9a-f]{6}$/iu.test(candidate) ? candidate.toLowerCase() : fallback;
}

export function normalize(value: unknown): Personalization {
  const saved = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  const savedColors = saved.gradientMap && typeof saved.gradientMap === "object"
    ? saved.gradientMap as Record<string, unknown>
    : {};
  const background = saved.background === "graphite" || saved.background === "indigo" || saved.background === "warm" || saved.background === "paper"
    ? saved.background
    : "slate";
  return {
    background,
    // Older releases saved image URLs, background effects and scene choices.
    // Deliberately drop them so upgrades never try to reload removed assets.
    gradientMap: {
      shadow: normalizeColor(savedColors.shadow, defaults.gradientMap.shadow),
      highlight: normalizeColor(savedColors.highlight, defaults.gradientMap.highlight),
    },
  };
}
/**
 * Balloon Quest 3D — VISUAL PREVIEW configuration. Pure data only: no session
 * engine, scoring, Firebase or sensor code. The real 3x3 progression belongs
 * to B3; these are demo parameters for inspecting the design.
 */

export type PreviewColor = "red" | "blue" | "green" | "yellow" | "purple" | "black" | "white";
export type PreviewMode = "easy" | "medium" | "advanced";
export type PreviewSymbol = "star" | "dot" | "triangle" | "square" | "diamond" | "plus" | "heart";

export interface PreviewColorDef {
  nameAr: string;
  /** Definite form for the instruction sentence: المس البالون ___ */
  adjectiveAr: string;
  light: string;
  base: string;
  dark: string;
  symbol: PreviewSymbol;
  /** Body outline, so pale/dark balloons stay readable against the sky. */
  outline: string;
  outlineWidth: number;
  /** Optional light halo drawn under the body (black balloon). */
  halo?: string;
  symbolFill: string;
  symbolStroke: string;
  /** Pop-particle colour. */
  particle: string;
}

export const PREVIEW_COLORS: Record<PreviewColor, PreviewColorDef> = {
  red: { nameAr: "أحمر", adjectiveAr: "الأحمر", light: "#FF8A8D", base: "#E5484D", dark: "#9F1F2B", symbol: "star", outline: "#8E1C28", outlineWidth: 1.6, symbolFill: "#fff", symbolStroke: "#9F1F2B", particle: "#FF8A8D" },
  blue: { nameAr: "أزرق", adjectiveAr: "الأزرق", light: "#7DB2FF", base: "#2F6FEA", dark: "#173F9A", symbol: "dot", outline: "#143786", outlineWidth: 1.6, symbolFill: "#fff", symbolStroke: "#173F9A", particle: "#7DB2FF" },
  green: { nameAr: "أخضر", adjectiveAr: "الأخضر", light: "#7BE0A5", base: "#2DB36A", dark: "#157245", symbol: "triangle", outline: "#0F6038", outlineWidth: 1.6, symbolFill: "#fff", symbolStroke: "#157245", particle: "#7BE0A5" },
  yellow: { nameAr: "أصفر", adjectiveAr: "الأصفر", light: "#FFE58A", base: "#F7C531", dark: "#C58A0B", symbol: "square", outline: "#A87208", outlineWidth: 1.6, symbolFill: "#fff", symbolStroke: "#A87208", particle: "#FFE58A" },
  purple: { nameAr: "بنفسجي", adjectiveAr: "البنفسجي", light: "#C3A2FF", base: "#8E5BE8", dark: "#53299E", symbol: "diamond", outline: "#47208A", outlineWidth: 1.6, symbolFill: "#fff", symbolStroke: "#53299E", particle: "#C3A2FF" },
  black: { nameAr: "أسود", adjectiveAr: "الأسود", light: "#6F7886", base: "#262B34", dark: "#0A0C10", symbol: "plus", outline: "#05070A", outlineWidth: 2, halo: "rgba(255,255,255,0.92)", symbolFill: "#fff", symbolStroke: "rgba(255,255,255,0.5)", particle: "#4A5262" },
  white: { nameAr: "أبيض", adjectiveAr: "الأبيض", light: "#FFFFFF", base: "#F3F6FA", dark: "#B4BFCF", symbol: "heart", outline: "#54667F", outlineWidth: 2.4, symbolFill: "#34465F", symbolStroke: "none", particle: "#8FA2BC" },
};

export const PREVIEW_COLOR_ORDER = Object.keys(PREVIEW_COLORS) as PreviewColor[];

export interface PreviewModeConfig {
  mode: PreviewMode;
  labelAr: string;
  labelEn: string;
  /** Balloon width in cqh (1% of stage height). */
  sizeCqh: number;
  rising: boolean;
  goalTotal: number;
  palette: PreviewColor[];
  /** Balloons in play at once (for rising modes this includes ones still travelling in from below). */
  activeCount: number;
  /** Seconds for a balloon to travel from below the bottom edge to above the top edge (rising modes). */
  riseSeconds: number;
}

export const PREVIEW_MODES: Record<PreviewMode, PreviewModeConfig> = {
  easy: {
    mode: "easy",
    labelAr: "سهل",
    labelEn: "Easy",
    sizeCqh: 21.5,
    rising: false,
    goalTotal: 3,
    palette: ["red", "blue", "yellow"],
    activeCount: 6,
    riseSeconds: 0,
  },
  medium: {
    mode: "medium",
    labelAr: "متوسط",
    labelEn: "Medium",
    sizeCqh: 17,
    rising: true,
    goalTotal: 4,
    palette: ["red", "blue", "green", "yellow", "purple"],
    activeCount: 7,
    riseSeconds: 40,
  },
  advanced: {
    mode: "advanced",
    labelAr: "متقدم",
    labelEn: "Advanced",
    sizeCqh: 14.5,
    rising: true,
    goalTotal: 5,
    palette: ["black", "white", "green", "blue", "yellow", "red", "purple"],
    activeCount: 8,
    riseSeconds: 30,
  },
};

export const PREVIEW_MODE_ORDER: PreviewMode[] = ["easy", "medium", "advanced"];

export function parsePreviewMode(value: string | undefined): PreviewMode {
  return value === "medium" || value === "advanced" ? value : "easy";
}

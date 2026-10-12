import type { BalloonColor } from "./types";

export type BalloonSymbol = "star" | "dot" | "triangle" | "square" | "diamond" | "plus" | "heart";

export interface BalloonColorDef {
  nameAr: string;
  /** Definite form: المس البالون ___ */
  adjectiveAr: string;
  light: string;
  base: string;
  dark: string;
  symbol: BalloonSymbol;
  outline: string;
  outlineWidth: number;
  halo?: string;
  symbolFill: string;
  symbolStroke: string;
  particle: string;
}

export const BALLOON_COLOR_DEFS: Record<BalloonColor, BalloonColorDef> = {
  red: { nameAr: "أحمر", adjectiveAr: "الأحمر", light: "#FF8A8D", base: "#E5484D", dark: "#9F1F2B", symbol: "star", outline: "#8E1C28", outlineWidth: 1.6, symbolFill: "#fff", symbolStroke: "#9F1F2B", particle: "#FF8A8D" },
  blue: { nameAr: "أزرق", adjectiveAr: "الأزرق", light: "#7DB2FF", base: "#2F6FEA", dark: "#173F9A", symbol: "dot", outline: "#143786", outlineWidth: 1.6, symbolFill: "#fff", symbolStroke: "#173F9A", particle: "#7DB2FF" },
  green: { nameAr: "أخضر", adjectiveAr: "الأخضر", light: "#7BE0A5", base: "#2DB36A", dark: "#157245", symbol: "triangle", outline: "#0F6038", outlineWidth: 1.6, symbolFill: "#fff", symbolStroke: "#157245", particle: "#7BE0A5" },
  yellow: { nameAr: "أصفر", adjectiveAr: "الأصفر", light: "#FFE58A", base: "#F7C531", dark: "#C58A0B", symbol: "square", outline: "#A87208", outlineWidth: 1.6, symbolFill: "#fff", symbolStroke: "#A87208", particle: "#FFE58A" },
  purple: { nameAr: "بنفسجي", adjectiveAr: "البنفسجي", light: "#C3A2FF", base: "#8E5BE8", dark: "#53299E", symbol: "diamond", outline: "#47208A", outlineWidth: 1.6, symbolFill: "#fff", symbolStroke: "#53299E", particle: "#C3A2FF" },
  black: { nameAr: "أسود", adjectiveAr: "الأسود", light: "#6F7886", base: "#262B34", dark: "#0A0C10", symbol: "plus", outline: "#05070A", outlineWidth: 2, halo: "rgba(255,255,255,0.92)", symbolFill: "#fff", symbolStroke: "rgba(255,255,255,0.5)", particle: "#4A5262" },
  white: { nameAr: "أبيض", adjectiveAr: "الأبيض", light: "#FFFFFF", base: "#F3F6FA", dark: "#B4BFCF", symbol: "heart", outline: "#54667F", outlineWidth: 2.4, symbolFill: "#34465F", symbolStroke: "none", particle: "#8FA2BC" },
};

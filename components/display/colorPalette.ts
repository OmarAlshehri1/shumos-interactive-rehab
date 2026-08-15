import { BalloonColor } from "@/lib/game";

/**
 * Presentation-only color and Arabic-copy mapping for balloons. Deliberately
 * kept out of lib/game: the engine only knows the abstract BalloonColor enum,
 * never a hex value or a translated word.
 *
 * Balloon hues are kept moderately saturated so they visually pop forward
 * against the more desaturated, pastel environment behind them (a classic
 * depth-through-saturation illustration technique) while staying a
 * cohesive, non-neon set.
 */
export interface BalloonColorTheme {
  light: string;
  base: string;
  dark: string;
  /** Arabic name of the color, indefinite masculine form (e.g. "أزرق"). */
  nameAr: string;
  /** Arabic name with the definite article, agreeing with masculine "اللون" (e.g. "الأزرق", for "اللون الأزرق"). */
  definiteNameAr: string;
  /** Arabic feminine-singular adjective agreement for "البالونات" (e.g. "الزرقاء"). */
  adjectiveAr: string;
}

export const BALLOON_COLOR_THEME: Record<BalloonColor, BalloonColorTheme> = {
  [BalloonColor.RED]: {
    light: "#FF9AA2",
    base: "#F2555A",
    dark: "#D6363C",
    nameAr: "أحمر",
    definiteNameAr: "الأحمر",
    adjectiveAr: "الحمراء",
  },
  [BalloonColor.BLUE]: {
    light: "#8FC1FF",
    base: "#3E8EF7",
    dark: "#2563C9",
    nameAr: "أزرق",
    definiteNameAr: "الأزرق",
    adjectiveAr: "الزرقاء",
  },
  [BalloonColor.GREEN]: {
    light: "#9AEFC4",
    base: "#3DD68C",
    dark: "#1FA968",
    nameAr: "أخضر",
    definiteNameAr: "الأخضر",
    adjectiveAr: "الخضراء",
  },
  [BalloonColor.YELLOW]: {
    light: "#FFE29A",
    base: "#FFC94A",
    dark: "#E8A722",
    nameAr: "أصفر",
    definiteNameAr: "الأصفر",
    adjectiveAr: "الصفراء",
  },
  [BalloonColor.PURPLE]: {
    light: "#D3B3FF",
    base: "#A66DF2",
    dark: "#7C4CC7",
    nameAr: "بنفسجي",
    definiteNameAr: "البنفسجي",
    adjectiveAr: "البنفسجية",
  },
  [BalloonColor.ORANGE]: {
    light: "#FFC499",
    base: "#FF9752",
    dark: "#E5751F",
    nameAr: "برتقالي",
    definiteNameAr: "البرتقالي",
    adjectiveAr: "البرتقالية",
  },
};

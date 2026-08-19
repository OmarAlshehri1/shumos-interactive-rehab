import { BubbleColor, BubbleShape } from "@/lib/bubblepop";

/**
 * Display-local color constants — deliberately duplicated rather than
 * imported from components/control/bubblepop/copy.ts, same "display never
 * depends on the control UI layer" convention lib/audio/bubblePopVoiceLines.ts
 * and BubbleArt.tsx's own local COLOR_HEX already follow.
 */
export const BUBBLE_COLOR_HEX: Record<BubbleColor, string> = {
  [BubbleColor.RED]: "#F2555A",
  [BubbleColor.BLUE]: "#3B9FE0",
  [BubbleColor.YELLOW]: "#F2C94C",
  [BubbleColor.GREEN]: "#3DC98A",
  [BubbleColor.PURPLE]: "#9B7BE0",
  [BubbleColor.ORANGE]: "#F2924C",
  [BubbleColor.PINK]: "#F0629B",
};

export const BUBBLE_COLOR_NAME_AR: Record<BubbleColor, string> = {
  [BubbleColor.RED]: "الحمراء",
  [BubbleColor.BLUE]: "الزرقاء",
  [BubbleColor.YELLOW]: "الصفراء",
  [BubbleColor.GREEN]: "الخضراء",
  [BubbleColor.PURPLE]: "البنفسجية",
  [BubbleColor.ORANGE]: "البرتقالية",
  [BubbleColor.PINK]: "الزهرية",
};

/** Indefinite Arabic shape names for spoken/visible mission phrasing (task Part G — "نجمة زرقاء", "قلب أصفر"). */
export const BUBBLE_SHAPE_NAME_AR: Record<BubbleShape, string> = {
  [BubbleShape.CIRCLE]: "دائرة",
  [BubbleShape.STAR]: "نجمة",
  [BubbleShape.HEART]: "قلب",
  [BubbleShape.TRIANGLE]: "مثلث",
  [BubbleShape.DIAMOND]: "معين",
};

/** Grammatical gender of each shape noun — "نجمة"/"دائرة" are feminine, "قلب"/"مثلث"/"معين" are masculine. Needed so the color adjective that follows agrees correctly (task Part G's exact examples mix both: "نجمة زرقاء" (f) vs "قلب أصفر" (m)). */
const SHAPE_GENDER: Record<BubbleShape, "M" | "F"> = {
  [BubbleShape.CIRCLE]: "F",
  [BubbleShape.STAR]: "F",
  [BubbleShape.HEART]: "M",
  [BubbleShape.TRIANGLE]: "M",
  [BubbleShape.DIAMOND]: "M",
};

/** Masculine/feminine indefinite adjective forms for a color — masculine matches task Part C's plain spoken color cue ("أزرق", "أصفر", "وردي"...) exactly; feminine is used only when paired with a feminine shape noun. */
const COLOR_ADJECTIVE_AR: Record<BubbleColor, { M: string; F: string }> = {
  [BubbleColor.RED]: { M: "أحمر", F: "حمراء" },
  [BubbleColor.BLUE]: { M: "أزرق", F: "زرقاء" },
  [BubbleColor.YELLOW]: { M: "أصفر", F: "صفراء" },
  [BubbleColor.GREEN]: { M: "أخضر", F: "خضراء" },
  [BubbleColor.PURPLE]: { M: "بنفسجي", F: "بنفسجية" },
  [BubbleColor.ORANGE]: { M: "برتقالي", F: "برتقالية" },
  [BubbleColor.PINK]: { M: "وردي", F: "وردية" },
};

/** The short spoken/visible color-only cue (task Part C — "أزرق", not "فرقع الفقاعة الزرقاء"). */
export function bubbleColorOnlyCueAr(color: BubbleColor): string {
  return COLOR_ADJECTIVE_AR[color].M;
}

/** "شكل + لون" with correct gender agreement (task Part G's exact examples). */
export function bubbleColorShapeCueAr(color: BubbleColor, shape: BubbleShape): string {
  return `${BUBBLE_SHAPE_NAME_AR[shape]} ${COLOR_ADJECTIVE_AR[color][SHAPE_GENDER[shape]]}`;
}

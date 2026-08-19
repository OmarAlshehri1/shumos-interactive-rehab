import { BubbleColor, BubbleShape, BubbleSize, ReachHeight, ReachSide, TargetMode } from "@/lib/bubblepop";

export const BUBBLE_SIZE_LABELS: Record<BubbleSize, string> = {
  [BubbleSize.LARGE]: "كبيرة",
  [BubbleSize.MEDIUM]: "متوسطة",
  [BubbleSize.SMALL]: "صغيرة",
};

export const REACH_HEIGHT_LABELS: Record<ReachHeight, string> = {
  [ReachHeight.LOW]: "منخفض",
  [ReachHeight.MEDIUM]: "متوسط",
  [ReachHeight.HIGH]: "مرتفع",
  [ReachHeight.FULL]: "كامل الجدار",
};

export const REACH_SIDE_LABELS: Record<ReachSide, string> = {
  [ReachSide.LEFT]: "يسار",
  [ReachSide.RIGHT]: "يمين",
  [ReachSide.FULL]: "كامل الجدار",
};

export const TARGET_MODE_LABELS: Record<TargetMode, string> = {
  [TargetMode.COLOR_ONLY]: "ألوان فقط",
  [TargetMode.COLOR_AND_SHAPE]: "ألوان وأشكال",
};

/** Definite-article Arabic color names, for "فرقع الفقاعة {اللون}!" instruction phrasing — same role as Balloon Quest's BALLOON_COLOR_THEME.definiteNameAr. */
export const BUBBLE_COLOR_NAME_AR: Record<BubbleColor, string> = {
  [BubbleColor.RED]: "الحمراء",
  [BubbleColor.BLUE]: "الزرقاء",
  [BubbleColor.YELLOW]: "الصفراء",
  [BubbleColor.GREEN]: "الخضراء",
  [BubbleColor.PURPLE]: "البنفسجية",
  [BubbleColor.ORANGE]: "البرتقالية",
  [BubbleColor.PINK]: "الزهرية",
};

/** Bubble base hex color — the child-facing gameplay swatch, kept separate from any therapist-only palette so the two can vary independently. */
export const BUBBLE_COLOR_HEX: Record<BubbleColor, string> = {
  [BubbleColor.RED]: "#F2555A",
  [BubbleColor.BLUE]: "#3B9FE0",
  [BubbleColor.YELLOW]: "#F2C94C",
  [BubbleColor.GREEN]: "#3DC98A",
  [BubbleColor.PURPLE]: "#9B7BE0",
  [BubbleColor.ORANGE]: "#F2924C",
  [BubbleColor.PINK]: "#F0629B",
};

export const BUBBLE_SHAPE_NAME_AR: Record<BubbleShape, string> = {
  [BubbleShape.CIRCLE]: "دائرة",
  [BubbleShape.STAR]: "نجمة",
  [BubbleShape.HEART]: "قلب",
  [BubbleShape.TRIANGLE]: "مثلث",
  [BubbleShape.DIAMOND]: "معين",
};

/** متوسط زمن الاستجابة المسجل — same "honest interaction-timing, not clinical" framing as the other two games' formatters. */
export function formatResponseTimeSeconds(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return "—";
  return `${(ms / 1000).toFixed(1)} ث`;
}

export function formatCompletionPercent(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate) || rate < 0 || rate > 1) return "—";
  return `${Math.round(rate * 100)}%`;
}

export function formatAccuracyPercent(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate) || rate < 0 || rate > 1) return "—";
  return `${Math.round(rate * 100)}%`;
}

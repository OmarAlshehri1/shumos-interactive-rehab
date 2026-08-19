import { Animal, Food, FoodSize, MovementPattern, ReachHeight, ReachSide } from "@/lib/feedanimals";

export const FOOD_SIZE_LABELS: Record<FoodSize, string> = {
  [FoodSize.LARGE]: "كبيرة",
  [FoodSize.MEDIUM]: "متوسطة",
  [FoodSize.SMALL]: "صغيرة",
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

/** Task section 15 — presented only as a layout option, never as "cross-midline therapy" in any user-facing string. */
export const MOVEMENT_PATTERN_LABELS: Record<MovementPattern, string> = {
  [MovementPattern.CENTRAL]: "مركزي",
  [MovementPattern.VARIED]: "متنوع",
  [MovementPattern.CROSS]: "متقاطع",
};

export const ANIMAL_NAME_AR: Record<Animal, string> = {
  [Animal.MONKEY]: "القرد",
  [Animal.RABBIT]: "الأرنب",
  [Animal.PANDA]: "الباندا",
  [Animal.ELEPHANT]: "الفيل",
  [Animal.GIRAFFE]: "الزرافة",
};

export const FOOD_NAME_AR: Record<Food, string> = {
  [Food.BANANA]: "الموزة",
  [Food.CARROT]: "الجزرة",
  [Food.BAMBOO]: "الخيزران",
  [Food.WATERMELON]: "البطيخة",
  [Food.LEAVES]: "الأوراق",
};

/** متوسط زمن الاستجابة المسجل — same "honest interaction-timing, not clinical" framing as the other games' formatters. */
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

import { Difficulty, PlayArea, TargetSize, TargetSpacing } from "@/lib/game";

export const DIFFICULTY_LABELS: Record<Difficulty, { name: string; description: string }> = {
  [Difficulty.EASY]: { name: "سهل", description: "أهداف أكبر وألوان أقل" },
  [Difficulty.MEDIUM]: { name: "متوسط", description: "تحدٍ متوازن وحركة أكثر" },
  [Difficulty.ADVANCED]: { name: "متقدم", description: "أهداف أكثر وتوزيع أوسع" },
};

export const TARGET_SIZE_LABELS: Record<TargetSize, string> = {
  [TargetSize.LARGE]: "كبير",
  [TargetSize.MEDIUM]: "متوسط",
  [TargetSize.SMALL]: "صغير",
};

export const TARGET_SPACING_LABELS: Record<TargetSpacing, string> = {
  [TargetSpacing.CLOSE]: "قريبة",
  [TargetSpacing.MEDIUM]: "متوسطة",
  [TargetSpacing.WIDE]: "واسعة",
};

export const PLAY_AREA_LABELS: Record<PlayArea, string> = {
  [PlayArea.FULL]: "كامل المساحة",
  [PlayArea.LEFT]: "اليسار",
  [PlayArea.RIGHT]: "اليمين",
  [PlayArea.FRONT]: "الأمام",
};

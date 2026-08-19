import { Difficulty, type StageNumber } from "@/lib/game";

/**
 * THERAPIST SETUP SIMPLIFICATION — human-readable Stage Card copy per
 * (difficulty, stage). Hand-authored, not derived from the blueprint
 * numbers at runtime (Arabic wording needs a human's judgment call), but
 * validated against lib/game/difficultyRules.ts by
 * lib/control/__tests__/stagePreset.test.ts: the blueprint's totalBalloons
 * strictly increases and baseSize strictly decreases across every
 * difficulty's 5 stages, which is exactly the progression this copy
 * describes — so this table can't silently contradict the engine.
 */
export interface StageCopyEntry {
  title: string;
  description: string;
  characteristics: readonly [string, string, string];
}

export const STAGE_COPY: Record<Difficulty, readonly [StageCopyEntry, StageCopyEntry, StageCopyEntry, StageCopyEntry, StageCopyEntry]> = {
  [Difficulty.EASY]: [
    { title: "بداية هادئة", description: "بداية بسيطة ومريحة للطفل", characteristics: ["4 بالونات", "أهداف كبيرة", "توزيع بسيط"] },
    { title: "خطوة إضافية", description: "بالون إضافي بنفس البساطة", characteristics: ["5 بالونات", "أهداف كبيرة", "توزيع بسيط"] },
    { title: "تقدم لطيف", description: "تنوع ألوان أكبر قليلاً", characteristics: ["6 بالونات", "3 ألوان", "مساحة أوسع قليلاً"] },
    { title: "ثقة أكبر", description: "مساحة أوسع لحركة أكثر", characteristics: ["7 بالونات", "أهداف واضحة", "توزيع متوازن"] },
    { title: "إنجاز جميل", description: "أعلى مستوى في السهل", characteristics: ["8 بالونات", "4 ألوان", "أوسع توزيع في هذا المستوى"] },
  ],
  [Difficulty.MEDIUM]: [
    { title: "بداية متوسطة", description: "تحدٍ متوازن للبداية", characteristics: ["8 بالونات", "أهداف متوسطة", "3 ألوان"] },
    { title: "تحدٍ متصاعد", description: "بالونات وألوان أكثر", characteristics: ["9 بالونات", "4 ألوان", "مسافات متوسطة"] },
    { title: "تحدٍ متوسط", description: "توزيع أوسع وألوان متنوعة", characteristics: ["10 بالونات", "ألوان متنوعة", "توزيع أوسع"] },
    { title: "تركيز أعلى", description: "مساحة أكبر تتطلب تركيزًا", characteristics: ["11 بالون", "5 ألوان", "مساحة أكبر"] },
    { title: "ذروة المتوسط", description: "أعلى مستوى في المتوسط", characteristics: ["12 بالون", "أهداف أدق", "توزيع واسع"] },
  ],
  [Difficulty.ADVANCED]: [
    { title: "بداية التحدي", description: "بداية المستوى المتقدم", characteristics: ["12 بالون", "أهداف أصغر", "5 ألوان"] },
    { title: "تركيز مكثف", description: "توزيع أوسع وتمييز أدق", characteristics: ["13 بالون", "توزيع أوسع", "تمييز أدق"] },
    { title: "تحدٍ متقدم", description: "ألوان أكثر ومساحة واسعة", characteristics: ["14 بالون", "6 ألوان", "مساحة واسعة"] },
    { title: "أهداف أكثر", description: "أهداف أكثر تحتاج تمييزًا دقيقًا", characteristics: ["15 بالون", "4 أهداف", "تمييز أدق"] },
    { title: "تحدٍ أكبر", description: "أعلى مستوى تحدٍ في اللعبة", characteristics: ["16 بالون", "أهداف أصغر", "أوسع مساحة"] },
  ],
};

export function getStageCopy(difficulty: Difficulty, stageNumber: StageNumber): StageCopyEntry {
  return STAGE_COPY[difficulty][stageNumber - 1];
}

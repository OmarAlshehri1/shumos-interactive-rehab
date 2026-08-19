import { ChaseColor as C, Difficulty as D, type ColorChaseStagePlan, type ColorChaseStepPlan, type PadId, type StageNumber } from "./types";

const step = (targetColor: C, correctPadId: PadId, distractors: ColorChaseStepPlan["distractors"] = []): ColorChaseStepPlan => ({
  targetColor,
  correctPadId,
  distractors,
});
const d = (padId: PadId, color: C) => ({ padId, color });
const plan = (
  difficulty: D,
  stageNumber: StageNumber,
  titleAr: string,
  instructionAr: string,
  steps: readonly ColorChaseStepPlan[],
  dangerPadIds: readonly PadId[] = [],
): ColorChaseStagePlan => ({ difficulty, stageNumber, titleAr, instructionAr, steps, dangerPadIds });

const EASY = [
  plan(D.EASY, 1, "البداية الزرقاء", "اجمع الأزرق مرتين", [step(C.BLUE, "PAD_5"), step(C.BLUE, "PAD_6")]),
  plan(D.EASY, 2, "ثلاث خطوات زرقاء", "اجمع الأزرق ثلاث مرات", [step(C.BLUE, "PAD_4"), step(C.BLUE, "PAD_5"), step(C.BLUE, "PAD_6")]),
  plan(D.EASY, 3, "طريق أخضر", "اجمع الأخضر ثلاث مرات", [step(C.GREEN, "PAD_2"), step(C.GREEN, "PAD_5"), step(C.GREEN, "PAD_8")]),
  plan(D.EASY, 4, "لونان", "اجمع الأزرق ثم الأصفر", [step(C.BLUE, "PAD_4"), step(C.BLUE, "PAD_5"), step(C.YELLOW, "PAD_8"), step(C.YELLOW, "PAD_9")]),
  plan(D.EASY, 5, "رحلة الألوان", "اجمع الوردي ثم الأخضر", [step(C.PINK, "PAD_1"), step(C.PINK, "PAD_5"), step(C.GREEN, "PAD_9"), step(C.GREEN, "PAD_6")]),
] as const;

const MEDIUM = [
  plan(D.MEDIUM, 1, "اختر الأزرق", "اختر اللون الأزرق", [step(C.BLUE, "PAD_4", [d("PAD_6", C.PINK)]), step(C.BLUE, "PAD_5", [d("PAD_8", C.YELLOW)]), step(C.BLUE, "PAD_2", [d("PAD_3", C.GREEN)])]),
  plan(D.MEDIUM, 2, "اختيار أبعد", "اختر اللون الأصفر", [step(C.YELLOW, "PAD_1", [d("PAD_2", C.RED)]), step(C.YELLOW, "PAD_5", [d("PAD_6", C.PURPLE)]), step(C.YELLOW, "PAD_9", [d("PAD_8", C.BLUE)]), step(C.YELLOW, "PAD_6", [d("PAD_3", C.PINK)])]),
  plan(D.MEDIUM, 3, "ثلاثة اختيارات", "اختر اللون الأخضر", [step(C.GREEN, "PAD_2", [d("PAD_1", C.BLUE), d("PAD_3", C.RED)]), step(C.GREEN, "PAD_5", [d("PAD_4", C.PINK), d("PAD_6", C.YELLOW)]), step(C.GREEN, "PAD_8", [d("PAD_7", C.PURPLE), d("PAD_9", C.BLUE)])]),
  plan(D.MEDIUM, 4, "تتابع لونين", "أزرق ثم أصفر", [step(C.BLUE, "PAD_4", [d("PAD_6", C.RED)]), step(C.BLUE, "PAD_1", [d("PAD_2", C.GREEN)]), step(C.YELLOW, "PAD_5", [d("PAD_8", C.PINK)]), step(C.YELLOW, "PAD_9", [d("PAD_7", C.PURPLE)])]),
  plan(D.MEDIUM, 5, "رحلة الاختيار", "وردي ثم أخضر ثم أزرق", [step(C.PINK, "PAD_1", [d("PAD_2", C.YELLOW), d("PAD_4", C.BLUE)]), step(C.GREEN, "PAD_5", [d("PAD_3", C.RED), d("PAD_6", C.PURPLE)]), step(C.BLUE, "PAD_9", [d("PAD_7", C.PINK), d("PAD_8", C.YELLOW)]), step(C.PINK, "PAD_6", [d("PAD_2", C.GREEN), d("PAD_3", C.RED)]), step(C.GREEN, "PAD_4", [d("PAD_7", C.BLUE), d("PAD_8", C.PURPLE)])]),
] as const;

const ADVANCED = [
  plan(D.ADVANCED, 1, "مهمة آمنة", "أزرق ثم أصفر ثم أحمر", [step(C.BLUE, "PAD_1", [d("PAD_2", C.GREEN)]), step(C.YELLOW, "PAD_4", [d("PAD_5", C.PINK)]), step(C.RED, "PAD_7", [d("PAD_8", C.PURPLE)])], ["PAD_9"]),
  plan(D.ADVANCED, 2, "لونان ومنطقة خطر", "أزرق ثم أصفر", [step(C.BLUE, "PAD_2", [d("PAD_3", C.RED)]), step(C.YELLOW, "PAD_5", [d("PAD_6", C.PINK)]), step(C.BLUE, "PAD_8", [d("PAD_7", C.GREEN)]), step(C.YELLOW, "PAD_4", [d("PAD_1", C.PURPLE)])], ["PAD_9"]),
  plan(D.ADVANCED, 3, "سلسلة الألوان", "أخضر ثم وردي ثم أزرق", [step(C.GREEN, "PAD_1", [d("PAD_2", C.YELLOW), d("PAD_4", C.RED)]), step(C.PINK, "PAD_5", [d("PAD_2", C.PURPLE), d("PAD_6", C.GREEN)]), step(C.BLUE, "PAD_8", [d("PAD_7", C.PINK), d("PAD_9", C.YELLOW)]), step(C.GREEN, "PAD_4", [d("PAD_5", C.RED), d("PAD_7", C.BLUE)])], ["PAD_3"]),
  plan(D.ADVANCED, 4, "عبور المناطق", "أصفر ثم أحمر ثم أخضر", [step(C.YELLOW, "PAD_1", [d("PAD_2", C.BLUE)]), step(C.RED, "PAD_4", [d("PAD_5", C.PINK)]), step(C.GREEN, "PAD_7", [d("PAD_8", C.YELLOW)]), step(C.YELLOW, "PAD_8", [d("PAD_5", C.PURPLE)]), step(C.RED, "PAD_5", [d("PAD_2", C.GREEN)])], ["PAD_3", "PAD_9"]),
  plan(D.ADVANCED, 5, "مطاردة الألوان الكبرى", "أزرق ثم أصفر ثم أحمر", [step(C.BLUE, "PAD_1", [d("PAD_2", C.PINK), d("PAD_4", C.GREEN)]), step(C.YELLOW, "PAD_5", [d("PAD_4", C.RED), d("PAD_8", C.PURPLE)]), step(C.RED, "PAD_7", [d("PAD_4", C.BLUE), d("PAD_8", C.YELLOW)]), step(C.BLUE, "PAD_8", [d("PAD_5", C.PINK), d("PAD_7", C.GREEN)]), step(C.YELLOW, "PAD_4", [d("PAD_1", C.PURPLE), d("PAD_5", C.RED)]), step(C.RED, "PAD_2", [d("PAD_1", C.GREEN), d("PAD_5", C.BLUE)])], ["PAD_3", "PAD_9"]),
] as const;

const PLANS: Record<D, readonly ColorChaseStagePlan[]> = { [D.EASY]: EASY, [D.MEDIUM]: MEDIUM, [D.ADVANCED]: ADVANCED };

export function getColorChaseStagePlan(difficulty: D, stageNumber: StageNumber): ColorChaseStagePlan {
  return PLANS[difficulty][stageNumber - 1];
}

export function allColorChaseStagePlans(): readonly ColorChaseStagePlan[] {
  return [...EASY, ...MEDIUM, ...ADVANCED];
}

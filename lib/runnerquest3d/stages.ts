import type { Difficulty, EncounterKind, StageNumber, StageSpec } from "./types";

const S = (index: number, difficulty: Difficulty, stage: StageNumber, titleAr: string, objectiveAr: string, rest: Omit<StageSpec, "index" | "difficulty" | "stage" | "titleAr" | "objectiveAr" | "usesHurdles">): StageSpec => ({
  index, difficulty, stage, titleAr, objectiveAr, ...rest, usesHurdles: rest.kinds.includes("hurdle"),
});
const k = (...kinds: EncounterKind[]) => kinds;

/** Exactly nine stages: three difficulties x three stages. Pure data. */
export const STAGES: readonly StageSpec[] = [
  // EASY — learn directions. No foot lift.
  S(0, "easy", 1, "الخطوات الأولى", "تحرّك يمينًا ويسارًا لتتجاوز الصخور الكبيرة.", { length: 0, baseGap: 26, count: 6, kinds: k("side"), theme: "meadow" }),
  S(1, "easy", 2, "اختر المسار", "اختر المسار المضيء من بين ثلاثة مسارات آمنة.", { length: 0, baseGap: 26, count: 6, kinds: k("gate"), theme: "garden" }),
  S(2, "easy", 3, "تجنّب بلطف", "تجنّب العوائق الجانبية وواصل الجري.", { length: 0, baseGap: 23, count: 8, kinds: k("side"), theme: "trail" }),
  // MEDIUM — step over obstacles.
  S(3, "medium", 1, "أول حاجز", "ارفع قدمك لتتخطّى الحاجز المنخفض.", { length: 0, baseGap: 28, count: 5, kinds: k("hurdle"), theme: "lake" }),
  S(4, "medium", 2, "الاتجاه والخطوة", "تحرّك جانبًا ثم تخطَّ الحاجز، خطوة واحدة في كل مرة.", { length: 0, baseGap: 26, count: 8, kinds: k("side", "hurdle"), theme: "forest" }),
  S(5, "medium", 3, "درب العوائق", "تخطَّ الحواجز وتجنّب الصخور على الدرب.", { length: 0, baseGap: 23, count: 10, kinds: k("hurdle", "side", "hurdle"), theme: "sunset" }),
  // ADVANCED — more variety, not more speed.
  S(6, "advanced", 1, "مسارات متغيّرة", "تنقّل بين المسارات المضيئة ونقاط التفتيش.", { length: 0, baseGap: 22, count: 9, kinds: k("gate", "side", "marker"), theme: "summit" }),
  S(7, "advanced", 2, "عوائق متنوعة", "اجمع بين التحرّك الجانبي ورفع القدم.", { length: 0, baseGap: 21, count: 10, kinds: k("side", "hurdle", "hurdle", "side"), theme: "river" }),
  S(8, "advanced", 3, "المغامرة الأخيرة", "اجمع كل ما تعلّمته حتى تصل إلى الوجهة الجميلة.", { length: 0, baseGap: 21, count: 12, kinds: k("gate", "hurdle", "side", "marker", "hurdle", "side"), theme: "festival" }),
];

export const TOTAL_STAGES = STAGES.length;

export function stageByPosition(difficulty: Difficulty, stage: StageNumber): StageSpec {
  const d = ["easy", "medium", "advanced"].indexOf(difficulty);
  return STAGES[d * 3 + (stage - 1)];
}
export function difficultyOfIndex(index: number): Difficulty {
  return STAGES[index].difficulty;
}

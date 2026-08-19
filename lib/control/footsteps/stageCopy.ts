import { Difficulty, type StageNumber } from "@/lib/footsteps";

/**
 * ROUTE ARCHITECTURE REWRITE — human-readable Stage Card copy per
 * (difficulty, stage), rewritten to describe each stage's REAL journey
 * identity (lib/footsteps/journeyPlans.ts's FOOTSTEPS_JOURNEY_PLANS) in
 * plain journey language — shape, checkpoint stars, and cosmic obstacles
 * only appear here where the plan actually has them, so this table can
 * never contradict the engine (see
 * lib/control/footsteps/__tests__/stagePreset.test.ts's consistency
 * checks). The old SINGLE/PAIR stance wording (قدم واحدة/قدمين) is gone —
 * that mechanic no longer exists.
 */
export interface FootstepsStageCopyEntry {
  title: string;
  description: string;
  characteristics: readonly [string, string, string];
}

export const FOOTSTEPS_STAGE_COPY: Record<
  Difficulty,
  readonly [FootstepsStageCopyEntry, FootstepsStageCopyEntry, FootstepsStageCopyEntry, FootstepsStageCopyEntry, FootstepsStageCopyEntry]
> = {
  [Difficulty.EASY]: [
    {
      title: "الطريق الأول",
      description: "بداية هادئة على مسار قصير ومستقيم — تعليم بسيط للعبة",
      characteristics: ["مسار قصير", "خطوات متقاربة", "اتجاه بسيط"],
    },
    {
      title: "قوس لطيف",
      description: "مسار ينحني بلطف نحو اليسار حتى النجمة",
      characteristics: ["انحناء يسار لطيف", "خطوات متقاربة", "مسار سلس"],
    },
    {
      title: "المنعطف الهادئ",
      description: "مسار ينحني بلطف نحو اليمين حتى النجمة",
      characteristics: ["انحناء يمين لطيف", "خطوات متقاربة", "مسار سلس"],
    },
    {
      title: "الموجة الهادئة",
      description: "مسار يتموج بلطف يمينًا ثم يعود قبل الوصول للنجمة",
      characteristics: ["موجة عريضة هادئة", "خطوات أكثر", "مسار ممتع"],
    },
    {
      title: "الطريق المتعرج",
      description: "مسار يتموج بمنحنيات لطيفة على شكل حرف S",
      characteristics: ["منحنيات لطيفة", "خطوات أكثر", "رحلة ممتعة"],
    },
  ],
  [Difficulty.MEDIUM]: [
    {
      title: "رحلة النجمتين",
      description: "رحلة أطول تمر بمحطة نجمة في منتصف الطريق قبل الوصول",
      characteristics: ["مسار أطول", "نجمة في المنتصف", "مسافات متوسطة"],
    },
    {
      title: "المسار الأيسر الطويل",
      description: "مسار يميل يسارًا حتى المحطة، ثم ينحني نحو النجمة",
      characteristics: ["انحناء يسار واسع", "محطة نجمة", "ينحني بعدها نحو الهدف"],
    },
    {
      title: "مسار يمين متصل",
      description: "انحناء يمين واسع يمر بمحطة نجمة، ثم قسم أطول حتى الهدف",
      characteristics: ["انحناء يمين واسع", "محطة نجمة", "قسم ثانٍ أطول"],
    },
    {
      title: "مسار متموج بمحطة",
      description: "مسار ناعم على شكل S يمر بمحطة نجمة في منتصفه تمامًا",
      characteristics: ["مسار ناعم متموج", "محطة في المنتصف", "مسافات متوسطة"],
    },
    {
      title: "رحلة طويلة",
      description: "أكبر رحلة في المستوى المتوسط، بمحطتي نجوم على الطريق",
      characteristics: ["محطتا نجوم", "طريق أطول", "مسافات متوسطة"],
    },
  ],
  [Difficulty.ADVANCED]: [
    {
      title: "تحدي الشهاب",
      description: "مسار أطول وسلس يمر بشهاب واحد قبل الوصول للنجمة النهائية",
      characteristics: ["مسار أطول", "شهاب واحد", "نجمة نهائية"],
    },
    {
      title: "صخرة الطريق",
      description: "مسار منحنٍ يمر بمحطة نجمة ثم صخرة كونية واحدة",
      characteristics: ["مسار منحنٍ", "محطة نجمة", "صخرة كونية واحدة"],
    },
    {
      title: "طريق الكواكب",
      description: "مسار أطول ومتنوع يمر بعقبتين فضائيتين ومحطة نجمة",
      characteristics: ["مسار متنوع", "عقبتان فضائيتان", "محطة نجمة"],
    },
    {
      title: "مسار النيازك",
      description: "مسار متغير الاتجاه بعقبتين مختلفتين ومحطتي نجوم",
      characteristics: ["مسار متغير الاتجاه", "عقبتان مختلفتان", "محطتا نجوم"],
    },
    {
      title: "الرحلة الكبرى",
      description: "أعظم رحلة كونية — محطتا نجوم وعقبتان مختلفتان حتى بوابة النجوم",
      characteristics: ["مسار طويل", "عقبات متنوعة", "بوابة النجوم"],
    },
  ],
};

export function getFootstepsStageCopy(difficulty: Difficulty, stageNumber: StageNumber): FootstepsStageCopyEntry {
  return FOOTSTEPS_STAGE_COPY[difficulty][stageNumber - 1];
}

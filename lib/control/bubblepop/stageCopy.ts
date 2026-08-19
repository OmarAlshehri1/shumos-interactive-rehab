import { Difficulty, type StageNumber } from "@/lib/bubblepop";

/**
 * THERAPIST SETUP SIMPLIFICATION — human-readable Stage Card copy per
 * (difficulty, stage). Hand-authored, not derived from the blueprint numbers
 * at runtime (Arabic wording needs a human's judgment call), but validated
 * against lib/bubblepop/difficultyRules.ts by
 * lib/control/bubblepop/__tests__/stagePreset.test.ts: each difficulty's
 * bubbleCount never decreases and baseSize strictly decreases across its 5
 * stages, which is exactly the progression this copy describes — so this
 * table can't silently contradict the engine. Mirrors
 * lib/control/stageCopy.ts's STAGE_COPY exactly.
 */
export interface BubblePopStageCopyEntry {
  title: string;
  description: string;
  characteristics: readonly [string, string, string];
}

export const BUBBLE_POP_STAGE_COPY: Record<
  Difficulty,
  readonly [BubblePopStageCopyEntry, BubblePopStageCopyEntry, BubblePopStageCopyEntry, BubblePopStageCopyEntry, BubblePopStageCopyEntry]
> = {
  [Difficulty.EASY]: [
    { title: "أول الفقاعات", description: "محطتان فقط، وفقاعة واحدة هادئة تعبر الجدار ببطء", characteristics: ["محطتان (أزرق وأصفر)", "4 مهمات", "اتجاه واحد بطيء جدًا"] },
    { title: "التيار المعاكس", description: "لون ثالث ينضم، والتيار يعبر من الجهة الأخرى", characteristics: ["3 محطات", "5 مهمات", "التيار من اليسار لليمين"] },
    { title: "تيارات البحر", description: "التيار يتبادل اتجاهه بين فقاعة وأخرى عبر عدة مسارات", characteristics: ["3 محطات", "6 مهمات", "اتجاه متبادل"] },
    { title: "أصدقاء البحر", description: "نفس تيارات البحر المتبادلة، وأسماك ودودة تسبح معك", characteristics: ["أسماك زخرفية", "7 مهمات", "لا تأثير على النقاط"] },
    { title: "الكنز الصغير", description: "كل فقاعة صحيحة تضيء صندوق الكنز حتى ينفتح أخيرًا", characteristics: ["صندوق كنز", "سلحفاة ودودة", "8 مهمات"] },
  ],
  [Difficulty.MEDIUM]: [
    { title: "تيار الفقاعات", description: "تيار طويل هادئ يعبر الجدار من اليمين لليسار", characteristics: ["4 محطات", "7 مهمات", "تيار واحد"] },
    { title: "تياران", description: "تيار علوي وتيار سفلي يتحركان في آن واحد بعكس بعضهما", characteristics: ["4 محطات", "8 مهمات", "تياران متعاكسان"] },
    { title: "سرب الأسماك", description: "نفس التيارين، وسرب أسماك حقيقي يسبح عبر الجدار", characteristics: ["سرب أسماك", "8 مهمات", "زخرفي بلا تأثير"] },
    { title: "بوابة القنديل", description: "قنديل بحر كبير وودود يعبر ببطء وسط التيارات", characteristics: ["قنديل بحر", "8 مهمات", "غير قابل للمس"] },
    { title: "رحلة الكنز", description: "كل إجابة صحيحة تكسب لؤلؤة حتى يفتح صندوق الكنز", characteristics: ["لآلئ الكنز", "10 مهمات", "سلحفاة ودودة"] },
  ],
  [Difficulty.ADVANCED]: [
    { title: "تيار الألوان", description: "ستة ألوان، وفقاعات تتحرك من الجهتين", characteristics: ["6 محطات لونية", "9 مهمات", "اتجاه متبادل"] },
    { title: "اللون والشكل", description: "كل مهمة الآن لون وشكل معًا — لؤلؤة واحدة صحيحة بين المرشحين", characteristics: ["5 مرشحات شكل ولون", "6 مهمات", "إجابة واحدة صحيحة"] },
    { title: "المهمة المزدوجة", description: "مهمتان متتاليتان في كل جولة — أزرق، ثم أصفر", characteristics: ["مهمات مزدوجة", "3 جولات", "بلا فقدان تقدم"] },
    { title: "مغامرة المحيط", description: "محيط غني بالحياة البحرية، ومهمات لون وشكل متبادلة", characteristics: ["أسماك وقنديل وسلحفاة وفرس بحر", "8 مهمات", "لون أو شكل بالتبادل"] },
    { title: "الكنز الكبير", description: "المرحلة الختامية — كل مهمة صحيحة تكسب مفتاحًا نحو الكنز الكبير", characteristics: ["مفاتيح ذهبية", "10 مهمات", "احتفال ختامي كبير"] },
  ],
};

export function getBubblePopStageCopy(difficulty: Difficulty, stageNumber: StageNumber): BubblePopStageCopyEntry {
  return BUBBLE_POP_STAGE_COPY[difficulty][stageNumber - 1];
}

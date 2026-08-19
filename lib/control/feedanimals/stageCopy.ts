import { Difficulty, type StageNumber } from "@/lib/feedanimals";

/**
 * THERAPIST SETUP SIMPLIFICATION — human-readable Stage Card copy per
 * (difficulty, stage). Every one of the 15 stages is a hand-authored SAFARI
 * ANIMAL ADVENTURE route (see lib/feedanimals/pathStages.ts) — this table's
 * titles/descriptions are the same ones the task itself specified per
 * stage, so a therapist reads exactly what makes each stage's journey
 * different (its own animal, its own route shape, its own obstacles) rather
 * than a generic difficulty label.
 */
export interface FeedAnimalsStageCopyEntry {
  title: string;
  description: string;
  characteristics: readonly [string, string, string];
}

export const FEED_ANIMALS_STAGE_COPY: Record<
  Difficulty,
  readonly [FeedAnimalsStageCopyEntry, FeedAnimalsStageCopyEntry, FeedAnimalsStageCopyEntry, FeedAnimalsStageCopyEntry, FeedAnimalsStageCopyEntry]
> = {
  [Difficulty.EASY]: [
    { title: "رحلة القرد", description: "ساعد القرد يوصل إلى الموز عبر منحنى بسيط", characteristics: ["مسار منحني بسيط", "تحكم يمين ويسار", "بدون عوائق"] },
    { title: "منعطف الأرنب", description: "أرنب يقفز بخفة نحو حقل الجزر", characteristics: ["منعطف واسع", "حركة قفز خفيفة", "بدون عوائق"] },
    { title: "طريق الباندا", description: "مسار طويل بشكل S نحو الخيزران", characteristics: ["مسار أطول", "منحنيات متعددة", "بدون عوائق"] },
    { title: "بركة الفيل", description: "المسار يلتف حول بركة صغيرة", characteristics: ["مسار يلتف حول بركة", "بيئة مائية", "بدون عوائق"] },
    { title: "رحلة الزرافة", description: "أطول وأوسع رحلة في المستوى السهل", characteristics: ["أطول مسار سهل", "منعطفات متعددة", "بدون عوائق"] },
  ],
  [Difficulty.MEDIUM]: [
    { title: "الغصن الساقط", description: "القرد يقفز فوق غصن ساقط في طريقه", characteristics: ["عائق: غصن ساقط", "زر القفز", "مسار جديد"] },
    { title: "حفرة الأرنب", description: "الأرنب يقفز فوق حفرة صغيرة", characteristics: ["عائق: حفرة", "زر القفز", "مسار منحني"] },
    { title: "طريق الباندا", description: "مسار واسع مع جذع شجرة وصخور", characteristics: ["عائق: جذع شجرة", "صخور تحيط بالمسار", "مسار أوسع"] },
    { title: "حول البركة", description: "الفيل يدور حول بركة كبيرة بمنعطفات عدة", characteristics: ["بركة كبيرة", "عائق: جذع شجرة", "منعطفات متعددة"] },
    { title: "رحلة الأصدقاء", description: "القرد أولاً ثم الأرنب في مهمة سفاري قصيرة", characteristics: ["حيوانان بالتتابع", "عائق واحد", "منطقة تجمّع"] },
  ],
  [Difficulty.ADVANCED]: [
    { title: "طريق الصخور", description: "مسار متعرج ناعم بين الصخور مع قفزة فوق غصن", characteristics: ["مسار متعرج طويل", "صخور متعددة", "عائق: غصن ساقط"] },
    { title: "النهر", description: "الفيل يسير على ضفة نهر حتى نقطة عبور آمنة", characteristics: ["بيئة نهر", "نقطة عبور بالقفز", "مسار متصل"] },
    { title: "مغامرة الأرنب", description: "مسار طويل ملتف مع حفرة وغصن وصخرة", characteristics: ["مسار طويل وملتف", "عائقان يتطلبان القفز", "صخرة زخرفية"] },
    { title: "فريق السفاري", description: "القرد ثم الأرنب ثم الفيل، كل واحد برحلته الخاصة", characteristics: ["3 حيوانات بالتتابع", "عائق لكل حيوان", "منطقة تجمّع السفاري"] },
    { title: "رحلة السفاري الكبرى", description: "الحيوانات الخمسة جميعها، كل واحد في رحلته المميزة", characteristics: ["5 حيوانات بالتتابع", "عوائق متنوعة", "احتفال ختامي كبير"] },
  ],
};

export function getFeedAnimalsStageCopy(difficulty: Difficulty, stageNumber: StageNumber): FeedAnimalsStageCopyEntry {
  return FEED_ANIMALS_STAGE_COPY[difficulty][stageNumber - 1];
}

import { Animal, Food, type StageNumber } from "@/lib/feedanimals";
import { stageOrdinalAr } from "@/components/display/copy";

/**
 * Feed the Animals' own spoken Arabic phrase builders — deliberately a
 * SEPARATE module from voiceLines.ts (Balloon Quest), footstepsVoiceLines.ts
 * (Follow the Footsteps), and bubblePopVoiceLines.ts (Bubble Pop Wall),
 * never shared text, per the product rule that every game must not be
 * mistakable for another. Same "pure string functions, no browser
 * dependency" shape so this stays equally easy to unit test.
 */

/** Definite-article Arabic animal names for spoken phrasing — kept local to this module (not imported from components/control/feedanimals/copy.ts) so lib/audio never depends on the control UI layer. */
const ANIMAL_NAME_AR: Record<Animal, string> = {
  [Animal.MONKEY]: "القرد",
  [Animal.RABBIT]: "الأرنب",
  [Animal.PANDA]: "الباندا",
  [Animal.ELEPHANT]: "الفيل",
  [Animal.GIRAFFE]: "الزرافة",
};

const FOOD_NAME_AR: Record<Food, string> = {
  [Food.BANANA]: "الموزة",
  [Food.CARROT]: "الجزرة",
  [Food.BAMBOO]: "الخيزران",
  [Food.WATERMELON]: "البطيخة",
  [Food.LEAVES]: "الأوراق",
};

export function feedAnimalsWelcomeLine(childName: string): string {
  return `يلا يا ${childName}، تعال نساعد حيوانات السفاري الجائعة!`;
}

/** Task section 6's suggested Ready Position line. */
export function feedAnimalsReadyPositionLine(childName: string, isFirstStage: boolean): string {
  return isFirstStage ? `يلا يا ${childName}، وقف قدام الشاشة وخلك جاهز!` : `ارجع لمكانك يا ${childName} وخلك جاهز!`;
}

export function feedAnimalsInstructionLine(childName: string, stageNumber: StageNumber): string {
  return `يلا يا ${childName}، جاهز للمرحلة ${stageOrdinalAr(stageNumber)}؟`;
}

/**
 * THE CORE gameplay instruction (task section 3/30) — a small deterministic
 * pool of Arabic templates ("ساعد.../وين.../اختار.../خلنا نعطي...", task
 * section 31's "voice variation"), cycled by `occurrenceIndex` so the exact
 * same sentence never repeats every single round. Spoken every time a new
 * round becomes current.
 */
const REQUEST_TEMPLATES: readonly ((childName: string, animal: string, food: string) => string)[] = [
  (name, animal, food) => `يا ${name}، ساعد ${animal}! عطه ${food}!`,
  (_, animal, food) => `${animal} جوعان! وين ${food}؟`,
  (name, animal, food) => `اختار يا ${name} — ${animal} يبغى ${food}!`,
  (_, animal, food) => `خلنا نعطي ${animal} ${food}!`,
];

export function feedAnimalsRequestLine(childName: string, animal: Animal, food: Food, occurrenceIndex: number): string {
  const index = ((occurrenceIndex % REQUEST_TEMPLATES.length) + REQUEST_TEMPLATES.length) % REQUEST_TEMPLATES.length;
  return REQUEST_TEMPLATES[index](childName, ANIMAL_NAME_AR[animal], FOOD_NAME_AR[food]);
}

export function allFeedAnimalsRequestLines(childName: string, animal: Animal, food: Food): string[] {
  return REQUEST_TEMPLATES.map((_, i) => feedAnimalsRequestLine(childName, animal, food, i));
}

/**
 * SAFARI ANIMAL ADVENTURE — the path mechanic's own core spoken instruction,
 * spoken once when PLAYING begins for a path stage (and again whenever a
 * new leg's animal takes over in a multi-animal stage) — the direct
 * equivalent of feedAnimalsRequestLine for the round-based mechanic, just
 * not per-round (there's one "round" per leg: reach that animal's food).
 */
export function feedAnimalsPathRequestLine(childName: string, animal: Animal, food: Food): string {
  return `يلا يا ${childName}، ساعد ${ANIMAL_NAME_AR[animal]} يوصل إلى ${FOOD_NAME_AR[food]}!`;
}

/** Task's explicit jump cue line — spoken once as the animal approaches a jump-requiring obstacle, never repeated for the same obstacle, never a countdown/pressure cue. */
export function feedAnimalsJumpCueLine(): string {
  return "اقفز!";
}

/** Task section 29 — spoken only occasionally (never on every incorrect tap), same cooldown-gated convention as every other game's incorrect line. */
export function feedAnimalsIncorrectLine(): string {
  return "جرب مرة ثانية!";
}

const MILESTONE_POOL: readonly ((name: string) => string)[] = [
  (name) => `ممتاز يا ${name}!`,
  () => "أحسنت!",
  () => "كمل، باقي شوي!",
  (name) => `شاطر يا ${name}!`,
];

/** Milestone encouragement — spoken only occasionally, never after every single correct feed. Cycled deterministically, same convention as every other game's encouragement pools. */
export function feedAnimalsMilestoneLine(childName: string, occurrenceIndex: number): string {
  const index = ((occurrenceIndex % MILESTONE_POOL.length) + MILESTONE_POOL.length) % MILESTONE_POOL.length;
  return MILESTONE_POOL[index](childName);
}

export function allFeedAnimalsMilestoneLines(childName: string): string[] {
  return MILESTONE_POOL.map((build, i) => feedAnimalsMilestoneLine(childName, i));
}

const STAGE_COMPLETE_OPENER: Record<StageNumber, string> = {
  1: "نجم",
  2: "بطل",
  3: "مستكشف",
  4: "قائد",
  5: "أسطورة",
};

export function feedAnimalsStageCompleteLine(childName: string, stageNumber: StageNumber): string {
  return `${STAGE_COMPLETE_OPENER[stageNumber]} يا ${childName}! أنهيت المرحلة ${stageOrdinalAr(stageNumber)}!`;
}

export function feedAnimalsSessionCompleteLine(childName: string): string {
  return `أحسنت يا ${childName}! ساعدت الحيوانات كلها!`;
}

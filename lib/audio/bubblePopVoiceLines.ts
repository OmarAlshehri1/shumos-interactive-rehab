import { BubbleColor, BubbleShape, type StageNumber } from "@/lib/bubblepop";
import { stageOrdinalAr } from "@/components/display/copy";

/**
 * Bubble Pop Wall's own spoken Arabic phrase builders — deliberately a
 * SEPARATE module from voiceLines.ts (Balloon Quest) and
 * footstepsVoiceLines.ts (Follow the Footsteps), never shared text, per the
 * product rule that every game must not be mistakable for another. Same
 * "pure string functions, no browser dependency" shape so this stays
 * equally easy to unit test.
 */

const SHAPE_NAME_AR: Record<BubbleShape, string> = {
  [BubbleShape.CIRCLE]: "دائرة",
  [BubbleShape.STAR]: "نجمة",
  [BubbleShape.HEART]: "قلب",
  [BubbleShape.TRIANGLE]: "مثلث",
  [BubbleShape.DIAMOND]: "معين",
};

/** Grammatical gender of each shape noun — see components/display/bubblepop/bubbleColors.ts's matching table for why this duplicates rather than imports (lib/audio never depends on the display component layer). */
const SHAPE_GENDER: Record<BubbleShape, "M" | "F"> = {
  [BubbleShape.CIRCLE]: "F",
  [BubbleShape.STAR]: "F",
  [BubbleShape.HEART]: "M",
  [BubbleShape.TRIANGLE]: "M",
  [BubbleShape.DIAMOND]: "M",
};

/** Masculine (plain color cue, task Part C's exact examples: "أزرق"/"أصفر"/"وردي") / feminine (agrees with a feminine shape noun) indefinite adjective forms. */
const COLOR_ADJECTIVE_AR: Record<BubbleColor, { M: string; F: string }> = {
  [BubbleColor.RED]: { M: "أحمر", F: "حمراء" },
  [BubbleColor.BLUE]: { M: "أزرق", F: "زرقاء" },
  [BubbleColor.YELLOW]: { M: "أصفر", F: "صفراء" },
  [BubbleColor.GREEN]: { M: "أخضر", F: "خضراء" },
  [BubbleColor.PURPLE]: { M: "بنفسجي", F: "بنفسجية" },
  [BubbleColor.ORANGE]: { M: "برتقالي", F: "برتقالية" },
  [BubbleColor.PINK]: { M: "وردي", F: "وردية" },
};

export function bubblePopWelcomeLine(childName: string): string {
  return `يلا يا ${childName}، فرقع الفقاعات معايا تحت الماء!`;
}

/** Task section 7's suggested Ready Position line. */
export function bubblePopReadyPositionLine(childName: string, isFirstStage: boolean): string {
  return isFirstStage ? `يلا يا ${childName}، وقف قدام الشاشة وخلك جاهز!` : `ارجع لمكانك يا ${childName} وخلك جاهز!`;
}

/**
 * Task Part C — "do NOT remove important intro instructions": stage 1 gets
 * ONE extra sentence explaining the rule ("اختار لون الفقاعة من الصدف
 * تحت") since every mission cue afterward is deliberately just a bare
 * color/shape name and never re-explains itself. Every other stage keeps
 * the short "ready?" line alone.
 */
export function bubblePopInstructionLine(childName: string, stageNumber: StageNumber): string {
  const base = `يلا يا ${childName}، جاهز للمرحلة ${stageOrdinalAr(stageNumber)}؟`;
  return stageNumber === 1 ? `${base} اختار لون الفقاعة من الصدف تحت!` : base;
}

/**
 * THE SHORT CORE GAMEPLAY CUE (task Part C — "I do NOT want... every
 * round" to be a full sentence): a bare color name ("أزرق") for a plain
 * color mission, or "شكل + لون" ("نجمة زرقاء") once shape also matters.
 * Never the child's name, never "فرقع الفقاعة" — the VISIBLE prompt
 * (MissionPrompt) already carries that framing; Mariam just names the
 * target. Spoken every time a new target becomes current.
 */
export function bubblePopTargetRequestLine(color: BubbleColor, shape: BubbleShape, announceShape: boolean): string {
  if (!announceShape) return COLOR_ADJECTIVE_AR[color].M;
  return `${SHAPE_NAME_AR[shape]} ${COLOR_ADJECTIVE_AR[color][SHAPE_GENDER[shape]]}`;
}

/** Task Part G's two-step sequence cue — spoken ONCE when the pair starts: "أزرق، ثم أصفر" or "نجمة زرقاء، ثم قلب أصفر". Short and clear, never a full sentence. */
export function bubblePopSequenceRequestLine(
  firstColor: BubbleColor,
  firstShape: BubbleShape,
  announceFirstShape: boolean,
  secondColor: BubbleColor,
  secondShape: BubbleShape,
  announceSecondShape: boolean,
): string {
  const first = bubblePopTargetRequestLine(firstColor, firstShape, announceFirstShape);
  const second = bubblePopTargetRequestLine(secondColor, secondShape, announceSecondShape);
  return `${first}، ثم ${second}`;
}

/** Task section 30 — spoken only occasionally (never on every incorrect tap), same cooldown-gated convention as Balloon Quest's incorrectLine. */
export function bubblePopIncorrectLine(): string {
  return "حاول مرة ثانية!";
}

const MILESTONE_POOL: readonly ((name: string) => string)[] = [
  (name) => `ممتاز يا ${name}!`,
  () => "أحسنت!",
  () => "كمل، باقي شوي!",
  (name) => `شاطر يا ${name}!`,
];

/** Milestone encouragement — spoken only occasionally, never after every single correct pop. Cycled deterministically, same convention as the other two games' encouragement pools. */
export function bubblePopMilestoneLine(childName: string, occurrenceIndex: number): string {
  const index = ((occurrenceIndex % MILESTONE_POOL.length) + MILESTONE_POOL.length) % MILESTONE_POOL.length;
  return MILESTONE_POOL[index](childName);
}

export function allBubblePopMilestoneLines(childName: string): string[] {
  return MILESTONE_POOL.map((build, i) => bubblePopMilestoneLine(childName, i));
}

const STAGE_COMPLETE_OPENER: Record<StageNumber, string> = {
  1: "نجم",
  2: "بطل",
  3: "غواص",
  4: "قائد",
  5: "أسطورة",
};

export function bubblePopStageCompleteLine(childName: string, stageNumber: StageNumber): string {
  return `${STAGE_COMPLETE_OPENER[stageNumber]} يا ${childName}! أنهيت المرحلة ${stageOrdinalAr(stageNumber)}!`;
}

export function bubblePopSessionCompleteLine(childName: string): string {
  return `أحسنت يا ${childName}! أنت بطل الفقاعات!`;
}

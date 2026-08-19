import { RouteObstacleKind, type StageNumber } from "@/lib/footsteps";
import { stageOrdinalAr } from "@/components/display/copy";

/**
 * Follow the Footsteps' own spoken Arabic phrase builders — deliberately a
 * SEPARATE module from voiceLines.ts (Balloon Quest's own phrases), never
 * shared text, per the product rule that the two games must not be
 * mistakable for one another. Same "pure string functions, no browser
 * dependency" shape as voiceLines.ts so both stay equally easy to unit test.
 */

export function footstepsWelcomeLine(childName: string): string {
  return `يلا يا ${childName}، امشِ على الخطوات وحدة وحدة!`;
}

export function footstepsInstructionLine(childName: string, stageNumber: StageNumber): string {
  return `يلا يا ${childName}، اتبع الخطوات المضيئة للمرحلة ${stageOrdinalAr(stageNumber)}!`;
}

/**
 * Milestone encouragement — spoken only occasionally (never after every
 * single step, per the task's "do not make Mariam speak after every step").
 * Cycled deterministically the same way Balloon Quest's encouragementLine
 * cycles its pools — no randomness.
 */
const MILESTONE_POOL: readonly ((name: string) => string)[] = [
  (name) => `ممتاز يا ${name}!`,
  () => "رائع!",
  () => "كمل، باقي شوي!",
  (name) => `شاطر يا ${name}!`,
];

export function footstepsMilestoneLine(childName: string, occurrenceIndex: number): string {
  const index = ((occurrenceIndex % MILESTONE_POOL.length) + MILESTONE_POOL.length) % MILESTONE_POOL.length;
  return MILESTONE_POOL[index](childName);
}

export function allFootstepsMilestoneLines(childName: string): string[] {
  return MILESTONE_POOL.map((build, i) => footstepsMilestoneLine(childName, i));
}

/**
 * JOURNEY REDESIGN — a short line for reaching a checkpoint star mid-route.
 * Cycled deterministically the same way MILESTONE_POOL cycles — no
 * randomness, never long narration.
 */
const CHECKPOINT_POOL: readonly (() => string)[] = [() => "وصلنا للنجمة! نكمل؟", () => "ممتاز! باقي نجمة ثانية!", () => "أحسنت! المحطة التالية قريبة!"];

export function footstepsCheckpointLine(occurrenceIndex: number): string {
  const index = ((occurrenceIndex % CHECKPOINT_POOL.length) + CHECKPOINT_POOL.length) % CHECKPOINT_POOL.length;
  return CHECKPOINT_POOL[index]();
}

const STAGE_COMPLETE_OPENER: Record<StageNumber, string> = {
  1: "نجم",
  2: "بطل",
  3: "مستكشف",
  4: "قائد",
  5: "أسطورة",
};

export function footstepsStageCompleteLine(childName: string, stageNumber: StageNumber): string {
  return `${STAGE_COMPLETE_OPENER[stageNumber]} يا ${childName}! أضأت طريق المرحلة ${stageOrdinalAr(stageNumber)}!`;
}

export function footstepsSessionCompleteLine(childName: string): string {
  return `أحسنت يا ${childName}!`;
}

/**
 * ROUTE ARCHITECTURE REWRITE — replaces the old SINGLE/PAIR stance cues with
 * cosmic obstacle lines (ADVANCED only). Spoken once when the obstacle
 * becomes the child's current movement cue — short, playful, never a
 * balance/coordination claim (task's "do not claim balance/jump ability").
 */
const OBSTACLE_ACTIVE_LINES: Record<RouteObstacleKind, string> = {
  [RouteObstacleKind.METEOR]: "انتبه للشهاب! اقفز فوقه!",
  [RouteObstacleKind.ROCK]: "يلا نتخطى الصخرة!",
  [RouteObstacleKind.COMET]: "شوف المذنب! يلا نعبره!",
};

export function footstepsObstacleActiveLine(kind: RouteObstacleKind): string {
  return OBSTACLE_ACTIVE_LINES[kind];
}

const OBSTACLE_CLEARED_LINES: Record<RouteObstacleKind, string> = {
  [RouteObstacleKind.METEOR]: "رائع! تخطيت الشهاب!",
  [RouteObstacleKind.ROCK]: "أحسنت! عبرت الصخرة!",
  [RouteObstacleKind.COMET]: "ممتاز! عبرت المذنب!",
};

export function footstepsObstacleClearedLine(kind: RouteObstacleKind): string {
  return OBSTACLE_CLEARED_LINES[kind];
}

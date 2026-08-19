import { BalloonColor, Difficulty, type StageNumber } from "./types";

/**
 * Canonical color order. Colors are assigned to a stage in this order, so
 * "colorCount: 3" always means RED/BLUE/GREEN, never a random subset — that
 * keeps generation reproducible and keeps this table easy to reason about.
 */
export const BALLOON_COLOR_ORDER: readonly BalloonColor[] = [
  BalloonColor.RED,
  BalloonColor.BLUE,
  BalloonColor.GREEN,
  BalloonColor.YELLOW,
  BalloonColor.PURPLE,
  BalloonColor.ORANGE,
];

/**
 * The parameters that define one stage's difficulty, before the therapist's
 * TargetSize/TargetSpacing/PlayArea preferences are applied. Positions are
 * never hardcoded here — only counts, color variety, and base size/spacing —
 * the actual layout is generated procedurally in stageGenerator.ts.
 */
export interface StageBlueprint {
  totalBalloons: number;
  /** How many of BALLOON_COLOR_ORDER are in play for this stage. */
  colorCount: number;
  /** How many balloons are the target color. */
  targetCount: number;
  /** Balloon diameter, normalized to the play area's shorter side, before the TargetSize multiplier. */
  baseSize: number;
  /** Minimum extra gap between balloon edges, normalized, before the TargetSpacing multiplier. */
  baseSpacing: number;
}

/** Every difficulty has exactly this many stages — see StageNumber's doc comment. */
export const STAGES_PER_DIFFICULTY = 5;

/**
 * Difficulty progression rules.
 *
 * TASK 11 — extended from 3 to 5 stages per difficulty. Each difficulty
 * follows the same 5-stage shape (a gentle ramp, never a sudden jump):
 *   Stage 1 — comfortable introduction (same numbers as the old Task 2
 *     stage 1 for that difficulty, so an EASY/MEDIUM/ADVANCED session still
 *     opens exactly as before).
 *   Stage 2 — a small increase (one or two more balloons, everything else
 *     unchanged) — the only genuinely new blueprint at each tier's low end.
 *   Stage 3 — balanced challenge (the old Task 2 stage 2 for that
 *     difficulty).
 *   Stage 4 — higher attention/movement demand: more balloons, and at
 *     ADVANCED specifically, targetCount also steps up from 3 to 4 (more
 *     targets to find among the same or more distractors is a genuinely
 *     different kind of harder, not just "more balloons").
 *   Stage 5 — the difficulty's strongest challenge (the old Task 2 stage 3
 *     for that difficulty — same totalBalloons/colorCount/size/spacing it
 *     always had, so an existing session that only ever reaches "the last
 *     stage" of a difficulty sees exactly the numbers it always did).
 *
 * Easy: few balloons, few colors, large/close targets, a high proportion of
 * them correct — low cognitive load, hard to miss.
 *
 * Medium: more balloons and colors, smaller/more spread targets, a lower
 * proportion of them correct.
 *
 * Advanced: up to ~16 balloons, most colors, small/widely spread targets,
 * the lowest proportion of them correct, and (stages 4-5 only) 4 targets
 * instead of 3 — but always physically distinguishable (see
 * MIN_BALLOON_SIZE in stageGenerator.ts).
 *
 * Within each difficulty, the 5 stages increase totalBalloons and
 * colorCount, and decrease baseSize and baseSpacing — difficulty ramps
 * within a session, not just across sessions. colorCount never exceeds 6
 * (BALLOON_COLOR_ORDER's full length).
 */
export const DIFFICULTY_RULES: Record<Difficulty, readonly [StageBlueprint, StageBlueprint, StageBlueprint, StageBlueprint, StageBlueprint]> = {
  [Difficulty.EASY]: [
    { totalBalloons: 4, colorCount: 2, targetCount: 2, baseSize: 0.22, baseSpacing: 0.14 },
    { totalBalloons: 5, colorCount: 2, targetCount: 2, baseSize: 0.21, baseSpacing: 0.135 },
    { totalBalloons: 6, colorCount: 3, targetCount: 3, baseSize: 0.2, baseSpacing: 0.12 },
    { totalBalloons: 7, colorCount: 3, targetCount: 3, baseSize: 0.19, baseSpacing: 0.115 },
    { totalBalloons: 8, colorCount: 4, targetCount: 3, baseSize: 0.18, baseSpacing: 0.11 },
  ],
  [Difficulty.MEDIUM]: [
    { totalBalloons: 8, colorCount: 3, targetCount: 3, baseSize: 0.16, baseSpacing: 0.11 },
    { totalBalloons: 9, colorCount: 4, targetCount: 3, baseSize: 0.155, baseSpacing: 0.105 },
    { totalBalloons: 10, colorCount: 4, targetCount: 3, baseSize: 0.15, baseSpacing: 0.1 },
    { totalBalloons: 11, colorCount: 5, targetCount: 3, baseSize: 0.145, baseSpacing: 0.095 },
    { totalBalloons: 12, colorCount: 5, targetCount: 3, baseSize: 0.14, baseSpacing: 0.09 },
  ],
  [Difficulty.ADVANCED]: [
    { totalBalloons: 12, colorCount: 5, targetCount: 3, baseSize: 0.13, baseSpacing: 0.08 },
    { totalBalloons: 13, colorCount: 5, targetCount: 3, baseSize: 0.125, baseSpacing: 0.0775 },
    { totalBalloons: 14, colorCount: 6, targetCount: 3, baseSize: 0.12, baseSpacing: 0.075 },
    { totalBalloons: 15, colorCount: 6, targetCount: 4, baseSize: 0.115, baseSpacing: 0.0725 },
    { totalBalloons: 16, colorCount: 6, targetCount: 4, baseSize: 0.11, baseSpacing: 0.07 },
  ],
};

export function getStageBlueprint(difficulty: Difficulty, stageNumber: StageNumber): StageBlueprint {
  return DIFFICULTY_RULES[difficulty][stageNumber - 1];
}

/**
 * Canonical easy -> hard order — the ONE place this ordering is defined, so
 * "أصعب"/"أسهل" (StageCompleteOverlay), the therapist report's grouping
 * (SessionSummaryScreen), and bestStage tie-breaking (scoring.ts) can never
 * disagree with each other. See getAdjacentDifficulty below for why a
 * difficulty change only ever steps one tier at a time.
 */
export const DIFFICULTY_ORDER: readonly Difficulty[] = [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.ADVANCED];

/**
 * TASK 11 — the therapist's "أصعب"/"أسهل" decision only ever steps to the
 * immediately adjacent tier (EASY <-> MEDIUM <-> ADVANCED), never jumps
 * straight from EASY to ADVANCED — "Preserve sensible progression... do not
 * make this mapping random." Returns null at either end (no harder tier
 * above ADVANCED, no easier tier below EASY) — callers use that to hide the
 * corresponding button rather than offer a dead action.
 */
export function getAdjacentDifficulty(current: Difficulty, direction: "easier" | "harder"): Difficulty | null {
  const index = DIFFICULTY_ORDER.indexOf(current);
  const targetIndex = direction === "harder" ? index + 1 : index - 1;
  return targetIndex >= 0 && targetIndex < DIFFICULTY_ORDER.length ? DIFFICULTY_ORDER[targetIndex] : null;
}

export interface StageProgressionTarget {
  difficulty: Difficulty;
  stageNumber: StageNumber;
}

/** The canonical Next Stage progression shared by every 5-stage game. */
export function getNextStageTarget(difficulty: Difficulty, stageNumber: StageNumber): StageProgressionTarget | null {
  if (stageNumber < STAGES_PER_DIFFICULTY) {
    return { difficulty, stageNumber: (stageNumber + 1) as StageNumber };
  }
  const harder = getAdjacentDifficulty(difficulty, "harder");
  return harder ? { difficulty: harder, stageNumber: 1 } : null;
}

export function isSequentialStageTarget(current: StageProgressionTarget, target: StageProgressionTarget): boolean {
  const next = getNextStageTarget(current.difficulty, current.stageNumber);
  return next?.difficulty === target.difficulty && next.stageNumber === target.stageNumber;
}

export function getStageDecisionTarget(
  difficulty: Difficulty,
  stageNumber: StageNumber,
  decision: "continue" | "easier" | "harder",
): StageProgressionTarget | null {
  if (decision === "continue") return getNextStageTarget(difficulty, stageNumber);
  const targetDifficulty = getAdjacentDifficulty(difficulty, decision);
  return targetDifficulty ? { difficulty: targetDifficulty, stageNumber } : null;
}

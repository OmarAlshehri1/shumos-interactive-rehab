import { DIFFICULTY_ORDER } from "./difficultyRules";
import {
  type Difficulty,
  StageStatus,
  type BalloonColor,
  type SessionSummary,
  type StageNumber,
  type StageResult,
} from "./types";

/**
 * Accuracy = correct / (correct + incorrect).
 *
 * "Incorrect" here means attempts on a non-target balloon; re-selecting an
 * already-popped balloon is a no-op and never reaches this formula (see
 * session.ts selectBalloon). Returns 0, not NaN, when nothing was attempted.
 */
export function calculateAccuracy(correctCount: number, incorrectCount: number): number {
  const total = correctCount + incorrectCount;
  return total === 0 ? 0 : correctCount / total;
}

/** Mean of the given reaction times; null (not NaN/0) when there were none, since "no data" and "instant" are different things. */
export function averageReactionTime(reactionTimesMs: readonly number[]): number | null {
  if (reactionTimesMs.length === 0) return null;
  const sum = reactionTimesMs.reduce((total, ms) => total + ms, 0);
  return sum / reactionTimesMs.length;
}

export interface FinalizeStageResultParams {
  difficulty: Difficulty;
  stageNumber: StageNumber;
  status: StageStatus;
  /** Null for a stage jumped over and never actually entered — see StageResult's doc comment. */
  targetColor: BalloonColor | null;
  correctCount: number;
  incorrectCount: number;
  totalTargets: number;
  /** Null for a stage jumped over and never actually entered. */
  durationMs: number | null;
  reactionTimesMs: readonly number[];
}

export function finalizeStageResult(params: FinalizeStageResultParams): StageResult {
  const neverEntered = params.durationMs === null;
  return {
    difficulty: params.difficulty,
    stageNumber: params.stageNumber,
    status: params.status,
    targetColor: params.targetColor,
    correctCount: params.correctCount,
    incorrectCount: params.incorrectCount,
    totalTargets: params.totalTargets,
    accuracy: neverEntered ? null : calculateAccuracy(params.correctCount, params.incorrectCount),
    durationMs: params.durationMs,
    averageReactionTimeMs: averageReactionTime(params.reactionTimesMs),
  };
}

/** Every difficulty with at least one played stage, in canonical order (see difficultyRules.ts's DIFFICULTY_ORDER) — see SessionSummary.difficultiesPlayed. */
export function difficultiesPlayed(stageResults: readonly StageResult[]): Difficulty[] {
  const present = new Set(stageResults.map((r) => r.difficulty));
  return DIFFICULTY_ORDER.filter((d) => present.has(d));
}

/**
 * Picks the best-performing COMPLETED stage: highest accuracy first, ties
 * broken by the lower average reaction time (faster is better). SKIPPED
 * stages never win — a stage the therapist moved past isn't a performance
 * to highlight, and its accuracy may be null anyway. Identified by
 * (difficulty, stageNumber) since a session can span more than one
 * difficulty.
 */
function pickBestStage(stageResults: readonly StageResult[]): { difficulty: Difficulty; stageNumber: StageNumber } | null {
  const completed = stageResults.filter((r) => r.status === StageStatus.COMPLETED && r.accuracy !== null);
  if (completed.length === 0) return null;

  let best = completed[0];
  for (const result of completed.slice(1)) {
    if (result.accuracy! > best.accuracy!) {
      best = result;
      continue;
    }
    if (result.accuracy === best.accuracy) {
      const bestReaction = best.averageReactionTimeMs ?? Infinity;
      const resultReaction = result.averageReactionTimeMs ?? Infinity;
      if (resultReaction < bestReaction) best = result;
    }
  }
  return { difficulty: best.difficulty, stageNumber: best.stageNumber };
}

export interface BuildSessionSummaryParams {
  sessionId: string;
  childFirstName: string;
  startingDifficulty: Difficulty;
  stageResults: readonly StageResult[];
  totalDurationMs: number;
  completedAt: string;
}

export function buildSessionSummary(params: BuildSessionSummaryParams): SessionSummary {
  const totalCorrect = params.stageResults.reduce((sum, r) => sum + r.correctCount, 0);
  const totalIncorrect = params.stageResults.reduce((sum, r) => sum + r.incorrectCount, 0);
  const allReactionTimes = params.stageResults.flatMap((r) =>
    r.averageReactionTimeMs === null ? [] : [r.averageReactionTimeMs],
  );

  return {
    sessionId: params.sessionId,
    childFirstName: params.childFirstName,
    startingDifficulty: params.startingDifficulty,
    difficultiesPlayed: difficultiesPlayed(params.stageResults),
    stageResults: [...params.stageResults],
    totalCorrect,
    totalIncorrect,
    overallAccuracy: calculateAccuracy(totalCorrect, totalIncorrect),
    totalDurationMs: params.totalDurationMs,
    averageReactionTimeMs: averageReactionTime(allReactionTimes),
    bestStage: pickBestStage(params.stageResults),
    completedAt: params.completedAt,
  };
}

import { DIFFICULTY_ORDER } from "@/lib/game";
import {
  type Difficulty,
  type FootstepsSessionSummary,
  type FootstepsStageResult,
  FootstepsStageStatus,
  type StageNumber,
} from "./types";
import { nonNegativeFiniteNumber, requireFiniteCount, requireNonNegativeFiniteNumber, safeRatio, sumFinite, weightedAverageFinite } from "@/lib/dataIntegrity/numeric";

/** stepsCompleted / stepsPresented; null means no valid presented-step denominator. */
export function calculateCompletionRate(stepsCompleted: number, stepsPresented: number): number | null {
  return safeRatio(stepsCompleted, stepsPresented);
}

/** Mean of the given step times; null (not NaN/0) when there were none — "no data" and "instant" are different things. */
export function averageStepTime(stepTimesMs: readonly number[]): number | null {
  if (stepTimesMs.length === 0) return null;
  const sum = sumFinite(stepTimesMs.map(nonNegativeFiniteNumber));
  if (sum === null) return null;
  return sum / stepTimesMs.length;
}

export interface FinalizeFootstepsStageResultParams {
  difficulty: Difficulty;
  stageNumber: StageNumber;
  status: FootstepsStageStatus;
  stepsPresented: number;
  stepsCompleted: number;
  /** Null for a stage jumped over and never actually entered. */
  durationMs: number | null;
  stepTimesMs: readonly number[];
}

export function finalizeFootstepsStageResult(params: FinalizeFootstepsStageResultParams): FootstepsStageResult {
  return {
    difficulty: params.difficulty,
    stageNumber: params.stageNumber,
    status: params.status,
    stepsPresented: params.stepsPresented,
    stepsCompleted: params.stepsCompleted,
    durationMs: params.durationMs,
    averageStepTimeMs: averageStepTime(params.stepTimesMs),
  };
}

/** Every difficulty with at least one played stage, in canonical order. */
export function footstepsDifficultiesPlayed(stageResults: readonly FootstepsStageResult[]): Difficulty[] {
  const present = new Set(stageResults.map((r) => r.difficulty));
  return DIFFICULTY_ORDER.filter((d) => present.has(d));
}

/** Picks the best-performing COMPLETED stage: highest completion rate first, ties broken by the lower average step time (a SKIPPED stage never wins). */
function pickBestFootstepsStage(stageResults: readonly FootstepsStageResult[]): { difficulty: Difficulty; stageNumber: StageNumber } | null {
  const completed = stageResults.filter((r) => r.status === FootstepsStageStatus.COMPLETED && r.stepsPresented > 0);
  if (completed.length === 0) return null;

  let best = completed[0];
  let bestRate = calculateCompletionRate(best.stepsCompleted, best.stepsPresented)!;
  for (const result of completed.slice(1)) {
    const rate = calculateCompletionRate(result.stepsCompleted, result.stepsPresented)!;
    if (rate > bestRate) {
      best = result;
      bestRate = rate;
      continue;
    }
    if (rate === bestRate) {
      const bestStepTime = best.averageStepTimeMs ?? Infinity;
      const resultStepTime = result.averageStepTimeMs ?? Infinity;
      if (resultStepTime < bestStepTime) {
        best = result;
        bestRate = rate;
      }
    }
  }
  return { difficulty: best.difficulty, stageNumber: best.stageNumber };
}

export interface BuildFootstepsSessionSummaryParams {
  sessionId: string;
  childFirstName: string;
  startingDifficulty: Difficulty;
  stageResults: readonly FootstepsStageResult[];
  totalDurationMs: number;
  completedAt: string;
}

export function buildFootstepsSessionSummary(params: BuildFootstepsSessionSummaryParams): FootstepsSessionSummary {
  const totalStepsPresented = requireFiniteCount(sumFinite(params.stageResults.map((result) => result.stepsPresented)), "totalStepsPresented");
  const totalStepsCompleted = requireFiniteCount(sumFinite(params.stageResults.map((result) => result.stepsCompleted)), "totalStepsCompleted");
  const averageStepTimeMs = weightedAverageFinite(params.stageResults.flatMap((result) =>
    result.averageStepTimeMs === null ? [] : [{ value: result.averageStepTimeMs, weight: result.stepsCompleted }],
  ));

  return {
    sessionId: params.sessionId,
    childFirstName: params.childFirstName,
    startingDifficulty: params.startingDifficulty,
    difficultiesPlayed: footstepsDifficultiesPlayed(params.stageResults),
    stageResults: [...params.stageResults],
    totalStepsPresented,
    totalStepsCompleted,
    completionRate: calculateCompletionRate(totalStepsCompleted, totalStepsPresented),
    totalDurationMs: requireNonNegativeFiniteNumber(params.totalDurationMs, "totalDurationMs"),
    averageStepTimeMs,
    bestStage: pickBestFootstepsStage(params.stageResults),
    completedAt: params.completedAt,
  };
}

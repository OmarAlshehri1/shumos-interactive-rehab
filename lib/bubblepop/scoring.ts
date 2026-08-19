import { DIFFICULTY_ORDER } from "@/lib/game";
import {
  type BubblePopSessionSummary,
  type BubblePopStageResult,
  BubblePopStageStatus,
  type Difficulty,
  type StageNumber,
} from "./types";
import { nonNegativeFiniteNumber, requireFiniteCount, requireNonNegativeFiniteNumber, safeRatio, sumFinite, weightedAverageFinite } from "@/lib/dataIntegrity/numeric";

/** targetsCompleted / targetsPresented — null when nothing was presented. */
export function calculateCompletionRate(targetsCompleted: number, targetsPresented: number): number | null {
  return safeRatio(targetsCompleted, targetsPresented);
}

/** targetsCompleted / (targetsCompleted + incorrectCount) — null when nothing was attempted. */
export function calculateAccuracy(targetsCompleted: number, incorrectCount: number): number | null {
  const total = sumFinite([nonNegativeFiniteNumber(targetsCompleted), nonNegativeFiniteNumber(incorrectCount)]);
  return total === null ? null : safeRatio(targetsCompleted, total);
}

/** Mean of the given response times; null (not NaN/0) when there were none — "no data" and "instant" are different things. */
export function averageResponseTime(responseTimesMs: readonly number[]): number | null {
  if (responseTimesMs.length === 0) return null;
  const sum = sumFinite(responseTimesMs.map(nonNegativeFiniteNumber));
  if (sum === null) return null;
  return sum / responseTimesMs.length;
}

export interface FinalizeBubblePopStageResultParams {
  difficulty: Difficulty;
  stageNumber: StageNumber;
  status: BubblePopStageStatus;
  targetsPresented: number;
  targetsCompleted: number;
  incorrectCount: number;
  /** Null for a stage jumped over and never actually entered. */
  durationMs: number | null;
  responseTimesMs: readonly number[];
}

export function finalizeBubblePopStageResult(params: FinalizeBubblePopStageResultParams): BubblePopStageResult {
  return {
    difficulty: params.difficulty,
    stageNumber: params.stageNumber,
    status: params.status,
    targetsPresented: params.targetsPresented,
    targetsCompleted: params.targetsCompleted,
    incorrectCount: params.incorrectCount,
    durationMs: params.durationMs,
    averageResponseTimeMs: averageResponseTime(params.responseTimesMs),
  };
}

/** Every difficulty with at least one played stage, in canonical order. */
export function bubblePopDifficultiesPlayed(stageResults: readonly BubblePopStageResult[]): Difficulty[] {
  const present = new Set(stageResults.map((r) => r.difficulty));
  return DIFFICULTY_ORDER.filter((d) => present.has(d));
}

/** Picks the best-performing COMPLETED stage: highest completion rate first, ties broken by higher accuracy, then by lower average response time. A SKIPPED stage never wins. */
function pickBestBubblePopStage(stageResults: readonly BubblePopStageResult[]): { difficulty: Difficulty; stageNumber: StageNumber } | null {
  const completed = stageResults.filter((r) => r.status === BubblePopStageStatus.COMPLETED && r.targetsPresented > 0);
  if (completed.length === 0) return null;

  let best = completed[0];
  let bestRate = calculateCompletionRate(best.targetsCompleted, best.targetsPresented)!;
  let bestAccuracy = calculateAccuracy(best.targetsCompleted, best.incorrectCount) ?? -1;
  for (const result of completed.slice(1)) {
    const rate = calculateCompletionRate(result.targetsCompleted, result.targetsPresented)!;
    const accuracy = calculateAccuracy(result.targetsCompleted, result.incorrectCount) ?? -1;
    if (rate > bestRate) {
      best = result;
      bestRate = rate;
      bestAccuracy = accuracy;
      continue;
    }
    if (rate === bestRate) {
      if (accuracy > bestAccuracy) {
        best = result;
        bestAccuracy = accuracy;
        continue;
      }
      if (accuracy === bestAccuracy) {
        const bestResponseTime = best.averageResponseTimeMs ?? Infinity;
        const resultResponseTime = result.averageResponseTimeMs ?? Infinity;
        if (resultResponseTime < bestResponseTime) best = result;
      }
    }
  }
  return { difficulty: best.difficulty, stageNumber: best.stageNumber };
}

export interface BuildBubblePopSessionSummaryParams {
  sessionId: string;
  childFirstName: string;
  startingDifficulty: Difficulty;
  stageResults: readonly BubblePopStageResult[];
  totalDurationMs: number;
  completedAt: string;
}

export function buildBubblePopSessionSummary(params: BuildBubblePopSessionSummaryParams): BubblePopSessionSummary {
  const totalTargetsPresented = requireFiniteCount(sumFinite(params.stageResults.map((result) => result.targetsPresented)), "totalTargetsPresented");
  const totalTargetsCompleted = requireFiniteCount(sumFinite(params.stageResults.map((result) => result.targetsCompleted)), "totalTargetsCompleted");
  const totalIncorrect = requireFiniteCount(sumFinite(params.stageResults.map((result) => result.incorrectCount)), "totalIncorrect");
  const averageResponseTimeMs = weightedAverageFinite(params.stageResults.flatMap((result) =>
    result.averageResponseTimeMs === null ? [] : [{ value: result.averageResponseTimeMs, weight: result.targetsCompleted }],
  ));

  return {
    sessionId: params.sessionId,
    childFirstName: params.childFirstName,
    startingDifficulty: params.startingDifficulty,
    difficultiesPlayed: bubblePopDifficultiesPlayed(params.stageResults),
    stageResults: [...params.stageResults],
    totalTargetsPresented,
    totalTargetsCompleted,
    totalIncorrect,
    completionRate: calculateCompletionRate(totalTargetsCompleted, totalTargetsPresented),
    accuracy: calculateAccuracy(totalTargetsCompleted, totalIncorrect),
    totalDurationMs: requireNonNegativeFiniteNumber(params.totalDurationMs, "totalDurationMs"),
    averageResponseTimeMs,
    bestStage: pickBestBubblePopStage(params.stageResults),
    completedAt: params.completedAt,
  };
}

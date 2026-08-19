import { DIFFICULTY_ORDER } from "@/lib/game";
import { type Difficulty, type FeedAnimalsSessionSummary, type FeedAnimalsStageResult, FeedAnimalsStageStatus, type StageNumber } from "./types";
import { nonNegativeFiniteNumber, requireFiniteCount, requireNonNegativeFiniteNumber, safeRatio, sumFinite, weightedAverageFinite } from "@/lib/dataIntegrity/numeric";

/** roundsCompleted / roundsPresented — null when nothing was presented. */
export function calculateCompletionRate(roundsCompleted: number, roundsPresented: number): number | null {
  return safeRatio(roundsCompleted, roundsPresented);
}

/** roundsCompleted / (roundsCompleted + incorrectCount) — null when nothing was attempted. */
export function calculateAccuracy(roundsCompleted: number, incorrectCount: number): number | null {
  const total = sumFinite([nonNegativeFiniteNumber(roundsCompleted), nonNegativeFiniteNumber(incorrectCount)]);
  return total === null ? null : safeRatio(roundsCompleted, total);
}

/** Mean of the given response times; null (not NaN/0) when there were none — "no data" and "instant" are different things. */
export function averageResponseTime(responseTimesMs: readonly number[]): number | null {
  if (responseTimesMs.length === 0) return null;
  const sum = sumFinite(responseTimesMs.map(nonNegativeFiniteNumber));
  if (sum === null) return null;
  return sum / responseTimesMs.length;
}

export interface FinalizeFeedAnimalsStageResultParams {
  difficulty: Difficulty;
  stageNumber: StageNumber;
  status: FeedAnimalsStageStatus;
  roundsPresented: number;
  roundsCompleted: number;
  incorrectCount: number;
  /** Null for a stage jumped over and never actually entered. */
  durationMs: number | null;
  responseTimesMs: readonly number[];
}

export function finalizeFeedAnimalsStageResult(params: FinalizeFeedAnimalsStageResultParams): FeedAnimalsStageResult {
  return {
    difficulty: params.difficulty,
    stageNumber: params.stageNumber,
    status: params.status,
    roundsPresented: params.roundsPresented,
    roundsCompleted: params.roundsCompleted,
    incorrectCount: params.incorrectCount,
    durationMs: params.durationMs,
    averageResponseTimeMs: averageResponseTime(params.responseTimesMs),
  };
}

/** Every difficulty with at least one played stage, in canonical order. */
export function feedAnimalsDifficultiesPlayed(stageResults: readonly FeedAnimalsStageResult[]): Difficulty[] {
  const present = new Set(stageResults.map((r) => r.difficulty));
  return DIFFICULTY_ORDER.filter((d) => present.has(d));
}

/** Picks the best-performing COMPLETED stage: highest completion rate first, ties broken by higher accuracy, then by lower average response time. A SKIPPED stage never wins. */
function pickBestFeedAnimalsStage(stageResults: readonly FeedAnimalsStageResult[]): { difficulty: Difficulty; stageNumber: StageNumber } | null {
  const completed = stageResults.filter((r) => r.status === FeedAnimalsStageStatus.COMPLETED && r.roundsPresented > 0);
  if (completed.length === 0) return null;

  let best = completed[0];
  let bestRate = calculateCompletionRate(best.roundsCompleted, best.roundsPresented)!;
  let bestAccuracy = calculateAccuracy(best.roundsCompleted, best.incorrectCount) ?? -1;
  for (const result of completed.slice(1)) {
    const rate = calculateCompletionRate(result.roundsCompleted, result.roundsPresented)!;
    const accuracy = calculateAccuracy(result.roundsCompleted, result.incorrectCount) ?? -1;
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

export interface BuildFeedAnimalsSessionSummaryParams {
  sessionId: string;
  childFirstName: string;
  startingDifficulty: Difficulty;
  stageResults: readonly FeedAnimalsStageResult[];
  totalDurationMs: number;
  completedAt: string;
}

export function buildFeedAnimalsSessionSummary(params: BuildFeedAnimalsSessionSummaryParams): FeedAnimalsSessionSummary {
  const totalRoundsPresented = requireFiniteCount(sumFinite(params.stageResults.map((result) => result.roundsPresented)), "totalRoundsPresented");
  const totalRoundsCompleted = requireFiniteCount(sumFinite(params.stageResults.map((result) => result.roundsCompleted)), "totalRoundsCompleted");
  const totalIncorrect = requireFiniteCount(sumFinite(params.stageResults.map((result) => result.incorrectCount)), "totalIncorrect");
  const averageResponseTimeMs = weightedAverageFinite(params.stageResults.flatMap((result) =>
    result.averageResponseTimeMs === null ? [] : [{ value: result.averageResponseTimeMs, weight: result.roundsCompleted }],
  ));

  return {
    sessionId: params.sessionId,
    childFirstName: params.childFirstName,
    startingDifficulty: params.startingDifficulty,
    difficultiesPlayed: feedAnimalsDifficultiesPlayed(params.stageResults),
    stageResults: [...params.stageResults],
    totalRoundsPresented,
    totalRoundsCompleted,
    totalIncorrect,
    completionRate: calculateCompletionRate(totalRoundsCompleted, totalRoundsPresented),
    accuracy: calculateAccuracy(totalRoundsCompleted, totalIncorrect),
    totalDurationMs: requireNonNegativeFiniteNumber(params.totalDurationMs, "totalDurationMs"),
    averageResponseTimeMs,
    bestStage: pickBestFeedAnimalsStage(params.stageResults),
    completedAt: params.completedAt,
  };
}

import { Difficulty, type ColorChaseSessionSummary, type ColorChaseStageResult, type StageNumber } from "./types";
import { nonNegativeFiniteNumber, requireFiniteCount, requireNonNegativeFiniteNumber, safeRatio, sumFinite, weightedAverageFinite } from "@/lib/dataIntegrity/numeric";

export function colorChaseAccuracy(correct: number, incorrect: number, danger: number): number | null {
  const attempts = sumFinite([nonNegativeFiniteNumber(correct), nonNegativeFiniteNumber(incorrect), nonNegativeFiniteNumber(danger)]);
  return attempts === null ? null : safeRatio(correct, attempts);
}

export function averageColorChaseResponse(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sum = sumFinite(values.map(nonNegativeFiniteNumber));
  return sum === null ? null : sum / values.length;
}

export function buildColorChaseSummary(input: {
  sessionId: string;
  childFirstName: string;
  startingDifficulty: Difficulty;
  stageResults: ColorChaseStageResult[];
  totalDurationMs: number;
  completedAt: string;
}): ColorChaseSessionSummary {
  const completed = input.stageResults.filter((result) => result.status === "COMPLETED");
  const totalTargetsPresented = requireFiniteCount(sumFinite(input.stageResults.map((result) => result.targetsPresented)), "totalTargetsPresented");
  const totalCorrect = requireFiniteCount(sumFinite(input.stageResults.map((result) => result.correctCount)), "totalCorrect");
  const totalIncorrect = requireFiniteCount(sumFinite(input.stageResults.map((result) => result.incorrectCount)), "totalIncorrect");
  const totalDangerPresses = requireFiniteCount(sumFinite(input.stageResults.map((result) => result.dangerPressCount)), "totalDangerPresses");
  const averageResponseTimeMs = weightedAverageFinite(input.stageResults.flatMap((result) =>
    result.averageResponseTimeMs === null ? [] : [{ value: result.averageResponseTimeMs, weight: result.correctCount }],
  ));
  const difficultyOrder = [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.ADVANCED];
  const difficultiesPlayed = difficultyOrder.filter((difficulty) => input.stageResults.some((result) => result.difficulty === difficulty));
  const best = [...completed].filter((result) => result.accuracy !== null && Number.isFinite(result.accuracy)).sort((a, b) => b.accuracy! - a.accuracy! || b.correctCount - a.correctCount)[0] ?? null;
  return {
    ...input,
    totalDurationMs: requireNonNegativeFiniteNumber(input.totalDurationMs, "totalDurationMs"),
    difficultiesPlayed,
    totalTargetsPresented,
    totalCorrect,
    totalIncorrect,
    totalDangerPresses,
    accuracy: colorChaseAccuracy(totalCorrect, totalIncorrect, totalDangerPresses),
    averageResponseTimeMs,
    bestStage: best ? { difficulty: best.difficulty, stageNumber: best.stageNumber as StageNumber } : null,
  };
}

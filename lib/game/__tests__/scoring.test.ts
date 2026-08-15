import { describe, expect, it } from "vitest";
import { averageReactionTime, buildSessionSummary, calculateAccuracy, difficultiesPlayed, finalizeStageResult } from "../scoring";
import { BalloonColor, Difficulty, StageStatus } from "../types";

describe("calculateAccuracy", () => {
  it("divides correct by (correct + incorrect)", () => {
    expect(calculateAccuracy(3, 1)).toBeCloseTo(0.75);
    expect(calculateAccuracy(4, 0)).toBe(1);
    expect(calculateAccuracy(0, 4)).toBe(0);
  });

  it("returns 0, not NaN, when nothing was attempted", () => {
    expect(calculateAccuracy(0, 0)).toBe(0);
  });
});

describe("averageReactionTime", () => {
  it("returns the mean of the given reaction times", () => {
    expect(averageReactionTime([1000, 2000, 3000])).toBe(2000);
  });

  it("returns null, not NaN, for an empty list", () => {
    expect(averageReactionTime([])).toBeNull();
  });
});

describe("finalizeStageResult", () => {
  it("computes accuracy and average reaction time consistently for a completed stage", () => {
    const result = finalizeStageResult({
      difficulty: Difficulty.EASY,
      stageNumber: 1,
      status: StageStatus.COMPLETED,
      targetColor: BalloonColor.BLUE,
      correctCount: 3,
      incorrectCount: 1,
      totalTargets: 3,
      durationMs: 9000,
      reactionTimesMs: [1000, 1500, 2000],
    });

    expect(result.accuracy).toBeCloseTo(0.75);
    expect(result.averageReactionTimeMs).toBeCloseTo(1500);
    expect(result.status).toBe(StageStatus.COMPLETED);
  });

  it("leaves accuracy null for a stage that was jumped over and never entered", () => {
    const result = finalizeStageResult({
      difficulty: Difficulty.EASY,
      stageNumber: 2,
      status: StageStatus.SKIPPED,
      targetColor: null,
      correctCount: 0,
      incorrectCount: 0,
      totalTargets: 0,
      durationMs: null,
      reactionTimesMs: [],
    });

    expect(result.accuracy).toBeNull();
    expect(result.durationMs).toBeNull();
    expect(result.status).toBe(StageStatus.SKIPPED);
  });
});

describe("difficultiesPlayed", () => {
  it("returns only the difficulties with at least one result, in canonical order", () => {
    const results = [
      finalizeStageResult({
        difficulty: Difficulty.ADVANCED,
        stageNumber: 3,
        status: StageStatus.COMPLETED,
        targetColor: BalloonColor.RED,
        correctCount: 3,
        incorrectCount: 0,
        totalTargets: 3,
        durationMs: 1000,
        reactionTimesMs: [500],
      }),
      finalizeStageResult({
        difficulty: Difficulty.EASY,
        stageNumber: 1,
        status: StageStatus.COMPLETED,
        targetColor: BalloonColor.BLUE,
        correctCount: 2,
        incorrectCount: 0,
        totalTargets: 2,
        durationMs: 1000,
        reactionTimesMs: [500],
      }),
    ];
    expect(difficultiesPlayed(results)).toEqual([Difficulty.EASY, Difficulty.ADVANCED]);
  });

  it("returns an empty array for no results", () => {
    expect(difficultiesPlayed([])).toEqual([]);
  });
});

describe("buildSessionSummary", () => {
  it("aggregates totals and picks the best COMPLETED stage by accuracy", () => {
    const stage1 = finalizeStageResult({
      difficulty: Difficulty.MEDIUM,
      stageNumber: 1,
      status: StageStatus.COMPLETED,
      targetColor: BalloonColor.BLUE,
      correctCount: 2,
      incorrectCount: 2,
      totalTargets: 2,
      durationMs: 5000,
      reactionTimesMs: [1000, 1000],
    });
    const stage2 = finalizeStageResult({
      difficulty: Difficulty.MEDIUM,
      stageNumber: 2,
      status: StageStatus.COMPLETED,
      targetColor: BalloonColor.RED,
      correctCount: 3,
      incorrectCount: 0,
      totalTargets: 3,
      durationMs: 6000,
      reactionTimesMs: [800, 900, 700],
    });

    const summary = buildSessionSummary({
      sessionId: "session-1",
      childFirstName: "Layla",
      startingDifficulty: Difficulty.MEDIUM,
      stageResults: [stage1, stage2],
      totalDurationMs: 11000,
      completedAt: "2026-08-14T00:00:00.000Z",
    });

    expect(summary.totalCorrect).toBe(5);
    expect(summary.totalIncorrect).toBe(2);
    expect(summary.overallAccuracy).toBeCloseTo(5 / 7);
    expect(summary.bestStage).toEqual({ difficulty: Difficulty.MEDIUM, stageNumber: 2 }); // 100% accuracy beats 50%
    expect(summary.difficultiesPlayed).toEqual([Difficulty.MEDIUM]);
  });

  it("breaks accuracy ties by the faster average reaction time", () => {
    const fast = finalizeStageResult({
      difficulty: Difficulty.EASY,
      stageNumber: 1,
      status: StageStatus.COMPLETED,
      targetColor: BalloonColor.BLUE,
      correctCount: 2,
      incorrectCount: 0,
      totalTargets: 2,
      durationMs: 4000,
      reactionTimesMs: [500, 500],
    });
    const slow = finalizeStageResult({
      difficulty: Difficulty.EASY,
      stageNumber: 2,
      status: StageStatus.COMPLETED,
      targetColor: BalloonColor.RED,
      correctCount: 2,
      incorrectCount: 0,
      totalTargets: 2,
      durationMs: 4000,
      reactionTimesMs: [2000, 2000],
    });

    const summary = buildSessionSummary({
      sessionId: "session-2",
      childFirstName: "Omar",
      startingDifficulty: Difficulty.EASY,
      stageResults: [slow, fast],
      totalDurationMs: 8000,
      completedAt: "2026-08-14T00:00:00.000Z",
    });

    expect(summary.bestStage).toEqual({ difficulty: Difficulty.EASY, stageNumber: 1 }); // both 100% accurate, stage 1 was faster
  });

  it("never picks a SKIPPED stage as bestStage even if it has real partial data", () => {
    const skippedWithPartialData = finalizeStageResult({
      difficulty: Difficulty.EASY,
      stageNumber: 1,
      status: StageStatus.SKIPPED,
      targetColor: BalloonColor.BLUE,
      correctCount: 5,
      incorrectCount: 0,
      totalTargets: 5,
      durationMs: 1000,
      reactionTimesMs: [100],
    });
    const completed = finalizeStageResult({
      difficulty: Difficulty.EASY,
      stageNumber: 2,
      status: StageStatus.COMPLETED,
      targetColor: BalloonColor.RED,
      correctCount: 1,
      incorrectCount: 1,
      totalTargets: 2,
      durationMs: 4000,
      reactionTimesMs: [2000],
    });

    const summary = buildSessionSummary({
      sessionId: "session-4",
      childFirstName: "Nora",
      startingDifficulty: Difficulty.EASY,
      stageResults: [skippedWithPartialData, completed],
      totalDurationMs: 5000,
      completedAt: "2026-08-14T00:00:00.000Z",
    });

    expect(summary.bestStage).toEqual({ difficulty: Difficulty.EASY, stageNumber: 2 });
  });

  it("returns bestStage null when there are no COMPLETED stage results", () => {
    const summary = buildSessionSummary({
      sessionId: "session-3",
      childFirstName: "Sara",
      startingDifficulty: Difficulty.EASY,
      stageResults: [],
      totalDurationMs: 0,
      completedAt: "2026-08-14T00:00:00.000Z",
    });
    expect(summary.bestStage).toBeNull();
    expect(summary.overallAccuracy).toBe(0);
    expect(summary.averageReactionTimeMs).toBeNull();
    expect(summary.difficultiesPlayed).toEqual([]);
  });
});

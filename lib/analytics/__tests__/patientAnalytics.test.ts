import { describe, expect, it } from "vitest";
import { Difficulty, StageStatus } from "@/lib/game";
import { buildPatientAnalytics, buildSessionInsights } from "../patientAnalytics";
import type { AnyStoredSession, StoredColorChaseSession, StoredSession } from "@/lib/sessions/types";

const NOW = Date.UTC(2026, 7, 18);

function balloon(overrides: Partial<StoredSession> = {}): StoredSession {
  return {
    sessionId: "balloon-1", patientId: "patient-a", gameId: "balloon-quest", startedAt: NOW - 10_000,
    completedAt: NOW, createdByUid: "staff", startingDifficulty: Difficulty.EASY, startingStage: 1,
    endingDifficulty: Difficulty.EASY, endingStage: 2, completedStageCount: 1, skippedStageCount: 1,
    totalCorrect: 8, totalIncorrect: 2, accuracy: .8, durationMs: 10_000, averageReactionTimeMs: 3000,
    bestStage: { difficulty: Difficulty.EASY, stageNumber: 1 },
    stageResults: [
      { difficulty: Difficulty.EASY, stageNumber: 1, status: StageStatus.COMPLETED, correct: 8, incorrect: 2, accuracy: .8, durationMs: 7000, averageReactionTimeMs: 3000 },
      { difficulty: Difficulty.EASY, stageNumber: 2, status: StageStatus.SKIPPED, correct: 0, incorrect: 0, accuracy: null, durationMs: 1000, averageReactionTimeMs: null },
    ],
    ...overrides,
  };
}

function color(overrides: Partial<StoredColorChaseSession> = {}): StoredColorChaseSession {
  return {
    sessionId: "color-1", patientId: "patient-a", gameId: "color-chase", startedAt: NOW - 20_000,
    completedAt: NOW - 1000, createdByUid: "staff", startingDifficulty: Difficulty.MEDIUM, startingStage: 1,
    endingDifficulty: Difficulty.MEDIUM, endingStage: 3, completedStageCount: 2, skippedStageCount: 0,
    totalTargetsPresented: 10, totalCorrect: 9, totalIncorrect: 1, totalDangerPresses: 0, accuracy: .9,
    durationMs: 19_000, averageResponseTimeMs: 2200, bestStage: { difficulty: Difficulty.MEDIUM, stageNumber: 3 },
    stageResults: [
      { difficulty: Difficulty.MEDIUM, stageNumber: 1, status: StageStatus.COMPLETED, targetsPresented: 5, correctCount: 4, incorrectCount: 1, dangerPressCount: 0, accuracy: .8, durationMs: 8000, averageResponseTimeMs: 2400 },
      { difficulty: Difficulty.MEDIUM, stageNumber: 3, status: StageStatus.COMPLETED, targetsPresented: 5, correctCount: 5, incorrectCount: 0, dangerPressCount: 0, accuracy: 1, durationMs: 7000, averageResponseTimeMs: 2000 },
    ],
    ...overrides,
  };
}

describe("patient analytics", () => {
  it("handles an empty history without inventing metrics", () => {
    const analytics = buildPatientAnalytics([], "patient-a", "all", NOW);
    expect(analytics.totalSessions).toBe(0);
    expect(analytics.totalActivePlayTimeMs).toBeNull();
    expect(analytics.averageStageDurationMs).toBeNull();
    expect(analytics.completionRate).toBeNull();
  });

  it("calculates exact core metrics without mixing patients", () => {
    const analytics = buildPatientAnalytics([
      balloon(), color(), balloon({ sessionId: "other", patientId: "patient-b", totalCorrect: 999 }),
    ], "patient-a", "all", NOW);
    expect(analytics.totalSessions).toBe(2);
    expect(analytics.totalActivePlayTimeMs).toBe(23_000);
    expect(analytics.averageStageDurationMs).toBe(5750);
    expect(analytics.completedStages).toBe(3);
    expect(analytics.skippedStages).toBe(1);
    expect(analytics.completionRate).toBe(.75);
  });

  it("keeps per-game metrics isolated", () => {
    const analytics = buildPatientAnalytics([balloon(), color()], "patient-a", "all", NOW);
    const balloonMetrics = analytics.perGame.find((game) => game.gameId === "balloon-quest")!.metrics;
    const chaseMetrics = analytics.perGame.find((game) => game.gameId === "color-chase")!.metrics;
    expect(balloonMetrics.find((item) => item.key === "correct")?.value).toBe(8);
    expect(chaseMetrics.find((item) => item.key === "correctPads")?.value).toBe(9);
    expect(balloonMetrics.some((item) => item.key === "danger")).toBe(false);
  });

  it("does not invent trends for a small dataset", () => {
    const analytics = buildPatientAnalytics([balloon()], "patient-a", "all", NOW);
    expect(analytics.hasTrendData).toBe(false);
    expect(analytics.insights.some((item) => item.includes("ارتفعت") || item.includes("انخفضت"))).toBe(false);
  });

  it("derives neutral earlier-versus-recent trends from four sessions", () => {
    const sessions: AnyStoredSession[] = [
      balloon({ sessionId: "1", completedAt: NOW - 4_000, accuracy: .68, averageReactionTimeMs: 4100 }),
      balloon({ sessionId: "2", completedAt: NOW - 3_000, accuracy: .70, averageReactionTimeMs: 4000 }),
      balloon({ sessionId: "3", completedAt: NOW - 2_000, accuracy: .82, averageReactionTimeMs: 3000, endingDifficulty: Difficulty.MEDIUM }),
      balloon({ sessionId: "4", completedAt: NOW - 1_000, accuracy: .80, averageReactionTimeMs: 3200, endingDifficulty: Difficulty.MEDIUM }),
    ];
    const analytics = buildPatientAnalytics(sessions, "patient-a", "all", NOW);
    expect(analytics.hasTrendData).toBe(true);
    expect(analytics.insights.join(" ")).toContain("ارتفعت دقة اللعب");
    expect(analytics.insights.join(" ")).toContain("انخفض متوسط زمن الاستجابة");
  });

  it("filters time windows and excludes unsaved/walk-in identifiers", () => {
    const old = balloon({ sessionId: "old", completedAt: NOW - 40 * 86_400_000 });
    const walkInLike = balloon({ sessionId: "walk-in", patientId: "" });
    expect(buildPatientAnalytics([old, balloon(), walkInLike], "patient-a", "30d", NOW).totalSessions).toBe(1);
    expect(buildPatientAnalytics([walkInLike], "patient-a", "all", NOW).totalSessions).toBe(0);
  });

  it("reports repeated stages and skipped attempts from immutable history", () => {
    const repeated = balloon({
      completedStageCount: 1,
      skippedStageCount: 1,
      stageResults: [
        { difficulty: Difficulty.EASY, stageNumber: 1, status: StageStatus.SKIPPED, correct: 1, incorrect: 0, accuracy: 1, durationMs: 1000, averageReactionTimeMs: 500 },
        { difficulty: Difficulty.EASY, stageNumber: 1, status: StageStatus.COMPLETED, correct: 2, incorrect: 0, accuracy: 1, durationMs: 1000, averageReactionTimeMs: 400 },
      ],
    });
    const insights = buildSessionInsights(repeated).join(" ");
    expect(insights).toContain("تم تخطي 1 مرحلة");
    expect(insights).toContain("1 إعادة محاولة");
  });

  it("quarantines hostile legacy numerics and never emits NaN/Infinity metrics or insights", () => {
    const hostile = balloon({
      sessionId: "hostile",
      completedAt: Number.NaN,
      completedStageCount: undefined as never,
      skippedStageCount: null as never,
      totalCorrect: Number.POSITIVE_INFINITY,
      accuracy: Number.NaN,
      averageReactionTimeMs: -20,
      durationMs: -1,
      stageResults: [{
        difficulty: Difficulty.EASY,
        stageNumber: 1,
        status: StageStatus.COMPLETED,
        correct: 0,
        incorrect: 0,
        accuracy: Number.NaN,
        durationMs: undefined as never,
        averageReactionTimeMs: Number.POSITIVE_INFINITY,
      }],
    });
    const analytics = buildPatientAnalytics([hostile, balloon({ sessionId: "valid", durationMs: 0 })], "patient-a", "all", NOW);
    expect(analytics.completedStages).toBeNull();
    expect(analytics.skippedStages).toBeNull();
    expect(analytics.completionRate).toBeNull();
    for (const game of analytics.perGame) {
      for (const metric of game.metrics) expect(Number.isFinite(metric.value)).toBe(true);
    }
    for (const point of analytics.trendPoints) {
      expect(Number.isFinite(point.completedAt)).toBe(true);
      if (point.accuracy !== null) expect(Number.isFinite(point.accuracy)).toBe(true);
      if (point.responseTimeMs !== null) expect(Number.isFinite(point.responseTimeMs)).toBe(true);
    }
    expect(analytics.insights.join(" ")).not.toMatch(/NaN|Infinity|undefined|null|Invalid Date/);
    expect(buildSessionInsights(hostile).join(" ")).not.toMatch(/NaN|Infinity|undefined|null|Invalid Date/);
  });

  it("keeps responseTime=0 as valid data while missing response time stays unavailable", () => {
    const analytics = buildPatientAnalytics([
      balloon({ sessionId: "zero", averageReactionTimeMs: 0 }),
      balloon({ sessionId: "missing", averageReactionTimeMs: null }),
    ], "patient-a", "all", NOW);
    const response = analytics.perGame[0]!.metrics.find((metric) => metric.key === "response");
    expect(response?.value).toBe(0);
  });
});

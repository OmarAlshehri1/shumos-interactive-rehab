import { describe, expect, it } from "vitest";
import { reviveFeedAnimalsSessionState } from "../serialization";

/**
 * MULTI-GAME PLATFORM — Feed the Animals' own RTDB-round-trip repair
 * coverage, mirroring bubblePopSerialization.test.ts's tests for the same
 * "RTDB drops empty arrays and null scalars on read-back" behavior, applied
 * to FeedAnimalsSessionState's field names instead.
 */
describe("reviveFeedAnimalsSessionState", () => {
  it("restores results/rounds to [] when RTDB dropped them (brand-new session)", () => {
    const raw = {
      sessionId: "s1",
      seed: "seed",
      config: { childFirstName: "عمر", difficulty: "EASY", foodSize: "MEDIUM", reachHeight: "FULL", reachSide: "FULL", movementPattern: "VARIED", startingStage: 1 },
      gameState: "WELCOME",
      currentDifficulty: "EASY",
      currentStage: {
        kind: "path",
        difficulty: "EASY",
        stageNumber: 1,
        rounds: [],
        currentRoundIndex: 0,
        totalPausedMs: 0,
        roundPausedMs: 0,
      },
      createdAt: 1,
      workflow: { sessionGoal: "MOVEMENT_REACH", endReason: "CHANGE_ACTIVITY" },
      // results/endedAt/summary intentionally absent, matching what RTDB actually returns
    };

    const revived = reviveFeedAnimalsSessionState(raw);
    expect(revived.results).toEqual([]);
    expect(revived.endedAt).toBeNull();
    expect(revived.summary).toBeNull();
    expect(revived.currentStage.rounds).toEqual([]);
    expect(revived.workflow).toEqual({ sessionGoal: "MOVEMENT_REACH", endReason: "CHANGE_ACTIVITY" });
  });

  it("restores pausedAt/startedAt/completedAt/roundStartedAt/incorrectCount to their defaults when RTDB dropped them", () => {
    const raw = {
      sessionId: "s1",
      seed: "seed",
      config: { childFirstName: "عمر", difficulty: "EASY", foodSize: "MEDIUM", reachHeight: "FULL", reachSide: "FULL", movementPattern: "VARIED", startingStage: 1 },
      gameState: "PLAYING",
      currentDifficulty: "EASY",
      currentStage: {
        kind: "path",
        difficulty: "EASY",
        stageNumber: 1,
        rounds: [
          {
            id: "r1",
            animal: "MONKEY",
            correctFood: "BANANA",
            animalPosition: { x: 0.5, y: 0.2 },
            choices: [{ id: "c1", food: "BANANA", position: { x: 0.4, y: 0.6 }, size: 0.2 }],
            fed: false,
          },
        ],
        currentRoundIndex: 0,
        totalPausedMs: 0,
        roundPausedMs: 0,
        // startedAt/completedAt/pausedAt/roundStartedAt/responseTimesMs/incorrectCount intentionally absent
      },
      createdAt: 1,
    };

    const revived = reviveFeedAnimalsSessionState(raw);
    const stage = revived.currentStage;
    expect(stage.pausedAt).toBeNull();
    expect(stage.startedAt).toBeNull();
    expect(stage.completedAt).toBeNull();
    expect(stage.roundStartedAt).toBeNull();
    expect(stage.responseTimesMs).toEqual([]);
    expect(stage.incorrectCount).toBe(0);
  });

  it("restores empty summary arrays and keeps no-attempt accuracy unavailable", () => {
    const raw = {
      sessionId: "s1",
      seed: "seed",
      config: { childFirstName: "عمر", difficulty: "EASY", foodSize: "MEDIUM", reachHeight: "FULL", reachSide: "FULL", movementPattern: "VARIED", startingStage: 1 },
      gameState: "SESSION_COMPLETE",
      currentDifficulty: "EASY",
      currentStage: {
        kind: "path",
        difficulty: "EASY",
        stageNumber: 1,
        rounds: [],
        currentRoundIndex: 0,
        totalPausedMs: 0,
        roundPausedMs: 0,
      },
      createdAt: 1,
      endedAt: 2,
      summary: {
        sessionId: "s1",
        childFirstName: "عمر",
        startingDifficulty: "EASY",
        totalRoundsPresented: 0,
        totalRoundsCompleted: 0,
        completionRate: 0,
        totalDurationMs: 1,
        completedAt: "2026-01-01T00:00:00.000Z",
        // stageResults/difficultiesPlayed/totalIncorrect/accuracy/averageResponseTimeMs/bestStage intentionally absent
      },
    };

    const revived = reviveFeedAnimalsSessionState(raw);
    expect(revived.summary?.stageResults).toEqual([]);
    expect(revived.summary?.difficultiesPlayed).toEqual([]);
    expect(revived.summary?.totalIncorrect).toBe(0);
    expect(revived.summary?.completionRate).toBeNull();
    expect(revived.summary?.accuracy).toBeNull();
    expect(revived.summary?.averageResponseTimeMs).toBeNull();
    expect(revived.summary?.bestStage).toBeNull();
  });

  it("preserves genuinely-present values unchanged", () => {
    const raw = {
      sessionId: "s1",
      seed: "seed",
      config: { childFirstName: "عمر", difficulty: "ADVANCED", foodSize: "SMALL", reachHeight: "HIGH", reachSide: "LEFT", movementPattern: "CROSS", startingStage: 1 },
      gameState: "PLAYING",
      currentDifficulty: "ADVANCED",
      currentStage: {
        difficulty: "ADVANCED",
        stageNumber: 1,
        rounds: [
          {
            id: "r1",
            animal: "GIRAFFE",
            correctFood: "LEAVES",
            animalPosition: { x: 0.3, y: 0.2 },
            choices: [{ id: "c1", food: "LEAVES", position: { x: 0.6, y: 0.5 }, size: 0.13 }],
            fed: true,
          },
        ],
        currentRoundIndex: 1,
        incorrectCount: 2,
        responseTimesMs: [450, 600],
        startedAt: 1000,
        completedAt: null,
        pausedAt: 1500,
        totalPausedMs: 200,
        roundStartedAt: 1600,
        roundPausedMs: 50,
      },
      results: [
        { difficulty: "ADVANCED", stageNumber: 1, status: "COMPLETED", roundsPresented: 3, roundsCompleted: 3, incorrectCount: 1, durationMs: 5000, averageResponseTimeMs: 600 },
      ],
      createdAt: 1,
    };

    const revived = reviveFeedAnimalsSessionState(raw);
    expect(revived.currentStage.pausedAt).toBe(1500);
    expect(revived.currentStage.responseTimesMs).toEqual([450, 600]);
    expect(revived.currentStage.incorrectCount).toBe(2);
    expect(revived.currentStage.rounds[0]!.fed).toBe(true);
    expect(revived.results[0]!.averageResponseTimeMs).toBe(600);
    expect(revived.results[0]!.status).toBe("COMPLETED");
  });

  it("rejects an impossible animal/food mapping instead of reviving ambiguous scoring", () => {
    expect(() =>
      reviveFeedAnimalsSessionState({
        sessionId: "bad-feed",
        seed: "seed",
        config: { childFirstName: "عمر", difficulty: "MEDIUM", foodSize: "MEDIUM", reachHeight: "FULL", reachSide: "FULL", movementPattern: "VARIED", startingStage: 1 },
        gameState: "PLAYING",
        currentDifficulty: "MEDIUM",
        currentStage: {
          kind: "rounds",
          difficulty: "MEDIUM",
          stageNumber: 1,
          rounds: [{ id: "r1", animal: "GIRAFFE", correctFood: "BANANA", animalPosition: { x: 0.3, y: 0.2 }, choices: [{ id: "c1", food: "BANANA", position: { x: 0.6, y: 0.5 }, size: 0.13 }] }],
          currentRoundIndex: 0,
          totalPausedMs: 0,
          roundPausedMs: 0,
        },
        createdAt: 1,
      }),
    ).toThrow(/correct choice/);
  });
});

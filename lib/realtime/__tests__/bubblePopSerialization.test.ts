import { describe, expect, it } from "vitest";
import { reviveBubblePopSessionState } from "../serialization";

/**
 * MULTI-GAME PLATFORM — Bubble Pop Wall's own RTDB-round-trip repair
 * coverage, mirroring footstepsSerialization.test.ts's tests for the same
 * "RTDB drops empty arrays and null scalars on read-back" behavior, applied
 * to BubblePopSessionState's field names instead.
 */
describe("reviveBubblePopSessionState", () => {
  it("restores results to [] while preserving a valid brand-new stage", () => {
    const raw = {
      sessionId: "s1",
      seed: "seed",
      config: { childFirstName: "عمر", difficulty: "EASY", bubbleSize: "MEDIUM", reachHeight: "FULL", reachSide: "FULL", targetMode: "COLOR_ONLY", startingStage: 1 },
      gameState: "WELCOME",
      currentDifficulty: "EASY",
      currentStage: {
        difficulty: "EASY",
        stageNumber: 1,
        bubbles: [{ id: "b1", index: 0, color: "RED", shape: "CIRCLE", position: { x: 0.5, y: 0.5 }, size: 0.2, isPopped: false }],
        targetSequence: ["b1"],
        currentTargetIndex: 0,
        totalPausedMs: 0,
        targetPausedMs: 0,
      },
      createdAt: 1,
      workflow: { sessionGoal: "VISUAL_DISCRIMINATION" },
      // results/endedAt/summary intentionally absent, matching what RTDB actually returns
    };

    const revived = reviveBubblePopSessionState(raw);
    expect(revived.results).toEqual([]);
    expect(revived.endedAt).toBeNull();
    expect(revived.summary).toBeNull();
    expect(revived.currentStage.bubbles).toHaveLength(1);
    expect(revived.currentStage.targetSequence).toEqual(["b1"]);
    expect(revived.workflow?.sessionGoal).toBe("VISUAL_DISCRIMINATION");
  });

  it("restores pausedAt/startedAt/completedAt/targetStartedAt/incorrectCount to their defaults when RTDB dropped them", () => {
    const raw = {
      sessionId: "s1",
      seed: "seed",
      config: { childFirstName: "عمر", difficulty: "EASY", bubbleSize: "MEDIUM", reachHeight: "FULL", reachSide: "FULL", targetMode: "COLOR_ONLY", startingStage: 1 },
      gameState: "PLAYING",
      currentDifficulty: "EASY",
      currentStage: {
        difficulty: "EASY",
        stageNumber: 1,
        bubbles: [{ id: "b1", index: 0, color: "RED", shape: "CIRCLE", position: { x: 0.5, y: 0.5 }, size: 0.2, isPopped: false }],
        targetSequence: ["b1"],
        currentTargetIndex: 0,
        totalPausedMs: 0,
        targetPausedMs: 0,
        // startedAt/completedAt/pausedAt/targetStartedAt/responseTimesMs/incorrectCount intentionally absent
      },
      createdAt: 1,
    };

    const revived = reviveBubblePopSessionState(raw);
    const stage = revived.currentStage;
    expect(stage.pausedAt).toBeNull();
    expect(stage.startedAt).toBeNull();
    expect(stage.completedAt).toBeNull();
    expect(stage.targetStartedAt).toBeNull();
    expect(stage.responseTimesMs).toEqual([]);
    expect(stage.incorrectCount).toBe(0);
    // Phase 2 — a plain color mission's `stationTokens` is an empty array, which RTDB
    // drops just like any other field; requiresShape/stationTokens must default safely.
    expect(stage.bubbles[0].requiresShape).toBe(false);
    expect(stage.bubbles[0].stationTokens).toEqual([]);
  });

  it("preserves a color+shape mission's requiresShape/stationTokens when genuinely present", () => {
    const raw = {
      sessionId: "s1",
      seed: "seed",
      config: { childFirstName: "عمر", difficulty: "ADVANCED", bubbleSize: "MEDIUM", reachHeight: "FULL", reachSide: "FULL", targetMode: "COLOR_ONLY", startingStage: 2 },
      gameState: "PLAYING",
      currentDifficulty: "ADVANCED",
      currentStage: {
        difficulty: "ADVANCED",
        stageNumber: 2,
        bubbles: [
          {
            id: "b1",
            index: 0,
            color: "BLUE",
            shape: "STAR",
            lane: 0.2,
            direction: "RIGHT_TO_LEFT",
            travelMs: 8000,
            size: 0.13,
            isPopped: false,
            requiresShape: true,
            stationTokens: [
              { color: "BLUE", shape: "STAR" },
              { color: "YELLOW", shape: "HEART" },
            ],
          },
        ],
        targetSequence: ["b1"],
        currentTargetIndex: 0,
        totalPausedMs: 0,
        targetPausedMs: 0,
      },
      createdAt: 1,
    };

    const revived = reviveBubblePopSessionState(raw);
    expect(revived.currentStage.bubbles[0].requiresShape).toBe(true);
    expect(revived.currentStage.bubbles[0].stationTokens).toEqual([
      { color: "BLUE", shape: "STAR" },
      { color: "YELLOW", shape: "HEART" },
    ]);
  });

  it("restores empty summary arrays and keeps no-attempt accuracy unavailable", () => {
    const raw = {
      sessionId: "s1",
      seed: "seed",
      config: { childFirstName: "عمر", difficulty: "EASY", bubbleSize: "MEDIUM", reachHeight: "FULL", reachSide: "FULL", targetMode: "COLOR_ONLY", startingStage: 1 },
      gameState: "SESSION_COMPLETE",
      currentDifficulty: "EASY",
      currentStage: {
        difficulty: "EASY",
        stageNumber: 1,
        bubbles: [{ id: "b1", index: 0, color: "RED", shape: "CIRCLE", position: { x: 0.5, y: 0.5 }, size: 0.2, isPopped: false }],
        targetSequence: ["b1"],
        currentTargetIndex: 0,
        totalPausedMs: 0,
        targetPausedMs: 0,
      },
      createdAt: 1,
      endedAt: 2,
      summary: {
        sessionId: "s1",
        childFirstName: "عمر",
        startingDifficulty: "EASY",
        totalTargetsPresented: 0,
        totalTargetsCompleted: 0,
        completionRate: 0,
        totalDurationMs: 1,
        completedAt: "2026-01-01T00:00:00.000Z",
        // stageResults/difficultiesPlayed/totalIncorrect/accuracy/averageResponseTimeMs/bestStage intentionally absent
      },
    };

    const revived = reviveBubblePopSessionState(raw);
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
      config: { childFirstName: "عمر", difficulty: "ADVANCED", bubbleSize: "SMALL", reachHeight: "HIGH", reachSide: "LEFT", targetMode: "COLOR_AND_SHAPE", startingStage: 1 },
      gameState: "PLAYING",
      currentDifficulty: "ADVANCED",
      currentStage: {
        difficulty: "ADVANCED",
        stageNumber: 1,
        bubbles: [{ id: "b1", index: 0, color: "BLUE", shape: "STAR", position: { x: 0.3, y: 0.4 }, size: 0.13, isPopped: true }],
        targetSequence: ["b1", "b2"],
        currentTargetIndex: 1,
        incorrectCount: 2,
        responseTimesMs: [450, 600],
        startedAt: 1000,
        completedAt: null,
        pausedAt: 1500,
        totalPausedMs: 200,
        targetStartedAt: 1600,
        targetPausedMs: 50,
      },
      results: [
        { difficulty: "ADVANCED", stageNumber: 1, status: "COMPLETED", targetsPresented: 3, targetsCompleted: 3, incorrectCount: 1, durationMs: 5000, averageResponseTimeMs: 600 },
      ],
      createdAt: 1,
    };

    const revived = reviveBubblePopSessionState(raw);
    expect(revived.currentStage.pausedAt).toBe(1500);
    expect(revived.currentStage.responseTimesMs).toEqual([450, 600]);
    expect(revived.currentStage.incorrectCount).toBe(2);
    expect(revived.results[0]!.averageResponseTimeMs).toBe(600);
    expect(revived.results[0]!.status).toBe("COMPLETED");
  });

  it("rejects a corrupt moving-bubble lane", () => {
    expect(() =>
      reviveBubblePopSessionState({
        sessionId: "bad-bubble",
        seed: "seed",
        config: { childFirstName: "عمر", difficulty: "EASY", bubbleSize: "MEDIUM", reachHeight: "FULL", reachSide: "FULL", targetMode: "COLOR_ONLY", startingStage: 1 },
        gameState: "PLAYING",
        currentDifficulty: "EASY",
        currentStage: {
          difficulty: "EASY",
          stageNumber: 1,
          bubbles: [{ id: "b1", index: 0, color: "BLUE", shape: "CIRCLE", lane: 1.4, direction: "RIGHT_TO_LEFT", travelMs: 8000, size: 0.15, isPopped: false }],
          targetSequence: ["b1"],
          currentTargetIndex: 0,
          totalPausedMs: 0,
          targetPausedMs: 0,
        },
        createdAt: 1,
      }),
    ).toThrow(/bubble\.lane/);
  });
});

import { describe, expect, it } from "vitest";
import { reviveFootstepsSessionState } from "../serialization";

function rawFootprints(count: number) {
  return Array.from({ length: count }, (_, index) => ({ id: `f${index}`, index, stance: "SINGLE", foot: index % 2 ? "RIGHT" : "LEFT", position: { x: .45 + (index % 2) * .1, y: .8 - index * .08 }, rotationDeg: 0 }));
}

/**
 * MULTI-GAME PLATFORM — Follow the Footsteps' own RTDB-round-trip repair
 * coverage, mirroring lib/realtime/__tests__/serialization.test.ts's
 * reviveSessionState tests for the same "RTDB drops empty arrays and null
 * scalars on read-back" behavior, applied to FootstepsSessionState's field
 * names instead.
 */
describe("reviveFootstepsSessionState", () => {
  it("restores results to [] when RTDB dropped it (brand-new session)", () => {
    const raw = {
      sessionId: "s1",
      seed: "seed",
      config: { childFirstName: "سارة", difficulty: "EASY", stepLength: "MEDIUM", pathStyle: "VARIED", pathWidth: "MEDIUM", startingStage: 1 },
      gameState: "WELCOME",
      currentDifficulty: "EASY",
      currentStage: {
        difficulty: "EASY",
        stageNumber: 1,
        footprints: rawFootprints(4),
        destination: { x: 0.5, y: 0.1 },
        totalSteps: 4,
        currentIndex: 0,
        totalPausedMs: 0,
        stepPausedMs: 0,
      },
      createdAt: 1,
      workflow: { sessionGoal: "BALANCE_TRANSITION", endReason: "CHILD_SATISFIED" },
      // results/endedAt/summary intentionally absent, matching what RTDB actually returns
    };

    const revived = reviveFootstepsSessionState(raw);
    expect(revived.results).toEqual([]);
    expect(revived.endedAt).toBeNull();
    expect(revived.summary).toBeNull();
    expect(revived.workflow).toEqual({ sessionGoal: "BALANCE_TRANSITION", endReason: "CHILD_SATISFIED" });
  });

  it("restores pausedAt/startedAt/completedAt/stepStartedAt to null when RTDB dropped them", () => {
    const raw = {
      sessionId: "s1",
      seed: "seed",
      config: { childFirstName: "سارة", difficulty: "EASY", stepLength: "MEDIUM", pathStyle: "VARIED", pathWidth: "MEDIUM", startingStage: 1 },
      gameState: "PLAYING",
      currentDifficulty: "EASY",
      currentStage: {
        difficulty: "EASY",
        stageNumber: 1,
        footprints: rawFootprints(4),
        destination: { x: 0.5, y: 0.1 },
        totalSteps: 4,
        currentIndex: 0,
        totalPausedMs: 0,
        stepPausedMs: 0,
        // startedAt/completedAt/pausedAt/stepStartedAt/stepTimesMs intentionally absent
      },
      createdAt: 1,
    };

    const revived = reviveFootstepsSessionState(raw);
    const stage = revived.currentStage;
    expect(stage.pausedAt).toBeNull();
    expect(stage.startedAt).toBeNull();
    expect(stage.completedAt).toBeNull();
    expect(stage.stepStartedAt).toBeNull();
    expect(stage.stepTimesMs).toEqual([]);
    expect(stage.pausedAt !== null).toBe(false);
  });

  it("restores summary.stageResults/difficultiesPlayed to [] when a session ends with zero completed stages", () => {
    const raw = {
      sessionId: "s1",
      seed: "seed",
      config: { childFirstName: "سارة", difficulty: "EASY", stepLength: "MEDIUM", pathStyle: "VARIED", pathWidth: "MEDIUM", startingStage: 1 },
      gameState: "SESSION_COMPLETE",
      currentDifficulty: "EASY",
      currentStage: {
        difficulty: "EASY",
        stageNumber: 1,
        footprints: rawFootprints(4),
        destination: { x: 0.5, y: 0.1 },
        totalSteps: 4,
        currentIndex: 0,
        totalPausedMs: 0,
        stepPausedMs: 0,
      },
      createdAt: 1,
      endedAt: 2,
      summary: {
        sessionId: "s1",
        childFirstName: "سارة",
        startingDifficulty: "EASY",
        totalStepsPresented: 0,
        totalStepsCompleted: 0,
        completionRate: 0,
        totalDurationMs: 1,
        completedAt: "2026-01-01T00:00:00.000Z",
        // stageResults/difficultiesPlayed/averageStepTimeMs/bestStage intentionally absent
      },
    };

    const revived = reviveFootstepsSessionState(raw);
    expect(revived.summary?.stageResults).toEqual([]);
    expect(revived.summary?.difficultiesPlayed).toEqual([]);
    expect(revived.summary?.completionRate).toBeNull();
    expect(revived.summary?.averageStepTimeMs).toBeNull();
    expect(revived.summary?.bestStage).toBeNull();
  });

  it("preserves genuinely-present values unchanged", () => {
    const raw = {
      sessionId: "s1",
      seed: "seed",
      config: { childFirstName: "سارة", difficulty: "MEDIUM", stepLength: "LONG", pathStyle: "STRAIGHT", pathWidth: "WIDE", startingStage: 1 },
      gameState: "PLAYING",
      currentDifficulty: "MEDIUM",
      currentStage: {
        difficulty: "MEDIUM",
        stageNumber: 1,
        footprints: rawFootprints(6),
        destination: { x: 0.5, y: 0.1 },
        totalSteps: 6,
        currentIndex: 2,
        stepTimesMs: [450, 600],
        startedAt: 1000,
        completedAt: null,
        pausedAt: 1500,
        totalPausedMs: 200,
        stepStartedAt: 1600,
        stepPausedMs: 50,
      },
      results: [
        { difficulty: "MEDIUM", stageNumber: 1, status: "COMPLETED", stepsPresented: 6, stepsCompleted: 6, durationMs: 5000, averageStepTimeMs: 600 },
      ],
      createdAt: 1,
    };

    const revived = reviveFootstepsSessionState(raw);
    expect(revived.currentStage.pausedAt).toBe(1500);
    expect(revived.currentStage.stepTimesMs).toEqual([450, 600]);
    expect(revived.results[0]!.averageStepTimeMs).toBe(600);
    expect(revived.results[0]!.status).toBe("COMPLETED");
  });

  // JOURNEY REDESIGN — checkpoints is a new array field on currentStage;
  // RTDB drops an empty array on read-back the same way it drops every
  // other array field here, so it needs the same `?? []` repair.
  it("restores checkpoints to [] when RTDB dropped it (EASY session, or before any checkpoint exists)", () => {
    const raw = {
      sessionId: "s1",
      seed: "seed",
      config: { childFirstName: "سارة", difficulty: "EASY", stepLength: "MEDIUM", pathStyle: "VARIED", pathWidth: "MEDIUM", startingStage: 1 },
      gameState: "PLAYING",
      currentDifficulty: "EASY",
      currentStage: {
        difficulty: "EASY",
        stageNumber: 1,
        footprints: rawFootprints(4),
        destination: { x: 0.5, y: 0.1 },
        totalSteps: 4,
        currentIndex: 0,
        totalPausedMs: 0,
        stepPausedMs: 0,
        // checkpoints intentionally absent, matching what RTDB actually returns for an empty array
      },
      createdAt: 1,
    };

    const revived = reviveFootstepsSessionState(raw);
    expect(revived.currentStage.checkpoints).toEqual([]);
  });

  it("preserves genuinely-present checkpoints (MEDIUM/ADVANCED session) unchanged", () => {
    const raw = {
      sessionId: "s1",
      seed: "seed",
      config: { childFirstName: "سارة", difficulty: "MEDIUM", stepLength: "MEDIUM", pathStyle: "VARIED", pathWidth: "MEDIUM", startingStage: 1 },
      gameState: "PLAYING",
      currentDifficulty: "MEDIUM",
      currentStage: {
        difficulty: "MEDIUM",
        stageNumber: 1,
        footprints: rawFootprints(6),
        checkpoints: [{ id: "c1", afterTargetIndex: 2, position: { x: 0.5, y: 0.5 } }],
        destination: { x: 0.5, y: 0.1 },
        totalSteps: 6,
        currentIndex: 0,
        totalPausedMs: 0,
        stepPausedMs: 0,
      },
      createdAt: 1,
    };

    const revived = reviveFootstepsSessionState(raw);
    expect(revived.currentStage.checkpoints).toEqual([{ id: "c1", afterTargetIndex: 2, position: { x: 0.5, y: 0.5 } }]);
  });

  it("rejects a corrupt footprint screen coordinate", () => {
    const footprints = rawFootprints(4);
    footprints[0]!.position.x = -0.1;
    expect(() =>
      reviveFootstepsSessionState({
        sessionId: "bad-foot",
        seed: "seed",
        config: { childFirstName: "سارة", difficulty: "EASY", stepLength: "MEDIUM", pathStyle: "VARIED", pathWidth: "MEDIUM", startingStage: 1 },
        gameState: "PLAYING",
        currentDifficulty: "EASY",
        currentStage: { difficulty: "EASY", stageNumber: 1, footprints, destination: { x: 0.5, y: 0.1 }, totalSteps: 4, currentIndex: 0, totalPausedMs: 0, stepPausedMs: 0 },
        createdAt: 1,
      }),
    ).toThrow(/footprint\.position/);
  });
});

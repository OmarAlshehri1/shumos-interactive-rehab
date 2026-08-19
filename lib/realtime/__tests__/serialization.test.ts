import { describe, expect, it } from "vitest";
import { reviveColorChaseSessionState, reviveSessionState, reviveSpacePilotSessionState } from "../serialization";
import { createColorChaseSession, Difficulty as ColorChaseDifficulty, getColorChaseStagePlan } from "@/lib/colorchase";
import { createSession, Difficulty, PlayArea, TargetSize, TargetSpacing } from "@/lib/game";
import { createSpacePilotSession } from "@/lib/spacepilot";

function rawBalloons(count: number) {
  return Array.from({ length: count }, (_, index) => ({ id: `b${index}`, color: "BLUE", position: { x: .2 + index * .1, y: .5 }, size: .1, isTarget: true, isPopped: false }));
}

/**
 * Regression coverage for the exact bug the Task 6 two-browser emulator
 * test caught: RTDB drops empty arrays and null-valued scalars entirely on
 * read-back, so a raw Firebase snapshot is missing fields that
 * lib/game's SessionState type promises are always present.
 *
 * TASK 11: revived around currentStage/currentDifficulty (see
 * lib/game/session.ts's class doc comment) instead of the old fixed
 * stages/currentStageIndex array.
 */
describe("reviveSessionState", () => {
  it("restores results to [] when RTDB dropped it (brand-new session)", () => {
    const raw = {
      sessionId: "s1",
      seed: "seed",
      config: { childFirstName: "سارة", difficulty: "EASY", targetSize: "LARGE", targetSpacing: "CLOSE", playArea: "FULL" },
      gameState: "WELCOME",
      currentDifficulty: "EASY",
      currentStage: {
        difficulty: "EASY",
        stageNumber: 1,
        targetColor: "BLUE",
        balloons: rawBalloons(2),
        totalTargets: 2,
        correctCount: 0,
        incorrectCount: 0,
        totalPausedMs: 0,
      },
      createdAt: 1,
      workflow: { sessionGoal: "FOLLOWING_INSTRUCTIONS", endReason: "CHILD_TIRED" },
      // results and endedAt/summary intentionally absent, matching what RTDB actually returns
    };

    const revived = reviveSessionState(raw);
    expect(revived.results).toEqual([]);
    expect(revived.endedAt).toBeNull();
    expect(revived.summary).toBeNull();
    expect(revived.workflow).toEqual({ sessionGoal: "FOLLOWING_INSTRUCTIONS", endReason: "CHILD_TIRED" });
  });

  it("restores pausedAt/startedAt/completedAt to null when RTDB dropped them (not-yet-started/not-paused stage)", () => {
    const raw = {
      sessionId: "s1",
      seed: "seed",
      config: { childFirstName: "سارة", difficulty: "EASY", targetSize: "LARGE", targetSpacing: "CLOSE", playArea: "FULL" },
      gameState: "PLAYING",
      currentDifficulty: "EASY",
      currentStage: {
        difficulty: "EASY",
        stageNumber: 1,
        targetColor: "BLUE",
        balloons: [{ id: "b1", color: "BLUE", position: { x: 0.5, y: 0.5 }, size: 0.2, isTarget: true, isPopped: false }],
        totalTargets: 1,
        correctCount: 0,
        incorrectCount: 0,
        totalPausedMs: 0,
        // startedAt/completedAt/pausedAt/reactionTimesMs intentionally absent
      },
      createdAt: 1,
    };

    const revived = reviveSessionState(raw);
    const stage = revived.currentStage;
    expect(stage.pausedAt).toBeNull();
    expect(stage.startedAt).toBeNull();
    expect(stage.completedAt).toBeNull();
    expect(stage.reactionTimesMs).toEqual([]);
    // This is the exact check that broke in production: `stage.pausedAt !== null`
    // must be false for a genuinely-unpaused stage, not true because the value
    // silently became `undefined` instead of `null`.
    expect(stage.pausedAt !== null).toBe(false);
  });

  it("restores summary.stageResults to [] and difficultiesPlayed to [] when a session ends with zero completed stages", () => {
    const raw = {
      sessionId: "s1",
      seed: "seed",
      config: { childFirstName: "سارة", difficulty: "EASY", targetSize: "LARGE", targetSpacing: "CLOSE", playArea: "FULL" },
      gameState: "SESSION_COMPLETE",
      currentDifficulty: "EASY",
      currentStage: {
        difficulty: "EASY",
        stageNumber: 1,
        targetColor: "BLUE",
        balloons: rawBalloons(2),
        totalTargets: 2,
        correctCount: 0,
        incorrectCount: 0,
        totalPausedMs: 0,
      },
      createdAt: 1,
      endedAt: 2,
      summary: {
        sessionId: "s1",
        childFirstName: "سارة",
        startingDifficulty: "EASY",
        totalCorrect: 0,
        totalIncorrect: 0,
        overallAccuracy: 0,
        totalDurationMs: 1,
        completedAt: "2026-01-01T00:00:00.000Z",
        // stageResults/difficultiesPlayed/averageReactionTimeMs/bestStage intentionally absent
      },
    };

    const revived = reviveSessionState(raw);
    expect(revived.summary?.stageResults).toEqual([]);
    expect(revived.summary?.difficultiesPlayed).toEqual([]);
    expect(revived.summary?.averageReactionTimeMs).toBeNull();
    expect(revived.summary?.overallAccuracy).toBeNull();
    expect(revived.summary?.bestStage).toBeNull();
  });

  it("preserves genuinely-present values unchanged", () => {
    const raw = {
      sessionId: "s1",
      seed: "seed",
      config: { childFirstName: "سارة", difficulty: "MEDIUM", targetSize: "MEDIUM", targetSpacing: "MEDIUM", playArea: "FULL" },
      gameState: "PLAYING",
      currentDifficulty: "MEDIUM",
      currentStage: {
        difficulty: "MEDIUM",
        stageNumber: 1,
        targetColor: "BLUE",
        balloons: rawBalloons(3),
        totalTargets: 3,
        correctCount: 1,
        incorrectCount: 2,
        reactionTimesMs: [450],
        startedAt: 1000,
        completedAt: null,
        pausedAt: 1500,
        totalPausedMs: 200,
      },
      results: [
        {
          difficulty: "MEDIUM",
          stageNumber: 1,
          status: "COMPLETED",
          targetColor: "RED",
          correctCount: 3,
          incorrectCount: 1,
          totalTargets: 3,
          accuracy: 0.75,
          durationMs: 5000,
          averageReactionTimeMs: 600,
        },
      ],
      createdAt: 1,
    };

    const revived = reviveSessionState(raw);
    expect(revived.currentStage.pausedAt).toBe(1500);
    expect(revived.currentStage.reactionTimesMs).toEqual([450]);
    expect(revived.results[0]!.averageReactionTimeMs).toBe(600);
    expect(revived.results[0]!.status).toBe("COMPLETED");
  });

  it("defaults a legacy result missing `status` to COMPLETED (pre-Task-11 data safety)", () => {
    const raw = {
      sessionId: "s1",
      seed: "seed",
      config: { childFirstName: "سارة", difficulty: "EASY", targetSize: "MEDIUM", targetSpacing: "MEDIUM", playArea: "FULL" },
      gameState: "PLAYING",
      currentDifficulty: "EASY",
      currentStage: {
        difficulty: "EASY",
        stageNumber: 2,
        targetColor: "BLUE",
        balloons: rawBalloons(2),
        totalTargets: 2,
        correctCount: 0,
        incorrectCount: 0,
        totalPausedMs: 0,
      },
      results: [
        { difficulty: "EASY", stageNumber: 1, targetColor: "RED", correctCount: 2, incorrectCount: 0, totalTargets: 2, accuracy: 1, durationMs: 3000 },
      ],
      createdAt: 1,
    };

    const revived = reviveSessionState(raw);
    expect(revived.results[0]!.status).toBe("COMPLETED");
    expect(revived.results[0]!.targetColor).toBe("RED");
  });
});

describe("reviveColorChaseSessionState", () => {
  it("rebuilds canonical pad plans and empty arrays after a Firebase round trip", () => {
    const revived = reviveColorChaseSessionState({
      sessionId: "color-1", seed: "fixed", config: { childFirstName: "سارة", difficulty: "EASY", startingStage: 1 },
      gameState: "PLAYING", currentDifficulty: "EASY", createdAt: 1, workflow: { sessionGoal: "VISUAL_DISCRIMINATION" },
      currentStage: { difficulty: "EASY", stageNumber: 1, currentStepIndex: 0, correctCount: 0, incorrectCount: 0, dangerPressCount: 0, totalPausedMs: 0, stepPausedMs: 0 },
    });
    expect(revived.results).toEqual([]);
    expect(revived.currentStage.responseTimesMs).toEqual([]);
    expect(revived.currentStage.processedInputIds).toEqual([]);
    expect(revived.currentStage.plan).toEqual(getColorChaseStagePlan(ColorChaseDifficulty.EASY, 1));
    expect(revived.currentStage.plan.steps[0].distractors).toEqual([]);
    expect(revived.workflow?.sessionGoal).toBe("VISUAL_DISCRIMINATION");
  });
});

describe("reviveSpacePilotSessionState", () => {
  it("preserves optional workflow metadata through the explicit reviver", () => {
    const original = createSpacePilotSession({ childFirstName: "سارة", workflow: { sessionGoal: "MOVEMENT_REACH", endReason: "CHANGE_ACTIVITY" } });
    expect(reviveSpacePilotSessionState(original).workflow).toEqual(original.workflow);
  });
});

describe("malformed nested realtime entities", () => {
  it("rejects a finite but out-of-bounds balloon position", () => {
    const session = createSession({
      childFirstName: "سارة",
      difficulty: Difficulty.EASY,
      targetSize: TargetSize.MEDIUM,
      targetSpacing: TargetSpacing.MEDIUM,
      playArea: PlayArea.FULL,
      seed: "integrity-balloon",
    });
    session.currentStage.balloons[0]!.position.x = 2;
    expect(() => reviveSessionState(session)).toThrow(/balloon\.position/);
  });

  it("rejects an invalid Space Pilot lane instead of reviving impossible play state", () => {
    const session = createSpacePilotSession({ childFirstName: "سارة", difficulty: Difficulty.EASY, seed: "integrity-space" });
    if (!("stars" in session.currentStage)) throw new Error("Expected EASY star stage");
    Object.assign(session.currentStage.stars[0]!, { lane: "SIDEWAYS" });
    expect(() => reviveSpacePilotSessionState(session)).toThrow(/star\.lane/);
  });

  it("rejects a corrupt Color Chase debounce anchor", () => {
    const session = createColorChaseSession({ childFirstName: "سارة", difficulty: Difficulty.EASY, seed: "integrity-color", now: 1 });
    Object.assign(session.currentStage, { lastAcceptedInput: { padId: "PAD_99", timestamp: 2 } });
    expect(() => reviveColorChaseSessionState(session)).toThrow(/lastAcceptedInput\.padId/);
  });
});

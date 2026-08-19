import { describe, expect, it } from "vitest";
import { GameState } from "@/lib/game";
import {
  applyBubblePopGameTransition,
  BubblePopStageStatus,
  type BubblePopSessionState,
  BubbleSize,
  confirmBubblePopColor,
  createBubblePopSession,
  currentTargetId,
  Difficulty,
  endBubblePopSession,
  getBubbleStagePlan,
  ReachHeight,
  ReachSide,
  TargetMode,
} from "@/lib/bubblepop";
import { BUBBLE_POP_WALL_GAME_ID } from "@/lib/games/registry";
import { buildStoredBubblePopSession } from "../buildStoredBubblePopSession";

const baseParams = {
  childFirstName: "عمر",
  difficulty: Difficulty.EASY,
  bubbleSize: BubbleSize.MEDIUM,
  reachHeight: ReachHeight.FULL,
  reachSide: ReachSide.FULL,
  targetMode: TargetMode.COLOR_ONLY,
};

function enterPlaying(state: BubblePopSessionState, t: number): BubblePopSessionState {
  let s = applyBubblePopGameTransition(state, GameState.SETUP, t).state;
  s = applyBubblePopGameTransition(s, GameState.START_ZONE, t).state;
  s = applyBubblePopGameTransition(s, GameState.INSTRUCTIONS, t).state;
  s = applyBubblePopGameTransition(s, GameState.COUNTDOWN, t).state;
  s = applyBubblePopGameTransition(s, GameState.PLAYING, t).state;
  return s;
}

function completeCurrentStage(state: BubblePopSessionState, startClock: number): { state: BubblePopSessionState; clock: number } {
  let s = state;
  let clock = startClock;
  const totalTargets = s.currentStage.targetSequence.length;
  for (let i = 0; i < totalTargets; i++) {
    clock += 400;
    const targetId = currentTargetId(s.currentStage)!;
    const color = s.currentStage.bubbles.find((b) => b.id === targetId)!.color;
    const result = confirmBubblePopColor(s, color, clock);
    expect(result.success).toBe(true);
    s = result.state;
  }
  return { state: s, clock };
}

describe("buildStoredBubblePopSession", () => {
  it("throws if the session has no summary yet", () => {
    const session = createBubblePopSession(baseParams);
    expect(() => buildStoredBubblePopSession({ session, patientId: "p1", createdByUid: "u1", gameId: BUBBLE_POP_WALL_GAME_ID })).toThrow();
  });

  it("maps a completed session's canonical summary into a StoredBubblePopSession, copying every number as-is (including accuracy AND completion, unlike Follow the Footsteps which has no accuracy concept)", () => {
    let clock = 1000;
    let session = createBubblePopSession({ ...baseParams, now: clock });
    session = enterPlaying(session, clock);
    const targetId = currentTargetId(session.currentStage)!;
    const targetColor = session.currentStage.bubbles.find((b) => b.id === targetId)!.color;
    const stations = getBubbleStagePlan(session.currentStage.difficulty, session.currentStage.stageNumber).stations;
    const wrongColor = stations.find((c) => c !== targetColor)!;
    const incorrectResult = confirmBubblePopColor(session, wrongColor, clock + 100);
    expect(incorrectResult.success).toBe(true);
    session = incorrectResult.state;

    const completed = completeCurrentStage(session, clock);
    session = completed.state;
    clock = completed.clock;
    expect(session.gameState).toBe(GameState.STAGE_COMPLETE);

    const ended = endBubblePopSession(session, clock + 2000);
    expect(ended.success).toBe(true);
    session = ended.state;
    const summary = session.summary!;

    const stored = buildStoredBubblePopSession({ session, patientId: "patient-1", createdByUid: "staff-1", gameId: BUBBLE_POP_WALL_GAME_ID });

    expect(stored.sessionId).toBe(summary.sessionId);
    expect(stored.patientId).toBe("patient-1");
    expect(stored.gameId).toBe(BUBBLE_POP_WALL_GAME_ID);
    expect(stored.completedStageCount).toBe(1);
    expect(stored.skippedStageCount).toBe(0);
    expect(stored.totalTargetsPresented).toBe(summary.totalTargetsPresented);
    expect(stored.totalTargetsCompleted).toBe(summary.totalTargetsCompleted);
    expect(stored.totalIncorrect).toBe(1);
    expect(stored.completionRate).toBe(summary.completionRate);
    expect(stored.accuracy).toBe(summary.accuracy);
    expect(stored.durationMs).toBe(summary.totalDurationMs);
    expect(stored.averageResponseTimeMs).toBe(summary.averageResponseTimeMs);
    expect(stored.bestStage).toEqual(summary.bestStage);
    expect(stored.stageResults).toHaveLength(1);
    expect(stored.stageResults[0]).toEqual({
      difficulty: Difficulty.EASY,
      stageNumber: 1,
      status: BubblePopStageStatus.COMPLETED,
      targetsPresented: summary.stageResults[0]!.targetsPresented,
      targetsCompleted: summary.stageResults[0]!.targetsCompleted,
      incorrectCount: 1,
      durationMs: summary.stageResults[0]!.durationMs,
      averageResponseTimeMs: summary.stageResults[0]!.averageResponseTimeMs,
    });
  });

  it("falls back to the session's own starting point when no stage was ever entered", () => {
    const created = createBubblePopSession({ ...baseParams, now: 1000, startingStage: 3 });
    const ended = endBubblePopSession(created, 2000);
    expect(ended.success).toBe(true);
    const session = ended.state;

    const stored = buildStoredBubblePopSession({ session, patientId: "p1", createdByUid: "u1", gameId: BUBBLE_POP_WALL_GAME_ID });

    expect(stored.endingDifficulty).toBe(Difficulty.EASY);
    expect(stored.endingStage).toBe(3);
    expect(stored.completedStageCount).toBe(0);
    expect(stored.skippedStageCount).toBe(0);
    expect(stored.stageResults).toHaveLength(0);
  });
});

import { describe, expect, it } from "vitest";
import { GameState } from "@/lib/game";
import {
  applyFootstepsGameTransition,
  confirmCurrentFootstep,
  createFootstepsSession,
  Difficulty,
  endFootstepsSession,
  FootstepsStageStatus,
  PathStyle,
  PathWidth,
  type FootstepsSessionState,
  StepLength,
} from "@/lib/footsteps";
import { FOLLOW_THE_FOOTSTEPS_GAME_ID } from "@/lib/games/registry";
import { buildStoredFootstepsSession } from "../buildStoredFootstepsSession";

const baseParams = {
  childFirstName: "سارة",
  difficulty: Difficulty.EASY,
  stepLength: StepLength.MEDIUM,
  pathStyle: PathStyle.VARIED,
  pathWidth: PathWidth.MEDIUM,
};

function enterPlaying(state: FootstepsSessionState, t: number): FootstepsSessionState {
  let s = applyFootstepsGameTransition(state, GameState.SETUP, t).state;
  s = applyFootstepsGameTransition(s, GameState.START_ZONE, t).state;
  s = applyFootstepsGameTransition(s, GameState.INSTRUCTIONS, t).state;
  s = applyFootstepsGameTransition(s, GameState.COUNTDOWN, t).state;
  s = applyFootstepsGameTransition(s, GameState.PLAYING, t).state;
  return s;
}

function completeCurrentStage(state: FootstepsSessionState, startClock: number): { state: FootstepsSessionState; clock: number } {
  let s = state;
  let clock = startClock;
  for (let i = 0; i < s.currentStage.totalSteps; i++) {
    clock += 400;
    const result = confirmCurrentFootstep(s, clock);
    expect(result.success).toBe(true);
    s = result.state;
  }
  return { state: s, clock };
}

describe("buildStoredFootstepsSession", () => {
  it("throws if the session has no summary yet", () => {
    const session = createFootstepsSession(baseParams);
    expect(() => buildStoredFootstepsSession({ session, patientId: "p1", createdByUid: "u1", gameId: FOLLOW_THE_FOOTSTEPS_GAME_ID })).toThrow();
  });

  it("maps a completed session's canonical summary into a StoredFootstepsSession, copying every number as-is", () => {
    let clock = 1000;
    let session = createFootstepsSession({ ...baseParams, now: clock });
    session = enterPlaying(session, clock);
    const completed = completeCurrentStage(session, clock);
    session = completed.state;
    clock = completed.clock;
    expect(session.gameState).toBe(GameState.STAGE_COMPLETE);

    const ended = endFootstepsSession(session, clock + 2000);
    expect(ended.success).toBe(true);
    session = ended.state;
    const summary = session.summary!;

    const stored = buildStoredFootstepsSession({ session, patientId: "patient-1", createdByUid: "staff-1", gameId: FOLLOW_THE_FOOTSTEPS_GAME_ID });

    expect(stored.sessionId).toBe(summary.sessionId);
    expect(stored.patientId).toBe("patient-1");
    expect(stored.gameId).toBe(FOLLOW_THE_FOOTSTEPS_GAME_ID);
    expect(stored.completedStageCount).toBe(1);
    expect(stored.skippedStageCount).toBe(0);
    expect(stored.totalStepsPresented).toBe(summary.totalStepsPresented);
    expect(stored.totalStepsCompleted).toBe(summary.totalStepsCompleted);
    expect(stored.completionRate).toBe(summary.completionRate);
    expect(stored.durationMs).toBe(summary.totalDurationMs);
    expect(stored.averageStepTimeMs).toBe(summary.averageStepTimeMs);
    expect(stored.bestStage).toEqual(summary.bestStage);
    expect(stored.stageResults).toHaveLength(1);
    expect(stored.stageResults[0]).toEqual({
      difficulty: Difficulty.EASY,
      stageNumber: 1,
      status: FootstepsStageStatus.COMPLETED,
      stepsPresented: summary.stageResults[0]!.stepsPresented,
      stepsCompleted: summary.stageResults[0]!.stepsCompleted,
      durationMs: summary.stageResults[0]!.durationMs,
      averageStepTimeMs: summary.stageResults[0]!.averageStepTimeMs,
    });
  });

  it("falls back to the session's own starting point when no stage was ever entered", () => {
    const created = createFootstepsSession({ ...baseParams, now: 1000, startingStage: 3 });
    const ended = endFootstepsSession(created, 2000);
    expect(ended.success).toBe(true);
    const session = ended.state;

    const stored = buildStoredFootstepsSession({ session, patientId: "p1", createdByUid: "u1", gameId: FOLLOW_THE_FOOTSTEPS_GAME_ID });

    expect(stored.endingDifficulty).toBe(Difficulty.EASY);
    expect(stored.endingStage).toBe(3);
    expect(stored.completedStageCount).toBe(0);
    expect(stored.skippedStageCount).toBe(0);
    expect(stored.stageResults).toHaveLength(0);
  });
});

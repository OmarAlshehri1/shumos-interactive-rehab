import { describe, expect, it } from "vitest";
import {
  Difficulty,
  GameState,
  PlayArea,
  StageStatus,
  TargetSize,
  TargetSpacing,
  applyGameTransition,
  createSession,
  endSession,
  selectBalloon,
  type SessionState,
} from "@/lib/game";
import { BALLOON_QUEST_GAME_ID } from "@/lib/games/registry";
import { buildStoredSession } from "../buildStoredSession";

const baseParams = {
  childFirstName: "Layla",
  difficulty: Difficulty.EASY,
  targetSize: TargetSize.MEDIUM,
  targetSpacing: TargetSpacing.MEDIUM,
  playArea: PlayArea.FULL,
};

function enterPlaying(state: SessionState, t: number): SessionState {
  let s = applyGameTransition(state, GameState.SETUP, t).state;
  s = applyGameTransition(s, GameState.START_ZONE, t).state;
  s = applyGameTransition(s, GameState.INSTRUCTIONS, t).state;
  s = applyGameTransition(s, GameState.COUNTDOWN, t).state;
  s = applyGameTransition(s, GameState.PLAYING, t).state;
  return s;
}

/** Pops every target balloon in the current stage, driving it to STAGE_COMPLETE — same pattern as lib/game/__tests__/session.test.ts. */
function completeCurrentStage(state: SessionState, startClock: number): { state: SessionState; clock: number } {
  let s = state;
  let clock = startClock;
  const targets = s.currentStage.balloons.filter((b) => b.isTarget);
  for (const target of targets) {
    clock += 400;
    const result = selectBalloon(s, target.id, clock);
    expect(result.success).toBe(true);
    s = result.state;
  }
  return { state: s, clock };
}

describe("buildStoredSession", () => {
  it("throws if the session has no summary yet (not genuinely finished)", () => {
    const session = createSession(baseParams);
    expect(() => buildStoredSession({ session, patientId: "p1", createdByUid: "u1", gameId: BALLOON_QUEST_GAME_ID })).toThrow();
  });

  it("maps a completed session's canonical summary into a StoredSession, copying every number as-is", () => {
    let clock = 1000;
    let session = createSession({ ...baseParams, now: clock });
    session = enterPlaying(session, clock);
    const completed = completeCurrentStage(session, clock);
    session = completed.state;
    clock = completed.clock;
    expect(session.gameState).toBe(GameState.STAGE_COMPLETE);

    const ended = endSession(session, clock + 2000);
    expect(ended.success).toBe(true);
    session = ended.state;
    const summary = session.summary!;
    expect(summary).not.toBeNull();

    const stored = buildStoredSession({ session, patientId: "patient-1", createdByUid: "staff-1", gameId: BALLOON_QUEST_GAME_ID });

    expect(stored.sessionId).toBe(summary.sessionId);
    expect(stored.patientId).toBe("patient-1");
    expect(stored.gameId).toBe(BALLOON_QUEST_GAME_ID);
    expect(stored.createdByUid).toBe("staff-1");
    expect(stored.startingDifficulty).toBe(Difficulty.EASY);
    expect(stored.startingStage).toBe(1);
    expect(stored.endingDifficulty).toBe(Difficulty.EASY);
    expect(stored.endingStage).toBe(1);
    expect(stored.completedStageCount).toBe(1);
    expect(stored.skippedStageCount).toBe(0);
    expect(stored.totalCorrect).toBe(summary.totalCorrect);
    expect(stored.totalIncorrect).toBe(summary.totalIncorrect);
    expect(stored.accuracy).toBe(summary.overallAccuracy);
    expect(stored.durationMs).toBe(summary.totalDurationMs);
    expect(stored.averageReactionTimeMs).toBe(summary.averageReactionTimeMs);
    expect(stored.bestStage).toEqual(summary.bestStage);
    expect(stored.stageResults).toHaveLength(1);
    expect(stored.stageResults[0]).toEqual({
      difficulty: Difficulty.EASY,
      stageNumber: 1,
      status: StageStatus.COMPLETED,
      correct: summary.stageResults[0]!.correctCount,
      incorrect: summary.stageResults[0]!.incorrectCount,
      accuracy: summary.stageResults[0]!.accuracy,
      durationMs: summary.stageResults[0]!.durationMs,
      averageReactionTimeMs: summary.stageResults[0]!.averageReactionTimeMs,
    });
  });

  it("falls back to the session's own starting point as the ending point when no stage was ever entered", () => {
    const created = createSession({ ...baseParams, now: 1000, startingStage: 3 });
    const ended = endSession(created, 2000); // ended straight from WELCOME
    expect(ended.success).toBe(true);
    const session = ended.state;
    expect(session.results).toHaveLength(0);

    const stored = buildStoredSession({ session, patientId: "p1", createdByUid: "u1", gameId: BALLOON_QUEST_GAME_ID });

    expect(stored.endingDifficulty).toBe(Difficulty.EASY);
    expect(stored.endingStage).toBe(3);
    expect(stored.completedStageCount).toBe(0);
    expect(stored.skippedStageCount).toBe(0);
    expect(stored.stageResults).toHaveLength(0);
  });
});

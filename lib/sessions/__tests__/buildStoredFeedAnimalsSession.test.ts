import { describe, expect, it } from "vitest";
import { GameState } from "@/lib/game";
import {
  advanceFeedAnimalsMonkey,
  applyFeedAnimalsGameTransition,
  Difficulty,
  endFeedAnimalsSession,
  type FeedAnimalsSessionState,
  FeedAnimalsStageStatus,
  FoodSize,
  MovementPattern,
  ReachHeight,
  ReachSide,
  createFeedAnimalsSession,
} from "@/lib/feedanimals";
import { feedAnimalsObstacleRequiresJump, getFeedAnimalsPathStage } from "@/lib/feedanimals/pathStages";
import { FEED_THE_ANIMALS_GAME_ID } from "@/lib/games/registry";
import { buildStoredFeedAnimalsSession } from "../buildStoredFeedAnimalsSession";

// SAFARI ANIMAL ADVENTURE — every real (difficulty, stageNumber) is a
// hand-designed PATH stage today (see lib/feedanimals/pathStages.ts), so
// this file drives sessions via advanceFeedAnimalsMonkey (LEFT/RIGHT/JUMP)
// rather than the original round-based confirmFoodSelection.
const baseParams = {
  childFirstName: "عمر",
  difficulty: Difficulty.MEDIUM,
  foodSize: FoodSize.MEDIUM,
  reachHeight: ReachHeight.FULL,
  reachSide: ReachSide.FULL,
  movementPattern: MovementPattern.VARIED,
};

function enterPlaying(state: FeedAnimalsSessionState, t: number): FeedAnimalsSessionState {
  let s = applyFeedAnimalsGameTransition(state, GameState.SETUP, t).state;
  s = applyFeedAnimalsGameTransition(s, GameState.START_ZONE, t).state;
  s = applyFeedAnimalsGameTransition(s, GameState.INSTRUCTIONS, t).state;
  s = applyFeedAnimalsGameTransition(s, GameState.COUNTDOWN, t).state;
  s = applyFeedAnimalsGameTransition(s, GameState.PLAYING, t).state;
  return s;
}

/** Drives the active leg (and any subsequent leg) all the way to STAGE_COMPLETE, pressing JUMP at every jump-requiring obstacle and RIGHT otherwise. */
function completeCurrentStage(state: FeedAnimalsSessionState, startClock: number): { state: FeedAnimalsSessionState; clock: number } {
  let s = state;
  let clock = startClock;
  for (let i = 0; i < 300 && s.gameState === GameState.PLAYING; i++) {
    clock += 400;
    const pathDef = getFeedAnimalsPathStage(s.currentStage.difficulty, s.currentStage.stageNumber)!;
    const leg = pathDef.legs[s.currentStage.legIndex];
    const blocked = leg.obstacles.some((o) => o.atStep === s.currentStage.pathProgressStep + 1 && feedAnimalsObstacleRequiresJump(o.kind));
    const result = advanceFeedAnimalsMonkey(s, blocked ? "jump" : "right", clock);
    expect(result.success).toBe(true);
    if (!result.success) break;
    s = result.state;
  }
  return { state: s, clock };
}

describe("buildStoredFeedAnimalsSession", () => {
  it("throws if the session has no summary yet", () => {
    const session = createFeedAnimalsSession(baseParams);
    expect(() => buildStoredFeedAnimalsSession({ session, patientId: "p1", createdByUid: "u1", gameId: FEED_THE_ANIMALS_GAME_ID })).toThrow();
  });

  it("maps a completed session's canonical summary into a StoredFeedAnimalsSession, copying every number as-is", () => {
    let clock = 1000;
    let session = createFeedAnimalsSession({ ...baseParams, now: clock });
    session = enterPlaying(session, clock);

    const completed = completeCurrentStage(session, clock);
    session = completed.state;
    clock = completed.clock;
    expect(session.gameState).toBe(GameState.STAGE_COMPLETE);

    const ended = endFeedAnimalsSession(session, clock + 2000);
    expect(ended.success).toBe(true);
    session = ended.state;
    const summary = session.summary!;

    const stored = buildStoredFeedAnimalsSession({ session, patientId: "patient-1", createdByUid: "staff-1", gameId: FEED_THE_ANIMALS_GAME_ID });

    expect(stored.sessionId).toBe(summary.sessionId);
    expect(stored.patientId).toBe("patient-1");
    expect(stored.gameId).toBe(FEED_THE_ANIMALS_GAME_ID);
    expect(stored.completedStageCount).toBe(1);
    expect(stored.skippedStageCount).toBe(0);
    expect(stored.totalRoundsPresented).toBe(summary.totalRoundsPresented);
    expect(stored.totalRoundsCompleted).toBe(summary.totalRoundsCompleted);
    expect(stored.totalIncorrect).toBe(0);
    expect(stored.completionRate).toBe(summary.completionRate);
    expect(stored.accuracy).toBe(summary.accuracy);
    expect(stored.durationMs).toBe(summary.totalDurationMs);
    expect(stored.averageResponseTimeMs).toBe(summary.averageResponseTimeMs);
    expect(stored.bestStage).toEqual(summary.bestStage);
    expect(stored.stageResults).toHaveLength(1);
    expect(stored.stageResults[0]).toEqual({
      difficulty: Difficulty.MEDIUM,
      stageNumber: 1,
      status: FeedAnimalsStageStatus.COMPLETED,
      roundsPresented: summary.stageResults[0]!.roundsPresented,
      roundsCompleted: summary.stageResults[0]!.roundsCompleted,
      incorrectCount: 0,
      durationMs: summary.stageResults[0]!.durationMs,
      averageResponseTimeMs: summary.stageResults[0]!.averageResponseTimeMs,
    });
  });

  it("falls back to the session's own starting point when no stage was ever entered", () => {
    const created = createFeedAnimalsSession({ ...baseParams, now: 1000, startingStage: 3 });
    const ended = endFeedAnimalsSession(created, 2000);
    expect(ended.success).toBe(true);
    const session = ended.state;

    const stored = buildStoredFeedAnimalsSession({ session, patientId: "p1", createdByUid: "u1", gameId: FEED_THE_ANIMALS_GAME_ID });

    expect(stored.endingDifficulty).toBe(Difficulty.MEDIUM);
    expect(stored.endingStage).toBe(3);
    expect(stored.completedStageCount).toBe(0);
    expect(stored.skippedStageCount).toBe(0);
    expect(stored.stageResults).toHaveLength(0);
  });
});

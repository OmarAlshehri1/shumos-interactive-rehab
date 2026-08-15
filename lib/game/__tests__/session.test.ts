import { describe, expect, it } from "vitest";
import {
  advanceToStage,
  applyGameTransition,
  createSession,
  endSession,
  jumpToStage,
  pauseSession,
  resumeSession,
  restartStage,
  selectBalloon,
  skipStage,
  type ActionResult,
  type SessionState,
} from "../session";
import { Difficulty, GameState, PlayArea, StageStatus, TargetSize, TargetSpacing, type StageNumber } from "../types";

const baseParams = {
  childFirstName: "Layla",
  difficulty: Difficulty.EASY,
  targetSize: TargetSize.MEDIUM,
  targetSpacing: TargetSpacing.MEDIUM,
  playArea: PlayArea.FULL,
};

function expectSuccess(result: ActionResult): SessionState {
  expect(result.success).toBe(true);
  return result.state;
}

/** From WELCOME (a freshly created session), all the way to PLAYING — used once, at session start. */
function enterPlaying(state: SessionState, timestamp: number): SessionState {
  let s = expectSuccess(applyGameTransition(state, GameState.SETUP, timestamp));
  s = expectSuccess(applyGameTransition(s, GameState.START_ZONE, timestamp));
  return enterPlayingFromStartZone(s, timestamp);
}

/** From START_ZONE (where advanceToStage/skipStage/jumpToStage always land) to PLAYING — the therapist's "الطفل جاهز" confirmation for every stage after the first. */
function enterPlayingFromStartZone(state: SessionState, timestamp: number): SessionState {
  let s = expectSuccess(applyGameTransition(state, GameState.INSTRUCTIONS, timestamp));
  s = expectSuccess(applyGameTransition(s, GameState.COUNTDOWN, timestamp));
  s = expectSuccess(applyGameTransition(s, GameState.PLAYING, timestamp));
  return s;
}

/** Pops every target balloon in the current stage, driving it to STAGE_COMPLETE. */
function completeCurrentStage(state: SessionState, startClock: number): { state: SessionState; clock: number } {
  let s = state;
  let clock = startClock;
  const targets = s.currentStage.balloons.filter((b) => b.isTarget);
  for (const target of targets) {
    clock += 300;
    s = expectSuccess(selectBalloon(s, target.id, clock));
  }
  return { state: s, clock };
}

describe("createSession isolation", () => {
  it("gives every session a unique id and starts with a fresh, unplayed stage 1", () => {
    const a = createSession({ ...baseParams, now: 1000 });
    const b = createSession({ ...baseParams, now: 1000 });

    expect(a.sessionId).not.toBe(b.sessionId);
    for (const session of [a, b]) {
      expect(session.results).toHaveLength(0);
      expect(session.currentDifficulty).toBe(Difficulty.EASY);
      expect(session.currentStage.stageNumber).toBe(1);
      expect(session.gameState).toBe(GameState.WELCOME);
      expect(session.currentStage.correctCount).toBe(0);
      expect(session.currentStage.incorrectCount).toBe(0);
      expect(session.currentStage.startedAt).toBeNull();
      expect(session.currentStage.balloons.every((balloon) => !balloon.isPopped)).toBe(true);
    }
  });

  it("does not leak popped balloons, score, or identity from a previous session into a new one", () => {
    const first = createSession({ ...baseParams, seed: "shared-seed", now: 1000 });
    let played = enterPlaying(first, 1000);
    const target = played.currentStage.balloons.find((b) => b.isTarget)!;
    played = expectSuccess(selectBalloon(played, target.id, 1500));
    expect(played.currentStage.correctCount).toBe(1);

    // Reusing the exact same explicit seed still yields a fresh runtime state.
    const second = createSession({ ...baseParams, seed: "shared-seed", now: 2000 });

    expect(second.sessionId).not.toBe(first.sessionId);
    expect(second.currentStage.correctCount).toBe(0);
    expect(second.currentStage.balloons.every((b) => !b.isPopped)).toBe(true);
    expect(second.gameState).toBe(GameState.WELCOME);
    // The seed still deterministically reproduces the same layout (isolation is about runtime state, not the generator).
    expect(second.currentStage.balloons.map((b) => b.id)).toEqual(first.currentStage.balloons.map((b) => b.id));
  });
});

describe("selectBalloon", () => {
  it("pops a correct balloon, increments correctCount, and records reaction time", () => {
    const session = enterPlaying(createSession({ ...baseParams, now: 1000 }), 1000);
    const target = session.currentStage.balloons.find((b) => b.isTarget)!;

    const next = expectSuccess(selectBalloon(session, target.id, 1750));

    const stage = next.currentStage;
    expect(stage.correctCount).toBe(1);
    expect(stage.balloons.find((b) => b.id === target.id)!.isPopped).toBe(true);
    expect(stage.reactionTimesMs).toEqual([750]);
  });

  it("does not pop an incorrect balloon, only increments incorrectCount", () => {
    const session = enterPlaying(createSession({ ...baseParams, now: 1000 }), 1000);
    const distractor = session.currentStage.balloons.find((b) => !b.isTarget)!;

    const next = expectSuccess(selectBalloon(session, distractor.id, 1200));

    const stage = next.currentStage;
    expect(stage.incorrectCount).toBe(1);
    expect(stage.correctCount).toBe(0);
    expect(stage.balloons.find((b) => b.id === distractor.id)!.isPopped).toBe(false);
  });

  it("does not score an already-popped balloon a second time", () => {
    const session = enterPlaying(createSession({ ...baseParams, now: 1000 }), 1000);
    const target = session.currentStage.balloons.find((b) => b.isTarget)!;

    const afterFirst = expectSuccess(selectBalloon(session, target.id, 1200));
    const afterSecond = expectSuccess(selectBalloon(afterFirst, target.id, 1400));

    expect(afterSecond.currentStage.correctCount).toBe(1);
    expect(afterSecond.currentStage.reactionTimesMs).toHaveLength(1);
  });

  it("is rejected outside of PLAYING", () => {
    const session = createSession({ ...baseParams, now: 1000 }); // still WELCOME
    const target = session.currentStage.balloons.find((b) => b.isTarget)!;
    expect(selectBalloon(session, target.id, 1200).success).toBe(false);
  });
});

describe("stage completion", () => {
  it("auto-completes the stage and produces a COMPLETED StageResult once every target is popped", () => {
    const session = enterPlaying(createSession({ ...baseParams, now: 1000 }), 1000);
    const stage = session.currentStage;
    const targets = stage.balloons.filter((b) => b.isTarget);
    const distractor = stage.balloons.find((b) => !b.isTarget)!;

    let s = expectSuccess(selectBalloon(session, distractor.id, 1100)); // one incorrect attempt first
    for (const [i, target] of targets.entries()) {
      s = expectSuccess(selectBalloon(s, target.id, 1200 + i * 300));
    }

    expect(s.gameState).toBe(GameState.STAGE_COMPLETE);
    expect(s.results).toHaveLength(1);
    const result = s.results[0];
    expect(result.difficulty).toBe(Difficulty.EASY);
    expect(result.status).toBe(StageStatus.COMPLETED);
    expect(result.correctCount).toBe(targets.length);
    expect(result.incorrectCount).toBe(1);
    expect(result.totalTargets).toBe(stage.totalTargets);
    expect(result.accuracy).toBeCloseTo(targets.length / (targets.length + 1));
  });
});

describe("advanceToStage — continuing within the same difficulty", () => {
  it("plays through all 5 EASY stages, landing on START_ZONE each time, then builds a summary via endSession", () => {
    let s = enterPlaying(createSession({ ...baseParams, now: 0 }), 0);
    let clock = 0;

    for (let stageNumber = 1; stageNumber <= 5; stageNumber++) {
      const completion = completeCurrentStage(s, clock);
      s = completion.state;
      clock = completion.clock;
      expect(s.gameState).toBe(GameState.STAGE_COMPLETE);

      if (stageNumber < 5) {
        clock += 100;
        s = expectSuccess(advanceToStage(s, { difficulty: Difficulty.EASY, stageNumber: (stageNumber + 1) as StageNumber }));
        expect(s.gameState).toBe(GameState.START_ZONE);
        expect(s.currentStage.stageNumber).toBe(stageNumber + 1);
        s = enterPlayingFromStartZone(s, clock);
      }
    }

    expect(s.results).toHaveLength(5);
    expect(s.results.every((r) => r.status === StageStatus.COMPLETED)).toBe(true);

    clock += 100;
    const ended = expectSuccess(endSession(s, clock));
    expect(ended.gameState).toBe(GameState.SESSION_COMPLETE);
    expect(ended.summary).not.toBeNull();
    expect(ended.summary!.stageResults).toHaveLength(5);
    expect(ended.summary!.difficultiesPlayed).toEqual([Difficulty.EASY]);
    expect(ended.summary!.overallAccuracy).toBe(1);
  });

  it("rejects advancing to a stage number that is not exactly current + 1 in the same difficulty", () => {
    const session = enterPlaying(createSession({ ...baseParams, now: 1000 }), 1000);
    const completion = completeCurrentStage(session, 1000);
    const result = advanceToStage(completion.state, { difficulty: Difficulty.EASY, stageNumber: 3 });
    expect(result.success).toBe(false);
  });

  it("rejects advancing from any state other than STAGE_COMPLETE", () => {
    const session = enterPlaying(createSession({ ...baseParams, now: 1000 }), 1000);
    const result = advanceToStage(session, { difficulty: Difficulty.EASY, stageNumber: 2 });
    expect(result.success).toBe(false);
  });
});

describe("advanceToStage — changing difficulty", () => {
  it("steps to the adjacent harder difficulty at the SAME stage number (e.g. Medium 3 -> Advanced 3)", () => {
    let s = enterPlaying(createSession({ ...baseParams, difficulty: Difficulty.MEDIUM, now: 0 }), 0);
    let clock = 0;
    for (let i = 0; i < 2; i++) {
      const completion = completeCurrentStage(s, clock);
      s = completion.state;
      clock = completion.clock + 100;
      s = expectSuccess(advanceToStage(s, { difficulty: Difficulty.MEDIUM, stageNumber: (s.currentStage.stageNumber + 1) as StageNumber }));
      s = enterPlayingFromStartZone(s, clock);
    }
    // Now at Medium stage 3.
    expect(s.currentStage.stageNumber).toBe(3);
    const completion = completeCurrentStage(s, clock);
    s = completion.state;
    clock = completion.clock + 100;

    const advanced = expectSuccess(advanceToStage(s, { difficulty: Difficulty.ADVANCED, stageNumber: 3 }));
    expect(advanced.currentDifficulty).toBe(Difficulty.ADVANCED);
    expect(advanced.currentStage.stageNumber).toBe(3);
    expect(advanced.currentStage.difficulty).toBe(Difficulty.ADVANCED);
    expect(advanced.gameState).toBe(GameState.START_ZONE);
  });

  it("rejects a non-adjacent difficulty change (Easy -> Advanced directly)", () => {
    const session = enterPlaying(createSession({ ...baseParams, difficulty: Difficulty.EASY, now: 1000 }), 1000);
    const completion = completeCurrentStage(session, 1000);
    const result = advanceToStage(completion.state, { difficulty: Difficulty.ADVANCED, stageNumber: 1 });
    expect(result.success).toBe(false);
  });

  it("rejects a difficulty change to a different stage number", () => {
    const session = enterPlaying(createSession({ ...baseParams, difficulty: Difficulty.MEDIUM, now: 1000 }), 1000);
    const completion = completeCurrentStage(session, 1000);
    const result = advanceToStage(completion.state, { difficulty: Difficulty.EASY, stageNumber: 2 });
    expect(result.success).toBe(false);
  });
});

describe("jumpToStage", () => {
  it("records every stage strictly in between as SKIPPED with no gameplay data, and the current in-progress stage as SKIPPED too", () => {
    const session = enterPlaying(createSession({ ...baseParams, difficulty: Difficulty.EASY, now: 1000 }), 1000);
    const target = session.currentStage.balloons.find((b) => b.isTarget)!;
    const played = expectSuccess(selectBalloon(session, target.id, 1300)); // some real partial progress on stage 1

    const jumped = expectSuccess(jumpToStage(played, 4, 2000));

    expect(jumped.gameState).toBe(GameState.START_ZONE);
    expect(jumped.currentStage.stageNumber).toBe(4);
    expect(jumped.currentDifficulty).toBe(Difficulty.EASY);

    expect(jumped.results).toHaveLength(3); // stage 1 (current, partial) + stages 2 and 3 (never entered)
    const [r1, r2, r3] = jumped.results;
    expect(r1.stageNumber).toBe(1);
    expect(r1.status).toBe(StageStatus.SKIPPED);
    expect(r1.correctCount).toBe(1); // real partial data preserved, not discarded

    expect(r2.stageNumber).toBe(2);
    expect(r2.status).toBe(StageStatus.SKIPPED);
    expect(r2.targetColor).toBeNull();
    expect(r2.accuracy).toBeNull();
    expect(r2.durationMs).toBeNull();

    expect(r3.stageNumber).toBe(3);
    expect(r3.status).toBe(StageStatus.SKIPPED);
  });

  it("jumps from STAGE_COMPLETE without re-finalizing the already-completed current stage", () => {
    const session = enterPlaying(createSession({ ...baseParams, now: 1000 }), 1000);
    const completion = completeCurrentStage(session, 1000);
    expect(completion.state.gameState).toBe(GameState.STAGE_COMPLETE);
    expect(completion.state.results).toHaveLength(1);

    const jumped = expectSuccess(jumpToStage(completion.state, 3, completion.clock + 100));

    // Stage 1's COMPLETED result stays exactly as it was finalized; only stage 2 gets a SKIPPED placeholder.
    expect(jumped.results).toHaveLength(2);
    expect(jumped.results[0].status).toBe(StageStatus.COMPLETED);
    expect(jumped.results[0].stageNumber).toBe(1);
    expect(jumped.results[1].status).toBe(StageStatus.SKIPPED);
    expect(jumped.results[1].stageNumber).toBe(2);
    expect(jumped.currentStage.stageNumber).toBe(3);
  });

  it("rejects jumping to the current stage or an earlier one", () => {
    const session = enterPlaying(createSession({ ...baseParams, now: 1000 }), 1000);
    expect(jumpToStage(session, 1, 1500).success).toBe(false);
  });

  it("rejects jumping outside of an active or just-completed stage", () => {
    const session = createSession({ ...baseParams, now: 1000 }); // WELCOME
    expect(jumpToStage(session, 3, 1500).success).toBe(false);
  });
});

describe("pause/resume", () => {
  it("excludes paused time from reaction time", () => {
    const session = enterPlaying(createSession({ ...baseParams, now: 1000 }), 1000);
    let s = expectSuccess(pauseSession(session, 1200)); // paused 200ms after start
    s = expectSuccess(resumeSession(s, 3200)); // paused for 2000ms

    const target = s.currentStage.balloons.find((b) => b.isTarget)!;
    s = expectSuccess(selectBalloon(s, target.id, 3700)); // 2700ms of wall time since start

    // 2700ms elapsed - 2000ms paused = 700ms of actual reaction time.
    expect(s.currentStage.reactionTimesMs[0]).toBe(700);
  });

  it("rejects selecting a balloon while paused", () => {
    const session = enterPlaying(createSession({ ...baseParams, now: 1000 }), 1000);
    const paused = expectSuccess(pauseSession(session, 1200));
    const target = paused.currentStage.balloons.find((b) => b.isTarget)!;
    expect(selectBalloon(paused, target.id, 1500).success).toBe(false);
  });
});

describe("restartStage", () => {
  it("resets progress but reproduces the same balloon layout", () => {
    const session = enterPlaying(createSession({ ...baseParams, now: 1000 }), 1000);
    const target = session.currentStage.balloons.find((b) => b.isTarget)!;
    const played = expectSuccess(selectBalloon(session, target.id, 1300));

    const restarted = expectSuccess(restartStage(played, 2000));

    expect(restarted.currentStage.correctCount).toBe(0);
    expect(restarted.currentStage.balloons.every((b) => !b.isPopped)).toBe(true);
    expect(restarted.currentStage.balloons.map((b) => b.id)).toEqual(session.currentStage.balloons.map((b) => b.id));
    expect(restarted.gameState).toBe(GameState.PLAYING);
  });
});

describe("skipStage", () => {
  it("finalizes the current stage as SKIPPED (preserving partial progress) and moves to stageNumber + 1", () => {
    const session = enterPlaying(createSession({ ...baseParams, now: 1000 }), 1000);
    const target = session.currentStage.balloons.find((b) => b.isTarget)!;
    const played = expectSuccess(selectBalloon(session, target.id, 1300));

    const skipped = expectSuccess(skipStage(played, 2000));

    expect(skipped.gameState).toBe(GameState.START_ZONE);
    expect(skipped.currentStage.stageNumber).toBe(2);
    expect(skipped.results).toHaveLength(1);
    expect(skipped.results[0].status).toBe(StageStatus.SKIPPED);
    expect(skipped.results[0].correctCount).toBe(1);
  });

  it("rejects skipping the difficulty's last stage (no stage 6 to move to)", () => {
    let s = enterPlaying(createSession({ ...baseParams, now: 0 }), 0);
    let clock = 0;
    for (let i = 0; i < 4; i++) {
      s = expectSuccess(skipStage(s, clock));
      clock += 100;
      s = enterPlayingFromStartZone(s, clock);
    }
    expect(s.currentStage.stageNumber).toBe(5);
    expect(skipStage(s, clock + 100).success).toBe(false);
  });
});

describe("endSession", () => {
  it("ends the session early from PLAYING and builds a partial summary with a SKIPPED stage", () => {
    const session = enterPlaying(createSession({ ...baseParams, now: 1000 }), 1000);
    const target = session.currentStage.balloons.find((b) => b.isTarget)!;
    const played = expectSuccess(selectBalloon(session, target.id, 1300));

    const ended = expectSuccess(endSession(played, 4000));

    expect(ended.gameState).toBe(GameState.SESSION_COMPLETE);
    expect(ended.summary).not.toBeNull();
    expect(ended.summary!.stageResults).toHaveLength(1);
    expect(ended.summary!.stageResults[0].status).toBe(StageStatus.SKIPPED);
  });

  it("is rejected if the session has already ended", () => {
    const session = enterPlaying(createSession({ ...baseParams, now: 1000 }), 1000);
    const ended = expectSuccess(endSession(session, 2000));
    expect(endSession(ended, 3000).success).toBe(false);
  });
});

describe("invalid state transitions at the session level", () => {
  it("rejects jumping straight from WELCOME to PLAYING", () => {
    const session = createSession({ ...baseParams, now: 1000 });
    const result = applyGameTransition(session, GameState.PLAYING, 1000);
    expect(result.success).toBe(false);
    expect(result.state).toBe(session); // rejected: state is returned unchanged
  });
});

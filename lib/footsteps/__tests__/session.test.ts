import { describe, expect, it } from "vitest";
import { GameState } from "@/lib/game";
import {
  advanceFootstepsStage,
  applyFootstepsGameTransition,
  confirmCurrentFootstep,
  createFootstepsSession,
  endFootstepsSession,
  jumpToFootstepsStage,
  pauseFootstepsSession,
  restartFootstepsStage,
  resumeFootstepsSession,
  skipFootstepsStage,
  switchFootstepsDifficulty,
  type FootstepsActionResult,
  type FootstepsSessionState,
} from "../session";
import { Difficulty, FootstepsStageStatus, PathStyle, PathWidth, type StageNumber, StepLength } from "../types";

const baseParams = {
  childFirstName: "نور",
  difficulty: Difficulty.EASY,
  stepLength: StepLength.MEDIUM,
  pathStyle: PathStyle.VARIED,
  pathWidth: PathWidth.MEDIUM,
};

function expectSuccess(result: FootstepsActionResult): FootstepsSessionState {
  expect(result.success).toBe(true);
  return result.state;
}

function enterPlaying(state: FootstepsSessionState, timestamp: number): FootstepsSessionState {
  let s = expectSuccess(applyFootstepsGameTransition(state, GameState.SETUP, timestamp));
  s = expectSuccess(applyFootstepsGameTransition(s, GameState.START_ZONE, timestamp));
  return enterPlayingFromStartZone(s, timestamp);
}

function enterPlayingFromStartZone(state: FootstepsSessionState, timestamp: number): FootstepsSessionState {
  let s = expectSuccess(applyFootstepsGameTransition(state, GameState.INSTRUCTIONS, timestamp));
  s = expectSuccess(applyFootstepsGameTransition(s, GameState.COUNTDOWN, timestamp));
  s = expectSuccess(applyFootstepsGameTransition(s, GameState.PLAYING, timestamp));
  return s;
}

function completeCurrentStage(state: FootstepsSessionState, startClock: number): { state: FootstepsSessionState; clock: number } {
  let s = state;
  let clock = startClock;
  const totalSteps = s.currentStage.totalSteps;
  for (let i = 0; i < totalSteps; i++) {
    clock += 400;
    s = expectSuccess(confirmCurrentFootstep(s, clock));
  }
  return { state: s, clock };
}

describe("createFootstepsSession isolation", () => {
  it("gives every session a unique id and starts with a fresh, unplayed stage 1", () => {
    const a = createFootstepsSession({ ...baseParams, now: 1000 });
    const b = createFootstepsSession({ ...baseParams, now: 1000 });

    expect(a.sessionId).not.toBe(b.sessionId);
    for (const session of [a, b]) {
      expect(session.results).toHaveLength(0);
      expect(session.currentDifficulty).toBe(Difficulty.EASY);
      expect(session.currentStage.stageNumber).toBe(1);
      expect(session.gameState).toBe(GameState.WELCOME);
      expect(session.currentStage.currentIndex).toBe(0);
      expect(session.currentStage.stepTimesMs).toHaveLength(0);
      expect(session.currentStage.startedAt).toBeNull();
    }
  });

  it("respects a manually chosen startingStage", () => {
    const session = createFootstepsSession({ ...baseParams, startingStage: 3, now: 1000 });
    expect(session.currentStage.stageNumber).toBe(3);
    expect(session.results).toHaveLength(0);
  });
});

describe("confirmCurrentFootstep — no negative scoring", () => {
  it("advances currentIndex exactly once per confirmation, never allows double-confirmation of the same footprint", () => {
    let session = enterPlaying(createFootstepsSession({ ...baseParams, now: 0 }), 0);
    const totalSteps = session.currentStage.totalSteps;

    session = expectSuccess(confirmCurrentFootstep(session, 500));
    expect(session.currentStage.currentIndex).toBe(1);
    expect(session.currentStage.stepTimesMs).toHaveLength(1);

    // A second confirmation call at the same instant still only advances by one step — never double-counts.
    session = expectSuccess(confirmCurrentFootstep(session, 900));
    expect(session.currentStage.currentIndex).toBe(2);
    expect(session.currentStage.stepTimesMs).toHaveLength(2);
    expect(session.currentStage.totalSteps).toBe(totalSteps);
  });

  it("rejects confirmation once every footprint in the stage is already confirmed", () => {
    let session = enterPlaying(createFootstepsSession({ ...baseParams, difficulty: Difficulty.EASY, startingStage: 1, now: 0 }), 0);
    const { state } = completeCurrentStage(session, 0);
    session = state;
    expect(session.gameState).toBe(GameState.STAGE_COMPLETE);

    const result = confirmCurrentFootstep(session, 99999);
    expect(result.success).toBe(false);
  });

  it("auto-finalizes the stage as COMPLETED and transitions to STAGE_COMPLETE once the last footprint is confirmed", () => {
    let session = enterPlaying(createFootstepsSession({ ...baseParams, now: 0 }), 0);
    const { state } = completeCurrentStage(session, 0);
    session = state;

    expect(session.gameState).toBe(GameState.STAGE_COMPLETE);
    expect(session.results).toHaveLength(1);
    expect(session.results[0].status).toBe(FootstepsStageStatus.COMPLETED);
    expect(session.results[0].stepsCompleted).toBe(session.results[0].stepsPresented);
  });

  it("rejects confirmation while paused, and rejects it outside PLAYING", () => {
    const fresh = createFootstepsSession({ ...baseParams, now: 0 });
    expect(confirmCurrentFootstep(fresh, 0).success).toBe(false);

    let playing = enterPlaying(fresh, 0);
    playing = expectSuccess(pauseFootstepsSession(playing, 100));
    expect(confirmCurrentFootstep(playing, 200).success).toBe(false);
  });
});

describe("pause timing excludes paused duration from step time", () => {
  it("does not count paused time toward the next confirmed step's recorded time", () => {
    let session = enterPlaying(createFootstepsSession({ ...baseParams, now: 0 }), 0);
    session = expectSuccess(pauseFootstepsSession(session, 100));
    session = expectSuccess(resumeFootstepsSession(session, 100000)); // a very long pause
    session = expectSuccess(confirmCurrentFootstep(session, 100200));

    // Only ~200ms of real elapsed time (100 before pause + 200 after resume) should count, not ~100200ms.
    expect(session.currentStage.stepTimesMs[0]).toBeLessThan(1000);
  });
});

describe("restartFootstepsStage determinism", () => {
  it("regenerates an identical path and resets every runtime metric", () => {
    let session = enterPlaying(createFootstepsSession({ ...baseParams, seed: "restart-seed", now: 0 }), 0);
    const originalFootprints = session.currentStage.footprints;
    session = expectSuccess(confirmCurrentFootstep(session, 500));
    expect(session.currentStage.currentIndex).toBe(1);

    session = expectSuccess(restartFootstepsStage(session, 1000));
    expect(session.currentStage.currentIndex).toBe(0);
    expect(session.currentStage.stepTimesMs).toHaveLength(0);
    expect(session.currentStage.footprints).toEqual(originalFootprints);
  });
});

describe("skipFootstepsStage semantics", () => {
  it("records the current stage as SKIPPED and moves to stageNumber + 1, landing on START_ZONE", () => {
    let session = enterPlaying(createFootstepsSession({ ...baseParams, now: 0 }), 0);
    session = expectSuccess(confirmCurrentFootstep(session, 500)); // partial progress

    session = expectSuccess(skipFootstepsStage(session, 1000));
    expect(session.gameState).toBe(GameState.START_ZONE);
    expect(session.currentStage.stageNumber).toBe(2);
    expect(session.results).toHaveLength(1);
    expect(session.results[0].status).toBe(FootstepsStageStatus.SKIPPED);
    expect(session.results[0].stepsCompleted).toBe(1); // real partial progress preserved
  });

  it("is rejected on the difficulty's final stage", () => {
    const session = enterPlaying(createFootstepsSession({ ...baseParams, startingStage: 5, now: 0 }), 0);
    const result = skipFootstepsStage(session, 1000);
    expect(result.success).toBe(false);
  });
});

describe("jumpToFootstepsStage semantics", () => {
  it("records only the stage actually left, never unvisited placeholders", () => {
    let session = enterPlaying(createFootstepsSession({ ...baseParams, now: 0 }), 0);
    session = expectSuccess(jumpToFootstepsStage(session, 4 as StageNumber, 1000));

    expect(session.currentStage.stageNumber).toBe(4);
    expect(session.gameState).toBe(GameState.START_ZONE);
    const skippedNumbers = session.results.map((r) => r.stageNumber);
    expect(skippedNumbers).toEqual([1]);
    for (const result of session.results) {
      expect(result.status).toBe(FootstepsStageStatus.SKIPPED);
    }
  });

  it("uses same-stage as a no-op and permits an earlier-stage re-attempt", () => {
    const session = enterPlaying(createFootstepsSession({ ...baseParams, startingStage: 3, now: 0 }), 0);
    expect(jumpToFootstepsStage(session, 3 as StageNumber, 1000).state).toBe(session);
    const back = expectSuccess(jumpToFootstepsStage(session, 2 as StageNumber, 1000));
    expect(back.currentStage.stageNumber).toBe(2);
  });
});

describe("live Footsteps difficulty navigation", () => {
  it("preserves the session, records the active attempt once, and loads stage 1", () => {
    let session = enterPlaying(createFootstepsSession({ ...baseParams, startingStage: 3, now: 0 }), 0);
    session = expectSuccess(confirmCurrentFootstep(session, 500));
    const changed = expectSuccess(switchFootstepsDifficulty(session, Difficulty.MEDIUM, 1000, { stepLength: StepLength.MEDIUM, pathStyle: PathStyle.VARIED, pathWidth: PathWidth.MEDIUM }));
    expect(changed.currentDifficulty).toBe(Difficulty.MEDIUM);
    expect(changed.currentStage.stageNumber).toBe(1);
    expect(changed.results).toHaveLength(1);
    expect(changed.gameState).toBe(GameState.START_ZONE);
  });
});

describe("advanceFootstepsStage difficulty decisions", () => {
  it("continues to stageNumber + 1 within the same difficulty", () => {
    let session = enterPlaying(createFootstepsSession({ ...baseParams, now: 0 }), 0);
    const { state } = completeCurrentStage(session, 0);
    session = state;

    session = expectSuccess(advanceFootstepsStage(session, { difficulty: Difficulty.EASY, stageNumber: 2 }));
    expect(session.currentDifficulty).toBe(Difficulty.EASY);
    expect(session.currentStage.stageNumber).toBe(2);
    expect(session.gameState).toBe(GameState.START_ZONE);
  });

  it("steps to the adjacent harder difficulty at the same stage number", () => {
    let session = enterPlaying(createFootstepsSession({ ...baseParams, startingStage: 5, now: 0 }), 0);
    const { state } = completeCurrentStage(session, 0);
    session = state;

    session = expectSuccess(advanceFootstepsStage(session, { difficulty: Difficulty.MEDIUM, stageNumber: 5 }));
    expect(session.currentDifficulty).toBe(Difficulty.MEDIUM);
    expect(session.currentStage.stageNumber).toBe(5);
  });

  it("rejects an invalid advance target", () => {
    let session = enterPlaying(createFootstepsSession({ ...baseParams, now: 0 }), 0);
    const { state } = completeCurrentStage(session, 0);
    session = state;
    expect(advanceFootstepsStage(session, { difficulty: Difficulty.ADVANCED, stageNumber: 1 }).success).toBe(false);
  });

  // THERAPIST SETUP SIMPLIFICATION (task section 53) — session.config is
  // frozen for the session's lifetime EXCEPT its technical fields, which a
  // real difficulty change now refreshes from the new difficulty's preset
  // (passed in by the calling controller hook via
  // lib/control/footsteps/stagePreset.ts). config.difficulty/startingStage
  // must stay the ORIGINAL setup choice (buildStoredFootstepsSession's
  // startingDifficulty relies on this) — only currentDifficulty reflects the
  // live difficulty. Mirrors lib/game/__tests__/session.test.ts's equivalent
  // block exactly.
  it("refreshes only the technical config fields on a difficulty change, leaving config.difficulty/startingStage as the original setup choice", () => {
    const session = enterPlaying(
      createFootstepsSession({ ...baseParams, difficulty: Difficulty.MEDIUM, stepLength: StepLength.MEDIUM, pathStyle: PathStyle.LEFT_RIGHT, pathWidth: PathWidth.MEDIUM, now: 1000 }),
      1000,
    );
    const { state: completed } = completeCurrentStage(session, 1000);
    const advanced = expectSuccess(
      advanceFootstepsStage(completed, { difficulty: Difficulty.ADVANCED, stageNumber: session.currentStage.stageNumber }, {
        stepLength: StepLength.LONG,
        pathStyle: PathStyle.VARIED,
        pathWidth: PathWidth.WIDE,
      }),
    );
    expect(advanced.config.stepLength).toBe(StepLength.LONG);
    expect(advanced.config.pathStyle).toBe(PathStyle.VARIED);
    expect(advanced.config.pathWidth).toBe(PathWidth.WIDE);
    expect(advanced.currentDifficulty).toBe(Difficulty.ADVANCED);
    // The original setup choice never changes, even though currentDifficulty did.
    expect(advanced.config.difficulty).toBe(Difficulty.MEDIUM);
    expect(advanced.config.startingStage).toBe(session.config.startingStage);
  });

  it("ignores presetFields on a same-difficulty continue — config is stage-invariant within one difficulty", () => {
    const session = enterPlaying(createFootstepsSession({ ...baseParams, difficulty: Difficulty.EASY, now: 1000 }), 1000);
    const { state: completed } = completeCurrentStage(session, 1000);
    const advanced = expectSuccess(
      advanceFootstepsStage(
        completed,
        { difficulty: Difficulty.EASY, stageNumber: (session.currentStage.stageNumber + 1) as StageNumber },
        { stepLength: StepLength.LONG, pathStyle: PathStyle.VARIED, pathWidth: PathWidth.WIDE },
      ),
    );
    expect(advanced.config.stepLength).toBe(session.config.stepLength);
    expect(advanced.config.pathStyle).toBe(session.config.pathStyle);
    expect(advanced.config.pathWidth).toBe(session.config.pathWidth);
  });
});

describe("endFootstepsSession", () => {
  it("finalizes an in-progress stage as SKIPPED with real partial progress and builds a summary", () => {
    let session = enterPlaying(createFootstepsSession({ ...baseParams, now: 0 }), 0);
    session = expectSuccess(confirmCurrentFootstep(session, 500));

    session = expectSuccess(endFootstepsSession(session, 2000));
    expect(session.gameState).toBe(GameState.SESSION_COMPLETE);
    expect(session.summary).not.toBeNull();
    expect(session.summary!.stageResults).toHaveLength(1);
    expect(session.summary!.stageResults[0].status).toBe(FootstepsStageStatus.SKIPPED);
    expect(session.summary!.totalStepsCompleted).toBe(1);
  });

  it("is rejected once already SESSION_COMPLETE", () => {
    let session = enterPlaying(createFootstepsSession({ ...baseParams, now: 0 }), 0);
    session = expectSuccess(endFootstepsSession(session, 2000));
    expect(endFootstepsSession(session, 3000).success).toBe(false);
  });
});

/**
 * RELIABILITY FIX — stranded-in-INSTRUCTIONS/COUNTDOWN recovery. Mirrors
 * lib/game/__tests__/session.test.ts's equivalent block — the controller-side
 * watchdog in useFootstepsRealtimeControllerSession.ts that resumes a session
 * left stranded by an interrupted runInstructionsToPlaying sequence is a thin
 * React effect around exactly this pure transition.
 */
describe("stranded transition recovery (INSTRUCTIONS/COUNTDOWN -> START_ZONE)", () => {
  it("recovers from INSTRUCTIONS back to START_ZONE, preserving session identity", () => {
    const created = createFootstepsSession({ ...baseParams, now: 1000 });
    const setUp = expectSuccess(applyFootstepsGameTransition(created, GameState.SETUP, 1000));
    const startZone = expectSuccess(applyFootstepsGameTransition(setUp, GameState.START_ZONE, 1000));
    const stranded = expectSuccess(applyFootstepsGameTransition(startZone, GameState.INSTRUCTIONS, 2000));

    const recovered = applyFootstepsGameTransition(stranded, GameState.START_ZONE, 3000);
    expect(recovered.success).toBe(true);
    expect(recovered.state.gameState).toBe(GameState.START_ZONE);
    expect(recovered.state.sessionId).toBe(stranded.sessionId);
    expect(recovered.state.config).toEqual(stranded.config);
    expect(recovered.state.currentStage.stageNumber).toBe(stranded.currentStage.stageNumber);
  });

  it("recovers from COUNTDOWN back to START_ZONE, preserving session identity", () => {
    const created = createFootstepsSession({ ...baseParams, now: 1000 });
    const setUp = expectSuccess(applyFootstepsGameTransition(created, GameState.SETUP, 1000));
    const startZone = expectSuccess(applyFootstepsGameTransition(setUp, GameState.START_ZONE, 1000));
    const instructions = expectSuccess(applyFootstepsGameTransition(startZone, GameState.INSTRUCTIONS, 2000));
    const stranded = expectSuccess(applyFootstepsGameTransition(instructions, GameState.COUNTDOWN, 3000));

    const recovered = applyFootstepsGameTransition(stranded, GameState.START_ZONE, 4000);
    expect(recovered.success).toBe(true);
    expect(recovered.state.gameState).toBe(GameState.START_ZONE);
    expect(recovered.state.sessionId).toBe(stranded.sessionId);
    expect(recovered.state.config).toEqual(stranded.config);
    expect(recovered.state.currentStage.stageNumber).toBe(stranded.currentStage.stageNumber);
  });

  it("recovering to START_ZONE lets the session reach PLAYING normally afterward", () => {
    const created = createFootstepsSession({ ...baseParams, now: 1000 });
    const setUp = expectSuccess(applyFootstepsGameTransition(created, GameState.SETUP, 1000));
    const startZone = expectSuccess(applyFootstepsGameTransition(setUp, GameState.START_ZONE, 1000));
    const stranded = expectSuccess(applyFootstepsGameTransition(startZone, GameState.INSTRUCTIONS, 2000));
    const recovered = expectSuccess(applyFootstepsGameTransition(stranded, GameState.START_ZONE, 3000));

    const playing = enterPlayingFromStartZone(recovered, 4000);
    expect(playing.gameState).toBe(GameState.PLAYING);
    expect(playing.sessionId).toBe(created.sessionId);
  });
});

// JOURNEY REDESIGN — checkpoints are a MEDIUM/ADVANCED route concept, but the
// engine's state machine needed ZERO changes to support them (see
// lib/footsteps/session.ts's class doc comment): confirmCurrentFootstep
// already just increments currentIndex by 1 per confirmable target, and a
// checkpoint is a purely derived fact about that index — never a separate
// confirm action, never a reason to finalize the stage early.
describe("JOURNEY REDESIGN — checkpoints", () => {
  it("restartFootstepsStage regenerates identical checkpoints and obstacles — a genuine retry, not a new route", () => {
    const created = createFootstepsSession({ ...baseParams, difficulty: Difficulty.ADVANCED, now: 1000 });
    const playing = enterPlaying(created, 1000);
    const restarted = expectSuccess(restartFootstepsStage(playing, 2000));

    expect(restarted.currentStage.checkpoints).toEqual(playing.currentStage.checkpoints);
    expect(restarted.currentStage.obstacles).toEqual(playing.currentStage.obstacles);
    expect(restarted.currentStage.footprints).toEqual(playing.currentStage.footprints);
  });

  it("a full MEDIUM playthrough crosses its checkpoint(s) without ever triggering a premature STAGE_COMPLETE", () => {
    const created = createFootstepsSession({ ...baseParams, difficulty: Difficulty.MEDIUM, startingStage: 1, now: 1000 });
    let s = enterPlaying(created, 1000);
    expect(s.currentStage.checkpoints.length).toBeGreaterThan(0); // MEDIUM stage 1 has at least one checkpoint by design

    const totalSteps = s.currentStage.totalSteps;
    let clock = 1000;
    for (let i = 0; i < totalSteps; i++) {
      clock += 400;
      s = expectSuccess(confirmCurrentFootstep(s, clock));
      // Crossing a checkpoint mid-route must never finalize the stage early — only the final target does.
      if (i < totalSteps - 1) expect(s.gameState).toBe(GameState.PLAYING);
    }
    // Only the FINAL target confirmation completes the stage.
    expect(s.gameState).toBe(GameState.STAGE_COMPLETE);
    expect(s.currentStage.currentIndex).toBe(totalSteps);
  });
});

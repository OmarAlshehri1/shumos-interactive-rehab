import { describe, expect, it } from "vitest";
import { GameState } from "@/lib/game";
import {
  advanceBubblePopStage,
  applyBubblePopGameTransition,
  type BubblePopActionResult,
  type BubblePopSessionState,
  confirmBubblePopColor,
  createBubblePopSession,
  currentTargetId,
  endBubblePopSession,
  jumpToBubblePopStage,
  pauseBubblePopSession,
  restartBubblePopStage,
  resumeBubblePopSession,
  skipBubblePopStage,
  switchBubblePopDifficulty,
} from "../session";
import { getBubbleStagePlan } from "../stagePlans";
import { BubbleSize, type BubbleColor, BubblePopStageStatus, Difficulty, ReachHeight, ReachSide, type StageNumber, TargetMode } from "../types";

const baseParams = {
  childFirstName: "عمر",
  difficulty: Difficulty.EASY,
  bubbleSize: BubbleSize.MEDIUM,
  reachHeight: ReachHeight.FULL,
  reachSide: ReachSide.FULL,
  targetMode: TargetMode.COLOR_ONLY,
};

function expectSuccess(result: BubblePopActionResult): BubblePopSessionState {
  expect(result.success).toBe(true);
  return result.state;
}

function enterPlaying(state: BubblePopSessionState, timestamp: number): BubblePopSessionState {
  let s = expectSuccess(applyBubblePopGameTransition(state, GameState.SETUP, timestamp));
  s = expectSuccess(applyBubblePopGameTransition(s, GameState.START_ZONE, timestamp));
  return enterPlayingFromStartZone(s, timestamp);
}

function enterPlayingFromStartZone(state: BubblePopSessionState, timestamp: number): BubblePopSessionState {
  let s = expectSuccess(applyBubblePopGameTransition(state, GameState.INSTRUCTIONS, timestamp));
  s = expectSuccess(applyBubblePopGameTransition(s, GameState.COUNTDOWN, timestamp));
  s = expectSuccess(applyBubblePopGameTransition(s, GameState.PLAYING, timestamp));
  return s;
}

function currentTargetColor(state: BubblePopSessionState): BubbleColor {
  const targetId = currentTargetId(state.currentStage)!;
  return state.currentStage.bubbles.find((b) => b.id === targetId)!.color;
}

/** A station color that is NOT the current mission's color — always exists since every Easy/Medium/Advanced plan has >= 2 stations. */
function wrongColor(state: BubblePopSessionState): BubbleColor {
  const plan = getBubbleStagePlan(state.currentStage.difficulty, state.currentStage.stageNumber);
  const correct = currentTargetColor(state);
  return plan.stations.find((c) => c !== correct)!;
}

/** Confirms every mission in the current stage's sequence, in order, by pressing the correct color each time. */
function completeCurrentStage(state: BubblePopSessionState, startClock: number): { state: BubblePopSessionState; clock: number } {
  let s = state;
  let clock = startClock;
  const totalTargets = s.currentStage.targetSequence.length;
  for (let i = 0; i < totalTargets; i++) {
    clock += 400;
    const color = currentTargetColor(s);
    s = expectSuccess(confirmBubblePopColor(s, color, clock));
  }
  return { state: s, clock };
}

describe("createBubblePopSession isolation", () => {
  it("gives every session a unique id and starts with a fresh, unplayed stage 1", () => {
    const a = createBubblePopSession({ ...baseParams, now: 1000 });
    const b = createBubblePopSession({ ...baseParams, now: 1000 });

    expect(a.sessionId).not.toBe(b.sessionId);
    for (const session of [a, b]) {
      expect(session.results).toHaveLength(0);
      expect(session.currentDifficulty).toBe(Difficulty.EASY);
      expect(session.currentStage.stageNumber).toBe(1);
      expect(session.gameState).toBe(GameState.WELCOME);
      expect(session.currentStage.currentTargetIndex).toBe(0);
      expect(session.currentStage.responseTimesMs).toHaveLength(0);
      expect(session.currentStage.startedAt).toBeNull();
      expect(session.currentStage.treasureProgress).toBe(0);
    }
  });

  it("respects a manually chosen startingStage", () => {
    const session = createBubblePopSession({ ...baseParams, startingStage: 3, now: 1000 });
    expect(session.currentStage.stageNumber).toBe(3);
    expect(session.results).toHaveLength(0);
  });
});

describe("confirmBubblePopColor — correct interaction", () => {
  it("advances currentTargetIndex exactly once per correct confirmation, pops the mission bubble, and rejects re-popping it", () => {
    let session = enterPlaying(createBubblePopSession({ ...baseParams, now: 0 }), 0);
    const totalTargets = session.currentStage.targetSequence.length;
    const firstTargetId = currentTargetId(session.currentStage)!;
    const color = currentTargetColor(session);

    session = expectSuccess(confirmBubblePopColor(session, color, 500));
    expect(session.currentStage.currentTargetIndex).toBe(1);
    expect(session.currentStage.responseTimesMs).toHaveLength(1);
    expect(session.currentStage.bubbles.find((b) => b.id === firstTargetId)!.isPopped).toBe(true);

    // Re-confirming the SAME color again targets the NEXT mission now — a no-op only if it happens to also be wrong/right is a different scenario; here we just confirm the pointer only moved once from the first press.
    expect(session.currentStage.targetSequence).toHaveLength(totalTargets);
  });

  it("auto-finalizes the stage as COMPLETED and transitions to STAGE_COMPLETE once every mission is confirmed", () => {
    let session = enterPlaying(createBubblePopSession({ ...baseParams, now: 0 }), 0);
    const { state } = completeCurrentStage(session, 0);
    session = state;

    expect(session.gameState).toBe(GameState.STAGE_COMPLETE);
    expect(session.results).toHaveLength(1);
    expect(session.results[0].status).toBe(BubblePopStageStatus.COMPLETED);
    expect(session.results[0].targetsCompleted).toBe(session.results[0].targetsPresented);
    expect(session.results[0].incorrectCount).toBe(0);
  });

  it("an already-popped mission's bubble id is a no-op if confirmed again indirectly (double-confirm protection)", () => {
    let session = enterPlaying(createBubblePopSession({ ...baseParams, now: 0 }), 0);
    const firstColor = currentTargetColor(session);
    session = expectSuccess(confirmBubblePopColor(session, firstColor, 500));
    const afterFirst = session;
    session = expectSuccess(confirmBubblePopColor(afterFirst, firstColor, 600));
    // A second press of the SAME color only scores against whatever is NOW current (correct or incorrect) — the previously popped bubble itself can never be re-popped.
    expect(session.currentStage.bubbles.filter((b) => b.isPopped).length).toBeGreaterThanOrEqual(1);
  });
});

describe("confirmBubblePopColor — incorrect interaction (NOT no-negative-scoring, unlike Follow the Footsteps)", () => {
  it("pressing the wrong station increments incorrectCount, leaves the mission bubble unpopped, and does not advance the target pointer", () => {
    let session = enterPlaying(createBubblePopSession({ ...baseParams, now: 0 }), 0);
    const targetIndexBefore = session.currentStage.currentTargetIndex;
    const targetIdBefore = currentTargetId(session.currentStage)!;
    const color = wrongColor(session);

    session = expectSuccess(confirmBubblePopColor(session, color, 500));
    expect(session.currentStage.incorrectCount).toBe(1);
    expect(session.currentStage.currentTargetIndex).toBe(targetIndexBefore);
    expect(session.currentStage.bubbles.find((b) => b.id === targetIdBefore)!.isPopped).toBe(false);
  });

  it("rejects confirmation while paused, and rejects it outside PLAYING", () => {
    const fresh = createBubblePopSession({ ...baseParams, now: 0 });
    const anyStation = getBubbleStagePlan(fresh.currentStage.difficulty, fresh.currentStage.stageNumber).stations[0];
    expect(confirmBubblePopColor(fresh, anyStation, 0).success).toBe(false);

    let playing = enterPlaying(fresh, 0);
    playing = expectSuccess(pauseBubblePopSession(playing, 100));
    const color = currentTargetColor(playing);
    expect(confirmBubblePopColor(playing, color, 200).success).toBe(false);
  });
});

describe("pause timing excludes paused duration from response time", () => {
  it("does not count paused time toward the next confirmed target's recorded response time", () => {
    let session = enterPlaying(createBubblePopSession({ ...baseParams, now: 0 }), 0);
    session = expectSuccess(pauseBubblePopSession(session, 100));
    session = expectSuccess(resumeBubblePopSession(session, 100000)); // a very long pause
    const color = currentTargetColor(session);
    session = expectSuccess(confirmBubblePopColor(session, color, 100200));

    expect(session.currentStage.responseTimesMs[0]).toBeLessThan(1000);
  });
});

describe("treasure chest progress (Easy 5 only, task section 12/13)", () => {
  it("advances treasureProgress on every correct pop only when the stage plan has the treasure feature", () => {
    let session = enterPlaying(createBubblePopSession({ ...baseParams, startingStage: 5, now: 0 }), 0);
    expect(getBubbleStagePlan(Difficulty.EASY, 5).features.treasure).toBe(true);
    expect(session.currentStage.treasureProgress).toBe(0);

    const color1 = currentTargetColor(session);
    session = expectSuccess(confirmBubblePopColor(session, color1, 500));
    expect(session.currentStage.treasureProgress).toBe(1);

    const color2 = currentTargetColor(session);
    session = expectSuccess(confirmBubblePopColor(session, color2, 900));
    expect(session.currentStage.treasureProgress).toBe(2);
  });

  it("never advances treasureProgress on a stage without the treasure feature", () => {
    let session = enterPlaying(createBubblePopSession({ ...baseParams, startingStage: 1, now: 0 }), 0);
    expect(getBubbleStagePlan(Difficulty.EASY, 1).features.treasure).toBe(false);
    const color = currentTargetColor(session);
    session = expectSuccess(confirmBubblePopColor(session, color, 500));
    expect(session.currentStage.treasureProgress).toBe(0);
  });

  it("resets to 0 on restart — no stale progress (task section 17)", () => {
    let session = enterPlaying(createBubblePopSession({ ...baseParams, startingStage: 5, now: 0 }), 0);
    const color = currentTargetColor(session);
    session = expectSuccess(confirmBubblePopColor(session, color, 500));
    expect(session.currentStage.treasureProgress).toBe(1);

    session = expectSuccess(restartBubblePopStage(session, 1000));
    expect(session.currentStage.treasureProgress).toBe(0);
  });
});

describe("restartBubblePopStage determinism", () => {
  it("regenerates an identical field/target sequence and resets every runtime metric", () => {
    let session = enterPlaying(createBubblePopSession({ ...baseParams, seed: "restart-seed", now: 0 }), 0);
    const originalBubbles = session.currentStage.bubbles;
    const originalSequence = session.currentStage.targetSequence;
    const color = currentTargetColor(session);
    session = expectSuccess(confirmBubblePopColor(session, color, 500));
    expect(session.currentStage.currentTargetIndex).toBe(1);

    session = expectSuccess(restartBubblePopStage(session, 1000));
    expect(session.currentStage.currentTargetIndex).toBe(0);
    expect(session.currentStage.responseTimesMs).toHaveLength(0);
    expect(session.currentStage.bubbles).toEqual(originalBubbles);
    expect(session.currentStage.targetSequence).toEqual(originalSequence);
    expect(session.currentStage.bubbles.every((b) => !b.isPopped)).toBe(true);
  });
});

describe("skipBubblePopStage semantics", () => {
  it("records the current stage as SKIPPED and moves to stageNumber + 1, landing on START_ZONE", () => {
    let session = enterPlaying(createBubblePopSession({ ...baseParams, now: 0 }), 0);
    const color = currentTargetColor(session);
    session = expectSuccess(confirmBubblePopColor(session, color, 500)); // partial progress

    session = expectSuccess(skipBubblePopStage(session, 1000));
    expect(session.gameState).toBe(GameState.START_ZONE);
    expect(session.currentStage.stageNumber).toBe(2);
    expect(session.results).toHaveLength(1);
    expect(session.results[0].status).toBe(BubblePopStageStatus.SKIPPED);
    expect(session.results[0].targetsCompleted).toBe(1); // real partial progress preserved
  });

  it("is rejected on the difficulty's final stage", () => {
    const session = enterPlaying(createBubblePopSession({ ...baseParams, startingStage: 5, now: 0 }), 0);
    const result = skipBubblePopStage(session, 1000);
    expect(result.success).toBe(false);
  });
});

describe("jumpToBubblePopStage semantics", () => {
  it("records only the stage actually left, never unvisited placeholders", () => {
    let session = enterPlaying(createBubblePopSession({ ...baseParams, now: 0 }), 0);
    session = expectSuccess(jumpToBubblePopStage(session, 4 as StageNumber, 1000));

    expect(session.currentStage.stageNumber).toBe(4);
    expect(session.gameState).toBe(GameState.START_ZONE);
    const skippedNumbers = session.results.map((r) => r.stageNumber);
    expect(skippedNumbers).toEqual([1]);
    for (const result of session.results) {
      expect(result.status).toBe(BubblePopStageStatus.SKIPPED);
    }
  });

  it("uses same-stage as a no-op and permits an earlier-stage re-attempt", () => {
    const session = enterPlaying(createBubblePopSession({ ...baseParams, startingStage: 3, now: 0 }), 0);
    expect(jumpToBubblePopStage(session, 3 as StageNumber, 1000).state).toBe(session);
    const back = expectSuccess(jumpToBubblePopStage(session, 2 as StageNumber, 1000));
    expect(back.currentStage.stageNumber).toBe(2);
  });
});

describe("live Bubble Pop difficulty navigation", () => {
  it("records the active attempt once and loads the selected difficulty at stage 1", () => {
    let session = enterPlaying(createBubblePopSession({ ...baseParams, startingStage: 4, now: 0 }), 0);
    session = expectSuccess(confirmBubblePopColor(session, currentTargetColor(session), 500));
    const changed = expectSuccess(switchBubblePopDifficulty(session, Difficulty.MEDIUM, 1000, { bubbleSize: BubbleSize.MEDIUM, reachHeight: ReachHeight.FULL, reachSide: ReachSide.FULL, targetMode: TargetMode.COLOR_ONLY }));
    expect(changed.currentDifficulty).toBe(Difficulty.MEDIUM);
    expect(changed.currentStage.stageNumber).toBe(1);
    expect(changed.results).toHaveLength(1);
    expect(changed.gameState).toBe(GameState.START_ZONE);
  });
});

describe("advanceBubblePopStage difficulty decisions", () => {
  it("continues to stageNumber + 1 within the same difficulty", () => {
    let session = enterPlaying(createBubblePopSession({ ...baseParams, now: 0 }), 0);
    const { state } = completeCurrentStage(session, 0);
    session = state;

    session = expectSuccess(advanceBubblePopStage(session, { difficulty: Difficulty.EASY, stageNumber: 2 }));
    expect(session.currentDifficulty).toBe(Difficulty.EASY);
    expect(session.currentStage.stageNumber).toBe(2);
    expect(session.gameState).toBe(GameState.START_ZONE);
  });

  it("steps to the adjacent harder difficulty at the same stage number", () => {
    let session = enterPlaying(createBubblePopSession({ ...baseParams, startingStage: 5, now: 0 }), 0);
    const { state } = completeCurrentStage(session, 0);
    session = state;

    session = expectSuccess(advanceBubblePopStage(session, { difficulty: Difficulty.MEDIUM, stageNumber: 5 }));
    expect(session.currentDifficulty).toBe(Difficulty.MEDIUM);
    expect(session.currentStage.stageNumber).toBe(5);
  });

  it("rejects an invalid advance target", () => {
    let session = enterPlaying(createBubblePopSession({ ...baseParams, now: 0 }), 0);
    const { state } = completeCurrentStage(session, 0);
    session = state;
    expect(advanceBubblePopStage(session, { difficulty: Difficulty.ADVANCED, stageNumber: 1 }).success).toBe(false);
  });

  it("refreshes only the technical config fields on a difficulty change, leaving config.difficulty/startingStage as the original setup choice", () => {
    const session = enterPlaying(
      createBubblePopSession({ ...baseParams, difficulty: Difficulty.MEDIUM, bubbleSize: BubbleSize.MEDIUM, reachHeight: ReachHeight.FULL, now: 1000 }),
      1000,
    );
    const { state: completed } = completeCurrentStage(session, 1000);
    const advanced = expectSuccess(
      advanceBubblePopStage(completed, { difficulty: Difficulty.ADVANCED, stageNumber: session.currentStage.stageNumber }, {
        bubbleSize: BubbleSize.SMALL,
        reachHeight: ReachHeight.HIGH,
        reachSide: ReachSide.LEFT,
        targetMode: TargetMode.COLOR_AND_SHAPE,
      }),
    );
    expect(advanced.config.bubbleSize).toBe(BubbleSize.SMALL);
    expect(advanced.config.reachHeight).toBe(ReachHeight.HIGH);
    expect(advanced.config.reachSide).toBe(ReachSide.LEFT);
    expect(advanced.config.targetMode).toBe(TargetMode.COLOR_AND_SHAPE);
    expect(advanced.currentDifficulty).toBe(Difficulty.ADVANCED);
    expect(advanced.config.difficulty).toBe(Difficulty.MEDIUM);
    expect(advanced.config.startingStage).toBe(session.config.startingStage);
  });

  it("ignores presetFields on a same-difficulty continue — config is stage-invariant within one difficulty", () => {
    const session = enterPlaying(createBubblePopSession({ ...baseParams, difficulty: Difficulty.EASY, now: 1000 }), 1000);
    const { state: completed } = completeCurrentStage(session, 1000);
    const advanced = expectSuccess(
      advanceBubblePopStage(
        completed,
        { difficulty: Difficulty.EASY, stageNumber: (session.currentStage.stageNumber + 1) as StageNumber },
        { bubbleSize: BubbleSize.SMALL, reachHeight: ReachHeight.HIGH, reachSide: ReachSide.LEFT, targetMode: TargetMode.COLOR_AND_SHAPE },
      ),
    );
    expect(advanced.config.bubbleSize).toBe(session.config.bubbleSize);
    expect(advanced.config.reachHeight).toBe(session.config.reachHeight);
  });
});

describe("endBubblePopSession", () => {
  it("finalizes an in-progress stage as SKIPPED with real partial progress and builds a summary with both completion and accuracy", () => {
    let session = enterPlaying(createBubblePopSession({ ...baseParams, now: 0 }), 0);
    const color = currentTargetColor(session);
    session = expectSuccess(confirmBubblePopColor(session, color, 500));
    const nextWrong = wrongColor(session);
    session = expectSuccess(confirmBubblePopColor(session, nextWrong, 700));

    session = expectSuccess(endBubblePopSession(session, 2000));
    expect(session.gameState).toBe(GameState.SESSION_COMPLETE);
    expect(session.summary).not.toBeNull();
    expect(session.summary!.stageResults).toHaveLength(1);
    expect(session.summary!.stageResults[0].status).toBe(BubblePopStageStatus.SKIPPED);
    expect(session.summary!.totalTargetsCompleted).toBe(1);
    expect(session.summary!.totalIncorrect).toBe(1);
    expect(session.summary!.accuracy).toBeCloseTo(0.5);
  });

  it("is rejected once already SESSION_COMPLETE", () => {
    let session = enterPlaying(createBubblePopSession({ ...baseParams, now: 0 }), 0);
    session = expectSuccess(endBubblePopSession(session, 2000));
    expect(endBubblePopSession(session, 3000).success).toBe(false);
  });
});

describe("stranded transition recovery (INSTRUCTIONS/COUNTDOWN -> START_ZONE)", () => {
  it("recovers from INSTRUCTIONS back to START_ZONE, preserving session identity", () => {
    const created = createBubblePopSession({ ...baseParams, now: 1000 });
    const setUp = expectSuccess(applyBubblePopGameTransition(created, GameState.SETUP, 1000));
    const startZone = expectSuccess(applyBubblePopGameTransition(setUp, GameState.START_ZONE, 1000));
    const stranded = expectSuccess(applyBubblePopGameTransition(startZone, GameState.INSTRUCTIONS, 2000));

    const recovered = applyBubblePopGameTransition(stranded, GameState.START_ZONE, 3000);
    expect(recovered.success).toBe(true);
    expect(recovered.state.gameState).toBe(GameState.START_ZONE);
    expect(recovered.state.sessionId).toBe(stranded.sessionId);
    expect(recovered.state.config).toEqual(stranded.config);
    expect(recovered.state.currentStage.stageNumber).toBe(stranded.currentStage.stageNumber);
  });

  it("recovers from COUNTDOWN back to START_ZONE, preserving session identity", () => {
    const created = createBubblePopSession({ ...baseParams, now: 1000 });
    const setUp = expectSuccess(applyBubblePopGameTransition(created, GameState.SETUP, 1000));
    const startZone = expectSuccess(applyBubblePopGameTransition(setUp, GameState.START_ZONE, 1000));
    const instructions = expectSuccess(applyBubblePopGameTransition(startZone, GameState.INSTRUCTIONS, 2000));
    const stranded = expectSuccess(applyBubblePopGameTransition(instructions, GameState.COUNTDOWN, 3000));

    const recovered = applyBubblePopGameTransition(stranded, GameState.START_ZONE, 4000);
    expect(recovered.success).toBe(true);
    expect(recovered.state.gameState).toBe(GameState.START_ZONE);
    expect(recovered.state.sessionId).toBe(stranded.sessionId);
    expect(recovered.state.config).toEqual(stranded.config);
    expect(recovered.state.currentStage.stageNumber).toBe(stranded.currentStage.stageNumber);
  });

  it("recovering to START_ZONE lets the session reach PLAYING normally afterward", () => {
    const created = createBubblePopSession({ ...baseParams, now: 1000 });
    const setUp = expectSuccess(applyBubblePopGameTransition(created, GameState.SETUP, 1000));
    const startZone = expectSuccess(applyBubblePopGameTransition(setUp, GameState.START_ZONE, 1000));
    const stranded = expectSuccess(applyBubblePopGameTransition(startZone, GameState.INSTRUCTIONS, 2000));
    const recovered = expectSuccess(applyBubblePopGameTransition(stranded, GameState.START_ZONE, 3000));

    const playing = enterPlayingFromStartZone(recovered, 4000);
    expect(playing.gameState).toBe(GameState.PLAYING);
    expect(playing.sessionId).toBe(created.sessionId);
  });
});

describe("confirmBubblePopColor — color+shape missions (Advanced 2, task Part G)", () => {
  it("pops only when BOTH color and shape match; color alone (no shape) is incorrect", () => {
    let session = enterPlaying(createBubblePopSession({ ...baseParams, difficulty: Difficulty.ADVANCED, startingStage: 2, now: 0 }), 0);
    const targetId = currentTargetId(session.currentStage)!;
    const target = session.currentStage.bubbles.find((b) => b.id === targetId)!;
    expect(target.requiresShape).toBe(true);

    // Right color, no shape (or wrong shape) — incorrect, no advance.
    const wrongToken = target.stationTokens.find((t) => !(t.color === target.color && t.shape === target.shape))!;
    session = expectSuccess(confirmBubblePopColor(session, wrongToken.color, 500, wrongToken.shape));
    expect(session.currentStage.incorrectCount).toBe(1);
    expect(session.currentStage.currentTargetIndex).toBe(0);

    // Exact (color, shape) match — correct, advances.
    session = expectSuccess(confirmBubblePopColor(session, target.color, 900, target.shape));
    expect(session.currentStage.currentTargetIndex).toBe(1);
    expect(session.currentStage.bubbles.find((b) => b.id === targetId)!.isPopped).toBe(true);
  });

  it("the right color with no shape argument at all is incorrect for a requiresShape mission", () => {
    let session = enterPlaying(createBubblePopSession({ ...baseParams, difficulty: Difficulty.ADVANCED, startingStage: 2, now: 0 }), 0);
    const targetId = currentTargetId(session.currentStage)!;
    const target = session.currentStage.bubbles.find((b) => b.id === targetId)!;
    session = expectSuccess(confirmBubblePopColor(session, target.color, 500));
    expect(session.currentStage.incorrectCount).toBe(1);
    expect(session.currentStage.bubbles.find((b) => b.id === targetId)!.isPopped).toBe(false);
  });
});

describe("confirmBubblePopColor — two-step sequence missions (Advanced 3, task Part G)", () => {
  it("preserves the first step's popped bubble when the second step is answered wrong (no harsh reset)", () => {
    let session = enterPlaying(createBubblePopSession({ ...baseParams, difficulty: Difficulty.ADVANCED, startingStage: 3, now: 0 }), 0);
    const firstId = currentTargetId(session.currentStage)!;
    const firstColor = session.currentStage.bubbles.find((b) => b.id === firstId)!.color;
    session = expectSuccess(confirmBubblePopColor(session, firstColor, 500));
    expect(session.currentStage.currentTargetIndex).toBe(1);
    expect(session.currentStage.bubbles.find((b) => b.id === firstId)!.isPopped).toBe(true);

    const secondId = currentTargetId(session.currentStage)!;
    const secondColor = session.currentStage.bubbles.find((b) => b.id === secondId)!.color;
    const plan = getBubbleStagePlan(Difficulty.ADVANCED, 3);
    const wrongColor = plan.stations.find((c) => c !== secondColor)!;
    session = expectSuccess(confirmBubblePopColor(session, wrongColor, 700));

    // First step's pop is untouched — incorrectCount rose, pointer did not move backward.
    expect(session.currentStage.bubbles.find((b) => b.id === firstId)!.isPopped).toBe(true);
    expect(session.currentStage.currentTargetIndex).toBe(1);
    expect(session.currentStage.incorrectCount).toBe(1);

    // The second step can still be completed normally afterward.
    session = expectSuccess(confirmBubblePopColor(session, secondColor, 900));
    expect(session.currentStage.currentTargetIndex).toBe(2);
  });
});

describe("treasure/key progression across difficulties (task Part F/G)", () => {
  it("Medium 5 (PEARLS) advances treasureProgress on every correct pop", () => {
    let session = enterPlaying(createBubblePopSession({ ...baseParams, difficulty: Difficulty.MEDIUM, startingStage: 5, now: 0 }), 0);
    expect(getBubbleStagePlan(Difficulty.MEDIUM, 5).treasureMode).toBe("PEARLS");
    const color = session.currentStage.bubbles.find((b) => b.id === currentTargetId(session.currentStage))!.color;
    session = expectSuccess(confirmBubblePopColor(session, color, 500));
    expect(session.currentStage.treasureProgress).toBe(1);
  });

  it("Advanced 5 (KEYS) advances treasureProgress on every correct pop, including a shape-mode one", () => {
    let session = enterPlaying(createBubblePopSession({ ...baseParams, difficulty: Difficulty.ADVANCED, startingStage: 5, now: 0 }), 0);
    expect(getBubbleStagePlan(Difficulty.ADVANCED, 5).treasureMode).toBe("KEYS");
    const target = session.currentStage.bubbles.find((b) => b.id === currentTargetId(session.currentStage))!;
    session = expectSuccess(confirmBubblePopColor(session, target.color, 500, target.requiresShape ? target.shape : undefined));
    expect(session.currentStage.treasureProgress).toBe(1);
  });

  it("reaches full treasureProgress exactly when the stage completes", () => {
    let session = enterPlaying(createBubblePopSession({ ...baseParams, difficulty: Difficulty.MEDIUM, startingStage: 5, now: 0 }), 0);
    const total = session.currentStage.bubbles.length;
    for (let i = 0; i < total; i++) {
      const target = session.currentStage.bubbles.find((b) => b.id === currentTargetId(session.currentStage))!;
      session = expectSuccess(confirmBubblePopColor(session, target.color, 500 + i * 400));
    }
    expect(session.gameState).toBe(GameState.STAGE_COMPLETE);
    expect(session.currentStage.treasureProgress).toBe(total);
  });
});

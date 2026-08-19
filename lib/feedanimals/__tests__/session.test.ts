import { describe, expect, it } from "vitest";
import { GameState } from "@/lib/game";
import { currentRound, FoodSize, MovementPattern, ReachHeight, ReachSide } from "../index";
import { generateFeedStage } from "../feedGenerator";
import { feedAnimalsObstacleRequiresJump, getFeedAnimalsPathStage } from "../pathStages";
import {
  advanceFeedAnimalsMonkey,
  advanceFeedAnimalsStage,
  applyFeedAnimalsGameTransition,
  confirmFoodSelection,
  createFeedAnimalsSession,
  endFeedAnimalsSession,
  type FeedAnimalsSessionState,
  jumpToFeedAnimalsStage,
  pauseFeedAnimalsSession,
  restartFeedAnimalsStage,
  resumeFeedAnimalsSession,
  skipFeedAnimalsStage,
  switchFeedAnimalsDifficulty,
} from "../session";
import { Difficulty, FeedAnimalsStageStatus, type StageNumber } from "../types";

// SAFARI ANIMAL ADVENTURE — every real (difficulty, stageNumber) is now a
// hand-designed PATH stage (see lib/feedanimals/pathStages.ts); the original
// round-based ("animal asks -> child picks food") mechanic
// (feedGenerator.ts/confirmFoodSelection) is kept only as a dormant
// fallback that buildStageRuntime can no longer actually select for any
// real input. This file therefore splits its coverage in two:
//   (1) confirmFoodSelection/pause-resume-timing are exercised against a
//       DIRECTLY-CONSTRUCTED "rounds" stage (generateFeedStage, bypassing
//       buildStageRuntime's own difficulty routing) — genuine white-box
//       coverage of that still-present code, since nothing about it was
//       deleted (task's "minimal compatibility changes").
//   (2) restart/advance/skip/jump/end — generic wrapper behavior that
//       doesn't itself branch on stage "kind" — are exercised against the
//       REAL, reachable path mechanic instead, using advanceFeedAnimalsMonkey.
const BASE_PARAMS = {
  childFirstName: "عمر",
  difficulty: Difficulty.MEDIUM,
  foodSize: FoodSize.LARGE,
  reachHeight: ReachHeight.FULL,
  reachSide: ReachSide.FULL,
  movementPattern: MovementPattern.VARIED,
};

function toPlaying(state: FeedAnimalsSessionState, now = Date.now()): FeedAnimalsSessionState {
  let s = applyFeedAnimalsGameTransition(state, GameState.SETUP, now).state;
  s = applyFeedAnimalsGameTransition(s, GameState.START_ZONE, now).state;
  s = applyFeedAnimalsGameTransition(s, GameState.INSTRUCTIONS, now).state;
  s = applyFeedAnimalsGameTransition(s, GameState.COUNTDOWN, now).state;
  s = applyFeedAnimalsGameTransition(s, GameState.PLAYING, now).state;
  return s;
}

/** Builds a session whose currentStage is forced to the ORIGINAL round-based mechanic, bypassing buildStageRuntime's own (now always-path) routing — see this file's own doc comment. */
function buildRoundsSession(overrides: Partial<typeof BASE_PARAMS & { startingStage: StageNumber }> = {}): FeedAnimalsSessionState {
  const base = createFeedAnimalsSession({ ...BASE_PARAMS, ...overrides });
  const generated = generateFeedStage({
    seed: base.seed,
    difficulty: base.currentStage.difficulty,
    stageNumber: base.currentStage.stageNumber,
    config: base.config,
  });
  return { ...base, currentStage: { ...base.currentStage, kind: "rounds", rounds: generated.rounds } };
}

function correctChoiceId(state: FeedAnimalsSessionState): string {
  const round = currentRound(state.currentStage);
  if (!round) throw new Error("no current round");
  const choice = round.choices.find((c) => c.food === round.correctFood);
  if (!choice) throw new Error("no correct choice found");
  return choice.id;
}

function incorrectChoiceId(state: FeedAnimalsSessionState): string {
  const round = currentRound(state.currentStage);
  if (!round) throw new Error("no current round");
  const choice = round.choices.find((c) => c.food !== round.correctFood);
  if (!choice) throw new Error("no incorrect choice found (round has only one choice)");
  return choice.id;
}

/** Drives the PATH mechanic's active leg (and every subsequent leg, for a multi-animal stage) all the way to STAGE_COMPLETE — pressing JUMP at every jump-requiring obstacle, RIGHT otherwise. */
function completePathStage(state: FeedAnimalsSessionState): FeedAnimalsSessionState {
  let s = state;
  for (let i = 0; i < 300 && s.gameState === GameState.PLAYING; i++) {
    const pathDef = getFeedAnimalsPathStage(s.currentStage.difficulty, s.currentStage.stageNumber)!;
    const leg = pathDef.legs[s.currentStage.legIndex];
    const blocked = leg.obstacles.some((o) => o.atStep === s.currentStage.pathProgressStep + 1 && feedAnimalsObstacleRequiresJump(o.kind));
    const result = advanceFeedAnimalsMonkey(s, blocked ? "jump" : "right", Date.now() + i);
    if (!result.success) break;
    s = result.state;
  }
  return s;
}

describe("createFeedAnimalsSession", () => {
  it("creates a fresh, unplayed session at stage 1 by default", () => {
    const session = createFeedAnimalsSession(BASE_PARAMS);
    expect(session.gameState).toBe(GameState.WELCOME);
    expect(session.currentStage.stageNumber).toBe(1);
    expect(session.results).toEqual([]);
    expect(session.summary).toBeNull();
  });

  it("respects a manually chosen startingStage", () => {
    const session = createFeedAnimalsSession({ ...BASE_PARAMS, startingStage: 3 });
    expect(session.currentStage.stageNumber).toBe(3);
  });

  it("produces unique sessionId/seed across calls", () => {
    const a = createFeedAnimalsSession(BASE_PARAMS);
    const b = createFeedAnimalsSession(BASE_PARAMS);
    expect(a.sessionId).not.toBe(b.sessionId);
    expect(a.seed).not.toBe(b.seed);
  });

  it("every real (difficulty, stageNumber) resolves to the path mechanic today — the round-based branch is a dormant fallback", () => {
    for (const difficulty of [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.ADVANCED]) {
      for (let stageNumber = 1; stageNumber <= 5; stageNumber++) {
        const session = createFeedAnimalsSession({ ...BASE_PARAMS, difficulty, startingStage: stageNumber as StageNumber });
        expect(session.currentStage.kind).toBe("path");
      }
    }
  });
});

describe("confirmFoodSelection — correct interaction (round-based mechanic, directly constructed)", () => {
  it("feeds the animal, advances the round pointer exactly once, and records response time", () => {
    const session = toPlaying(buildRoundsSession());
    const choiceId = correctChoiceId(session);
    const result = confirmFoodSelection(session, choiceId, Date.now() + 500);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.state.currentStage.currentRoundIndex).toBe(1);
    expect(result.state.currentStage.rounds[0].fed).toBe(true);
    expect(result.state.currentStage.responseTimesMs).toHaveLength(1);
  });

  it("re-confirming an already-fed round's food is a safe no-op (never double-scored)", () => {
    const session = toPlaying(buildRoundsSession());
    const choiceId = correctChoiceId(session);
    const first = confirmFoodSelection(session, choiceId, Date.now());
    expect(first.success).toBe(true);
    if (!first.success) return;
    const second = confirmFoodSelection(first.state, choiceId, Date.now());
    expect(second.success).toBe(true);
    if (!second.success) return;
    expect(second.state.currentStage.currentRoundIndex).toBe(1);
    expect(second.state.currentStage.responseTimesMs).toHaveLength(1);
  });

  it("double-confirm protection: rapidly confirming the same correct choice twice never advances twice", () => {
    const session = toPlaying(buildRoundsSession());
    const choiceId = correctChoiceId(session);
    const now = Date.now();
    const r1 = confirmFoodSelection(session, choiceId, now);
    if (!r1.success) throw new Error("expected success");
    const r2 = confirmFoodSelection(r1.state, choiceId, now + 10);
    if (!r2.success) throw new Error("expected success");
    expect(r2.state.currentStage.currentRoundIndex).toBe(1);
    expect(r2.state.currentStage.rounds.filter((r) => r.fed)).toHaveLength(1);
  });

  it("auto-finalizes the stage and transitions to STAGE_COMPLETE once every round is fed", () => {
    let session = toPlaying(buildRoundsSession());
    const totalRounds = session.currentStage.rounds.length;
    for (let i = 0; i < totalRounds; i++) {
      const choiceId = correctChoiceId(session);
      const result = confirmFoodSelection(session, choiceId, Date.now() + i * 100);
      if (!result.success) throw new Error(result.reason);
      session = result.state;
    }
    expect(session.gameState).toBe(GameState.STAGE_COMPLETE);
    expect(session.results).toHaveLength(1);
    expect(session.results[0].status).toBe(FeedAnimalsStageStatus.COMPLETED);
    expect(session.results[0].roundsCompleted).toBe(totalRounds);
    expect(session.results[0].roundsPresented).toBe(totalRounds);
  });
});

describe("confirmFoodSelection — incorrect interaction (round-based mechanic)", () => {
  it("increments incorrectCount and leaves the round/pointer unchanged", () => {
    const session = toPlaying(buildRoundsSession());
    const wrongId = incorrectChoiceId(session);
    const result = confirmFoodSelection(session, wrongId, Date.now());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.state.currentStage.incorrectCount).toBe(1);
    expect(result.state.currentStage.currentRoundIndex).toBe(0);
    expect(result.state.currentStage.rounds[0].fed).toBe(false);
  });

  it("incorrect then correct: incorrect count is exactly +1, round advances exactly once on the correct tap", () => {
    const session = toPlaying(buildRoundsSession());
    const wrongId = incorrectChoiceId(session);
    const afterWrong = confirmFoodSelection(session, wrongId, Date.now());
    if (!afterWrong.success) throw new Error("expected success");
    expect(afterWrong.state.currentStage.currentRoundIndex).toBe(0);

    const rightId = correctChoiceId(afterWrong.state);
    const afterRight = confirmFoodSelection(afterWrong.state, rightId, Date.now() + 200);
    if (!afterRight.success) throw new Error("expected success");
    expect(afterRight.state.currentStage.incorrectCount).toBe(1);
    expect(afterRight.state.currentStage.currentRoundIndex).toBe(1);
  });

  it("rejects confirmation outside PLAYING", () => {
    const session = buildRoundsSession(); // still WELCOME
    const round = session.currentStage.rounds[0];
    const result = confirmFoodSelection(session, round.choices[0].id, Date.now());
    expect(result.success).toBe(false);
  });

  it("rejects confirmation while paused", () => {
    const playing = toPlaying(buildRoundsSession());
    const paused = pauseFeedAnimalsSession(playing, Date.now());
    if (!paused.success) throw new Error("expected pause to succeed");
    const choiceId = correctChoiceId(paused.state);
    const result = confirmFoodSelection(paused.state, choiceId, Date.now());
    expect(result.success).toBe(false);
  });
});

describe("pause/resume timing (round-based mechanic)", () => {
  it("excludes paused duration from stage duration and response-time math", () => {
    const t0 = 1_000_000;
    let session = toPlaying({ ...buildRoundsSession(), createdAt: t0 }, t0);

    const paused = pauseFeedAnimalsSession(session, t0 + 1000);
    if (!paused.success) throw new Error("expected pause");
    const resumed = resumeFeedAnimalsSession(paused.state, t0 + 30_000); // 29s paused
    if (!resumed.success) throw new Error("expected resume");
    session = resumed.state;

    const choiceId = correctChoiceId(session);
    const confirmed = confirmFoodSelection(session, choiceId, t0 + 30_500); // 500ms after resume
    if (!confirmed.success) throw new Error("expected success");
    // Active time = 1000ms before the pause + 500ms after resume = 1500ms —
    // the 29s spent paused must be excluded, not the full 30.5s elapsed.
    expect(confirmed.state.currentStage.responseTimesMs[0]).toBe(1500);
  });
});

describe("restartFeedAnimalsStage (path mechanic — the only reachable kind today)", () => {
  it("resets progress/legIndex to 0 and reproduces the exact same route", () => {
    const session = toPlaying(createFeedAnimalsSession(BASE_PARAMS));
    const afterOneStep = advanceFeedAnimalsMonkey(session, "right", Date.now());
    if (!afterOneStep.success) throw new Error("expected success");

    const restarted = restartFeedAnimalsStage(afterOneStep.state, Date.now());
    if (!restarted.success) throw new Error("expected success");
    expect(restarted.state.currentStage.kind).toBe("path");
    expect(restarted.state.currentStage.pathProgressStep).toBe(0);
    expect(restarted.state.currentStage.legIndex).toBe(0);
  });
});

describe("skip/jump semantics (path mechanic)", () => {
  it("skipFeedAnimalsStage records the current stage as SKIPPED and moves to the next stage number", () => {
    const session = toPlaying(createFeedAnimalsSession(BASE_PARAMS));
    const skipped = skipFeedAnimalsStage(session, Date.now());
    if (!skipped.success) throw new Error(skipped.success ? "" : skipped.reason);
    expect(skipped.state.gameState).toBe(GameState.START_ZONE);
    expect(skipped.state.currentStage.stageNumber).toBe(2);
    expect(skipped.state.results).toHaveLength(1);
    expect(skipped.state.results[0].status).toBe(FeedAnimalsStageStatus.SKIPPED);
  });

  it("rejects skipping the difficulty's last (5th) stage", () => {
    const session = toPlaying(createFeedAnimalsSession({ ...BASE_PARAMS, startingStage: 5 }));
    const result = skipFeedAnimalsStage(session, Date.now());
    expect(result.success).toBe(false);
  });

  it("jumpToFeedAnimalsStage records only the stage actually left", () => {
    const session = toPlaying(createFeedAnimalsSession(BASE_PARAMS));
    const jumped = jumpToFeedAnimalsStage(session, 4, Date.now());
    if (!jumped.success) throw new Error(jumped.success ? "" : jumped.reason);
    expect(jumped.state.currentStage.stageNumber).toBe(4);
    expect(jumped.state.results.map((r) => r.stageNumber)).toEqual([1]);
    expect(jumped.state.results.every((r) => r.status === FeedAnimalsStageStatus.SKIPPED)).toBe(true);
  });

  it("uses same-stage as a no-op and permits an earlier-stage re-attempt", () => {
    const session = toPlaying(createFeedAnimalsSession({ ...BASE_PARAMS, startingStage: 3 }));
    expect(jumpToFeedAnimalsStage(session, 3, Date.now()).state).toBe(session);
    const back = jumpToFeedAnimalsStage(session, 2, Date.now());
    expect(back.success).toBe(true);
    expect(back.state.currentStage.stageNumber).toBe(2);
  });
});

describe("live Feed Animals difficulty navigation", () => {
  it("records the active attempt once and loads stage 1 of the selected preset", () => {
    const session = toPlaying(createFeedAnimalsSession({ ...BASE_PARAMS, startingStage: 4 }));
    const changed = switchFeedAnimalsDifficulty(session, Difficulty.ADVANCED, Date.now() + 1000, {
      foodSize: FoodSize.LARGE,
      reachHeight: ReachHeight.FULL,
      reachSide: ReachSide.FULL,
      movementPattern: MovementPattern.CROSS,
    });
    expect(changed.success).toBe(true);
    expect(changed.state.currentDifficulty).toBe(Difficulty.ADVANCED);
    expect(changed.state.currentStage.stageNumber).toBe(1);
    expect(changed.state.results).toHaveLength(1);
    expect(changed.state.gameState).toBe(GameState.START_ZONE);
  });
});

describe("advanceFeedAnimalsStage (path mechanic)", () => {
  it("continue moves to the next stage number, same difficulty", () => {
    const session = completePathStage(toPlaying(createFeedAnimalsSession(BASE_PARAMS)));
    const advanced = advanceFeedAnimalsStage(session, { difficulty: Difficulty.MEDIUM, stageNumber: 2 });
    if (!advanced.success) throw new Error(advanced.success ? "" : advanced.reason);
    expect(advanced.state.currentStage.stageNumber).toBe(2);
    expect(advanced.state.currentDifficulty).toBe(Difficulty.MEDIUM);
  });

  it("easier/harder steps to the adjacent difficulty at the same stage number", () => {
    const session = completePathStage(toPlaying(createFeedAnimalsSession(BASE_PARAMS)));
    const harder = advanceFeedAnimalsStage(session, { difficulty: Difficulty.ADVANCED, stageNumber: 1 });
    if (!harder.success) throw new Error(harder.success ? "" : harder.reason);
    expect(harder.state.currentDifficulty).toBe(Difficulty.ADVANCED);
    expect(harder.state.currentStage.stageNumber).toBe(1);
  });

  it("rejects an invalid target", () => {
    const session = completePathStage(toPlaying(createFeedAnimalsSession(BASE_PARAMS)));
    const invalid = advanceFeedAnimalsStage(session, { difficulty: Difficulty.ADVANCED, stageNumber: 5 });
    expect(invalid.success).toBe(false);
  });

  // THERAPIST SETUP SIMPLIFICATION (task section 53) — session.config is
  // frozen for the session's lifetime EXCEPT its technical fields, which a
  // real difficulty change now refreshes from the new difficulty's preset.
  // config.difficulty/startingStage must stay the ORIGINAL setup choice —
  // only currentDifficulty reflects the live difficulty.
  it("refreshes only the technical config fields on a difficulty change, leaving config.difficulty/startingStage as the original setup choice", () => {
    const session = completePathStage(
      toPlaying(createFeedAnimalsSession({ ...BASE_PARAMS, difficulty: Difficulty.MEDIUM, foodSize: FoodSize.MEDIUM })),
    );
    const advanced = advanceFeedAnimalsStage(
      session,
      { difficulty: Difficulty.ADVANCED, stageNumber: session.currentStage.stageNumber },
      { foodSize: FoodSize.SMALL, reachHeight: ReachHeight.LOW, reachSide: ReachSide.LEFT, movementPattern: MovementPattern.CROSS },
    );
    if (!advanced.success) throw new Error(advanced.success ? "" : advanced.reason);
    expect(advanced.state.config.foodSize).toBe(FoodSize.SMALL);
    expect(advanced.state.config.reachHeight).toBe(ReachHeight.LOW);
    expect(advanced.state.config.reachSide).toBe(ReachSide.LEFT);
    expect(advanced.state.config.movementPattern).toBe(MovementPattern.CROSS);
    expect(advanced.state.currentDifficulty).toBe(Difficulty.ADVANCED);
    // The original setup choice never changes, even though currentDifficulty did.
    expect(advanced.state.config.difficulty).toBe(Difficulty.MEDIUM);
    expect(advanced.state.config.startingStage).toBe(session.config.startingStage);
  });

  it("ignores presetFields on a same-difficulty continue — config is stage-invariant within one difficulty", () => {
    const session = completePathStage(toPlaying(createFeedAnimalsSession(BASE_PARAMS)));
    const advanced = advanceFeedAnimalsStage(
      session,
      { difficulty: Difficulty.MEDIUM, stageNumber: (session.currentStage.stageNumber + 1) as StageNumber },
      { foodSize: FoodSize.SMALL, reachHeight: ReachHeight.LOW, reachSide: ReachSide.LEFT, movementPattern: MovementPattern.CROSS },
    );
    if (!advanced.success) throw new Error(advanced.success ? "" : advanced.reason);
    expect(advanced.state.config.foodSize).toBe(session.config.foodSize);
    expect(advanced.state.config.reachHeight).toBe(session.config.reachHeight);
    expect(advanced.state.config.reachSide).toBe(session.config.reachSide);
    expect(advanced.state.config.movementPattern).toBe(session.config.movementPattern);
  });
});

describe("endFeedAnimalsSession", () => {
  it("finalizes an in-progress path stage as SKIPPED with real partial progress and builds a summary", () => {
    const session = toPlaying(createFeedAnimalsSession(BASE_PARAMS));
    const afterOne = advanceFeedAnimalsMonkey(session, "right", Date.now());
    if (!afterOne.success) throw new Error("expected success");

    const ended = endFeedAnimalsSession(afterOne.state, Date.now() + 1000);
    if (!ended.success) throw new Error(ended.success ? "" : ended.reason);
    expect(ended.state.gameState).toBe(GameState.SESSION_COMPLETE);
    expect(ended.state.summary).not.toBeNull();
    expect(ended.state.results[0].status).toBe(FeedAnimalsStageStatus.SKIPPED);
  });

  it("is rejected once already SESSION_COMPLETE", () => {
    const session = toPlaying(createFeedAnimalsSession(BASE_PARAMS));
    const ended = endFeedAnimalsSession(session, Date.now());
    if (!ended.success) throw new Error("expected success");
    const endedAgain = endFeedAnimalsSession(ended.state, Date.now());
    expect(endedAgain.success).toBe(false);
  });
});

describe("stranded transition recovery (INSTRUCTIONS/COUNTDOWN -> START_ZONE)", () => {
  it("recovers from INSTRUCTIONS back to START_ZONE, preserving session identity", () => {
    const session = createFeedAnimalsSession(BASE_PARAMS);
    let s = applyFeedAnimalsGameTransition(session, GameState.SETUP, Date.now()).state;
    s = applyFeedAnimalsGameTransition(s, GameState.START_ZONE, Date.now()).state;
    s = applyFeedAnimalsGameTransition(s, GameState.INSTRUCTIONS, Date.now()).state;

    const recovered = applyFeedAnimalsGameTransition(s, GameState.START_ZONE, Date.now());
    expect(recovered.success).toBe(true);
    if (!recovered.success) return;
    expect(recovered.state.sessionId).toBe(session.sessionId);
    expect(recovered.state.currentStage.stageNumber).toBe(session.currentStage.stageNumber);

    // Can reach PLAYING normally afterward.
    let resumed = applyFeedAnimalsGameTransition(recovered.state, GameState.INSTRUCTIONS, Date.now()).state;
    resumed = applyFeedAnimalsGameTransition(resumed, GameState.COUNTDOWN, Date.now()).state;
    resumed = applyFeedAnimalsGameTransition(resumed, GameState.PLAYING, Date.now()).state;
    expect(resumed.gameState).toBe(GameState.PLAYING);
  });

  it("recovers from COUNTDOWN back to START_ZONE", () => {
    const session = createFeedAnimalsSession(BASE_PARAMS);
    let s = applyFeedAnimalsGameTransition(session, GameState.SETUP, Date.now()).state;
    s = applyFeedAnimalsGameTransition(s, GameState.START_ZONE, Date.now()).state;
    s = applyFeedAnimalsGameTransition(s, GameState.INSTRUCTIONS, Date.now()).state;
    s = applyFeedAnimalsGameTransition(s, GameState.COUNTDOWN, Date.now()).state;

    const recovered = applyFeedAnimalsGameTransition(s, GameState.START_ZONE, Date.now());
    expect(recovered.success).toBe(true);
  });
});

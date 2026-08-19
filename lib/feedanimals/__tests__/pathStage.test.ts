import { describe, expect, it } from "vitest";
import { GameState } from "@/lib/game";
import {
  advanceFeedAnimalsMonkey,
  applyFeedAnimalsGameTransition,
  createFeedAnimalsSession,
  Difficulty,
  type FeedAnimalsSessionState,
  FeedAnimalsStageStatus,
  FoodSize,
  jumpToFeedAnimalsStage,
  MovementPattern,
  pauseFeedAnimalsSession,
  ReachHeight,
  ReachSide,
  restartFeedAnimalsStage,
  type StageNumber,
} from "../index";
import { feedAnimalsObstacleRequiresJump, getFeedAnimalsPathStage, sampleFeedAnimalsMonkeyPosition, sampleFeedAnimalsPathPosition, STAGE_1_EASY_PATH } from "../pathStages";
import { reviveFeedAnimalsSessionState } from "@/lib/realtime/serialization";

const BASE_PARAMS = {
  childFirstName: "عمر",
  difficulty: Difficulty.EASY,
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

function sessionAt(difficulty: Difficulty, startingStage: StageNumber): FeedAnimalsSessionState {
  return toPlaying(createFeedAnimalsSession({ ...BASE_PARAMS, difficulty, startingStage }));
}

/** Drives ONLY the currently-active leg to its own end (legIndex increments, or the whole stage completes if this was the last leg) — stops as soon as either happens, never running past it into a subsequent leg. */
function driveOneLegToEnd(state: FeedAnimalsSessionState): FeedAnimalsSessionState {
  let s = state;
  const startingLegIndex = s.currentStage.legIndex;
  for (let i = 0; i < 200 && s.gameState === GameState.PLAYING && s.currentStage.legIndex === startingLegIndex; i++) {
    const pathDef = getFeedAnimalsPathStage(s.currentStage.difficulty, s.currentStage.stageNumber)!;
    const leg = pathDef.legs[s.currentStage.legIndex];
    const blocked = leg.obstacles.some((o) => o.atStep === s.currentStage.pathProgressStep + 1 && feedAnimalsObstacleRequiresJump(o.kind));
    const result = advanceFeedAnimalsMonkey(s, blocked ? "jump" : "right", Date.now() + i);
    if (!result.success) break;
    s = result.state;
  }
  return s;
}

/** Drives the active leg all the way to its own destination, pressing JUMP at every jump-requiring obstacle and RIGHT otherwise. Stops once the whole stage is COMPLETE or a hard step cap is hit (safety net against an infinite loop from a bad test fixture). Runs through EVERY remaining leg for a multi-animal stage — use driveOneLegToEnd instead when a test needs to stop after exactly one leg. */
function driveLegToEnd(state: FeedAnimalsSessionState): FeedAnimalsSessionState {
  let s = state;
  for (let i = 0; i < 200 && s.gameState === GameState.PLAYING; i++) {
    const pathDef = getFeedAnimalsPathStage(s.currentStage.difficulty, s.currentStage.stageNumber)!;
    const leg = pathDef.legs[s.currentStage.legIndex];
    const blocked = leg.obstacles.some((o) => o.atStep === s.currentStage.pathProgressStep + 1 && feedAnimalsObstacleRequiresJump(o.kind));
    const result = advanceFeedAnimalsMonkey(s, blocked ? "jump" : "right", Date.now() + i);
    if (!result.success) break;
    s = result.state;
  }
  return s;
}

const ALL_DIFFICULTIES = [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.ADVANCED] as const;
const ALL_STAGES: StageNumber[] = [1, 2, 3, 4, 5];

describe("getFeedAnimalsPathStage — every (difficulty, stage) is a hand-designed path stage", () => {
  for (const difficulty of ALL_DIFFICULTIES) {
    for (const stageNumber of ALL_STAGES) {
      it(`${difficulty} stage ${stageNumber} has at least one leg, each with >=2 waypoints and consistent totalSteps`, () => {
        const def = getFeedAnimalsPathStage(difficulty, stageNumber);
        expect(def).not.toBeNull();
        expect(def!.legs.length).toBeGreaterThan(0);
        for (const leg of def!.legs) {
          expect(leg.waypoints.length).toBeGreaterThanOrEqual(2);
          expect(leg.totalSteps).toBe(leg.waypoints.length - 1);
          for (const obstacle of leg.obstacles) {
            expect(obstacle.atStep).toBeGreaterThan(0);
            expect(obstacle.atStep).toBeLessThanOrEqual(leg.totalSteps);
          }
          // Every waypoint stays clear of the reserved bottom control-pad strip and the very top instruction band.
          for (const wp of leg.waypoints) {
            expect(wp.x).toBeGreaterThanOrEqual(0);
            expect(wp.x).toBeLessThanOrEqual(1);
            expect(wp.y).toBeGreaterThanOrEqual(0.1);
            expect(wp.y).toBeLessThanOrEqual(0.82);
          }
        }
      });
    }
  }

  it("multi-animal stages (Medium 5, Advanced 4, Advanced 5) have more than one leg, each a different animal", () => {
    const medium5 = getFeedAnimalsPathStage(Difficulty.MEDIUM, 5)!;
    expect(medium5.legs.length).toBe(2);
    const advanced4 = getFeedAnimalsPathStage(Difficulty.ADVANCED, 4)!;
    expect(advanced4.legs.length).toBe(3);
    const advanced5 = getFeedAnimalsPathStage(Difficulty.ADVANCED, 5)!;
    expect(advanced5.legs.length).toBe(5);
    for (const def of [medium5, advanced4, advanced5]) {
      const animals = new Set(def.legs.map((l) => l.animal));
      expect(animals.size).toBe(def.legs.length);
    }
  });

  it("every single-animal stage has exactly one leg", () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      for (const stageNumber of ALL_STAGES) {
        if (difficulty === Difficulty.MEDIUM && stageNumber === 5) continue;
        if (difficulty === Difficulty.ADVANCED && (stageNumber === 4 || stageNumber === 5)) continue;
        expect(getFeedAnimalsPathStage(difficulty, stageNumber)!.legs).toHaveLength(1);
      }
    }
  });

  it("EASY stages have no jump-requiring obstacles (control-only difficulty)", () => {
    for (const stageNumber of ALL_STAGES) {
      const def = getFeedAnimalsPathStage(Difficulty.EASY, stageNumber)!;
      for (const leg of def.legs) {
        expect(leg.obstacles.some((o) => feedAnimalsObstacleRequiresJump(o.kind))).toBe(false);
      }
    }
  });

  it("MEDIUM and ADVANCED stages each have at least one jump-requiring obstacle somewhere in the stage", () => {
    for (const difficulty of [Difficulty.MEDIUM, Difficulty.ADVANCED] as const) {
      for (const stageNumber of ALL_STAGES) {
        const def = getFeedAnimalsPathStage(difficulty, stageNumber)!;
        const hasJump = def.legs.some((leg) => leg.obstacles.some((o) => feedAnimalsObstacleRequiresJump(o.kind)));
        expect(hasJump).toBe(true);
      }
    }
  });
});

describe("sampleFeedAnimalsPathPosition / sampleFeedAnimalsMonkeyPosition", () => {
  it("is deterministic — same step always samples the same position", () => {
    const a = sampleFeedAnimalsMonkeyPosition(STAGE_1_EASY_PATH, 3);
    const b = sampleFeedAnimalsMonkeyPosition(STAGE_1_EASY_PATH, 3);
    expect(a).toEqual(b);
  });

  it("step 0 sits at the first waypoint, the last step sits at the destination waypoint", () => {
    const leg = STAGE_1_EASY_PATH.legs[0];
    const start = sampleFeedAnimalsPathPosition(leg, 0);
    const end = sampleFeedAnimalsPathPosition(leg, leg.totalSteps);
    expect(start.position.x).toBeCloseTo(leg.waypoints[0].x, 5);
    expect(start.position.y).toBeCloseTo(leg.waypoints[0].y, 5);
    const destination = leg.waypoints[leg.waypoints.length - 1];
    expect(end.position.x).toBeCloseTo(destination.x, 5);
    expect(end.position.y).toBeCloseTo(destination.y, 5);
  });

  it("clamps out-of-range steps into [0, totalSteps] instead of extrapolating", () => {
    const leg = STAGE_1_EASY_PATH.legs[0];
    const belowZero = sampleFeedAnimalsPathPosition(leg, -5);
    const atZero = sampleFeedAnimalsPathPosition(leg, 0);
    expect(belowZero).toEqual(atZero);

    const pastEnd = sampleFeedAnimalsPathPosition(leg, leg.totalSteps + 10);
    const atEnd = sampleFeedAnimalsPathPosition(leg, leg.totalSteps);
    expect(pastEnd).toEqual(atEnd);
  });

  it("fraction increases monotonically with progress step", () => {
    const leg = STAGE_1_EASY_PATH.legs[0];
    let previousFraction = -1;
    for (let step = 0; step <= leg.totalSteps; step++) {
      const sample = sampleFeedAnimalsPathPosition(leg, step);
      expect(sample.fraction).toBeGreaterThan(previousFraction);
      previousFraction = sample.fraction;
    }
  });
});

describe("advanceFeedAnimalsMonkey — single-leg stage (Easy 1)", () => {
  it("RIGHT advances progress by exactly one step, LEFT retreats by exactly one step", () => {
    const session = sessionAt(Difficulty.EASY, 1);
    expect(session.currentStage.kind).toBe("path");
    expect(session.currentStage.pathProgressStep).toBe(0);

    const afterRight = advanceFeedAnimalsMonkey(session, "right", Date.now());
    if (!afterRight.success) throw new Error(afterRight.reason);
    expect(afterRight.state.currentStage.pathProgressStep).toBe(1);

    const afterLeft = advanceFeedAnimalsMonkey(afterRight.state, "left", Date.now());
    if (!afterLeft.success) throw new Error(afterLeft.reason);
    expect(afterLeft.state.currentStage.pathProgressStep).toBe(0);
  });

  it("never goes below 0 or above totalSteps — pressing past either end is a safe no-op", () => {
    const session = sessionAt(Difficulty.EASY, 1);
    const totalSteps = STAGE_1_EASY_PATH.legs[0].totalSteps;

    const stillAtStart = advanceFeedAnimalsMonkey(session, "left", Date.now());
    expect(stillAtStart.success).toBe(true);
    if (stillAtStart.success) expect(stillAtStart.state.currentStage.pathProgressStep).toBe(0);

    let s = session;
    for (let i = 0; i < totalSteps + 5; i++) {
      const result = advanceFeedAnimalsMonkey(s, "right", Date.now() + i);
      if (!result.success) break;
      s = result.state;
    }
    expect(s.currentStage.pathProgressStep).toBeLessThanOrEqual(totalSteps);
  });

  it("rapid/double RIGHT presses advance by exactly two steps, never a teleport/skip", () => {
    const session = sessionAt(Difficulty.EASY, 1);
    const now = Date.now();
    const first = advanceFeedAnimalsMonkey(session, "right", now);
    if (!first.success) throw new Error(first.reason);
    const second = advanceFeedAnimalsMonkey(first.state, "right", now + 5);
    if (!second.success) throw new Error(second.reason);
    expect(second.state.currentStage.pathProgressStep).toBe(2);
  });

  it("reaching the destination auto-finalizes the stage as COMPLETED and transitions to STAGE_COMPLETE", () => {
    const s = driveLegToEnd(sessionAt(Difficulty.EASY, 1));
    expect(s.currentStage.pathProgressStep).toBe(STAGE_1_EASY_PATH.legs[0].totalSteps);
    expect(s.gameState).toBe(GameState.STAGE_COMPLETE);
    expect(s.results).toHaveLength(1);
    expect(s.results[0]).toMatchObject({ status: FeedAnimalsStageStatus.COMPLETED, roundsPresented: 1, roundsCompleted: 1, incorrectCount: 0 });
  });

  it("a press once the stage is already STAGE_COMPLETE is rejected, never double-finalizing", () => {
    const s = driveLegToEnd(sessionAt(Difficulty.EASY, 1));
    const extraPress = advanceFeedAnimalsMonkey(s, "right", Date.now() + 999);
    expect(extraPress.success).toBe(false);
    expect(s.results).toHaveLength(1);
  });

  it("is rejected while paused — progress stays exactly where it was", () => {
    const session = sessionAt(Difficulty.EASY, 1);
    const afterOneStep = advanceFeedAnimalsMonkey(session, "right", Date.now());
    if (!afterOneStep.success) throw new Error(afterOneStep.reason);
    const paused = pauseFeedAnimalsSession(afterOneStep.state, Date.now());
    if (!paused.success) throw new Error("expected pause to succeed");
    const attempted = advanceFeedAnimalsMonkey(paused.state, "right", Date.now());
    expect(attempted.success).toBe(false);
    expect(paused.state.currentStage.pathProgressStep).toBe(1);
  });

  it("is rejected outside PLAYING", () => {
    const notPlaying = createFeedAnimalsSession({ ...BASE_PARAMS, difficulty: Difficulty.EASY, startingStage: 1 }); // still WELCOME
    expect(advanceFeedAnimalsMonkey(notPlaying, "right", Date.now()).success).toBe(false);
  });
});

describe("advanceFeedAnimalsMonkey — obstacles and JUMP (Medium 1: الغصن الساقط)", () => {
  it("RIGHT is a safe no-op right at a jump-requiring obstacle; JUMP crosses it", () => {
    const def = getFeedAnimalsPathStage(Difficulty.MEDIUM, 1)!;
    const leg = def.legs[0];
    const obstacle = leg.obstacles.find((o) => feedAnimalsObstacleRequiresJump(o.kind))!;
    expect(obstacle).toBeDefined();

    let s = sessionAt(Difficulty.MEDIUM, 1);
    for (let i = 0; i < obstacle.atStep - 1; i++) {
      const result = advanceFeedAnimalsMonkey(s, "right", Date.now() + i);
      if (!result.success) throw new Error(result.reason);
      s = result.state;
    }
    expect(s.currentStage.pathProgressStep).toBe(obstacle.atStep - 1);

    const blockedRight = advanceFeedAnimalsMonkey(s, "right", Date.now());
    expect(blockedRight.success).toBe(true);
    if (blockedRight.success) expect(blockedRight.state.currentStage.pathProgressStep).toBe(obstacle.atStep - 1); // blocked, no progress

    const jumped = advanceFeedAnimalsMonkey(s, "jump", Date.now());
    expect(jumped.success).toBe(true);
    if (jumped.success) expect(jumped.state.currentStage.pathProgressStep).toBe(obstacle.atStep); // JUMP performs the crossing
  });

  it("an unnecessary JUMP (no obstacle ahead) never advances progress — 'do not advance incorrectly'", () => {
    const session = sessionAt(Difficulty.MEDIUM, 1);
    const def = getFeedAnimalsPathStage(Difficulty.MEDIUM, 1)!;
    const obstacle = def.legs[0].obstacles.find((o) => feedAnimalsObstacleRequiresJump(o.kind))!;
    expect(obstacle.atStep).toBeGreaterThan(1); // sanity: step 0->1 isn't the obstacle itself for this fixture

    const wrongJump = advanceFeedAnimalsMonkey(session, "jump", Date.now());
    expect(wrongJump.success).toBe(true);
    if (wrongJump.success) expect(wrongJump.state.currentStage.pathProgressStep).toBe(0);
  });

  it("driving the whole leg with JUMP-where-needed reaches STAGE_COMPLETE", () => {
    const s = driveLegToEnd(sessionAt(Difficulty.MEDIUM, 1));
    expect(s.gameState).toBe(GameState.STAGE_COMPLETE);
    expect(s.results[0]).toMatchObject({ status: FeedAnimalsStageStatus.COMPLETED, roundsPresented: 1, roundsCompleted: 1 });
  });
});

describe("advanceFeedAnimalsMonkey — multi-animal stages", () => {
  it("Medium 5 (رحلة الأصدقاء): completing leg 1 advances legIndex and resets pathProgressStep without finalizing the stage", () => {
    const def = getFeedAnimalsPathStage(Difficulty.MEDIUM, 5)!;
    expect(def.legs.length).toBe(2);
    let s = sessionAt(Difficulty.MEDIUM, 5);
    expect(s.currentStage.legIndex).toBe(0);

    for (let i = 0; i < 100 && s.currentStage.legIndex === 0 && s.gameState === GameState.PLAYING; i++) {
      const leg = def.legs[s.currentStage.legIndex];
      const blocked = leg.obstacles.some((o) => o.atStep === s.currentStage.pathProgressStep + 1 && feedAnimalsObstacleRequiresJump(o.kind));
      const result = advanceFeedAnimalsMonkey(s, blocked ? "jump" : "right", Date.now() + i);
      if (!result.success) throw new Error(result.reason);
      s = result.state;
    }

    expect(s.gameState).toBe(GameState.PLAYING); // not finished yet — second animal's leg still ahead
    expect(s.currentStage.legIndex).toBe(1);
    expect(s.currentStage.pathProgressStep).toBe(0);
    expect(s.results).toHaveLength(0); // no stage result recorded until the WHOLE stage (both legs) finishes
  });

  it("Medium 5: finishing the second leg finalizes the stage as COMPLETED with roundsPresented/roundsCompleted = 2 (one per animal)", () => {
    const s = driveLegToEnd(driveLegToEnd(sessionAt(Difficulty.MEDIUM, 5)));
    expect(s.gameState).toBe(GameState.STAGE_COMPLETE);
    expect(s.results).toHaveLength(1);
    expect(s.results[0]).toMatchObject({ status: FeedAnimalsStageStatus.COMPLETED, roundsPresented: 2, roundsCompleted: 2 });
  });

  it("Advanced 5 (رحلة السفاري الكبرى): all 5 legs must complete before STAGE_COMPLETE, one animal controlled at a time", () => {
    let s = sessionAt(Difficulty.ADVANCED, 5);
    const totalLegs = getFeedAnimalsPathStage(Difficulty.ADVANCED, 5)!.legs.length;
    expect(totalLegs).toBe(5);
    for (let leg = 0; leg < totalLegs; leg++) {
      expect(s.currentStage.legIndex).toBe(leg);
      s = driveOneLegToEnd(s);
    }
    expect(s.gameState).toBe(GameState.STAGE_COMPLETE);
    expect(s.results[0]).toMatchObject({ status: FeedAnimalsStageStatus.COMPLETED, roundsPresented: 5, roundsCompleted: 5 });
  });

  it("jumping away from a multi-animal stage mid-way records SKIPPED with only the already-finished legs counted as completed", () => {
    const s = driveOneLegToEnd(sessionAt(Difficulty.ADVANCED, 4)); // finish leg 0 of 3 only
    expect(s.currentStage.legIndex).toBe(1);
    expect(s.gameState).toBe(GameState.PLAYING);

    const jumped = jumpToFeedAnimalsStage(s, 5, Date.now());
    if (!jumped.success) throw new Error(jumped.reason);
    expect(jumped.state.results).toHaveLength(1);
    expect(jumped.state.results[0]).toMatchObject({
      difficulty: Difficulty.ADVANCED,
      stageNumber: 4,
      status: FeedAnimalsStageStatus.SKIPPED,
      roundsPresented: 3, // Advanced 4 has 3 legs total
      roundsCompleted: 1, // only leg 0 (the monkey) had actually finished
    });
  });
});

describe("restartFeedAnimalsStage — path stage", () => {
  it("resets progress and legIndex to 0 and reproduces the exact same route (same start, same destination)", () => {
    const session = sessionAt(Difficulty.EASY, 1);
    const afterTwoSteps = [0, 1].reduce((s, i) => {
      const result = advanceFeedAnimalsMonkey(s, "right", Date.now() + i);
      if (!result.success) throw new Error(result.reason);
      return result.state;
    }, session);
    expect(afterTwoSteps.currentStage.pathProgressStep).toBe(2);

    const restarted = restartFeedAnimalsStage(afterTwoSteps, Date.now());
    if (!restarted.success) throw new Error("expected restart to succeed");
    expect(restarted.state.currentStage.kind).toBe("path");
    expect(restarted.state.currentStage.pathProgressStep).toBe(0);
    expect(restarted.state.currentStage.legIndex).toBe(0);
  });
});

describe("realtime revive — path stage", () => {
  it("round-trips kind, legIndex and pathProgressStep through reviveFeedAnimalsSessionState", () => {
    const session = sessionAt(Difficulty.EASY, 1);
    const afterOneStep = advanceFeedAnimalsMonkey(session, "right", Date.now());
    if (!afterOneStep.success) throw new Error(afterOneStep.reason);

    const raw = JSON.parse(JSON.stringify(afterOneStep.state));
    const revived = reviveFeedAnimalsSessionState(raw);
    expect(revived.currentStage.kind).toBe("path");
    expect(revived.currentStage.pathProgressStep).toBe(1);
    expect(revived.currentStage.legIndex).toBe(0);
  });

  it("round-trips a mid-multi-leg stage's legIndex correctly (no replayed celebration on revive)", () => {
    const s = driveOneLegToEnd(sessionAt(Difficulty.MEDIUM, 5));
    expect(s.currentStage.legIndex).toBe(1);
    const raw = JSON.parse(JSON.stringify(s));
    const revived = reviveFeedAnimalsSessionState(raw);
    expect(revived.currentStage.legIndex).toBe(1);
    expect(revived.currentStage.pathProgressStep).toBe(0);
  });

  it("defaults an old record with no legIndex field to 0", () => {
    const session = sessionAt(Difficulty.EASY, 1);
    const raw = JSON.parse(JSON.stringify(session)) as { currentStage: Record<string, unknown> };
    delete raw.currentStage.legIndex;
    const revived = reviveFeedAnimalsSessionState(raw);
    expect(revived.currentStage.legIndex).toBe(0);
  });
});

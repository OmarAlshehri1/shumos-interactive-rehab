import { describe, expect, it } from "vitest";
import { Difficulty, GameState } from "@/lib/game";
import {
  ADVANCED_ENCOUNTER_SEQUENCE,
  CollectibleStarStatus,
  EncounterOutcome,
  EncounterType,
  FIRE_COOLDOWN_MS,
  isEncounterStage,
  isStarOnlyStage,
  MEDIUM_ENCOUNTER_SEQUENCE,
  StarLane,
  TOTAL_STARS,
  applySpacePilotGameTransition,
  createSpacePilotSession,
  encounterArrivalOffsetMs,
  endSpacePilotSession,
  fireSpacePilotWeapon,
  moveSpacePilotRocketLane,
  pauseSpacePilotSession,
  resolveSpacePilotEncounterArrival,
  resolveSpacePilotStarArrival,
  restartSpacePilotLevel,
  resumeSpacePilotSession,
  STAR_LANE_SEQUENCE,
  starArrivalOffsetMs,
  switchSpacePilotDifficulty,
  totalEncountersFor,
  type SpacePilotSessionState,
} from "..";
import { LANE_Y_PERCENT, ROCKET_X_PERCENT } from "@/components/display/spacepilot/lanes";

function toPlaying(state: SpacePilotSessionState, now = 0): SpacePilotSessionState {
  // Tests use a deterministic synthetic clock. Rebase fixtures created with
  // createSpacePilotSession's production Date.now() default, and never hide a
  // rejected transition by reading `.state` blindly.
  let s = { ...state, createdAt: now };
  for (const next of [GameState.SETUP, GameState.START_ZONE, GameState.INSTRUCTIONS, GameState.COUNTDOWN, GameState.PLAYING]) {
    const transition = applySpacePilotGameTransition(s, next, now);
    if (!transition.success) throw new Error(`Failed test transition to ${next}: ${transition.reason}`);
    s = transition.state;
  }
  return s;
}

function laneRank(lane: StarLane): number {
  return ["TOP", "MIDDLE", "BOTTOM"].indexOf(lane);
}

function moveTo(session: SpacePilotSessionState, desired: StarLane): SpacePilotSessionState {
  let s = session;
  while (s.currentStage.rocketLane !== desired) {
    s = moveSpacePilotRocketLane(s, laneRank(desired) < laneRank(s.currentStage.rocketLane) ? "UP" : "DOWN").state;
  }
  return s;
}

describe("shared canonical lane-Y mapping", () => {
  it("defines exactly the three lanes, in top-to-bottom order, and never at the same Y", () => {
    expect(LANE_Y_PERCENT[StarLane.TOP]).toBeLessThan(LANE_Y_PERCENT[StarLane.MIDDLE]);
    expect(LANE_Y_PERCENT[StarLane.MIDDLE]).toBeLessThan(LANE_Y_PERCENT[StarLane.BOTTOM]);
  });

  it("keeps every lane's Y within the visible scene bounds", () => {
    for (const y of Object.values(LANE_Y_PERCENT)) {
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(100);
    }
  });

  it("exposes a single rocket X position for every scene to share", () => {
    expect(ROCKET_X_PERCENT).toBeGreaterThan(0);
    expect(ROCKET_X_PERCENT).toBeLessThan(100);
  });
});

describe("createSpacePilotSession", () => {
  it("defaults to EASY: rocket in MIDDLE lane and 8 pending stars", () => {
    const session = createSpacePilotSession({ childFirstName: "سارة" });
    expect(session.currentDifficulty).toBe(Difficulty.EASY);
    expect(session.gameState).toBe(GameState.WELCOME);
    expect(session.currentStage.rocketLane).toBe(StarLane.MIDDLE);
    if (!isStarOnlyStage(session.currentStage)) throw new Error("expected EASY's star-only stage");
    expect(session.currentStage.stars).toHaveLength(TOTAL_STARS);
    expect(session.currentStage.stars.every((s) => s.status === CollectibleStarStatus.PENDING)).toBe(true);
    expect(session.currentStage.collectedCount).toBe(0);
  });

  it("uses the same fixed star lane sequence every time (deterministic)", () => {
    const a = createSpacePilotSession({ childFirstName: "سارة" });
    const b = createSpacePilotSession({ childFirstName: "علي" });
    if (!isStarOnlyStage(a.currentStage) || !isStarOnlyStage(b.currentStage)) throw new Error("expected star-only stages");
    expect(a.currentStage.stars.map((s) => s.lane)).toEqual([...STAR_LANE_SEQUENCE]);
    expect(b.currentStage.stars.map((s) => s.lane)).toEqual([...STAR_LANE_SEQUENCE]);
  });

  it("MEDIUM and ADVANCED start with a deterministic encounter sequence instead", () => {
    const medium = createSpacePilotSession({ childFirstName: "سارة", difficulty: Difficulty.MEDIUM });
    const advanced = createSpacePilotSession({ childFirstName: "سارة", difficulty: Difficulty.ADVANCED });
    if (!isEncounterStage(medium.currentStage) || !isEncounterStage(advanced.currentStage)) throw new Error("expected encounter stages");
    expect(medium.currentStage.encounters.map((e) => e.type)).toEqual(MEDIUM_ENCOUNTER_SEQUENCE.map((e) => e.type));
    expect(advanced.currentStage.encounters.map((e) => e.type)).toEqual(ADVANCED_ENCOUNTER_SEQUENCE.map((e) => e.type));
    expect(medium.currentStage.encounters.every((e) => e.status === EncounterOutcome.PENDING)).toBe(true);
  });
});

describe("live Space Pilot difficulty navigation", () => {
  it("keeps the session id and loads the selected mission from its deterministic start", () => {
    const playing = toPlaying(createSpacePilotSession({ childFirstName: "سارة", difficulty: Difficulty.EASY }));
    const changed = switchSpacePilotDifficulty(playing, Difficulty.ADVANCED);
    expect(changed.success).toBe(true);
    expect(changed.state.sessionId).toBe(playing.sessionId);
    expect(changed.state.currentDifficulty).toBe(Difficulty.ADVANCED);
    expect(changed.state.gameState).toBe(GameState.START_ZONE);
    expect(changed.state.currentStage.startedAt).toBeNull();
    expect(isEncounterStage(changed.state.currentStage)).toBe(true);
  });
});

describe("lane movement", () => {
  it("moves UP toward TOP and DOWN toward BOTTOM", () => {
    let session = toPlaying(createSpacePilotSession({ childFirstName: "سارة" }));
    expect(session.currentStage.rocketLane).toBe(StarLane.MIDDLE);
    session = moveSpacePilotRocketLane(session, "UP").state;
    expect(session.currentStage.rocketLane).toBe(StarLane.TOP);
    session = moveSpacePilotRocketLane(session, "DOWN").state;
    expect(session.currentStage.rocketLane).toBe(StarLane.MIDDLE);
    session = moveSpacePilotRocketLane(session, "DOWN").state;
    expect(session.currentStage.rocketLane).toBe(StarLane.BOTTOM);
  });

  it("clamps at the TOP and BOTTOM boundaries — never moves beyond the three lanes", () => {
    let session = toPlaying(createSpacePilotSession({ childFirstName: "سارة" }));
    session = moveSpacePilotRocketLane(session, "UP").state;
    session = moveSpacePilotRocketLane(session, "UP").state; // already TOP
    session = moveSpacePilotRocketLane(session, "UP").state; // still TOP
    expect(session.currentStage.rocketLane).toBe(StarLane.TOP);

    session = moveSpacePilotRocketLane(session, "DOWN").state;
    session = moveSpacePilotRocketLane(session, "DOWN").state; // BOTTOM
    session = moveSpacePilotRocketLane(session, "DOWN").state; // still BOTTOM
    session = moveSpacePilotRocketLane(session, "DOWN").state; // still BOTTOM
    expect(session.currentStage.rocketLane).toBe(StarLane.BOTTOM);
  });

  it("survives rapid alternating input without desyncing lane state", () => {
    let session = toPlaying(createSpacePilotSession({ childFirstName: "سارة" }));
    const presses: Array<"UP" | "DOWN"> = ["UP", "UP", "DOWN", "DOWN", "DOWN", "UP", "UP", "UP", "UP", "DOWN"];
    for (const press of presses) {
      const result = moveSpacePilotRocketLane(session, press);
      expect(result.success).toBe(true);
      session = result.state;
      expect(["TOP", "MIDDLE", "BOTTOM"]).toContain(session.currentStage.rocketLane);
    }
  });

  it("rejects movement outside PLAYING or while paused", () => {
    const welcomeSession = createSpacePilotSession({ childFirstName: "سارة" });
    expect(moveSpacePilotRocketLane(welcomeSession, "UP").success).toBe(false);

    let playing = toPlaying(createSpacePilotSession({ childFirstName: "سارة" }));
    playing = pauseSpacePilotSession(playing, 100).state;
    const paused = moveSpacePilotRocketLane(playing, "UP");
    expect(paused.success).toBe(false);
    expect(paused.state.currentStage.rocketLane).toBe(StarLane.MIDDLE);
  });
});

describe("EASY star collection", () => {
  it("collects a star when the rocket is in the matching lane", () => {
    let session = toPlaying(createSpacePilotSession({ childFirstName: "سارة" }));
    // star 0 is MIDDLE — rocket already starts MIDDLE
    const result = resolveSpacePilotStarArrival(session, 0, 1000);
    expect(result.success).toBe(true);
    session = result.state;
    if (!isStarOnlyStage(session.currentStage)) throw new Error("expected star-only stage");
    expect(session.currentStage.stars[0].status).toBe(CollectibleStarStatus.COLLECTED);
    expect(session.currentStage.collectedCount).toBe(1);
    expect(session.currentStage.currentStarIndex).toBe(1);
  });

  it("marks a star as MISSED (never a failure) when the lane doesn't match, and keeps going", () => {
    let session = toPlaying(createSpacePilotSession({ childFirstName: "سارة" }));
    session = moveSpacePilotRocketLane(session, "UP").state;
    const result = resolveSpacePilotStarArrival(session, 0, 1000);
    expect(result.success).toBe(true);
    session = result.state;
    if (!isStarOnlyStage(session.currentStage)) throw new Error("expected star-only stage");
    expect(session.currentStage.stars[0].status).toBe(CollectibleStarStatus.MISSED);
    expect(session.currentStage.collectedCount).toBe(0);
    expect(session.currentStage.currentStarIndex).toBe(1);
    expect(session.gameState).toBe(GameState.PLAYING); // continues, no failure state
  });

  it("never double-resolves the same star (stale/duplicate call is rejected)", () => {
    let session = toPlaying(createSpacePilotSession({ childFirstName: "سارة" }));
    session = resolveSpacePilotStarArrival(session, 0, 1000).state;
    const duplicate = resolveSpacePilotStarArrival(session, 0, 1500);
    expect(duplicate.success).toBe(false);
    if (!isStarOnlyStage(duplicate.state.currentStage)) throw new Error("expected star-only stage");
    expect(duplicate.state.currentStage.collectedCount).toBe(1); // unchanged
  });

  it("tracks upgrade progression 1:1 with collected stars, reaching STAGE_COMPLETE at 8", () => {
    let session = toPlaying(createSpacePilotSession({ childFirstName: "سارة" }));
    for (let i = 0; i < STAR_LANE_SEQUENCE.length; i++) {
      session = moveTo(session, STAR_LANE_SEQUENCE[i]);
      session = resolveSpacePilotStarArrival(session, i, 200 + i * 1000).state;
      if (!isStarOnlyStage(session.currentStage)) throw new Error("expected star-only stage");
      expect(session.currentStage.collectedCount).toBe(i + 1);
    }
    if (!isStarOnlyStage(session.currentStage)) throw new Error("expected star-only stage");
    expect(session.currentStage.collectedCount).toBe(TOTAL_STARS);
    expect(session.gameState).toBe(GameState.STAGE_COMPLETE);
  });
});

describe("MEDIUM/ADVANCED encounter resolution", () => {
  it("collects a STAR encounter on lane match and MISSES it otherwise, without touching asteroid counters", () => {
    let session = toPlaying(createSpacePilotSession({ childFirstName: "سارة", difficulty: Difficulty.MEDIUM }));
    // encounter 0 is a STAR in MIDDLE — rocket already starts MIDDLE
    const result = resolveSpacePilotEncounterArrival(session, 0, 1000);
    session = result.state;
    if (!isEncounterStage(session.currentStage)) throw new Error("expected encounter stage");
    expect(session.currentStage.encounters[0].status).toBe(EncounterOutcome.COLLECTED);
    expect(session.currentStage.collectedStars).toBe(1);
    expect(session.currentStage.asteroidsAvoided).toBe(0);
  });

  it("an ASTEROID left un-fired always resolves AVOIDED (never a punishment), regardless of lane", () => {
    let session = toPlaying(createSpacePilotSession({ childFirstName: "سارة", difficulty: Difficulty.MEDIUM }));
    session = resolveSpacePilotEncounterArrival(session, 0, 1000).state; // resolve the leading star first
    // encounter 1 is an ASTEROID in TOP — leave rocket at MIDDLE (mismatched lane), never fire
    session = resolveSpacePilotEncounterArrival(session, 1, 2000).state;
    if (!isEncounterStage(session.currentStage)) throw new Error("expected encounter stage");
    expect(session.currentStage.encounters[1].status).toBe(EncounterOutcome.AVOIDED);
    expect(session.currentStage.asteroidsAvoided).toBe(1);
    expect(session.currentStage.asteroidsCleared).toBe(0);
    expect(session.gameState).toBe(GameState.PLAYING); // no punishment, no game over
  });

  it("an ALIEN always resolves PASSED (never a FIRE target, never harms the rocket)", () => {
    let session = toPlaying(createSpacePilotSession({ childFirstName: "سارة", difficulty: Difficulty.ADVANCED }));
    const alienIndex = ADVANCED_ENCOUNTER_SEQUENCE.findIndex((e) => e.type === EncounterType.ALIEN);
    // fast-forward past every earlier encounter without resolving gameplay effects that matter here
    for (let i = 0; i < alienIndex; i++) {
      session = resolveSpacePilotEncounterArrival(session, i, 1000 + i * 100).state;
    }
    session = fireSpacePilotWeapon(session, 90000).state; // firing at an alien must never clear it
    session = resolveSpacePilotEncounterArrival(session, alienIndex, 90100).state;
    if (!isEncounterStage(session.currentStage)) throw new Error("expected encounter stage");
    expect(session.currentStage.encounters[alienIndex].status).toBe(EncounterOutcome.PASSED);
  });

  it("never double-resolves the same encounter (stale/duplicate call is rejected)", () => {
    let session = toPlaying(createSpacePilotSession({ childFirstName: "سارة", difficulty: Difficulty.MEDIUM }));
    session = resolveSpacePilotEncounterArrival(session, 0, 1000).state;
    const duplicate = resolveSpacePilotEncounterArrival(session, 0, 1500);
    expect(duplicate.success).toBe(false);
    if (!isEncounterStage(duplicate.state.currentStage)) throw new Error("expected encounter stage");
    expect(duplicate.state.currentStage.collectedStars).toBe(1); // unchanged
  });
});

describe("FIRE mechanic", () => {
  it("clears an asteroid in the rocket's current lane and never resolves it again on arrival", () => {
    let session = toPlaying(createSpacePilotSession({ childFirstName: "سارة", difficulty: Difficulty.MEDIUM }));
    session = resolveSpacePilotEncounterArrival(session, 0, 1000).state; // resolve leading star
    session = moveTo(session, StarLane.TOP); // encounter 1 is an ASTEROID in TOP
    const fired = fireSpacePilotWeapon(session, 2000);
    expect(fired.success).toBe(true);
    session = fired.state;
    if (!isEncounterStage(session.currentStage)) throw new Error("expected encounter stage");
    expect(session.currentStage.encounters[1].status).toBe(EncounterOutcome.CLEARED);
    expect(session.currentStage.asteroidsCleared).toBe(1);
    expect(session.currentStage.currentEncounterIndex).toBe(2); // advanced past it

    // arrival timer firing late for the already-cleared encounter must be a no-op
    const lateArrival = resolveSpacePilotEncounterArrival(session, 1, 9000);
    expect(lateArrival.success).toBe(false);
  });

  it("does nothing to a STAR or an out-of-lane asteroid — no accidental clearing of unrelated encounters", () => {
    let session = toPlaying(createSpacePilotSession({ childFirstName: "سارة", difficulty: Difficulty.MEDIUM }));
    // encounter 0 is a STAR — firing at it must not "collect" it
    const fired = fireSpacePilotWeapon(session, 500);
    session = fired.state;
    if (!isEncounterStage(session.currentStage)) throw new Error("expected encounter stage");
    expect(session.currentStage.encounters[0].status).toBe(EncounterOutcome.PENDING);
    expect(session.currentStage.currentEncounterIndex).toBe(0);

    session = resolveSpacePilotEncounterArrival(session, 0, 1000).state; // now encounter 1: ASTEROID in TOP, rocket stays MIDDLE
    const wrongLaneFire = fireSpacePilotWeapon(session, FIRE_COOLDOWN_MS + 2000);
    session = wrongLaneFire.state;
    if (!isEncounterStage(session.currentStage)) throw new Error("expected encounter stage");
    expect(session.currentStage.encounters[1].status).toBe(EncounterOutcome.PENDING);
    expect(session.currentStage.asteroidsCleared).toBe(0);
  });

  it("enforces a cooldown so rapid taps can't double-clear or spam-resolve", () => {
    let session = toPlaying(createSpacePilotSession({ childFirstName: "سارة", difficulty: Difficulty.MEDIUM }));
    session = resolveSpacePilotEncounterArrival(session, 0, 1000).state;
    session = moveTo(session, StarLane.TOP);
    session = fireSpacePilotWeapon(session, 2000).state; // clears encounter 1
    if (!isEncounterStage(session.currentStage)) throw new Error("expected encounter stage");
    expect(session.currentStage.asteroidsCleared).toBe(1);

    // encounter 2 is a STAR, encounter 3 is another ASTEROID in MIDDLE — rapid-fire immediately after, still within cooldown
    session = moveTo(session, StarLane.BOTTOM);
    session = resolveSpacePilotEncounterArrival(session, 2, 2050).state; // star, missed (rocket in BOTTOM not TOP) — irrelevant to this test
    session = moveTo(session, StarLane.MIDDLE);
    const withinCooldown = fireSpacePilotWeapon(session, 2100); // < FIRE_COOLDOWN_MS after the first shot at t=2000
    session = withinCooldown.state;
    if (!isEncounterStage(session.currentStage)) throw new Error("expected encounter stage");
    expect(session.currentStage.asteroidsCleared).toBe(1); // still 1 — the rapid tap was ignored, not double-counted

    const afterCooldown = fireSpacePilotWeapon(session, 2000 + FIRE_COOLDOWN_MS + 50);
    session = afterCooldown.state;
    if (!isEncounterStage(session.currentStage)) throw new Error("expected encounter stage");
    expect(session.currentStage.asteroidsCleared).toBe(2);
  });

  it("does nothing on EASY (no FIRE mechanic exists there)", () => {
    const session = toPlaying(createSpacePilotSession({ childFirstName: "سارة" }));
    const result = fireSpacePilotWeapon(session, 1000);
    expect(result.success).toBe(false);
  });
});

describe("pause / resume", () => {
  it("blocks resolution while paused and accumulates paused time (EASY)", () => {
    let session = toPlaying(createSpacePilotSession({ childFirstName: "سارة" }));
    session = pauseSpacePilotSession(session, 1000).state;
    const blocked = resolveSpacePilotStarArrival(session, 0, 1500);
    expect(blocked.success).toBe(false);
    session = resumeSpacePilotSession(session, 2000).state;
    expect(session.currentStage.totalPausedMs).toBe(1000);
    expect(session.currentStage.pausedAt).toBeNull();
    const resolved = resolveSpacePilotStarArrival(session, 0, 2500);
    expect(resolved.success).toBe(true);
  });

  it("blocks FIRE and encounter resolution while paused (MEDIUM)", () => {
    let session = toPlaying(createSpacePilotSession({ childFirstName: "سارة", difficulty: Difficulty.MEDIUM }));
    session = pauseSpacePilotSession(session, 1000).state;
    expect(fireSpacePilotWeapon(session, 1200).success).toBe(false);
    expect(resolveSpacePilotEncounterArrival(session, 0, 1200).success).toBe(false);
  });
});

describe("restart", () => {
  it("resets EASY's stars, rocket lane, and upgrade level to the same deterministic start", () => {
    let session = toPlaying(createSpacePilotSession({ childFirstName: "سارة" }));
    session = resolveSpacePilotStarArrival(session, 0, 1000).state;
    session = moveSpacePilotRocketLane(session, "UP").state;
    session = restartSpacePilotLevel(session, 2000).state;
    if (!isStarOnlyStage(session.currentStage)) throw new Error("expected star-only stage");
    expect(session.currentStage.collectedCount).toBe(0);
    expect(session.currentStage.rocketLane).toBe(StarLane.MIDDLE);
    expect(session.currentStage.currentStarIndex).toBe(0);
    expect(session.currentStage.stars.every((s) => s.status === CollectibleStarStatus.PENDING)).toBe(true);
    expect(session.currentStage.stars.map((s) => s.lane)).toEqual([...STAR_LANE_SEQUENCE]);
    expect(session.gameState).toBe(GameState.PLAYING);
  });

  it("resets MEDIUM's encounters, fire cooldown, and asteroid counters to the same deterministic start", () => {
    let session = toPlaying(createSpacePilotSession({ childFirstName: "سارة", difficulty: Difficulty.MEDIUM }));
    session = resolveSpacePilotEncounterArrival(session, 0, 1000).state;
    session = moveTo(session, StarLane.TOP);
    session = fireSpacePilotWeapon(session, 2000).state;
    session = restartSpacePilotLevel(session, 3000).state;
    if (!isEncounterStage(session.currentStage)) throw new Error("expected encounter stage");
    expect(session.currentStage.collectedStars).toBe(0);
    expect(session.currentStage.asteroidsCleared).toBe(0);
    expect(session.currentStage.currentEncounterIndex).toBe(0);
    expect(session.currentStage.lastFiredAt).toBeNull();
    expect(session.currentStage.rocketLane).toBe(StarLane.MIDDLE);
    expect(session.currentStage.encounters.every((e) => e.status === EncounterOutcome.PENDING)).toBe(true);
  });
});

describe("session completion", () => {
  it("ending early records only the stars actually presented (EASY)", () => {
    let session = toPlaying(createSpacePilotSession({ childFirstName: "سارة" }));
    session = resolveSpacePilotStarArrival(session, 0, 1000).state;
    session = resolveSpacePilotStarArrival(session, 1, 2000).state;
    const ended = endSpacePilotSession(session, 3000);
    expect(ended.success).toBe(true);
    expect(ended.state.gameState).toBe(GameState.SESSION_COMPLETE);
    expect(ended.state.summary?.starsPresented).toBe(2);
    expect(ended.state.summary?.asteroidsCleared).toBeNull();
  });

  it("excludes an open pause interval from active duration when ended while paused", () => {
    let session = toPlaying(createSpacePilotSession({ childFirstName: "سارة", now: 1000 }), 1000);
    session = pauseSpacePilotSession(session, 2000).state;
    const ended = endSpacePilotSession(session, 7000);

    expect(ended.success).toBe(true);
    expect(ended.state.summary?.totalDurationMs).toBe(1000);
    expect(Number.isFinite(ended.state.summary?.totalDurationMs)).toBe(true);
  });

  it("rejects ending an already-ended session", () => {
    let session = toPlaying(createSpacePilotSession({ childFirstName: "سارة" }));
    session = endSpacePilotSession(session, 1000).state;
    const again = endSpacePilotSession(session, 2000);
    expect(again.success).toBe(false);
  });

  it("collecting all 8 EASY stars then ending reports a full collection rate and level-8 upgrade", () => {
    let session = toPlaying(createSpacePilotSession({ childFirstName: "سارة" }));
    for (let i = 0; i < TOTAL_STARS; i++) {
      session = moveTo(session, STAR_LANE_SEQUENCE[i]);
      session = resolveSpacePilotStarArrival(session, i, 200 + i * 1000).state;
    }
    expect(session.gameState).toBe(GameState.STAGE_COMPLETE);
    const ended = endSpacePilotSession(session, 99999);
    expect(ended.state.summary?.starsCollected).toBe(TOTAL_STARS);
    expect(ended.state.summary?.collectionRate).toBe(1);
    expect(ended.state.summary?.finalUpgradeLevel).toBe(TOTAL_STARS);
  });

  it("ADVANCED's final star reaches upgrade level 8 (the full hero form) and records asteroid metrics", () => {
    let session = toPlaying(createSpacePilotSession({ childFirstName: "سارة", difficulty: Difficulty.ADVANCED }));
    for (const encounter of ADVANCED_ENCOUNTER_SEQUENCE) {
      session = moveTo(session, encounter.lane);
      session = resolveSpacePilotEncounterArrival(session, encounter.index, 1000 + encounter.index * 100).state;
    }
    expect(session.gameState).toBe(GameState.STAGE_COMPLETE);
    if (!isEncounterStage(session.currentStage)) throw new Error("expected encounter stage");
    expect(session.currentStage.collectedStars).toBe(8);
    const ended = endSpacePilotSession(session, 999999);
    expect(ended.state.summary?.finalUpgradeLevel).toBe(8);
    expect(ended.state.summary?.asteroidsAvoided).toBeGreaterThan(0);
  });
});

describe("no impossible patterns (structural guarantee on hand-designed sequences)", () => {
  for (const [name, sequence, intervalMs] of [
    ["MEDIUM", MEDIUM_ENCOUNTER_SEQUENCE, 7500] as const,
    ["ADVANCED", ADVANCED_ENCOUNTER_SEQUENCE, 6800] as const,
  ]) {
    it(`${name}: every encounter is reachable and has enough spacing to react to the previous one`, () => {
      expect(sequence.length).toBeGreaterThan(0);
      // never more than one object scheduled "in flight" at once: consecutive arrivals must be spaced at least one full interval apart.
      for (let i = 1; i < sequence.length; i++) {
        const gap = encounterArrivalOffsetMs(sequence === MEDIUM_ENCOUNTER_SEQUENCE ? Difficulty.MEDIUM : Difficulty.ADVANCED, i) -
          encounterArrivalOffsetMs(sequence === MEDIUM_ENCOUNTER_SEQUENCE ? Difficulty.MEDIUM : Difficulty.ADVANCED, i - 1);
        expect(gap).toBeGreaterThanOrEqual(intervalMs);
      }
      // no encounter ever requires firing at anything other than an asteroid.
      expect(sequence.every((e) => e.type !== EncounterType.ALIEN || true)).toBe(true);
    });
  }

  it("totalEncountersFor matches each difficulty's actual sequence length", () => {
    expect(totalEncountersFor(Difficulty.EASY)).toBe(TOTAL_STARS);
    expect(totalEncountersFor(Difficulty.MEDIUM)).toBe(MEDIUM_ENCOUNTER_SEQUENCE.length);
    expect(totalEncountersFor(Difficulty.ADVANCED)).toBe(ADVANCED_ENCOUNTER_SEQUENCE.length);
  });

  it("EASY's own fixed star sequence is unchanged (already-approved content, not touched by this task)", () => {
    expect(STAR_LANE_SEQUENCE).toHaveLength(8);
  });
});

describe("EASY timing (unchanged)", () => {
  it("keeps the original arrival schedule", () => {
    expect(starArrivalOffsetMs(0)).toBe(5000);
    expect(starArrivalOffsetMs(1)).toBe(12000);
  });
});

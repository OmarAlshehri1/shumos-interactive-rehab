import { describe, expect, it } from "vitest";
import { GameplaySimulation, type GameplayObject } from "../gameplay";
import { DIFFICULTY_PRESETS, MISSION_PLANS, normalizeGameplayConfig, type FlightDifficulty } from "../missions";
import { FLIGHT_HALF_HEIGHT, FLIGHT_HALF_WIDTH } from "../simulation";

const center = { x: 0.5, y: 0.5 };
const inputAt = (x: number, y: number) => ({ x: 0.5 + x / (FLIGHT_HALF_WIDTH * 2), y: 0.5 - y / (FLIGHT_HALF_HEIGHT * 2) });
function advance(sim: GameplaySimulation, seconds: number, input = center, fps = 60) {
  for (let i = 0; i < Math.round(seconds * fps); i++) sim.step(1 / fps, input);
}

/** Follow a feasible route at the existing keyboard's normalized movement speed. */
function flyMission(sim: GameplaySimulation, fps = 60, collect = true) {
  let position = inputAt(sim.ship.x, sim.ship.y);
  for (let frame = 0; frame < fps * 40 && sim.status === "running"; frame++) {
    const next = sim.objects.find((object) => object.outcome === "pending")!;
    const target = next.kind === "ring" && collect ? inputAt(next.x, next.y) : inputAt(next.x, next.y >= 0 ? -2.6 : 2.6);
    const dx = target.x - position.x, dy = target.y - position.y;
    const amount = Math.min(1, (0.38 / fps) / (Math.hypot(dx, dy) || 1));
    position = { x: position.x + dx * amount, y: position.y + dy * amount };
    sim.step(1 / fps, position);
  }
  expect(sim.status === "mission-complete" || sim.status === "complete").toBe(true);
}

function nearEncounter(kind: GameplayObject["kind"]) {
  const sim = new GameplaySimulation(); sim.start();
  const object = sim.objects[0];
  object.kind = kind; object.arrivalSeconds = 0.12; object.radius = kind === "ring" ? 0.7 : 1;
  return { sim, object };
}

describe("authoritative Space Pilot gameplay", () => {
  it("waits for launch, bounds movement and holds position for missing/invalid input", () => {
    const sim = new GameplaySimulation(); sim.step(0.1, center); expect(sim.elapsedSeconds).toBe(0);
    sim.start(); sim.step(0.1, { x: 10, y: -4 });
    expect(sim.ship.x).toBe(4.8); expect(sim.ship.y).toBe(2.8);
    sim.step(0.1, null); sim.step(0.1, { x: NaN, y: Infinity });
    expect(sim.ship.x).toBe(4.8); expect(sim.ship.y).toBe(2.8);
  });

  it("collects a star once, removes it, and awards points only from an accepted outcome", () => {
    const { sim, object } = nearEncounter("ring");
    sim.step(0.2, center);
    expect(object.outcome).toBe("collected"); expect(sim.stats.ringsCollected).toBe(1); expect(sim.stats.score).toBe(100);
    advance(sim, 1); sim.pause(); sim.resume(); advance(sim, 1);
    expect(sim.events.filter((event) => event.objectId === object.id)).toHaveLength(1);
    expect(sim.stats.ringsCollected).toBe(1); expect(sim.stats.score).toBe(100);
  });

  it("resolves missed stars without awarding score", () => {
    const { sim, object } = nearEncounter("ring"); advance(sim, 1, inputAt(4.8, 2.8));
    expect(object.outcome).toBe("missed"); expect(sim.stats.ringsMissed).toBe(1); expect(sim.stats.score).toBe(0);
  });

  it.each(["asteroid", "fiery"] as const)("resolves %s impact exactly once without penalties or control loss", (kind) => {
    const { sim, object } = nearEncounter(kind); sim.stats.ringsCollected = 2; sim.stats.score = 200;
    sim.step(0.2, center); advance(sim, 1);
    expect(object.outcome).toBe("collision"); expect(sim.stats.asteroidCollisions).toBe(1);
    expect(sim.stats.asteroidsAvoided).toBe(0); expect(sim.stats.score).toBe(200); expect(sim.stats.ringsCollected).toBe(2);
    expect(sim.status).toBe("running"); sim.step(0.1, inputAt(3, 2)); expect(sim.ship.x).toBeCloseTo(3);
    expect(sim.events.filter((event) => event.objectId === object.id)).toHaveLength(1);
  });

  it.each(["asteroid", "fiery"] as const)("tracks avoided %s separately from collisions", (kind) => {
    const { sim, object } = nearEncounter(kind); advance(sim, 1, inputAt(0, 2.8));
    expect(object.outcome).toBe("avoided"); expect(sim.stats.asteroidsAvoided).toBe(1); expect(sim.stats.asteroidCollisions).toBe(0);
  });

  it("catches fast objects over a quarter-second frame without duplicate resolution", () => {
    const sim = new GameplaySimulation({ speed: 30 }); sim.start(); advance(sim, 0.5);
    sim.step(0.25, center);
    expect(sim.objects[0].outcome).toBe("collected"); expect(sim.stats.ringsCollected).toBe(1);
  });

  it("freezes all gameplay while paused and resumes from the same time", () => {
    const sim = new GameplaySimulation(); sim.start(); advance(sim, 0.5); sim.pause();
    const before = JSON.stringify(sim); sim.step(0.2, inputAt(4, 2)); expect(JSON.stringify(sim)).toBe(before);
    sim.resume(); sim.step(0.1, center); expect(sim.elapsedSeconds).toBeCloseTo(0.6);
  });

  it("pauses long scheduling gaps with no catch-up and ignores non-monotonic/invalid deltas", () => {
    const sim = new GameplaySimulation(); sim.start(); advance(sim, 0.5);
    const before = JSON.stringify(sim);
    for (const delta of [0, -1, NaN, Infinity]) sim.step(delta, center);
    expect(JSON.stringify(sim)).toBe(before);
    sim.step(60, center); expect(sim.status).toBe("paused"); expect(sim.elapsedSeconds).toBeCloseTo(0.5); expect(sim.stats.resolved).toBe(0);
    sim.resume(); sim.step(1 / 60, center); expect(sim.elapsedSeconds).toBeCloseTo(0.5 + 1 / 60);
  });

  it("resets all run state and rejects delayed work tagged with the previous run", () => {
    const sim = new GameplaySimulation({ sessionId: "session-a" }); sim.start(); flyMission(sim); sim.nextMission(); flyMission(sim);
    expect(sim.stats.upgradeTier).toBe(3);
    const oldRun = sim.runId; sim.restart(); const fresh = JSON.stringify(sim);
    sim.step(0.1, center, oldRun); sim.nextMission(oldRun); sim.restart({ difficulty: "HIGH" }, oldRun);
    expect(JSON.stringify(sim)).toBe(fresh); expect(sim.events).toHaveLength(0); expect(sim.stats.score).toBe(0);
    expect(sim.mission).toBe(0); expect(sim.stats.upgradeTier).toBe(1); expect(sim.elapsedSeconds).toBe(0);
    advance(sim, 2); expect(sim.events[0]).toMatchObject({ sessionId: "session-a", runId: oldRun + 1 });
  });

  it("uses star denominators even when several asteroids are presented", () => {
    const sim = new GameplaySimulation(); sim.start(); flyMission(sim); sim.nextMission(); advance(sim, 0.1);
    expect(sim.stats.asteroidsPresented).toBeGreaterThan(0);
    expect(sim.stats.collectionAccuracy).toBe(sim.stats.ringsCollected / sim.stats.ringsPresented);
    expect(sim.stats.ringsPresented).toBeLessThan(sim.stats.ringsPresented + sim.stats.asteroidsPresented);
  });

  it("unlocks visual tiers at three and seven stars and retains them after impacts", () => {
    const sim = new GameplaySimulation(); sim.start();
    while (sim.stats.ringsCollected < 3) {
      const object = sim.objects.find((item) => item.outcome === "pending")!;
      sim.step(1 / 60, object.kind === "ring" ? inputAt(object.x, object.y) : inputAt(0, 2.8));
    }
    expect(sim.stats.upgradeTier).toBe(2);
    while (sim.status === "running") {
      const object = sim.objects.find((item) => item.outcome === "pending")!; sim.step(1 / 60, inputAt(object.x, object.y));
    }
    sim.nextMission();
    while (sim.stats.ringsCollected < 7) {
      const object = sim.objects.find((item) => item.outcome === "pending")!; sim.step(1 / 60, inputAt(object.x, object.y));
    }
    expect(sim.stats.upgradeTier).toBe(3); expect(sim.stats.asteroidCollisions).toBeGreaterThan(0);
  });

  it.each(["LOW", "MEDIUM", "HIGH"] as FlightDifficulty[])("offers a bounded, keyboard-speed route collecting every star and avoiding every obstacle on %s", (difficulty) => {
    const sim = new GameplaySimulation({ difficulty }); sim.start();
    for (let mission = 0; mission < 3; mission++) {
      expect(sim.mission).toBe(mission); flyMission(sim); const frozen = JSON.stringify(sim); sim.step(0.2, center); expect(JSON.stringify(sim)).toBe(frozen);
      sim.nextMission();
    }
    expect(sim.status).toBe("complete"); expect(sim.stats.completedMissions).toBe(3);
    expect(sim.stats).toMatchObject({ ringsPresented: 11, ringsCollected: 11, ringsMissed: 0, asteroidsPresented: 7, asteroidsAvoided: 7, asteroidCollisions: 0, resolved: 18, score: 1100, collectionAccuracy: 1, upgradeTier: 3 });
    expect(new Set(sim.events.map((event) => event.objectId)).size).toBe(18);
    if (difficulty === "HIGH") expect(sim.objects.filter((object) => object.kind === "fiery")).toHaveLength(3);
  });

  it("makes preset changes reset the run with distinct speed, tolerance, spacing and density", () => {
    const sim = new GameplaySimulation(); sim.start(); advance(sim, 2); const previous = sim.runId;
    sim.restart({ difficulty: "LOW" }); expect(sim.config).toEqual(DIFFICULTY_PRESETS.LOW); expect(sim.runId).toBe(previous + 1);
    sim.restart({ difficulty: "HIGH" }); expect(sim.config).toEqual(DIFFICULTY_PRESETS.HIGH); expect(sim.stats.resolved).toBe(0);
    expect(DIFFICULTY_PRESETS.LOW.speed).toBeLessThan(DIFFICULTY_PRESETS.HIGH.speed);
    expect(DIFFICULTY_PRESETS.LOW.targetTolerance).toBeGreaterThan(DIFFICULTY_PRESETS.HIGH.targetTolerance);
    expect(DIFFICULTY_PRESETS.LOW.encounterSpacing).toBeGreaterThan(DIFFICULTY_PRESETS.HIGH.encounterSpacing);
    expect(DIFFICULTY_PRESETS.LOW.obstacleDensity).toBeLessThan(DIFFICULTY_PRESETS.HIGH.obstacleDensity);
    expect(MISSION_PLANS[2].speedFactor).toBeGreaterThan(MISSION_PLANS[0].speedFactor);
  });

  it("bounds custom accessibility settings and rejects non-finite values", () => {
    expect(normalizeGameplayConfig({ speed: Infinity, targetTolerance: NaN, encounterSpacing: -100, obstacleDensity: 20 })).toMatchObject({ speed: 12, targetTolerance: 0.4, encounterSpacing: 2.5, obstacleDensity: 3 });
    const sim = new GameplaySimulation({ speed: 18, targetTolerance: 0.9, encounterSpacing: 5, obstacleDensity: 1 });
    expect(sim.config).toMatchObject({ speed: 18, targetTolerance: 0.9, encounterSpacing: 5, obstacleDensity: 1 });
  });

  it.each(["loss", "handoff", "pause"])("does not sweep across the ship during sensor %s/re-engagement", (kind) => {
    const sim = new GameplaySimulation(); sim.start(); const object = sim.objects[0]; object.arrivalSeconds = 0.12;
    sim.step(0.05, inputAt(-4.8, 0));
    if (kind === "loss") sim.step(0.01, null);
    else if (kind === "pause") { sim.pause(); sim.resume(); }
    else sim.invalidateInput();
    sim.step(0.1, inputAt(4.8, 0));
    expect(object.outcome).toBe("pending"); expect(sim.stats.ringsCollected).toBe(0);
  });

  it("does sweep legitimate continuous steering across an encounter", () => {
    const sim = new GameplaySimulation(); sim.start(); sim.objects[0].arrivalSeconds = 0.12;
    sim.step(0.05, inputAt(-4.8, 0)); sim.step(0.1, inputAt(4.8, 0)); expect(sim.objects[0].outcome).toBe("collected");
  });

  it("produces the same complete outcomes and score at 30 and 60 FPS", () => {
    const runs = [30, 60].map((fps) => {
      const sim = new GameplaySimulation({ difficulty: "HIGH" }); sim.start();
      for (let mission = 0; mission < 3; mission++) { flyMission(sim, fps); sim.nextMission(); }
      return sim;
    });
    expect(runs[0].stats).toEqual(runs[1].stats);
    expect(runs[0].events.map(({ objectId, outcome }) => ({ objectId, outcome }))).toEqual(runs[1].events.map(({ objectId, outcome }) => ({ objectId, outcome })));
    expect(Math.abs(runs[0].elapsedSeconds - runs[1].elapsedSeconds)).toBeLessThan(1 / 30);
  });
});

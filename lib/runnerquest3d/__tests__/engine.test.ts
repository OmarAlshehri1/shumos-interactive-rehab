import { describe, expect, it } from "vitest";
import { generateStage, validatePlan, MIN_GAP_M } from "../encounters";
import { STAGES, TOTAL_STAGES } from "../stages";
import { advanceStage, applyAction, assistPastObstacle, createSession, endSession, newRun, nextBlocking, pauseSession, restartStage, resumeSession, skipStage, startSession, tickSession, updateSettings } from "../session";
import type { Session } from "../types";

const make = (over: Partial<Parameters<typeof createSession>[0]> = {}) => createSession({ sessionId: "s", sessionEpoch: 1, seed: 7, ...over });
function run(s: Session, ms: number, step = 50) { for (let t = 0; t < ms && s.lifecycle === "playing"; t += step) tickSession(s, step); }

/** A tiny bot that plays one stage correctly, one action at a time, regardless of speed. */
function playStage(s: Session, maxMs = 20 * 60 * 1000): void {
  let t = 0;
  while (s.lifecycle === "playing" && t < maxMs) {
    const st = s.stage!;
    const i = nextBlocking(st);
    if (i >= 0 && st.holding) {
      const e = st.encounters[i];
      if (e.kind === "hurdle") applyAction(s, { kind: "step" });
      else {
        const free = [-1, 0, 1].filter((l) => !e.lanes.includes(l as -1));
        const goal = free.reduce((a, b) => (Math.abs(a - st.lane) <= Math.abs(b - st.lane) ? a : b));
        applyAction(s, { kind: "lane", dir: goal < st.lane ? -1 : 1 });
      }
    }
    tickSession(s, 50);
    t += 50;
  }
}

describe("stages + encounters", () => {
  it("defines exactly nine stages, three per difficulty", () => {
    expect(STAGES).toHaveLength(9);
    expect(TOTAL_STAGES).toBe(9);
    for (const d of ["easy", "medium", "advanced"]) expect(STAGES.filter((x) => x.difficulty === d)).toHaveLength(3);
  });
  it("easy stages never need a foot lift", () => {
    for (const sp of STAGES.filter((x) => x.difficulty === "easy")) {
      expect(sp.usesHurdles).toBe(false);
      for (let seed = 0; seed < 20; seed++) expect(generateStage(sp.index, seed).encounters.some((e) => e.kind === "hurdle")).toBe(false);
    }
  });
  it("medium stage 1 is a single-hurdle stage", () => {
    expect(generateStage(3, 1).encounters.filter((e) => e.kind === "hurdle").every((e) => e.lanes.length === 3)).toBe(true);
  });
  it("is deterministic for the same seed and varies with the seed", () => {
    for (const sp of STAGES) {
      expect(generateStage(sp.index, 42)).toEqual(generateStage(sp.index, 42));
    }
    expect(generateStage(6, 1).encounters).not.toEqual(generateStage(6, 2).encounters);
  });
  it("every generated plan is reachable and well spaced (many seeds, spacings)", () => {
    for (const sp of STAGES) for (let seed = 0; seed < 60; seed++) for (const spacing of [0.8, 1, 1.6]) {
      const plan = generateStage(sp.index, seed, spacing);
      expect(validatePlan(plan, { footLiftAvailable: true })).toEqual([]);
      const zs = plan.encounters.map((e) => e.z);
      for (let i = 1; i < zs.length; i++) expect(zs[i] - zs[i - 1]).toBeGreaterThanOrEqual(MIN_GAP_M / 2);
      // never a full-width solid obstacle without a free lane
      for (const e of plan.encounters) if (e.kind === "side" || e.kind === "gate") expect(e.lanes.length).toBeLessThan(3);
    }
  });
});

describe("session safety", () => {
  it("has no time-based failure: idle for ten minutes at an obstacle, still playing, no collision, no end", () => {
    const s = make();
    startSession(s);
    for (let i = 0; i < 12000; i++) tickSession(s, 50); // 10 minutes
    expect(s.lifecycle).toBe("playing");
    const st = s.stage!;
    expect(st.holding).toBe(true);
    expect(st.holds).toBe(1);
    const blocker = st.encounters[nextBlocking(st)];
    expect(st.distance).toBeLessThan(blocker.z); // never reaches the obstacle
    expect(blocker.z - st.distance).toBeGreaterThan(1);
  });
  it("only advances while playing", () => {
    const s = make();
    expect(s.stage!.distance).toBe(0);
    tickSession(s, 50);
    expect(s.stage!.simTimeMs).toBe(0);
    startSession(s);
    run(s, 500);
    pauseSession(s);
    const d = s.stage!.distance;
    tickSession(s, 100);
    expect(s.stage!.distance).toBe(d);
    resumeSession(s);
    run(s, 300);
    expect(s.stage!.distance).toBeGreaterThan(d);
  });
  it("clamps a long frame so a scheduling gap cannot teleport the runner", () => {
    const s = make();
    startSession(s);
    tickSession(s, 60000);
    expect(s.stage!.distance).toBeLessThan(0.6);
  });
  it("bumps the revision on discrete changes only", () => {
    const s = make();
    startSession(s);
    const r0 = s.revision;
    tickSession(s, 50);
    const r1 = s.revision;
    expect(applyAction(s, { kind: "lane", dir: 1 })).toBe("applied");
    expect(s.revision).toBeGreaterThan(r1);
    expect(r1).toBeGreaterThanOrEqual(r0);
    const r2 = s.revision;
    expect(applyAction(s, { kind: "lane", dir: 1 })).toBe("ignored"); // already in the right lane
    expect(s.revision).toBe(r2);
  });
  it("rejects duplicate input ids and actions while not playing", () => {
    const s = make();
    expect(applyAction(s, { kind: "lane", dir: 1 }, "a")).toBe("ignored");
    startSession(s);
    expect(applyAction(s, { kind: "lane", dir: -1 }, "a")).toBe("applied");
    expect(applyAction(s, { kind: "lane", dir: 1 }, "a")).toBe("ignored");
    expect(s.stage!.lane).toBe(-1);
  });
});

describe("obstacle behaviour", () => {
  it("holds before a blocking side obstacle and continues once a free lane is chosen", () => {
    const s = make({ startIndex: 0, endIndex: 0 });
    startSession(s);
    const st = s.stage!;
    const first = st.encounters[0];
    run(s, 60000);
    if (first.lanes.includes(0)) {
      expect(st.holding).toBe(true);
      expect(st.distance).toBeLessThan(first.z);
      const free = [-1, 0, 1].find((l) => !first.lanes.includes(l as -1))!;
      applyAction(s, { kind: "lane", dir: free < 0 ? -1 : 1 });
      run(s, 4000);
      expect(st.obstacles[0].resolved).toBe(true);
    }
  });
  it("a full-width hurdle needs a step; a step outside the window is ignored; an armed hurdle is cleared", () => {
    const s = make({ startIndex: 3, endIndex: 3 });
    startSession(s);
    const st = s.stage!;
    expect(applyAction(s, { kind: "step" })).toBe("ignored"); // far away
    run(s, 60000);
    expect(st.holding).toBe(true);
    expect(st.obstacles[0].resolved).toBe(false);
    expect(applyAction(s, { kind: "step" })).toBe("applied");
    expect(applyAction(s, { kind: "step" })).toBe("ignored"); // already armed
    run(s, 5000);
    expect(st.obstacles[0].how).toBe("stepped");
  });
  it("auto-steps hurdles when foot lift is not required", () => {
    const s = make({ startIndex: 3, endIndex: 3, settings: { footLiftRequired: false } });
    startSession(s);
    run(s, 40000);
    expect(s.stage!.obstacles[0].resolved).toBe(true);
    expect(s.stage!.obstacles[0].how).toBe("auto");
  });
  it("pause-before-obstacle stops well ahead of the obstacle", () => {
    const s = make({ startIndex: 3, endIndex: 3, settings: { pauseBeforeObstacle: true } });
    startSession(s);
    run(s, 60000);
    const st = s.stage!;
    expect(st.encounters[0].z - st.distance).toBeGreaterThan(5.5);
    expect(st.holding).toBe(true);
  });
  it("therapist assist moves past the obstacle and is recorded", () => {
    const s = make({ startIndex: 3, endIndex: 3 });
    startSession(s);
    run(s, 60000);
    expect(assistPastObstacle(s)).toBe(true);
    expect(s.stage!.assists).toBe(1);
    run(s, 2000);
    expect(s.stage!.obstacles[0].how).toBe("assisted");
  });
  it("gates need the open lane; markers and checkpoints never block", () => {
    const s = make({ startIndex: 1, endIndex: 1 });
    startSession(s);
    const g = s.stage!.encounters[0];
    run(s, 60000);
    expect(s.stage!.holding).toBe(g.target !== 0);
  });
});

describe("full sessions", () => {
  it("a correct player completes each of the nine stages at any speed", () => {
    for (const speed of [1, 2.4, 4.5]) {
      for (let idx = 0; idx < TOTAL_STAGES; idx++) {
        const s = make({ startIndex: idx, endIndex: idx, seed: 11 + idx, settings: { speed } });
        startSession(s);
        playStage(s);
        expect(s.lifecycle, `stage ${idx} speed ${speed}`).toBe("completed");
        expect(s.results[0].status).toBe("completed");
        expect(s.results[0].obstaclesResolved).toBe(s.results[0].obstaclesTotal);
        expect(s.summary?.completedStages).toBe(1);
      }
    }
  });
  it("plays all nine stages in order with therapist-driven advancement", () => {
    const s = make({ seed: 99 });
    for (let i = 0; i < 9; i++) {
      expect(s.stageIndex).toBe(i);
      startSession(s);
      playStage(s);
      if (i < 8) {
        expect(s.lifecycle).toBe("stage-complete");
        tickSession(s, 100); // no automatic progress
        expect(s.stageIndex).toBe(i);
        expect(advanceStage(s)).toBe(true);
      }
    }
    expect(s.lifecycle).toBe("completed");
    expect(s.results).toHaveLength(9);
    expect(s.summary!.completedStages).toBe(9);
    expect(s.summary!.totalStars).toBeGreaterThan(30);
  });
  it("skip, restart, end and new run behave", () => {
    const s = make();
    startSession(s);
    run(s, 3000);
    expect(skipStage(s)).toBe(true);
    expect(s.results[0].status).toBe("skipped");
    expect(s.lifecycle).toBe("stage-complete");
    advanceStage(s);
    startSession(s);
    run(s, 3000);
    const r = s.revision;
    expect(restartStage(s)).toBe(true);
    expect(s.stage!.distance).toBe(0);
    expect(s.lifecycle).toBe("ready");
    expect(s.revision).toBeGreaterThan(r);
    expect(s.results).toHaveLength(1);
    expect(endSession(s)).toBe(true);
    expect(s.summary!.reason).toBe("therapist-ended");
    expect(s.summary!.skippedStages).toBe(1);
    const run0 = s.runId;
    newRun(s);
    expect(s.runId).toBe(run0 + 1);
    expect(s.lifecycle).toBe("ready");
    expect(s.results).toHaveLength(0);
  });
  it("sanitises settings", () => {
    const s = make();
    updateSettings(s, { speed: 99, spacing: 0 });
    expect(s.settings.speed).toBe(4.5);
    expect(s.settings.spacing).toBe(0.8);
    updateSettings(s, { speed: NaN });
    expect(Number.isFinite(s.settings.speed)).toBe(true);
  });
  it("restart keeps the same encounters (deterministic retry)", () => {
    const s = make({ startIndex: 5, endIndex: 5 });
    const a = JSON.stringify(s.stage!.encounters);
    startSession(s);
    run(s, 5000);
    restartStage(s);
    expect(JSON.stringify(s.stage!.encounters)).toBe(a);
  });
});

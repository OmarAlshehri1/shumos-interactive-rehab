import { describe, expect, it } from "vitest";
import { PhysicalRole } from "@/lib/physicalInput/types";
import { ControlRuntime, type RuntimeDeps } from "../controlRuntime";
import { FLOOR_OBJECTIVE_COUNTS, generateFloorObjectives, validateFloorPlan } from "../floor";
import { isDisplayState, parseMessage, PROTOCOL_VERSION, toDisplayState, type Message } from "../protocol";
import { DisplayReplica } from "../replica";
import { advanceStage, applyAction, assistPastObstacle, createSession, endSession, floorCurrent, pauseSession, repeatObjective, resumeSession, restartStage, sanitizeFloor, setProjection, skipObjective, skipStage, startSession, tickSession, newRun } from "../session";
import { STAGES } from "../stages";
import { DEFAULT_FLOOR, type Session } from "../types";

const make = (over: Partial<Parameters<typeof createSession>[0]> = {}) => createSession({ sessionId: "s", sessionEpoch: 1, seed: 11, projection: "FLOOR", ...over });

/** Plays the CURRENT objective the way a therapist would from the touch pad. */
function confirmCurrent(s: Session): void {
  const o = floorCurrent(s.stage!)!;
  if (o.kind === "region") applyAction(s, { kind: "region", region: o.target! });
  else applyAction(s, { kind: "step" });
}

describe("FLOOR curriculum", () => {
  it("has the same nine stages as WALL, each with a deterministic, reachable plan", () => {
    expect(FLOOR_OBJECTIVE_COUNTS).toHaveLength(9);
    for (let i = 0; i < 9; i++) {
      for (const seed of [0, 1, 7, 12345, 4294967295]) {
        const a = generateFloorObjectives(i, seed), b = generateFloorObjectives(i, seed);
        expect(a).toEqual(b);
        expect(validateFloorPlan(a)).toEqual([]);
        expect(a.length).toBe(FLOOR_OBJECTIVE_COUNTS[i]);
      }
    }
  });
  it("gets longer and more varied with difficulty, never by demanding speed", () => {
    const kinds = (i: number) => new Set(generateFloorObjectives(i, 3).map((o) => `${o.kind}:${o.variant}`));
    expect(FLOOR_OBJECTIVE_COUNTS[0]).toBeLessThanOrEqual(FLOOR_OBJECTIVE_COUNTS[2]);
    expect(FLOOR_OBJECTIVE_COUNTS[6]).toBeGreaterThanOrEqual(FLOOR_OBJECTIVE_COUNTS[3]);
    expect(FLOOR_OBJECTIVE_COUNTS[8]).toBe(Math.max(...FLOOR_OBJECTIVE_COUNTS));
    // Easy 1 is a single simple direction at a time; the last stage uses every interaction type.
    expect([...kinds(0)]).toEqual(["region:direction"]);
    expect(kinds(8)).toEqual(new Set(["region:direction", "region:neutral", "region:choose", "step:step", "rest:rest"]));
    expect(kinds(4).has("rest:rest")).toBe(true); // medium 2: optional rests
  });
  it("easy 3 never repeats a side three times in a row", () => {
    for (let seed = 0; seed < 200; seed++) {
      const t = generateFloorObjectives(2, seed).map((o) => o.target);
      for (let i = 2; i < t.length; i++) expect(!(t[i] === t[i - 1] && t[i] === t[i - 2])).toBe(true);
    }
  });
  it("does not change the WALL stage definitions", () => {
    expect(STAGES).toHaveLength(9);
    expect(STAGES.map((s) => s.theme)).toEqual(["meadow", "garden", "trail", "lake", "forest", "sunset", "summit", "river", "festival"]);
  });
});

describe("FLOOR engine", () => {
  it("completes every one of the nine stages with only therapist confirmations (no sensor, no time)", () => {
    for (let idx = 0; idx < 9; idx++) {
      const s = make({ startIndex: idx, endIndex: idx });
      expect(startSession(s)).toBe(true);
      let guard = 0;
      while (s.lifecycle === "playing" && guard++ < 100) { confirmCurrent(s); tickSession(s, 100); }
      expect(s.lifecycle).toBe("completed");
      const r = s.results[0];
      expect(r).toMatchObject({ index: idx, status: "completed", projection: "FLOOR", obstaclesTotal: FLOOR_OBJECTIVE_COUNTS[idx], obstaclesResolved: FLOOR_OBJECTIVE_COUNTS[idx], objectivesSkipped: 0, assists: 0, holds: 0 });
      expect(s.summary).toMatchObject({ projection: "FLOOR", completedStages: 1, totalObjectivesSkipped: 0 });
    }
  });
  it("runs all nine stages in one session, advancing only when the therapist says so", () => {
    const s = make();
    startSession(s);
    for (let idx = 0; idx < 9; idx++) {
      while (s.lifecycle === "playing") confirmCurrent(s);
      if (idx < 8) { expect(s.lifecycle).toBe("stage-complete"); expect(advanceStage(s)).toBe(true); startSession(s); }
    }
    expect(s.lifecycle).toBe("completed");
    expect(s.summary!.completedStages).toBe(9);
  });
  it("never fails, never times out: ticking forever changes nothing but active time", () => {
    const s = make();
    startSession(s);
    const before = JSON.stringify({ c: s.stage!.floor!.current, r: s.revision });
    for (let i = 0; i < 20000; i++) tickSession(s, 100);
    expect(JSON.stringify({ c: s.stage!.floor!.current, r: s.revision })).toBe(before);
    expect(s.lifecycle).toBe("playing");
    expect(s.stage!.speed).toBe(0);
  });
  it("a wrong region is not an error: the child's region updates and the target stays lit", () => {
    const s = make({ startIndex: 0, endIndex: 0 });
    startSession(s);
    const o = floorCurrent(s.stage!)!;
    const wrong = o.target === 1 ? -1 : 1;
    expect(applyAction(s, { kind: "region", region: wrong })).toBe("applied");
    expect(s.stage!.floor!.current).toBe(0);
    expect(s.stage!.floor!.region).toBe(wrong);
    expect(s.stage!.stars).toBe(0);
    expect(applyAction(s, { kind: "step" })).toBe("ignored"); // a step does not satisfy a region objective
    confirmCurrent(s);
    expect(s.stage!.floor!.current).toBe(1);
    expect(s.stage!.stars).toBe(1);
  });
  it("lane actions (keyboard / foot mapping) confirm the left/right region", () => {
    const s = make({ startIndex: 0, endIndex: 0 });
    startSession(s);
    const o = floorCurrent(s.stage!)!;
    applyAction(s, { kind: "lane", dir: o.target === 1 ? 1 : -1 });
    expect(s.stage!.floor!.current).toBe(1);
  });
  it("assistance completes the objective, counts as assisted and still credits the star", () => {
    const s = make({ startIndex: 1, endIndex: 1 });
    startSession(s);
    expect(assistPastObstacle(s)).toBe(true);
    const st = s.stage!;
    expect(st.floor!.current).toBe(1);
    expect(st.assists).toBe(1);
    expect(st.stars).toBe(1);
    expect(st.obstacles[0].how).toBe("assisted");
    pauseSession(s);
    expect(assistPastObstacle(s)).toBe(true); // also allowed while paused
    expect(st.assists).toBe(2);
  });
  it("skip objective: no star, counted separately, the stage can still finish", () => {
    const s = make({ startIndex: 0, endIndex: 0 });
    startSession(s);
    skipObjective(s);
    expect(s.stage!.floor!.skipped).toBe(1);
    expect(s.stage!.stars).toBe(0);
    while (s.lifecycle === "playing") confirmCurrent(s);
    const r = s.results[0];
    expect(r.status).toBe("completed");
    expect(r.objectivesSkipped).toBe(1);
    expect(r.obstaclesResolved).toBe(r.obstaclesTotal - 1);
    expect(s.summary!.totalObjectivesSkipped).toBe(1);
  });
  it("skipping every objective still ends cleanly", () => {
    const s = make({ startIndex: 0, endIndex: 0 });
    startSession(s);
    let guard = 0;
    while (s.lifecycle === "playing" && guard++ < 50) skipObjective(s);
    expect(s.lifecycle).toBe("completed");
    expect(s.results[0].obstaclesResolved).toBe(0);
  });
  it("repeat replays the cue without changing progress or score", () => {
    const s = make({ startIndex: 0, endIndex: 0 });
    startSession(s);
    const rev = s.revision;
    expect(repeatObjective(s)).toBe(true);
    expect(s.stage!.floor!.cueSeq).toBe(1);
    expect(s.stage!.floor!.current).toBe(0);
    expect(s.revision).toBe(rev + 1);
    const ready = make();
    expect(repeatObjective(ready)).toBe(false); // not while ready
  });
  it("rest objective is completed by a confirmation, earns no star and is not a skip", () => {
    const s = make({ startIndex: 4, endIndex: 4 });
    startSession(s);
    let guard = 0;
    while (floorCurrent(s.stage!)?.kind !== "rest" && guard++ < 20) confirmCurrent(s);
    const stars = s.stage!.stars;
    const idx = s.stage!.floor!.current;
    expect(applyAction(s, { kind: "region", region: 1 })).toBe("ignored");
    expect(applyAction(s, { kind: "step" })).toBe("applied");
    expect(s.stage!.stars).toBe(stars);
    expect(s.stage!.obstacles[idx].how).toBe("rest");
    expect(s.stage!.floor!.skipped).toBe(0);
  });
  it("pause blocks actions; resume continues exactly where it was", () => {
    const s = make({ startIndex: 0, endIndex: 0 });
    startSession(s);
    confirmCurrent(s);
    pauseSession(s);
    const o = floorCurrent(s.stage!)!;
    expect(applyAction(s, { kind: "region", region: o.target! })).toBe("ignored");
    resumeSession(s);
    expect(s.stage!.floor!.current).toBe(1);
    confirmCurrent(s);
    expect(s.stage!.floor!.current).toBe(2);
  });
  it("restart rebuilds the same plan from the beginning; the earlier stages' results stay", () => {
    const s = make({ startIndex: 0, endIndex: 1 });
    startSession(s);
    const plan = JSON.stringify(s.stage!.floor!.objectives);
    confirmCurrent(s); confirmCurrent(s);
    restartStage(s);
    expect(s.lifecycle).toBe("ready");
    expect(s.stage!.floor!.current).toBe(0);
    expect(JSON.stringify(s.stage!.floor!.objectives)).toBe(plan);
    startSession(s);
    while (s.lifecycle === "playing") confirmCurrent(s);
    advanceStage(s); startSession(s);
    restartStage(s);
    expect(s.results).toHaveLength(1);
  });
  it("skipping a whole stage and ending early record only what happened", () => {
    const s = make({ startIndex: 0, endIndex: 2 });
    startSession(s);
    confirmCurrent(s);
    skipStage(s);
    expect(s.results[0]).toMatchObject({ status: "skipped", projection: "FLOOR" });
    advanceStage(s); startSession(s);
    endSession(s);
    expect(s.lifecycle).toBe("ended");
    expect(s.summary!.reason).toBe("therapist-ended");
    expect(s.summary!.completedStages).toBe(0);
    expect(s.summary!.skippedStages).toBe(1);
  });
  it("projection can only be chosen before the session begins", () => {
    const s = createSession({ sessionId: "s", sessionEpoch: 1, seed: 3 });
    expect(s.projection).toBe("WALL");
    const runBefore = s.runId;
    expect(setProjection(s, "FLOOR")).toBe(true);
    expect(s.stage!.floor).toBeDefined();
    expect(s.runId).toBe(runBefore + 1);
    expect(setProjection(s, "FLOOR")).toBe(true); // idempotent, no needless new run
    expect(s.runId).toBe(runBefore + 1);
    expect(setProjection(s, "WALL")).toBe(true);
    expect(s.stage!.floor).toBeUndefined();
    startSession(s);
    expect(setProjection(s, "FLOOR")).toBe(false);
    expect(s.projection).toBe("WALL");
    endSession(s);
    newRun(s);
    expect(setProjection(s, "FLOOR")).toBe(true); // a brand-new run may choose again
  });
  it("a FLOOR session in the middle of a multi-stage run refuses to switch", () => {
    const s = make({ startIndex: 0, endIndex: 2 });
    startSession(s);
    while (s.lifecycle === "playing") confirmCurrent(s);
    advanceStage(s);
    expect(s.lifecycle).toBe("ready");
    expect(setProjection(s, "WALL")).toBe(false);
  });
  it("WALL actions are unchanged: a region action is ignored by the lane runner", () => {
    const s = createSession({ sessionId: "s", sessionEpoch: 1, seed: 3 });
    startSession(s);
    expect(applyAction(s, { kind: "region", region: 1 })).toBe("ignored");
    expect(s.stage!.lane).toBe(0);
  });
  it("sanitizes calibration", () => {
    const f = sanitizeFloor(DEFAULT_FLOOR, { margin: 9, widthCm: -4, heightCm: 99999, range: "huge" as never, pad: "high", grid: true });
    expect(f).toMatchObject({ margin: 0.15, widthCm: 0, heightCm: 2000, range: "normal", pad: "high", grid: true, guidance: true });
    expect(sanitizeFloor(DEFAULT_FLOOR, { margin: Number.NaN }).margin).toBe(DEFAULT_FLOOR.margin);
  });
});

describe("FLOOR protocol + replica", () => {
  it("round-trips through the display protocol, including the strict validator", () => {
    const s = make({ startIndex: 4, endIndex: 4 });
    startSession(s);
    confirmCurrent(s); assistPastObstacle(s); skipObjective(s);
    const d = toDisplayState(s)!;
    expect(d.projection).toBe("FLOOR");
    expect(d.running).toBe(false);
    expect(d.floor!.outcomes.slice(0, 3)).toBe("cas");
    expect(d.floor!.total).toBe(d.armed.length);
    expect(isDisplayState(JSON.parse(JSON.stringify(d)))).toBe(true);
    expect(isDisplayState({ ...d, floor: { ...d.floor!, outcomes: "xx" } })).toBe(false);
    expect(isDisplayState({ ...d, floor: undefined })).toBe(false);
    expect(isDisplayState({ ...d, floor: { ...d.floor!, cal: { ...d.floor!.cal, margin: 3 } } })).toBe(false);
    const wall = toDisplayState(createSession({ sessionId: "w", sessionEpoch: 1, seed: 1 }))!;
    expect(wall.projection).toBeUndefined();
    expect(isDisplayState(wall)).toBe(true);
    expect(isDisplayState({ ...wall, floor: d.floor })).toBe(false);
  });
  it("the Display replica holds the discrete FLOOR state and never extrapolates motion", () => {
    const s = make({ startIndex: 0, endIndex: 0 });
    startSession(s);
    confirmCurrent(s);
    const id = { ownerId: "o", ownerStartedAt: 1, sessionId: s.sessionId, sessionEpoch: s.sessionEpoch, runId: s.runId };
    const r = new DisplayReplica(2600);
    const m: Message = { v: PROTOCOL_VERSION, type: "state", revision: s.revision, sentAtMs: 0, state: toDisplayState(s)!, ...id };
    expect(parseMessage(JSON.parse(JSON.stringify(m)))).not.toBeNull();
    expect(r.accept(m, 1000)).toBe("accepted");
    expect(r.distance(1000)).toBe(1);
    expect(r.distance(9000)).toBe(1);
    expect(r.speed(9000)).toBe(0);
    expect(r.accept(m, 1100)).toBe("duplicate");
  });
});

function harness(over: Partial<RuntimeDeps> = {}) {
  let t = 1000;
  const sent: Message[] = [];
  const rt = new ControlRuntime({
    now: () => t, wall: () => 1_700_000_000_000 + t, send: (m) => { sent.push(m); },
    ownerId: "owner-1", newId: (() => { let n = 0; return () => `id-${++n}`; })(), seed: 99, ...over,
  });
  rt.command({ type: "allow-no-display", value: true });
  return { rt, sent, step(ms: number) { for (let i = 0; i < ms; i += 16) { t += 16; rt.tick(); } }, get t() { return t; } };
}

describe("FLOOR runtime (Control)", () => {
  it("selects the projection through a command before start and refuses it afterwards", () => {
    const h = harness();
    expect(h.rt.command({ type: "projection", value: "FLOOR" })).toBe(true);
    expect(h.rt.session.projection).toBe("FLOOR");
    expect(toDisplayState(h.rt.session)!.projection).toBe("FLOOR");
    h.rt.command({ type: "start" });
    expect(h.rt.command({ type: "projection", value: "WALL" })).toBe(false);
    expect(h.rt.view().lastRefusal).toMatch(/قبل بدء الجلسة/);
  });
  it("sends no clock samples while running a FLOOR stage (no per-frame / periodic writes)", () => {
    const h = harness({ projection: "FLOOR" });
    h.rt.command({ type: "start" });
    h.step(3000);
    const clocks = h.sent.filter((m) => m.type === "clock") as Array<Message & { type: "clock" }>;
    expect(clocks.length).toBeGreaterThan(0);
    expect(clocks.every((c) => c.running === false)).toBe(true);
  });
  it("manual touch confirmation drives FLOOR through the same authoritative path", () => {
    const h = harness({ projection: "FLOOR", startIndex: 0, endIndex: 0 });
    h.rt.command({ type: "start" });
    for (let guard = 0; guard < 30 && h.rt.session.lifecycle === "playing"; guard++) {
      const o = floorCurrent(h.rt.session.stage!)!;
      h.step(200);
      h.rt.manual(o.kind === "region" ? { kind: "region", region: o.target! } : { kind: "step" });
    }
    expect(h.rt.session.lifecycle).toBe("completed");
  });
  it("a foot sensor only HINTS in FLOOR: it never completes an objective, and the therapist still can", () => {
    const h = harness({ projection: "FLOOR", startIndex: 0, endIndex: 0, settings: { inputSource: "RIGHT_FOOT" } });
    // Real foot adapters call ingestFoot; the simulated rig is the same path.
    h.rt.simulateConnection(PhysicalRole.RIGHT_FOOT as PhysicalRole.RIGHT_FOOT, true);
    h.step(2500);
    expect(h.rt.command({ type: "start" })).toBe(true);
    const o = floorCurrent(h.rt.session.stage!)!;
    h.rt.simulateGesture(PhysicalRole.RIGHT_FOOT as PhysicalRole.RIGHT_FOOT, o.target === 1 ? "TILT_RIGHT" : "TILT_LEFT");
    h.step(600);
    expect(h.rt.session.stage!.floor!.current).toBe(0);
    expect(h.rt.counters.hinted).toBeGreaterThan(0);
    // the onset hint is later followed by a "back at rest" hint; either way it is only a hint
    expect(["left", "right", "rest"]).toContain(h.rt.view().floorHint?.kind);
    h.step(300); // the therapist's tap shares the sensor's debounce window
    h.rt.manual({ kind: "region", region: o.target! });
    expect(h.rt.session.stage!.floor!.current).toBe(1);
  });
  it("disconnecting the sensor leaves manual control available (continue manually)", () => {
    const h = harness({ projection: "FLOOR", startIndex: 0, endIndex: 0, settings: { inputSource: "RIGHT_FOOT" } });
    h.step(2500);
    h.rt.command({ type: "start" });
    h.rt.simulateConnection(PhysicalRole.RIGHT_FOOT as PhysicalRole.RIGHT_FOOT, false);
    h.step(1500);
    expect(h.rt.session.lifecycle).toBe("suspended");
    expect(h.rt.command({ type: "continue-manually" })).toBe(true);
    const o = floorCurrent(h.rt.session.stage!)!;
    h.rt.manual({ kind: "region", region: o.target! });
    expect(h.rt.session.stage!.floor!.current).toBe(1);
  });
});

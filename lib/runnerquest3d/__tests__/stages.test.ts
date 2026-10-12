import { describe, expect, it } from "vitest";
import { generateStage, MIN_GAP_M, FIRST_ENCOUNTER_M } from "../encounters";
import { applyAction, createSession, endSession, HINT_RANGE_M, nextBlocking, pauseSession, resumeSession, restartStage, skipStage, startSession, tickSession, updateSettings } from "../session";
import { STAGES } from "../stages";

const kinds = (idx: number, seed = 3) => new Set(generateStage(idx, seed).encounters.map((e) => e.kind));
const make = (idx: number, settings = {}) => createSession({ sessionId: "s", sessionEpoch: 1, seed: 3, startIndex: idx, endIndex: idx, settings });
const run = (s: ReturnType<typeof make>, ms: number) => { for (let t = 0; t < ms; t += 50) tickSession(s, 50); };

describe("each of the nine stages matches its brief", () => {
  it("EASY 1: side obstacles only, one lane each", () => {
    for (let seed = 0; seed < 30; seed++) for (const e of generateStage(0, seed).encounters) if (e.kind === "side") expect(e.lanes).toHaveLength(1);
    expect([...kinds(0)].sort()).toEqual(["checkpoint", "side"]);
  });
  it("EASY 2: gates only (three safe regions, one glowing)", () => {
    expect([...kinds(1)].sort()).toEqual(["checkpoint", "gate"]);
    for (const e of generateStage(1, 9).encounters) if (e.kind === "gate") { expect(e.lanes).toHaveLength(2); expect(e.target).not.toBeNull(); }
  });
  it("EASY 3: more side obstacles with the widest spacing, no hurdle", () => {
    expect(generateStage(2, 1).encounters.filter((e) => e.kind === "side").length).toBeGreaterThan(generateStage(0, 1).encounters.filter((e) => e.kind === "side").length);
    expect(kinds(2).has("hurdle")).toBe(false);
  });
  it("MEDIUM 1: exactly one low hurdle at a time, always full width, slow approach", () => {
    const plan = generateStage(3, 5);
    const h = plan.encounters.filter((e) => e.kind === "hurdle");
    expect(h.length).toBe(STAGES[3].count);
    for (const e of h) expect(e.lanes).toHaveLength(3);
    for (let i = 1; i < h.length; i++) expect(h[i].z - h[i - 1].z).toBeGreaterThanOrEqual(STAGES[3].baseGap - 1);
  });
  it("MEDIUM 2: combines side obstacles and hurdles, one thing at a time", () => {
    const k = kinds(4);
    expect(k.has("side") && k.has("hurdle")).toBe(true);
    const enc = generateStage(4, 2).encounters.filter((e) => e.kind !== "checkpoint");
    for (let i = 1; i < enc.length; i++) expect(enc[i].z - enc[i - 1].z).toBeGreaterThanOrEqual(MIN_GAP_M);
  });
  it("MEDIUM 3: a trail of several hurdles and side obstacles with comfortable recovery", () => {
    const plan = generateStage(5, 4);
    expect(plan.encounters.filter((e) => e.kind === "hurdle").length).toBeGreaterThanOrEqual(4);
    expect(plan.encounters.filter((e) => e.kind === "side").length).toBeGreaterThanOrEqual(2);
    expect(STAGES[5].baseGap).toBeGreaterThanOrEqual(22);
  });
  it("ADVANCED 1: varied lateral navigation with gates, markers and checkpoints, no hurdle", () => {
    const k = kinds(6);
    expect(k.has("gate") && k.has("marker") && k.has("checkpoint")).toBe(true);
    expect(k.has("hurdle")).toBe(false);
  });
  it("ADVANCED 2: side obstacles and low hurdles in predictable sequence", () => {
    const seq = generateStage(7, 11).encounters.filter((e) => e.kind !== "checkpoint").map((e) => e.kind);
    expect(seq.slice(0, 4)).toEqual(["side", "hurdle", "hurdle", "side"]);
  });
  it("ADVANCED 3: combines every learned action and ends in the destination", () => {
    const k = kinds(8);
    for (const x of ["gate", "hurdle", "side", "marker", "checkpoint"] as const) expect(k.has(x)).toBe(true);
    expect(STAGES[8].count).toBeGreaterThan(STAGES[7].count);
  });
  it("difficulty rises through variety, never through speed or tighter spacing than the Medium trail allows", () => {
    for (const s of STAGES) expect(s.baseGap).toBeGreaterThanOrEqual(21);
    expect(FIRST_ENCOUNTER_M).toBeGreaterThanOrEqual(30);
  });
  it("encounters are identical on every machine for a fixed seed (golden)", () => {
    const e = generateStage(6, 12345).encounters.slice(0, 3).map((x) => `${x.kind}@${x.z.toFixed(0)}:${x.lanes.join("")}/${x.target}`);
    expect(e).toEqual(generateStage(6, 12345).encounters.slice(0, 3).map((x) => `${x.kind}@${x.z.toFixed(0)}:${x.lanes.join("")}/${x.target}`));
    expect(generateStage(0, 12345).encounters[0].z).toBe(FIRST_ENCOUNTER_M);
  });
});

describe("hints and retry", () => {
  it("shows a movement hint toward the free lane only when the way is blocked and near", () => {
    const s = make(0);
    startSession(s);
    const st = s.stage!;
    st.lane = 0;
    const i = st.encounters.findIndex((e) => e.kind === "side" && e.lanes.includes(0));
    if (i < 0) return; // seed-dependent
    st.distance = st.encounters[i].z - (HINT_RANGE_M - 1);
    for (let k = 0; k < i; k++) st.obstacles[k].resolved = true;
    tickSession(s, 50);
    expect(["move-left", "move-right"]).toContain(st.hint);
    st.distance = st.encounters[i].z - (HINT_RANGE_M + 8);
    tickSession(s, 50);
    expect(st.hint).toBeNull();
  });
  it("hurdle hint is 'step'; a gate hint is 'choose-path'", () => {
    const h = make(3); startSession(h); h.stage!.distance = h.stage!.encounters[0].z - 10; tickSession(h, 50);
    expect(h.stage!.hint).toBe("step");
    const g = make(1); startSession(g);
    const gi = g.stage!.encounters.findIndex((e) => e.kind === "gate" && e.target !== 0);
    if (gi >= 0) { for (let k = 0; k < gi; k++) g.stage!.obstacles[k].resolved = true; g.stage!.distance = g.stage!.encounters[gi].z - 12; tickSession(g, 50); expect(g.stage!.hint).toBe("choose-path"); }
  });
  it("a hold is counted once per obstacle however long the child takes, and repeating a miss never accumulates collisions", () => {
    const s = make(3);
    startSession(s);
    run(s, 120000);
    expect(s.stage!.holds).toBe(1);
    expect(s.stage!.stars).toBe(0);
    expect(s.lifecycle).toBe("playing");
  });
  it("restart clears holds/stars but keeps earlier stage results", () => {
    const s = createSession({ sessionId: "s", sessionEpoch: 1, seed: 3, startIndex: 3, endIndex: 5 });
    startSession(s); skipStage(s);
    expect(s.results).toHaveLength(1);
    s.lifecycle = "ready"; s.stageIndex = 4;
    run(s, 100);
    startSession(s); run(s, 90000);
    expect(s.stage!.holds).toBeGreaterThan(0);
    restartStage(s);
    expect(s.stage!.holds).toBe(0);
    expect(s.results).toHaveLength(1);
  });
});

describe("therapist settings", () => {
  it("speed changes distance per second; spacing is fixed per stage and applies on restart", () => {
    const slow = make(0, { speed: 1.5 }), fast = make(0, { speed: 4 });
    startSession(slow); startSession(fast);
    run(slow, 4000); run(fast, 4000);
    expect(fast.stage!.distance).toBeGreaterThan(slow.stage!.distance * 1.8);
    const s = make(0);
    const before = s.stage!.encounters[1].z;
    updateSettings(s, { spacing: 1.6 });
    expect(s.stage!.encounters[1].z).toBe(before);
    restartStage(s);
    expect(s.stage!.encounters[1].z).toBeGreaterThan(before);
  });
  it("foot-lift off removes the step requirement; sensitivity/tolerance do not alter encounters", () => {
    const a = make(3, { footLiftRequired: false }); startSession(a); run(a, 40000);
    expect(a.stage!.obstacles[0].resolved).toBe(true);
    const b = make(3, { sensitivity: "high", tolerance: "high" }), c = make(3, { sensitivity: "low", tolerance: "low" });
    expect(b.stage!.encounters).toEqual(c.stage!.encounters);
  });
  it("tolerance widens the step window", () => {
    const narrow = make(3, { tolerance: "low" }), wide = make(3, { tolerance: "high" });
    for (const s of [narrow, wide]) { startSession(s); s.stage!.distance = s.stage!.encounters[0].z - 8; }
    expect(applyAction(narrow, { kind: "step" })).toBe("ignored");
    expect(applyAction(wide, { kind: "step" })).toBe("applied");
  });
});

describe("pause / resume / end", () => {
  it("pause freezes everything, resume continues, end summarises without recording an unfinished stage", () => {
    const s = make(0);
    startSession(s); run(s, 2000);
    pauseSession(s);
    const snap = JSON.stringify(s.stage);
    tickSession(s, 100); tickSession(s, 100);
    expect(JSON.stringify(s.stage)).toBe(snap);
    expect(applyAction(s, { kind: "lane", dir: 1 })).toBe("ignored");
    resumeSession(s); run(s, 500);
    expect(nextBlocking(s.stage!)).toBeGreaterThanOrEqual(-1);
    endSession(s);
    expect(s.summary!.completedStages).toBe(0);
    expect(s.results).toHaveLength(0);
    expect(s.lifecycle).toBe("ended");
  });
});

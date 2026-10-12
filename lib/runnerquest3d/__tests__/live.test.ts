import { describe, expect, it, vi } from "vitest";
import { ControlRuntime } from "../controlRuntime";
import { buildLiveSession, liveToMessages, LIVE_CLOCK_INTERVAL_MS, reviveRunnerSession, RunnerLivePublisher, type LiveWrite } from "../live";
import type { Message } from "../protocol";
import { DisplayReplica } from "../replica";

/** Mimics Realtime Database read-back: nulls and empty arrays vanish, arrays may come back as index objects. */
function rtdbRoundTrip<T>(v: T): unknown {
  const walk = (x: unknown): unknown => {
    if (x === null || x === undefined) return undefined;
    if (Array.isArray(x)) { if (x.length === 0) return undefined; return Object.fromEntries(x.map((e, i) => [String(i), walk(e)])); }
    if (typeof x === "object") { const o: Record<string, unknown> = {}; for (const [k, val] of Object.entries(x)) { const w = walk(val); if (w !== undefined) o[k] = w; } return Object.keys(o).length ? o : undefined; }
    return x;
  };
  return JSON.parse(JSON.stringify(walk(v)));
}

function control(over = {}) {
  let t = 1000;
  const sent: Message[] = [];
  const rt = new ControlRuntime({ now: () => t, wall: () => 1_700_000_000_000 + t, send: (m) => sent.push(m), ownerId: "uid-1", newId: (() => { let n = 0; return () => `id${++n}`; })(), seed: 21, startIndex: 3, endIndex: 5, settings: { speed: 3 }, externalDisplayReady: () => true, ...over });
  const step = (ms: number) => { for (let i = 0; i < ms; i += 16) { t += 16; rt.tick(); } };
  step(32); // first tick publishes the initial state
  return { rt, sent, step, get t() { return t; } };
}
const lastState = (sent: Message[]) => [...sent].reverse().find((m): m is Extract<Message, { type: "state" }> => m.type === "state")!;
const lastClock = (sent: Message[]) => [...sent].reverse().find((m): m is Extract<Message, { type: "clock" }> => m.type === "clock") ?? null;

describe("live session record", () => {
  it("round-trips through RTDB-style null/empty-array loss and still validates", () => {
    const c = control();
    c.rt.command({ type: "start" });
    c.step(2000);
    const rec = buildLiveSession({ state: lastState(c.sent), clock: lastClock(c.sent), seed: 21, createdAt: 5, childFirstName: "  سارة  " });
    expect(rec.config.childFirstName).toBe("سارة");
    const back = reviveRunnerSession(rtdbRoundTrip(rec));
    expect(back).not.toBeNull();
    expect(back!.rq3.state.lifecycle).toBe("playing");
    expect(back!.rq3.state.armed).toEqual(rec.rq3.state.armed);
    expect(back!.rq3.state.hint ?? null).toBe(rec.rq3.state.hint ?? null);
  });
  it("carries the generic fields the rules/consumers require and no obstacle positions", () => {
    const c = control();
    const rec = buildLiveSession({ state: lastState(c.sent), clock: null, seed: 21, createdAt: 5, childFirstName: "نور" });
    for (const k of ["sessionId", "seed", "config", "gameState", "currentDifficulty", "currentStage", "createdAt"]) expect(rec).toHaveProperty(k);
    expect(JSON.stringify(rec)).not.toMatch(/"z":/);
    expect(JSON.stringify(rec).length).toBeLessThan(2500);
  });
  it("rejects malformed or foreign records instead of guessing", () => {
    const c = control();
    const rec = buildLiveSession({ state: lastState(c.sent), clock: null, seed: 1, createdAt: 1, childFirstName: "نور" });
    const raw = rtdbRoundTrip(rec) as Record<string, unknown> & { rq3: { state: Record<string, unknown>; clock: Record<string, unknown> } };
    expect(reviveRunnerSession({ ...raw, engine: "bq3" })).toBeNull();
    expect(reviveRunnerSession({ ...raw, engineVersion: 2 })).toBeNull();
    expect(reviveRunnerSession({ ...raw, rq3: { ...raw.rq3, state: { ...raw.rq3.state, lane: 3 } } })).toBeNull();
    expect(reviveRunnerSession({ ...raw, rq3: { ...raw.rq3, clock: { ...raw.rq3.clock, distance: -4 } } })).toBeNull();
    expect(reviveRunnerSession(null)).toBeNull();
    expect(reviveRunnerSession("x")).toBeNull();
  });
  it("feeds the Display replica exactly like the local channel", () => {
    const c = control();
    c.rt.command({ type: "start" });
    c.step(3000);
    const rec = reviveRunnerSession(rtdbRoundTrip(buildLiveSession({ state: lastState(c.sent), clock: lastClock(c.sent), seed: 21, createdAt: 5, childFirstName: "ليان" })))!;
    const { state, clock } = liveToMessages(rec);
    const r = new DisplayReplica(2600);
    expect(r.accept(state, 0)).toBe("accepted");
    r.accept(clock, 0);
    expect(r.state!.stageIndex).toBe(3);
    expect(r.state!.stars).toBe(c.rt.session.stage!.stars);
    // the very same record delivered twice (Firebase echo) is a no-op
    expect(r.accept(state, 1)).toBe("duplicate");
  });
});

describe("publisher: bounded Firebase writes", () => {
  function pub() {
    let now = 0;
    const writes: LiveWrite[] = [];
    const deps = { write: vi.fn(async (w: LiveWrite) => { writes.push(w); }), fetchBaseRevision: vi.fn(async () => 50), now: () => now };
    const p = new RunnerLivePublisher(deps);
    return { p, writes, deps, setNow: (n: number) => { now = n; } };
  }
  it("writes nothing until enabled with a child name", async () => {
    const c = control();
    const { p, writes } = pub();
    c.sent.forEach((m) => p.push(m));
    await Promise.resolve();
    expect(writes).toHaveLength(0);
    p.setEnabled(true);
    await Promise.resolve();
    expect(writes).toHaveLength(0);
    p.setChildName("نور");
    await vi.waitFor(() => expect(writes.length).toBe(1));
  });
  it("strictly increasing revisions, state changes at once, clock at most ~1 Hz, never per frame", async () => {
    const c = control();
    const { p, writes, setNow } = pub();
    p.setSessionMeta(21, 5); p.setChildName("نور"); p.setEnabled(true);
    c.rt.command({ type: "start" });
    let seen = 0;
    // 20 seconds of play at 60 fps
    for (let i = 0; i < 1250; i++) {
      c.step(16);
      setNow(c.t);
      for (; seen < c.sent.length; seen++) p.push(c.sent[seen]);
      if (i % 25 === 0) await Promise.resolve();
    }
    await vi.waitFor(() => expect(writes.length).toBeGreaterThan(10));
    const revs = writes.map((w) => w.revision);
    expect(revs).toEqual([...revs].sort((a, b) => a - b));
    expect(new Set(revs).size).toBe(revs.length);
    expect(writes.length).toBeLessThan(20 * (1000 / LIVE_CLOCK_INTERVAL_MS) + 20 + 10); // ~1 Hz clock + a few state changes
    expect(writes.length / 20).toBeLessThan(3);
  });
  it("re-bases after a rejected write and retries with the latest state", async () => {
    vi.useFakeTimers();
    const c = control();
    let fail = true;
    const writes: LiveWrite[] = [];
    const p = new RunnerLivePublisher({ write: async (w) => { if (fail) { fail = false; throw new Error("PERMISSION_DENIED/revision"); } writes.push(w); }, fetchBaseRevision: async () => 90, now: () => 0 });
    p.setChildName("نور"); p.setEnabled(true);
    c.sent.forEach((m) => p.push(m));
    await vi.advanceTimersByTimeAsync(1500);
    expect(writes.length).toBeGreaterThanOrEqual(1);
    expect(writes[0].revision).toBeGreaterThan(90);
    vi.useRealTimers();
  });
});

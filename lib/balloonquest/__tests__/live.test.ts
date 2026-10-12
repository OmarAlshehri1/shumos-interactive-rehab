import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Env } from "./harness";
import { buildLiveSession, bq3ToMessages, isBq3Session, LivePublisher, LIVE_CLOCK_INTERVAL_MS, reviveBq3Session, type LiveWrite } from "../live";
import { DisplayReplica } from "../replica";
import type { Message } from "../protocol";

/** What Realtime Database does to a value: drops nulls and empty arrays/objects. */
function rtdb<T>(value: T): T {
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) {
      const items = v.map(strip);
      return items.length ? items : undefined;
    }
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) {
        const s = strip(x);
        if (s !== null && s !== undefined) out[k] = s;
      }
      return Object.keys(out).length ? out : undefined;
    }
    return v;
  };
  return strip(JSON.parse(JSON.stringify(value))) as T;
}

function liveFrom(env: Env, name = "ليلى") {
  const states = env.sent.filter((m): m is Extract<Message, { type: "state" }> => m.type === "state");
  const clocks = env.sent.filter((m): m is Extract<Message, { type: "clock" }> => m.type === "clock");
  return buildLiveSession({ state: states[states.length - 1], clock: clocks[clocks.length - 1] ?? null, seed: env.rt.session.seed, createdAt: env.rt.session.sessionEpoch, childFirstName: name });
}
function playing(difficulty: "EASY" | "MEDIUM" | "ADVANCED" = "MEDIUM") {
  const env = new Env({ inputMode: "therapist", allowNoDisplay: true });
  env.rt.command({ type: "new-session", difficulty, stage: 1 });
  env.addDisplay();
  env.run(500);
  env.rt.command({ type: "start" });
  env.run(3000);
  return env;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate loosely-typed JSON clones on purpose */
describe("live session record", () => {
  it("carries the generic fields platform consumers read, tagged with the engine", () => {
    const live = liveFrom(playing());
    expect(isBq3Session(live)).toBe(true);
    expect(live).toMatchObject({ engine: "bq3", engineVersion: 1, config: { childFirstName: "ليلى" }, gameState: "PLAYING", currentDifficulty: "MEDIUM", currentStage: { stageNumber: 1, stageIndex: 3 } });
    expect(typeof live.createdAt).toBe("number");
    expect(isBq3Session({ gameState: "PLAYING" })).toBe(false);
  });

  it("survives a Realtime Database round trip (nulls and empty arrays dropped) and stays valid", () => {
    for (const d of ["EASY", "MEDIUM", "ADVANCED"] as const) {
      const live = liveFrom(playing(d));
      const back = reviveBq3Session(rtdb(live));
      expect(back).not.toBeNull();
      expect(back!.bq3.state.balloons.map((b) => b.id)).toEqual(live.bq3.state.balloons.map((b) => b.id));
      expect(back!.bq3.state.suspendReason).toBeNull();
    }
  });

  it("revives lifecycle states whose arrays are empty or absent (ready, completed with no stages)", () => {
    const env = new Env({ inputMode: "therapist", allowNoDisplay: true });
    env.run(100);
    const ready = liveFrom(env);
    expect(reviveBq3Session(rtdb(ready))?.bq3.state.lifecycle).toBe("ready");
    env.rt.command({ type: "start" });
    env.run(200);
    env.rt.command({ type: "end" });
    const ended = reviveBq3Session(rtdb(liveFrom(env)));
    expect(ended?.bq3.state.lifecycle).toBe("ended");
    expect(ended?.bq3.state.summary).toMatchObject({ reason: "therapist-ended", completedStages: 0 });
  });

  it("rejects malformed records so they fail safely to the waiting world", () => {
    const good = rtdb(liveFrom(playing()));
    const mutate = (fn: (r: any) => void) => { const r = JSON.parse(JSON.stringify(good)); fn(r); return r; };
    expect(reviveBq3Session(null)).toBeNull();
    expect(reviveBq3Session({ engine: "bq3" })).toBeNull();
    expect(reviveBq3Session(mutate((r) => { r.engine = "other"; }))).toBeNull();
    expect(reviveBq3Session(mutate((r) => { r.bq3.state.target = "pink"; }))).toBeNull();
    expect(reviveBq3Session(mutate((r) => { r.bq3.state.balloons[0].x = 500; }))).toBeNull();
    expect(reviveBq3Session(mutate((r) => { r.bq3.clock.simTimeMs = "soon"; }))).toBeNull();
    expect(reviveBq3Session(mutate((r) => { delete r.config.childFirstName; }))).toBeNull();
    expect(reviveBq3Session(mutate((r) => { r.bq3.state.lifecycle = "exploded"; }))).toBeNull();
    expect(reviveBq3Session(good)).not.toBeNull();
  });

  it("the child name fits the production rules (1-30 characters) and is trimmed", () => {
    const env = playing();
    const live = liveFrom(env, `   ${"س".repeat(60)}  `);
    expect(live.config.childFirstName.length).toBe(30);
  });

  it("feeds the Display replica exactly like the local channel: same positions as the authoritative engine", () => {
    const env = playing("ADVANCED");
    env.run(2000);
    const live = reviveBq3Session(rtdb(liveFrom(env)))!;
    const replica = new DisplayReplica();
    const { state, clock } = bq3ToMessages(live);
    expect(replica.accept(state, 1000)).toBe("accepted");
    expect(replica.accept(clock, 1000)).toBe("accepted");
    expect(replica.state!.balloons).toHaveLength(env.rt.session.stage!.balloons.length);
    expect(replica.simTime(1000)).toBeCloseTo(live.bq3.clock.simTimeMs, 0);
    // a re-delivery of the very same record (Firebase reconcile poll) is harmless
    expect(replica.accept(state, 1100)).toBe("duplicate");
    expect(replica.accept(clock, 1100)).toBe("duplicate");
    // paused: the replica freezes
    env.rt.command({ type: "pause" });
    const paused = bq3ToMessages(reviveBq3Session(rtdb(liveFrom(env)))!);
    replica.accept(paused.state, 1200);
    const t = replica.simTime(1200);
    expect(replica.simTime(9000)).toBe(t);
  });
});

describe("LivePublisher (write coalescing)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = () => {
    const writes: LiveWrite[] = [];
    let held: (() => void) | null = null;
    let holding = false;
    let fail = false;
    let now = 10_000;
    const pub = new LivePublisher({
      write: (w) => new Promise<void>((resolve, reject) => {
        writes.push(w);
        const done = () => (fail ? reject(new Error("PERMISSION_DENIED")) : resolve());
        if (holding) { held = done; holding = false; } else done();
      }),
      fetchBaseRevision: async () => 500,
      now: () => now,
    });
    const env = new Env({ inputMode: "therapist", allowNoDisplay: true });
    env.rt.command({ type: "new-session", difficulty: "MEDIUM", stage: 1 });
    const stateMsg = (): Extract<Message, { type: "state" }> => env.sent.filter((m): m is Extract<Message, { type: "state" }> => m.type === "state").pop()!;
    return { pub, writes, env, stateMsg, advance: (ms: number) => { now += ms; }, setFail: (v: boolean) => { fail = v; }, hold: () => { holding = true; }, releaseHeld: () => { const r = held; held = null; r?.(); } };
  };

  it("writes nothing until enabled with a child name, then writes the latest state with increasing revisions", async () => {
    const t = setup();
    t.pub.setBaseRevision(40);
    t.pub.push(t.stateMsg());
    await vi.advanceTimersByTimeAsync(0);
    expect(t.writes).toHaveLength(0);
    t.pub.setSessionMeta(1, 2);
    t.pub.setEnabled(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.writes).toHaveLength(0); // still no child name
    t.pub.setChildName("منى");
    await vi.advanceTimersByTimeAsync(0);
    expect(t.writes).toHaveLength(1);
    expect(t.writes[0].revision).toBe(41);
    expect(t.writes[0].session.config.childFirstName).toBe("منى");
    expect(t.writes[0].sessionId).toBe(t.stateMsg().sessionId);
  });

  it("coalesces state changes while a write is in flight: at most one write at a time, newest state wins", async () => {
    const t = setup();
    t.pub.setEnabled(true); t.pub.setChildName("منى");
    t.hold();
    t.pub.push(t.stateMsg());
    await vi.advanceTimersByTimeAsync(0);
    expect(t.writes).toHaveLength(1);
    for (let i = 0; i < 5; i++) { t.env.rt.command({ type: "settings", patch: { sizeScale: 1 + (i + 1) * 0.05 } }); t.pub.push(t.stateMsg()); }
    await vi.advanceTimersByTimeAsync(0);
    expect(t.writes).toHaveLength(1); // still the held one
    t.releaseHeld();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.writes).toHaveLength(2); // exactly one follow-up carrying the newest state
    expect(t.writes[1].session.bq3.revision).toBe(t.stateMsg().revision);
    expect(t.writes[1].revision).toBe(t.writes[0].revision + 1);
  });

  it("throttles clock samples to about one per second and ignores paused heartbeats", async () => {
    const t = setup();
    t.env.rt.command({ type: "start" });
    t.pub.setEnabled(true); t.pub.setChildName("منى");
    const state = t.stateMsg();
    t.pub.push(state);
    await vi.advanceTimersByTimeAsync(0);
    const base = t.writes.length;
    const clock = (seq: number, running: boolean): Message => ({ v: 1, type: "clock", revision: state.revision, seq, simTimeMs: seq * 250, running, ownerId: state.ownerId, ownerStartedAt: state.ownerStartedAt, sessionId: state.sessionId, sessionEpoch: state.sessionEpoch, runId: state.runId });
    for (let i = 1; i <= 8; i++) { t.advance(250); t.pub.push(clock(i, true)); await vi.advanceTimersByTimeAsync(0); }
    const written = t.writes.length - base;
    expect(written).toBeGreaterThanOrEqual(1);
    expect(written).toBeLessThanOrEqual(3); // 2 s of 4 Hz clocks -> ~2 writes
    const before = t.writes.length;
    for (let i = 9; i <= 20; i++) { t.advance(1000); t.pub.push(clock(i, false)); await vi.advanceTimersByTimeAsync(0); }
    expect(t.writes.length).toBe(before); // paused liveness heartbeats never hit Firebase
    expect(LIVE_CLOCK_INTERVAL_MS).toBe(1000);
  });

  it("backs off instead of spinning when writes keep failing, re-bases the revision, and recovers", async () => {
    const t = setup();
    t.pub.setEnabled(true); t.pub.setChildName("منى");
    t.setFail(true);
    t.pub.push(t.stateMsg());
    await vi.advanceTimersByTimeAsync(0);
    expect(t.writes).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(900);
    expect(t.writes).toHaveLength(1); // no tight retry loop
    await vi.advanceTimersByTimeAsync(200);
    expect(t.writes).toHaveLength(2);
    expect(t.writes[1].revision).toBeGreaterThan(500); // re-based on the stored revision
    t.setFail(false);
    await vi.advanceTimersByTimeAsync(1100);
    expect(t.writes).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.writes).toHaveLength(3); // success stops the retries
  });
});

import { describe, expect, it } from "vitest";
import { Env } from "./harness";
import { buildLiveSession, LivePublisher, reviveBq3Session, type LiveWrite } from "../live";
import { DisplayReplica } from "../replica";
import type { Message } from "../protocol";
import { evaluateRecovery, OWNER_STALE_MS, parseSnapshot, serializeSession, type StoredRecordView } from "../recovery";
import { selectBalloon, selectableBodies } from "../session";
import type { Session } from "../types";

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

function playing(difficulty: "EASY" | "MEDIUM" | "ADVANCED" = "MEDIUM") {
  const env = new Env({ inputMode: "therapist", allowNoDisplay: true });
  env.rt.command({ type: "new-session", difficulty, stage: 1 });
  env.run(300);
  env.rt.command({ type: "start" });
  env.run(3000);
  return env;
}
function correctPicks(env: Env, n: number) {
  for (let i = 0; i < n; i++) {
    let id: string | undefined;
    for (let tries = 0; tries < 200 && !id; tries++) {
      const st = env.rt.session.stage!;
      id = selectableBodies(env.rt.session).find((b) => st.balloons.find((x) => x.id === b.id)!.color === st.target)?.id;
      if (!id) env.run(100); // target balloon still below the screen: let it rise
    }
    expect(env.rt.therapistSelect(id!)).toBe(true);
    env.run(100);
  }
}
/** A Control reload: a brand-new runtime (later wall clock => newer owner) that adopts the stored snapshot. */
function reloaded(snapshot: Session, wallLater = 4000) {
  let n = 0; // the real Control uses random UUIDs; the test harness counter would collide with the first Control's ids
  const env2 = new Env({ inputMode: "therapist", allowNoDisplay: true }, { newId: () => `reloaded-${++n}` });
  env2.wall += wallLater;
  env2.rt.adopt(snapshot);
  return env2;
}

describe("snapshot", () => {
  it("round-trips a mid-stage moving session exactly, also through Realtime Database's null/empty-array stripping", () => {
    const env = playing("MEDIUM");
    correctPicks(env, 1);
    const json = serializeSession(env.rt.session);
    expect(parseSnapshot(json)).toEqual(JSON.parse(JSON.stringify(env.rt.session)));
    // The snapshot is a STRING inside the record, so RTDB cannot alter it.
    const rec = rtdb({ bq3: { snapshot: json } });
    expect(parseSnapshot(rec.bq3.snapshot)).not.toBeNull();
  });

  it("rejects malformed, truncated, tampered and inconsistent snapshots", () => {
    const env = playing("MEDIUM");
    const good = JSON.parse(serializeSession(env.rt.session));
    expect(parseSnapshot(undefined)).toBeNull();
    expect(parseSnapshot("")).toBeNull();
    expect(parseSnapshot(serializeSession(env.rt.session).slice(0, 200))).toBeNull();
    expect(parseSnapshot(JSON.stringify({ ...good, version: 2 }))).toBeNull();
    expect(parseSnapshot(JSON.stringify({ ...good, lifecycle: "exploded" }))).toBeNull();
    expect(parseSnapshot(JSON.stringify({ ...good, stage: null }))).toBeNull(); // playing without a stage
    expect(parseSnapshot(JSON.stringify({ ...good, stage: { ...good.stage, balloons: [{ id: 1 }] } }))).toBeNull();
    expect(parseSnapshot(JSON.stringify({ ...good, stage: { ...good.stage, target: "pink" } }))).toBeNull();
    expect(parseSnapshot(JSON.stringify({ ...good, stage: { ...good.stage, simTimeMs: -5 } }))).toBeNull();
    expect(parseSnapshot(JSON.stringify({ ...good, stageIndex: 12 }))).toBeNull();
    expect(parseSnapshot(JSON.stringify({ ...good, seenInputEvents: [1, 2] }))).toBeNull();
    expect(parseSnapshot(JSON.stringify({ ...good, summary: { nope: true } }))).toBeNull(); // only terminal states carry a summary
    expect(parseSnapshot("x".repeat(500_000))).toBeNull();
    const ready = new Env({ inputMode: "therapist" });
    expect(parseSnapshot(serializeSession(ready.rt.session))).toBeNull(); // nothing to recover
  });

  it("stays small enough to ride along with every state write", () => {
    const env = playing("ADVANCED");
    correctPicks(env, 2);
    expect(serializeSession(env.rt.session).length).toBeLessThan(40_000);
  });
});

describe("adopting a snapshot", () => {
  it("comes back PAUSED with stage, progress and accepted events intact, and nothing moves or scores until the therapist resumes", () => {
    const env = playing("MEDIUM");
    correctPicks(env, 2);
    const before = env.rt.session;
    const env2 = reloaded(parseSnapshot(serializeSession(before))!);
    const s = env2.rt.session;
    expect(s.lifecycle).toBe("paused");
    expect(s.suspendReason).toBeNull();
    expect(s.revision).toBeGreaterThan(before.revision);
    expect(s.sessionId).toBe(before.sessionId);
    expect(s.stage!.goalDone).toBe(2);
    expect(s.stage!.target).toBe(before.stage!.target);
    expect(s.stage!.balloons.map((b) => b.id)).toEqual(before.stage!.balloons.map((b) => b.id));
    expect(s.selectionSeq).toBe(before.selectionSeq);
    const t = env2.rt.getSimTimeMs();
    env2.run(6000); // paused: nothing moves, nothing spawns, nothing scores
    expect(env2.rt.getSimTimeMs()).toBe(t);
    expect(env2.rt.session.lifecycle).toBe("paused");
    const target = env2.rt.session.stage!.balloons.find((b) => b.color === env2.rt.session.stage!.target)!;
    expect(env2.rt.therapistSelect(target.id)).toBe(false);
    expect(env2.rt.session.stage!.goalDone).toBe(2);
    // Explicit therapist confirmation continues, with the same balloons.
    expect(env2.rt.command({ type: "resume" })).toBe(true);
    env2.run(500);
    expect(env2.rt.session.lifecycle).toBe("playing");
    expect(env2.rt.getSimTimeMs()).toBeGreaterThan(t);
    correctPicks(env2, 1);
    expect(env2.rt.session.stage!.goalDone).toBe(3);
  });

  it("a recovered session never double-counts: an already accepted input event or popped balloon is refused", () => {
    const env = playing("EASY");
    const st = env.rt.session.stage!;
    const b = st.balloons.find((x) => x.color === st.target)!;
    env.rt.therapistSelect(b.id);
    env.run(50);
    const used = env.rt.session.seenInputEvents[env.rt.session.seenInputEvents.length - 1];
    const env2 = reloaded(parseSnapshot(serializeSession(env.rt.session))!);
    env2.rt.command({ type: "resume" });
    env2.run(50);
    const dup = selectBalloon(env2.rt.session, { balloonId: env2.rt.session.stage!.balloons.find((x) => x.color === env2.rt.session.stage!.target && !x.popping)!.id, source: "THERAPIST", inputEventId: used });
    expect(dup.outcome).toBe("ignored");
    expect(env2.rt.therapistSelect(b.id)).toBe(false); // popped before the reload
    expect(env2.rt.session.stage!.goalDone).toBe(1);
  });

  it.each(["playing", "suspended (sensor lost)", "paused"] as const)("recovers from %s as a plain pause", (kind) => {
    const env = new Env({ inputMode: kind === "suspended (sensor lost)" ? "right-hand" : "therapist", allowNoDisplay: true });
    env.rt.command({ type: "new-session", difficulty: "MEDIUM", stage: 1 });
    env.run(300);
    if (kind === "suspended (sensor lost)") {
      env.rt.session = { ...env.rt.session, lifecycle: "ready" };
      env.rt.command({ type: "settings", patch: { inputMode: "therapist" } });
    }
    env.rt.command({ type: "start" });
    env.run(1000);
    if (kind === "suspended (sensor lost)") env.rt.suspend("control-hidden");
    if (kind === "paused") env.rt.command({ type: "pause" });
    const snap = parseSnapshot(serializeSession(env.rt.session))!;
    const env2 = reloaded(snap);
    expect(env2.rt.session.lifecycle).toBe("paused");
    expect(env2.rt.session.suspendReason).toBeNull();
    env2.run(3000);
    expect(env2.rt.session.lifecycle).toBe("paused"); // never auto-resumes
  });

  it("a stage-complete session waits for the therapist instead of auto-advancing", () => {
    const env = playing("EASY");
    while (env.rt.session.lifecycle === "playing") correctPicks(env, 1);
    expect(env.rt.session.lifecycle).toBe("stage-complete");
    const env2 = reloaded(parseSnapshot(serializeSession(env.rt.session))!);
    env2.run(15_000); // far longer than the auto-advance celebration
    expect(env2.rt.session.lifecycle).toBe("stage-complete");
    expect(env2.rt.session.results).toHaveLength(1);
    expect(env2.rt.command({ type: "advance" })).toBe(true);
    expect(env2.rt.session.stageIndex).toBe(1);
  });

  it("a completed or ended session is restored as it was, summary included", () => {
    const env = playing("EASY");
    env.rt.command({ type: "end" });
    const ended = env.rt.session;
    expect(ended.summary).not.toBeNull();
    const env2 = reloaded(parseSnapshot(serializeSession(ended))!);
    expect(env2.rt.session.lifecycle).toBe("ended");
    expect(env2.rt.session.summary).toEqual(ended.summary);
    expect(env2.rt.command({ type: "resume" })).toBe(false);
  });

  it("the Display follows the reloaded Control (newer owner) without a stale-message flip, and its clock stays frozen while paused", () => {
    const env = playing("MEDIUM");
    correctPicks(env, 1);
    const display = new DisplayReplica();
    for (const m of env.sent) display.accept(m, env.now);
    const env2 = reloaded(parseSnapshot(serializeSession(env.rt.session))!);
    const results = env2.sent.map((m: Message) => display.accept(m, env2.now));
    expect(results).not.toContain("stale");
    expect(display.state?.lifecycle).toBe("paused");
    expect(display.state?.goalDone).toBe(1);
    // A late message from the dead old Control (older owner) is stale.
    const late = env.sent.filter((m) => m.type === "state").pop()!;
    expect(display.accept(late, env2.now)).toBe("stale");
  });
});

describe("recovery decision", () => {
  const session = () => {
    const env = playing("MEDIUM");
    correctPicks(env, 1);
    return env.rt.session;
  };
  const record = (over: { tab?: string; beat?: number; owner?: string; patientId?: string | null; game?: string | null; sessionId?: string; snapshot?: string | undefined; engine?: string } = {}): StoredRecordView => {
    const s = session();
    return {
      gameId: over.game === undefined ? "balloon-quest" : over.game,
      sessionId: over.sessionId ?? s.sessionId,
      patientId: over.patientId === undefined ? "p1" : over.patientId,
      session: { engine: over.engine ?? "bq3", config: { childFirstName: "ليلى" }, bq3: { ownerId: over.owner ?? "uid-1", snapshot: "snapshot" in over ? over.snapshot : serializeSession(s), controlTabId: over.tab ?? "tab-A", heartbeatAt: over.beat ?? 1_000_000 } },
    };
  };
  const base = { uid: "uid-1", patientId: "p1" as string | null, tabId: "tab-A", now: 1_002_000 };

  it("recovers immediately in the same window (a plain reload)", () => {
    const d = evaluateRecovery({ ...base, record: record() });
    expect(d.kind).toBe("recover");
    if (d.kind === "recover") expect(d.why).toBe("same-window");
    expect(d.kind === "recover" && d.fromTabId).toBeNull();
  });
  it("another window that is still alive is never taken over silently; the therapist can force it", () => {
    const r = record({ tab: "tab-B" });
    expect(evaluateRecovery({ ...base, record: r })).toEqual({ kind: "blocked", why: "other-window-active", takeoverAllowed: true });
    // A live window is never overwritten by a fresh session, even from a window with another patient selected; take-over then needs the same patient.
    expect(evaluateRecovery({ ...base, patientId: "p2", record: r })).toEqual({ kind: "blocked", why: "other-window-active", takeoverAllowed: false });
    expect(evaluateRecovery({ ...base, patientId: "p2", force: true, record: r }).kind).toBe("blocked");
    const forced = evaluateRecovery({ ...base, record: r, force: true });
    expect(forced.kind === "recover" && forced.why).toBe("takeover");
  });
  it("another window that has stopped writing is recovered automatically", () => {
    const d = evaluateRecovery({ ...base, record: record({ tab: "tab-B" }), now: 1_000_000 + OWNER_STALE_MS + 1 });
    expect(d.kind === "recover" && d.why).toBe("owner-gone");
    expect(d.kind === "recover" && d.fromTabId).toBe("tab-B");
  });
  it("never recovers someone else's, another patient's, another game's, stale or damaged records", () => {
    expect(evaluateRecovery({ ...base, record: record({ owner: "uid-2" }) }).kind).toBe("none");
    expect(evaluateRecovery({ ...base, record: record({ patientId: "p2" }) }).kind).toBe("none");
    expect(evaluateRecovery({ ...base, record: record({ patientId: null }) }).kind).toBe("none");
    expect(evaluateRecovery({ ...base, record: record({ game: "runner-quest-3d" }) }).kind).toBe("none");
    expect(evaluateRecovery({ ...base, record: record({ engine: "legacy" }) }).kind).toBe("none");
    expect(evaluateRecovery({ ...base, record: record({ sessionId: "other" }) }).kind).toBe("none");
    expect(evaluateRecovery({ ...base, record: record({ snapshot: undefined }) }).kind).toBe("none");
    expect(evaluateRecovery({ ...base, record: record({ snapshot: "{not json" }) }).kind).toBe("none");
    expect(evaluateRecovery({ ...base, record: record(), now: 1_000_000 + 13 * 3600_000 }).kind).toBe("none");
    expect(evaluateRecovery({ ...base, record: null }).kind).toBe("none");
    expect(evaluateRecovery({ ...base, patientId: null, record: record({ patientId: null }) }).kind).toBe("recover"); // walk-in
  });
});

describe("live record carries the snapshot", () => {
  it("every write includes the snapshot, window id and a fresh heartbeat; the Display's reviver ignores nothing it needs", async () => {
    const env = playing("MEDIUM");
    const writes: LiveWrite[] = [];
    let t = 100_000;
    const pub = new LivePublisher({ write: async (w) => void writes.push(w), fetchBaseRevision: async () => 0, now: () => t });
    pub.setChildName("ليلى");
    pub.setTabId("tab-A");
    pub.setTakeoverFrom("tab-0");
    pub.setEnabled(true);
    for (const m of env.sent) {
      if (m.type === "state") pub.setSnapshot(serializeSession(env.rt.session));
      pub.push(m);
    }
    await Promise.resolve();
    const last = writes[writes.length - 1].session;
    expect(last.bq3.controlTabId).toBe("tab-A");
    expect(last.bq3.heartbeatAt).toBe(100_000);
    const stored = rtdb(last);
    const back = reviveBq3Session(stored)!;
    expect(parseSnapshot(back.bq3.snapshot)?.sessionId).toBe(env.rt.session.sessionId);
    expect(back.bq3.controlTabId).toBe("tab-A");
    expect(back.bq3.takeoverFrom).toBe("tab-0");
    // Idle liveness: nothing changed, but touch() rewrites the record with a newer heartbeat.
    const n = writes.length;
    t += 1000;
    pub.touch(4000);
    await Promise.resolve();
    expect(writes.length).toBe(n);
    t += 4000;
    pub.touch(4000);
    await new Promise((r) => setTimeout(r, 0));
    expect(writes.length).toBe(n + 1);
    expect(writes[n].session.bq3.heartbeatAt).toBe(t);
  });
  it("a record without the new fields (older Control build) still revives for the Display and is simply not recoverable", () => {
    const env = playing("MEDIUM");
    const states = env.sent.filter((m): m is Extract<Message, { type: "state" }> => m.type === "state");
    const old = buildLiveSession({ state: states[states.length - 1], clock: null, seed: 1, createdAt: 1, childFirstName: "ليلى" });
    const back = reviveBq3Session(rtdb(old));
    expect(back).not.toBeNull();
    expect(back!.bq3.snapshot).toBeUndefined();
  });
});

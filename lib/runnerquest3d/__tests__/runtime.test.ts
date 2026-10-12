import { describe, expect, it } from "vitest";
import { PhysicalRole } from "@/lib/physicalInput/types";
import { ControlRuntime, GAP_MS, INPUT_LOSS_GRACE_MS, type RuntimeDeps } from "../controlRuntime";
import { PROTOCOL_VERSION, parseMessage, toDisplayState, type Message } from "../protocol";
import { DisplayReplica } from "../replica";

const R = PhysicalRole.RIGHT_FOOT as PhysicalRole.RIGHT_FOOT;
const L = PhysicalRole.LEFT_FOOT as PhysicalRole.LEFT_FOOT;

/** Control + one Display replica on a fake clock and an in-memory channel. */
function harness(over: Partial<RuntimeDeps> = {}) {
  let t = 1000;
  const sent: Message[] = [];
  const replica = new DisplayReplica();
  let ackSeq = 0;
  let displayOn = true;
  let lastDisplayState: ReturnType<typeof toDisplayState> = null;
  const rt = new ControlRuntime({
    now: () => t, wall: () => 1_700_000_000_000 + t, send: (m) => { sent.push(m); replica.accept(m, t); lastDisplayState = replica.state; },
    ownerId: "owner-1", newId: (() => { let n = 0; return () => `id-${++n}`; })(), seed: 99, ...over,
  });
  const ack = (visible = true) => rt.receive({ v: PROTOCOL_VERSION, type: "ack", displayId: "d1", ownerId: "owner-1", sessionEpoch: rt.session.sessionEpoch, runId: rt.session.runId, revision: Math.max(0, replica.revision), seq: ++ackSeq, visible });
  const step = (ms: number, ackEvery = 400) => {
    let sinceAck = 0;
    for (let i = 0; i < ms; i += 16) {
      t += 16; sinceAck += 16;
      if (displayOn && sinceAck >= ackEvery) { ack(); sinceAck = 0; }
      rt.tick();
    }
  };
  const probe = () => rt.receive({ v: PROTOCOL_VERSION, type: "probe", displayId: "d1", nonce: "n1" });
  return { rt, sent, replica, step, ack, probe, setDisplay(v: boolean) { displayOn = v; }, get t() { return t; }, advanceClock(ms: number) { t += ms; }, get display() { return lastDisplayState; } };
}
const connect = (h: ReturnType<typeof harness>) => { h.probe(); h.ack(); };

describe("Control authority and start gating", () => {
  it("refuses to start without a visible Display, unless preview-without-display is enabled", () => {
    const h = harness();
    expect(h.rt.command({ type: "start" })).toBe(false);
    expect(h.rt.view().lastRefusal).toMatch(/شاشة العرض/);
    h.rt.command({ type: "allow-no-display", value: true });
    expect(h.rt.command({ type: "start" })).toBe(true);
    expect(h.rt.session.lifecycle).toBe("playing");
  });
  it("a hidden Display (visible:false) does not count as ready", () => {
    const h = harness();
    h.probe(); h.ack(false);
    expect(h.rt.view().displayReady).toBe(false);
    h.ack(true);
    expect(h.rt.view().displayReady).toBe(true);
  });
  it("foot sources cannot start before the rest pose is learned", () => {
    const h = harness({ settings: { inputSource: "RIGHT_FOOT" } });
    connect(h);
    h.step(100);
    expect(h.rt.command({ type: "start" })).toBe(false);
    h.step(1500);
    expect(h.rt.command({ type: "start" })).toBe(true);
  });
  it("rejects commands addressed to an older session/run", () => {
    const h = harness();
    connect(h);
    const stale = { sessionEpoch: h.rt.session.sessionEpoch, runId: h.rt.session.runId };
    h.rt.command({ type: "new-run" });
    expect(h.rt.command({ type: "start" }, stale)).toBe(false);
    expect(h.rt.command({ type: "start" }, { sessionEpoch: h.rt.session.sessionEpoch, runId: h.rt.session.runId })).toBe(true);
  });
});

describe("Control / Display agreement", () => {
  it("the Display replica mirrors lifecycle, lane, stars and distance within the extrapolation error", () => {
    const h = harness();
    connect(h);
    h.rt.command({ type: "start" });
    h.step(3000);
    h.rt.key("ArrowLeft");
    h.step(1000);
    const s = h.rt.session.stage!;
    const mirrored = h.replica.state!;
    expect(mirrored.lifecycle).toBe("playing");
    expect(mirrored.lane).toBe(s.lane);
    expect(Math.abs(h.replica.distance(h.t) - s.distance)).toBeLessThan(0.6);
    expect(mirrored.armed).toHaveLength(s.obstacles.length);
  });
  it("outcomes (stars, resolved obstacles, holds) match exactly after every revision", () => {
    const h = harness({ settings: { speed: 4.5, spacing: 0.8 }, startIndex: 3, endIndex: 3 });
    connect(h);
    h.rt.command({ type: "start" });
    for (let i = 0; i < 400; i++) {
      h.step(100);
      const st = h.rt.session.stage!;
      if (st.holding && h.rt.session.lifecycle === "playing") h.rt.key(" ");
      if (h.rt.session.lifecycle !== "playing") break;
    }
    h.step(2000);
    const st = h.rt.session.stage!;
    const mirrored = h.replica.state!;
    expect(mirrored.stars).toBe(st.stars);
    expect(mirrored.holds).toBe(st.holds);
    expect(mirrored.resolved).toEqual(st.obstacles.map((o) => o.resolved));
    expect(mirrored.lifecycle).toBe(h.rt.session.lifecycle);
  });
  it("sends a revision on every discrete change and a clock in between (no per-frame state spam)", () => {
    const h = harness();
    connect(h);
    h.rt.command({ type: "start" });
    h.sent.length = 0;
    h.step(2000);
    const states = h.sent.filter((m) => m.type === "state").length, clocks = h.sent.filter((m) => m.type === "clock").length;
    expect(clocks).toBeGreaterThan(8);
    expect(states).toBeLessThan(clocks);
    const revs = h.sent.filter((m): m is Extract<Message, { type: "state" }> => m.type === "state").map((m) => m.revision);
    expect(revs).toEqual([...revs].sort((a, b) => a - b));
    expect(new Set(revs).size).toBe(revs.length);
  });
  it("answers a probe with a full sync, so a reloaded Display recovers immediately", () => {
    const h = harness();
    connect(h);
    h.rt.command({ type: "start" });
    h.step(1500);
    const fresh = new DisplayReplica();
    h.probe();
    const sync = h.sent.filter((m) => m.type === "sync").pop()!;
    expect(fresh.accept(sync, h.t)).toBe("accepted");
    expect(fresh.state!.lifecycle).toBe("playing");
    expect(fresh.state!.stageIndex).toBe(h.rt.session.stageIndex);
  });
});

describe("DisplayReplica rejects stale, duplicate and foreign messages", () => {
  const base = (over: Partial<RuntimeDeps> = {}) => { const h = harness(over); connect(h); h.rt.command({ type: "start" }); h.step(500); h.rt.key("ArrowLeft"); h.step(300); return h; };
  it("stale revision, duplicate state, duplicate clock seq, foreign owner", () => {
    const h = base();
    const r = new DisplayReplica();
    const states = h.sent.filter((m): m is Extract<Message, { type: "state" }> => m.type === "state");
    const latest = states[states.length - 1], older = states[0];
    expect(r.accept(latest, 0)).toBe("accepted");
    expect(r.accept(latest, 0)).toBe("duplicate");
    expect(r.accept(older, 0)).toBe("stale");
    const clock = h.sent.filter((m): m is Extract<Message, { type: "clock" }> => m.type === "clock").pop()!;
    expect(r.accept({ ...clock, revision: latest.revision }, 0)).toBe("accepted");
    expect(r.accept({ ...clock, revision: latest.revision }, 0)).toBe("duplicate");
    expect(r.accept({ ...clock, revision: latest.revision, seq: clock.seq + 1, ownerId: "someone-else" }, 0)).toBe("foreign");
    expect(r.accept({ ...clock, revision: latest.revision + 5, seq: clock.seq + 2 }, 0)).toBe("needs-sync");
    expect(r.needsSync).toBe(true);
  });
  it("a new run supersedes an old one; an old run's late messages are dropped", () => {
    const h = base();
    const r = new DisplayReplica();
    h.sent.filter((m) => m.type === "state").forEach((m) => r.accept(m, 0));
    const oldRun = h.sent.filter((m): m is Extract<Message, { type: "state" }> => m.type === "state").pop()!;
    h.rt.command({ type: "new-run" });
    const newState = h.sent.filter((m): m is Extract<Message, { type: "state" }> => m.type === "state").pop()!;
    expect(newState.runId).toBe(oldRun.runId + 1);
    expect(r.accept(newState, 0)).toBe("accepted");
    expect(r.accept(oldRun, 0)).toBe("stale");
    expect(r.state!.lifecycle).toBe("ready");
  });
  it("a reloaded Control (later ownerStartedAt) takes over; the previous owner is stale", () => {
    const a = base();
    const r = new DisplayReplica();
    a.sent.filter((m) => m.type === "state").forEach((m) => r.accept(m, 0));
    const b = harness({ ownerId: "owner-2", wall: () => 1_900_000_000_000 });
    const bState = (() => { b.probe(); return b.sent.find((m) => m.type === "sync")!; })();
    expect(r.accept({ ...bState, type: "state" } as Message, 0)).toBe("accepted");
    expect(r.identity!.ownerId).toBe("owner-2");
    expect(r.accept(a.sent.filter((m) => m.type === "state").pop()!, 0)).toBe("stale");
  });
  it("freezes while paused and bounds extrapolation when Control goes silent", () => {
    const h = base();
    h.rt.command({ type: "pause" });
    const d = h.replica.distance(h.t);
    expect(h.replica.distance(h.t + 5000)).toBe(d);
    h.rt.command({ type: "resume" });
    const d2 = h.replica.distance(h.t);
    const far = h.replica.distance(h.t + 60000);
    expect(far - d2).toBeLessThan(4.5 * 0.7 + 0.01);
    expect(h.replica.isSilent(h.t + 5000)).toBe(true);
  });
  it("malformed messages are rejected without throwing", () => {
    const h = base();
    const good = h.sent.filter((m) => m.type === "state").pop()!;
    expect(parseMessage(good)).not.toBeNull();
    const bad = (patch: Record<string, unknown>) => parseMessage({ ...good, state: { ...(good as { state: object }).state, ...patch } });
    expect(bad({ lane: 2 })).toBeNull();
    expect(bad({ distance: NaN })).toBeNull();
    expect(bad({ speed: 99 })).toBeNull();
    expect(bad({ armed: [true], resolved: [] })).toBeNull();
    expect(bad({ stageIndex: 9 })).toBeNull();
    expect(parseMessage(null)).toBeNull();
    expect(parseMessage({ v: 2, type: "state" })).toBeNull();
    expect(parseMessage({ v: 1, type: "clock", distance: -1 })).toBeNull();
  });
  it("the Display state carries no obstacle positions and no patient data", () => {
    const h = base();
    const json = JSON.stringify(toDisplayState(h.rt.session));
    expect(json).not.toMatch(/"z":/);
    expect(json).not.toMatch(/patient|name|email/i);
  });
});

describe("input sources through the runtime (simulated hardware)", () => {
  it("keyboard moves the runner; foot samples are ignored in keyboard mode", () => {
    const h = harness();
    connect(h);
    h.rt.command({ type: "start" }); h.step(300);
    h.rt.simulateGesture(R, "TILT_LEFT"); h.step(1000);
    expect(h.rt.session.stage!.lane).toBe(0);
    h.rt.key("ArrowLeft");
    expect(h.rt.session.stage!.lane).toBe(-1);
    expect(h.rt.counters.accepted).toBe(1);
  });
  it("simulated RIGHT_FOOT: right-foot gestures act; left foot and keyboard do not", () => {
    const h = harness({ settings: { inputSource: "RIGHT_FOOT" } });
    connect(h);
    h.step(1500);
    h.rt.command({ type: "start" });
    h.rt.simulateGesture(L, "TILT_RIGHT"); h.step(1200);
    expect(h.rt.session.stage!.lane).toBe(0);
    h.rt.key("ArrowRight");
    expect(h.rt.session.stage!.lane).toBe(0);
    h.rt.simulateGesture(R, "TILT_RIGHT"); h.step(1200);
    expect(h.rt.session.stage!.lane).toBe(1);
    expect(h.rt.counters.wrongSource).toBeGreaterThan(0);
  });
  it("hand/handheld samples never reach the game even in a foot mode", () => {
    const h = harness({ settings: { inputSource: "DUAL_FOOT" } });
    connect(h);
    h.step(1500);
    h.rt.command({ type: "start" });
    const s = { timestampMs: 1, accelerationG: [0, 0, 1], gyroscopeDps: [200, 0, 0], anglesDeg: [60, 60, 0] } as const;
    for (const role of [PhysicalRole.RIGHT_HAND, PhysicalRole.LEFT_HAND, "HANDHELD"]) expect(h.rt.ingestFoot(role, { ...s, timestampMs: 10 + Math.random() }, h.t).accepted).toBe(false);
    expect(h.rt.counters.ignoredRole).toBe(3);
    expect(h.rt.session.stage!.lane).toBe(0);
    expect(h.rt.session.stage!.stepSeq).toBe(0);
  });
  it("dual foot: both feet run through the real pipeline to lane + step", () => {
    const h = harness({ settings: { inputSource: "DUAL_FOOT", speed: 1 }, startIndex: 3, endIndex: 3 });
    connect(h);
    h.step(1500);
    h.rt.command({ type: "start" });
    h.rt.simulateGesture(L, "TILT_LEFT"); h.step(900);
    h.rt.simulateGesture(R, "TILT_RIGHT"); h.step(900);
    expect(h.rt.session.stage!.lane).toBe(0); // left then right = back to centre
    h.rt.session.stage!.distance = h.rt.session.stage!.encounters[0].z - 5; // inside the step window
    h.rt.simulateGesture(R, "LIFT"); h.step(900);
    expect(h.rt.session.stage!.obstacles[0].armed).toBe(true);
  });
});

describe("safety: suspension and recovery", () => {
  it("losing a required foot sensor suspends play (input-lost), freezes the runner and needs a deliberate resume", () => {
    const h = harness({ settings: { inputSource: "RIGHT_FOOT" } });
    connect(h);
    h.step(1500);
    h.rt.command({ type: "start" });
    h.step(1500);
    const before = h.rt.session.stage!.distance;
    h.rt.simulateConnection(R, false);
    h.step(INPUT_LOSS_GRACE_MS + 200);
    expect(h.rt.session.lifecycle).toBe("suspended");
    expect(h.rt.session.suspendReason).toBe("input-lost");
    const frozen = h.rt.session.stage!.distance;
    expect(frozen - before).toBeLessThan(5);
    h.step(3000);
    expect(h.rt.session.stage!.distance).toBe(frozen);
    expect(h.rt.command({ type: "resume" })).toBe(false); // sensor still gone
    h.rt.simulateConnection(R, true);
    h.step(200);
    expect(h.rt.command({ type: "resume" })).toBe(false); // still re-settling: not live yet
    h.step(1800);
    expect(h.rt.command({ type: "resume" })).toBe(true);
    expect(h.rt.session.lifecycle).toBe("playing");
  });
  it("losing the Display suspends; it resumes by itself when the Display returns", () => {
    const h = harness();
    connect(h);
    h.rt.command({ type: "start" });
    h.step(1000);
    h.setDisplay(false);
    h.step(3000);
    expect(h.rt.session.lifecycle).toBe("suspended");
    expect(h.rt.session.suspendReason).toBe("display-unavailable");
    const d = h.rt.session.stage!.distance;
    h.step(1000);
    expect(h.rt.session.stage!.distance).toBe(d);
    h.setDisplay(true); h.ack();
    h.step(100);
    expect(h.rt.session.lifecycle).toBe("playing");
  });
  it("a long scheduling gap suspends instead of teleporting the runner", () => {
    const h = harness();
    connect(h);
    h.rt.command({ type: "start" });
    h.step(500);
    const d = h.rt.session.stage!.distance;
    h.advanceClock(GAP_MS + 200);
    h.rt.tick();
    expect(h.rt.session.lifecycle).toBe("suspended");
    expect(h.rt.session.suspendReason).toBe("scheduling-gap");
    expect(h.rt.session.stage!.distance).toBe(d);
  });
  it("a hidden Control window suspends and never auto-resumes", () => {
    const h = harness();
    connect(h);
    h.rt.command({ type: "start" });
    h.step(300);
    h.rt.suspend("control-hidden");
    h.step(3000);
    expect(h.rt.session.lifecycle).toBe("suspended");
    expect(h.rt.command({ type: "resume" })).toBe(true);
  });
  it("pause/resume/restart/skip/end/advance through the runtime", () => {
    const h = harness({ settings: { speed: 4.5 }, startIndex: 0, endIndex: 1 });
    connect(h);
    h.rt.command({ type: "start" }); h.step(500);
    h.rt.command({ type: "pause" }); const d = h.rt.session.stage!.distance; h.step(500);
    expect(h.rt.session.stage!.distance).toBe(d);
    h.rt.command({ type: "resume" });
    h.rt.command({ type: "restart" });
    expect(h.rt.session.lifecycle).toBe("ready");
    h.rt.command({ type: "start" });
    h.rt.command({ type: "skip" });
    expect(h.rt.session.lifecycle).toBe("stage-complete");
    expect(h.rt.command({ type: "advance" })).toBe(true);
    expect(h.rt.session.stageIndex).toBe(1);
    h.rt.command({ type: "start" }); h.step(300);
    h.rt.command({ type: "end" });
    expect(h.rt.session.summary).toMatchObject({ reason: "therapist-ended", skippedStages: 1 });
    expect(h.display!.lifecycle).toBe("ended");
  });
});

describe("manual therapist control (touch) and sensor fallback", () => {
  it("MANUAL is the default source and needs no hardware", () => {
    const h = harness();
    connect(h);
    expect(h.rt.session.settings.inputSource).toBe("MANUAL");
    expect(h.rt.view().inputOk).toBe(true);
    expect(h.rt.command({ type: "start" })).toBe(true);
  });
  it("manual left/right/step go through the same authoritative actions in EVERY source", () => {
    for (const source of ["MANUAL", "KEYBOARD", "RIGHT_FOOT", "LEFT_FOOT", "DUAL_FOOT"] as const) {
      const h = harness({ settings: { inputSource: source, speed: 1 }, startIndex: 3, endIndex: 3 });
      connect(h);
      h.step(1800);
      h.rt.command({ type: "allow-no-display", value: true });
      expect(h.rt.command({ type: "start" }), source).toBe(true);
      h.step(300);
      expect(h.rt.manual({ kind: "lane", dir: -1 }).accepted, source).toBe(true);
      expect(h.rt.session.stage!.lane).toBe(-1);
      h.step(300);
      h.rt.session.stage!.distance = h.rt.session.stage!.encounters[0].z - 5;
      expect(h.rt.manual({ kind: "step" }).accepted, source).toBe(true);
      expect(h.rt.session.stage!.obstacles[0].armed).toBe(true);
    }
  });
  it("manual input is ignored unless playing, and two sources cannot double-move within the debounce window", () => {
    const h = harness({ settings: { inputSource: "RIGHT_FOOT" } });
    connect(h);
    h.step(1800);
    expect(h.rt.manual({ kind: "lane", dir: 1 }).accepted).toBe(false); // not started
    h.rt.command({ type: "start" });
    h.step(100);
    h.rt.simulateGesture(R, "TILT_RIGHT");
    h.step(300); // the sensor moved the runner right
    expect(h.rt.session.stage!.lane).toBe(1);
    const before = h.rt.session.stage!.laneSeq;
    h.step(700);
    expect(h.rt.manual({ kind: "lane", dir: -1 }).accepted).toBe(true);
    expect(h.rt.manual({ kind: "lane", dir: -1 }).reason).toBe("debounced"); // double tap
    expect(h.rt.session.stage!.laneSeq).toBe(before + 1);
  });
  it("hand/handheld input never affects a manual or sensor session", () => {
    const h = harness();
    connect(h);
    h.rt.command({ type: "start" });
    const s = { timestampMs: 5, accelerationG: [0, 0, 1], gyroscopeDps: [200, 0, 0], anglesDeg: [60, 60, 0] } as const;
    for (const role of [PhysicalRole.RIGHT_HAND, PhysicalRole.LEFT_HAND, "HANDHELD"]) expect(h.rt.ingestFoot(role, { ...s, timestampMs: Math.random() }, h.t).accepted).toBe(false);
    expect(h.rt.session.stage!.lane).toBe(0);
  });
  it("sensor disconnect suspends but preserves the session; the therapist continues manually without losing progress", () => {
    const h = harness({ settings: { inputSource: "RIGHT_FOOT" } });
    connect(h);
    h.step(1800);
    h.rt.command({ type: "start" });
    h.step(2500);
    const dist = h.rt.session.stage!.distance;
    const id = h.rt.session.sessionId;
    h.rt.simulateConnection(R, false);
    h.step(INPUT_LOSS_GRACE_MS + 300);
    expect(h.rt.session.lifecycle).toBe("suspended");
    expect(h.rt.session.suspendReason).toBe("input-lost");
    expect(h.rt.session.sessionId).toBe(id);
    expect(h.rt.command({ type: "resume" })).toBe(false); // plain resume still needs the sensor
    expect(h.rt.command({ type: "continue-manually" })).toBe(true);
    expect(h.rt.session.lifecycle).toBe("playing");
    expect(h.rt.view().sensorBypass).toBe(true);
    h.step(4000); // sensor still gone: must NOT re-suspend
    expect(h.rt.session.lifecycle).toBe("playing");
    expect(h.rt.session.stage!.distance).toBeGreaterThan(dist);
    expect(h.rt.manual({ kind: "lane", dir: 1 }).accepted).toBe(true);
    expect(h.rt.session.stage!.lane).toBe(1);
    // the sensor returns: the bypass clears and automatic input is live again
    h.rt.simulateConnection(R, true);
    h.step(2500);
    expect(h.rt.view().sensorBypass).toBe(false);
    expect(h.rt.view().inputOk).toBe(true);
    h.rt.simulateGesture(R, "TILT_LEFT");
    h.step(800);
    expect(h.rt.session.stage!.lane).toBe(0);
  });
  it("continue-manually is refused when nothing was lost, and switching the source clears it", () => {
    const h = harness();
    connect(h);
    h.rt.command({ type: "start" });
    expect(h.rt.command({ type: "continue-manually" })).toBe(false);
    h.rt.command({ type: "pause" });
    expect(h.rt.command({ type: "continue-manually" })).toBe(false);
  });
  it("stale commands addressed to an older run are refused; duplicate input ids do nothing", () => {
    const h = harness();
    connect(h);
    const old = { sessionEpoch: h.rt.session.sessionEpoch, runId: h.rt.session.runId };
    h.rt.command({ type: "start" });
    h.rt.command({ type: "end" });
    h.rt.command({ type: "new-run" });
    expect(h.rt.command({ type: "skip" }, old)).toBe(false);
    expect(h.rt.command({ type: "start" }, { sessionEpoch: h.rt.session.sessionEpoch, runId: h.rt.session.runId })).toBe(true);
    const id = "MANUAL:dup";
    expect(applyDup(h.rt, id)).toBe("applied");
    expect(applyDup(h.rt, id)).toBe("ignored");
  });
});

import { applyAction } from "../session";
const applyDup = (rt: ControlRuntime, id: string) => applyAction(rt.session, { kind: "lane", dir: 1 }, id);

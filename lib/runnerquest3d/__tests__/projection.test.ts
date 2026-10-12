import { describe, expect, it } from "vitest";
import { ControlRuntime } from "../controlRuntime";
import { PROTOCOL_VERSION, type Message } from "../protocol";
import { DisplayReplica } from "../replica";

/** Control + a Display replica that only hears state changes and a ~1 Hz clock (the Firebase cadence). */
function rig(settings = {}, stage = 4, idle = false) {
  let t = 1000;
  const replica = new DisplayReplica(2600);
  let clocks = 0;
  const rt = new ControlRuntime({
    now: () => t, wall: () => 1_700_000_000_000 + t, ownerId: "o", newId: (() => { let n = 0; return () => `i${++n}`; })(), seed: 5, startIndex: stage, endIndex: stage,
    settings: { speed: 3, ...settings },
    send: (m: Message) => { if (m.type === "clock" && ++clocks % 8 !== 0) return; replica.accept(m, t); },
  });
  rt.command({ type: "allow-no-display", value: true });
  rt.command({ type: "start" });
  let maxErr = 0, overshoot = 0;
  const step = (ms: number) => {
    for (let i = 0; i < ms; i += 16) {
      t += 16;
      rt.tick();
      const st = rt.session.stage!;
      if (!idle && st.holding) {
        const k = st.encounters.findIndex((e, j) => !st.obstacles[j].resolved && e.z >= st.distance && e.kind !== "checkpoint" && e.kind !== "marker");
        const e = st.encounters[k];
        if (e.kind === "hurdle") rt.manual({ kind: "step" });
        else { const free = [-1, 0, 1].filter((l) => !e.lanes.includes(l as -1)); const g = free.reduce((a, b) => (Math.abs(a - st.lane) <= Math.abs(b - st.lane) ? a : b)); rt.manual({ kind: "lane", dir: g < st.lane ? -1 : 1 }); }
      }
      if (replica.state && rt.session.lifecycle === "playing") {
        const d = replica.distance(t);
        maxErr = Math.max(maxErr, Math.abs(d - st.distance));
        overshoot = Math.max(overshoot, d - st.distance);
      }
    }
  };
  return { rt, replica, step, get err() { return maxErr; }, get overshoot() { return overshoot; }, get t() { return t; } };
}

describe("Display projection from a 1 Hz clock", () => {
  it("tracks Control closely while the child plays normally", () => {
    const r = rig();
    r.step(60000);
    expect(r.rt.session.results.length + (r.rt.session.stage!.distance > 20 ? 1 : 0)).toBeGreaterThan(0);
    expect(r.err).toBeLessThan(2.2); // metres, at 3 m/s with one sample per second
  });
  it("never runs past the point where Control holds the runner (idle child)", () => {
    const r = rig({ speed: 4.5 }, 0, true);
    r.step(50000);
    const st = r.rt.session.stage!;
    expect(st.holding).toBe(true);
    expect(r.overshoot).toBeLessThan(0.9);
    expect(r.replica.distance(r.t)).toBeLessThanOrEqual(st.distance + 0.05);
  });
  it("stops at the pause-before-obstacle line too", () => {
    const r = rig({ speed: 4.5, pauseBeforeObstacle: true }, 3, true);
    r.step(40000);
    expect(r.overshoot).toBeLessThan(0.9);
  });
  it("freezes while paused and does not extrapolate beyond the cap when Control goes silent", () => {
    const r = rig();
    r.step(3000);
    r.rt.command({ type: "pause" });
    r.step(500);
    const d = r.replica.distance(r.t);
    expect(r.replica.distance(r.t + 10000)).toBe(d);
    r.rt.command({ type: "resume" });
    r.step(300);
    const d2 = r.replica.distance(r.t);
    expect(r.replica.distance(r.t + 60000) - d2).toBeLessThan(3 * 2.7 + 0.1);
  });
});

describe("protocol extras", () => {
  it("state messages carry the settings the projection needs and reject invalid ones", async () => {
    const { parseMessage } = await import("../protocol");
    const r = rig();
    r.step(200);
    const m = { v: PROTOCOL_VERSION, ...({} as object) };
    void m;
    const st = { ...r.replica.state! };
    expect(st.targetSpeed).toBe(3);
    expect(st.pauseBeforeObstacle).toBe(false);
    const msg = { v: 1, type: "state", ownerId: "o", ownerStartedAt: 1, sessionId: "s", sessionEpoch: 1, runId: 0, revision: 1, sentAtMs: 1, state: st };
    expect(parseMessage(msg)).not.toBeNull();
    expect(parseMessage({ ...msg, state: { ...st, targetSpeed: 99 } })).toBeNull();
    expect(parseMessage({ ...msg, state: { ...st, pauseBeforeObstacle: "yes" } })).toBeNull();
  });
});

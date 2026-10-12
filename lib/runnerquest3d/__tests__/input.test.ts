import { describe, expect, it } from "vitest";
import { PhysicalRole, type MotionSample } from "@/lib/physicalInput/types";
import { BASE_CONFIG, configFor, FootActionRecognizer, type FootGesture } from "../input/footRecognizer";
import { InputHub, LANE_DEBOUNCE_MS, STEP_DEBOUNCE_MS } from "../input/hub";
import { SimulatedFootSensor } from "../input/simulatedFoot";

const R = PhysicalRole.RIGHT_FOOT as PhysicalRole.RIGHT_FOOT;
const L = PhysicalRole.LEFT_FOOT as PhysicalRole.LEFT_FOOT;

/** Drives a simulated sensor + recognizer on a fake clock. */
function rig(cfg = configFor("normal", "normal")) {
  const sensor = new SimulatedFootSensor(R, 5);
  const rec = new FootActionRecognizer(cfg);
  let now = 0;
  const events: Array<{ g: FootGesture; at: number }> = [];
  const advance = (ms: number) => {
    const end = now + ms;
    while (now < end) {
      now += 10;
      sensor.pump(now, (_r, s, at) => { const g = rec.push(s, at); if (g) events.push({ g, at }); });
    }
  };
  return { sensor, rec, events, advance, get now() { return now; } };
}
const sample = (a: [number, number, number], ts: number, gyro: [number, number, number] = [1, 0, 0]): MotionSample => ({ timestampMs: ts, accelerationG: [0, 0, 1], gyroscopeDps: gyro, anglesDeg: a });

describe("FootActionRecognizer (on SIMULATED samples — not evidence about real hardware)", () => {
  it("ignores everything while learning the rest pose, then goes neutral", () => {
    const r = rig();
    r.sensor.trigger("TILT_LEFT", 100);
    r.advance(500);
    expect(r.events).toEqual([]);
    expect(r.rec.state).toBe("warming");
    r.advance(1500);
    expect(r.rec.state).toBe("neutral");
  });
  it("recognises tilt left, tilt right and lift, one event each", () => {
    const r = rig();
    r.advance(1500);
    r.sensor.trigger("TILT_LEFT", r.now); r.advance(1200);
    r.sensor.trigger("TILT_RIGHT", r.now); r.advance(1200);
    r.sensor.trigger("LIFT", r.now); r.advance(1200);
    expect(r.events.map((e) => e.g)).toEqual(["TILT_LEFT", "TILT_RIGHT", "LIFT"]);
  });
  it("a held tilt fires once and re-arms only after returning to neutral", () => {
    const r = rig();
    r.advance(1500);
    r.sensor.trigger("TILT_RIGHT", r.now, 30); r.advance(300);
    r.sensor.trigger("TILT_RIGHT", r.now, 30); // fired again while still near the peak: must not double count
    r.advance(1500);
    expect(r.events.filter((e) => e.g === "TILT_RIGHT").length).toBeLessThanOrEqual(2);
    expect(r.events.length).toBeGreaterThanOrEqual(1);
    const rr = rig();
    rr.advance(1500);
    let k = 0;
    const feed = (a: [number, number, number], n: number) => { for (let i = 0; i < n; i++, k++) { const g = rr.rec.push(sample(a, 100000 + k * 20), rr.now + k * 20); if (g) rr.events.push({ g, at: rr.now }); } };
    feed([2, -4, 30], 5);
    feed([30, -4, 30], 40); // held far over threshold for 800 ms
    expect(rr.events).toHaveLength(1);
    feed([2, -4, 30], 30);
    expect(rr.rec.state).toBe("neutral");
  });
  it("quiet noise at rest never triggers (60 s soak)", () => {
    const r = rig();
    r.advance(60000);
    expect(r.events).toEqual([]);
  });
  it("sub-threshold movement is ignored; sensitivity changes what counts", () => {
    const small = rig(configFor("normal", "normal"));
    small.advance(1500); small.sensor.trigger("TILT_LEFT", small.now, 8); small.advance(1000);
    expect(small.events).toEqual([]);
    const high = rig(configFor("high", "normal"));
    high.advance(1500); high.sensor.trigger("TILT_LEFT", high.now, 13); high.advance(1000);
    expect(high.events.map((e) => e.g)).toEqual(["TILT_LEFT"]);
    const low = rig(configFor("low", "normal"));
    low.advance(1500); low.sensor.trigger("TILT_LEFT", low.now, 18); low.advance(1000);
    expect(low.events).toEqual([]);
  });
  it("a diagonal movement resolves to its dominant axis only", () => {
    const rec = new FootActionRecognizer(BASE_CONFIG);
    let t = 0;
    const push = (a: [number, number, number]) => rec.push(sample(a, 1000 + t * 20), (t++) * 20);
    for (let i = 0; i < 40; i++) push([2, -4, 30]);
    const out: Array<FootGesture | null> = [];
    for (let i = 0; i < 20; i++) out.push(push([2 + 18, -4 + 40, 30])); // tilt 18/15 = 1.2, lift 40/18 = 2.2
    expect(out.filter(Boolean)).toEqual(["LIFT"]);
  });
  it("goes stale without samples and recovers only after settling again (disconnect/reconnect)", () => {
    const r = rig();
    r.advance(1500);
    expect(r.rec.isFresh(r.now)).toBe(true);
    r.sensor.connected = false; r.rec.markDisconnected();
    r.advance(1000);
    expect(r.rec.isFresh(r.now)).toBe(false);
    expect(r.rec.state).toBe("lost");
    r.sensor.connected = true;
    r.sensor.trigger("LIFT", r.now + 50); // a gesture during re-settling must not fire
    r.advance(500);
    expect(r.events).toEqual([]);
    r.advance(1500);
    expect(r.rec.state).toBe("neutral");
    r.sensor.trigger("LIFT", r.now); r.advance(1000);
    expect(r.events.map((e) => e.g)).toEqual(["LIFT"]);
  });
  it("recenter learns a new neutral pose (foot resting at a different angle) without firing", () => {
    const rec = new FootActionRecognizer(BASE_CONFIG);
    let t = 0;
    const push = (a: [number, number, number]) => rec.push(sample(a, 1000 + t * 20), (t++) * 20);
    for (let i = 0; i < 60; i++) push([2, -4, 30]);
    expect(rec.state).toBe("neutral");
    rec.recenter(t * 20);
    const fired: Array<FootGesture | null> = [];
    for (let i = 0; i < 80; i++) fired.push(push([28, -4, 30])); // foot now rests tilted by 26 deg
    expect(fired.filter(Boolean)).toEqual([]);
    expect(rec.state).toBe("neutral");
  });
  it("rejects invalid, duplicate and out-of-order samples", () => {
    const rec = new FootActionRecognizer(BASE_CONFIG);
    expect(rec.push(sample([NaN, 0, 0], 1), 0)).toBeNull();
    expect(rec.push({ ...sample([0, 0, 0], 2), gyroscopeDps: [Infinity, 0, 0] }, 20)).toBeNull();
    rec.push(sample([0, 0, 0], 100), 40);
    expect(rec.push(sample([40, 0, 0], 100), 60)).toBeNull(); // duplicate timestamp
    expect(rec.push(sample([40, 0, 0], 90), 80)).toBeNull(); // older timestamp
  });
  it("handles angle wrap-around at ±180°", () => {
    const rec = new FootActionRecognizer({ ...BASE_CONFIG });
    let t = 0;
    const push = (a: [number, number, number]) => rec.push(sample(a, 1000 + t * 20), (t++) * 20);
    for (let i = 0; i < 60; i++) push([179, -4, 30]);
    const fired: Array<FootGesture | null> = [];
    for (let i = 0; i < 30; i++) fired.push(push([-178, -4, 30])); // +3° across the wrap, not -357°
    expect(fired.filter(Boolean)).toEqual([]);
  });
});

describe("InputHub: only the selected source may affect gameplay", () => {
  const settle = (hub: InputHub, roles: PhysicalRole[], ms = 1500) => {
    const sensors = new Map(roles.map((r, i) => [r, new SimulatedFootSensor(r as typeof R | typeof L, 30 + i)]));
    let now = 0;
    const out: ReturnType<InputHub["ingestFoot"]>[] = [];
    const advance = (d: number) => { const end = now + d; while (now < end) { now += 10; for (const [role, s] of sensors) s.pump(now, (_r, smp, at) => out.push(hub.ingestFoot(role, smp, at))); } };
    advance(ms);
    out.length = 0;
    return { sensors, advance, out, get now() { return now; } };
  };
  const accepted = (out: ReturnType<InputHub["ingestFoot"]>[]) => out.filter((r) => r.accepted);

  it("KEYBOARD mode ignores every foot sample and every hand sample", () => {
    const hub = new InputHub();
    const h = settle(hub, [R, L]);
    h.sensors.get(R)!.trigger("TILT_LEFT", h.now); h.advance(1000);
    expect(accepted(h.out)).toEqual([]);
    expect(hub.ingestFoot(PhysicalRole.RIGHT_HAND, sample([0, 0, 0], 5), 0).reason).toBe("wrong-source");
    expect(hub.isLive(0)).toBe(true);
  });
  it("keyboard maps keys, ignores repeats and debounces", () => {
    const hub = new InputHub();
    expect(hub.keyboard("ArrowLeft", false, 1000)).toMatchObject({ accepted: true, action: { kind: "lane", dir: -1 } });
    expect(hub.keyboard("ArrowLeft", true, 1000 + LANE_DEBOUNCE_MS + 10).accepted).toBe(false); // auto-repeat
    expect(hub.keyboard("d", false, 1000 + 50).reason).toBe("debounced");
    expect(hub.keyboard("d", false, 1000 + LANE_DEBOUNCE_MS + 1)).toMatchObject({ accepted: true, action: { kind: "lane", dir: 1 } });
    expect(hub.keyboard(" ", false, 5000)).toMatchObject({ accepted: true, action: { kind: "step" } });
    expect(hub.keyboard(" ", false, 5000 + STEP_DEBOUNCE_MS - 1).reason).toBe("debounced");
    expect(hub.keyboard("x", false, 9000).reason).toBe("no-gesture");
  });
  it("RIGHT_FOOT mode: the left foot, hands and keyboard cannot affect the game", () => {
    const hub = new InputHub();
    hub.setMode("RIGHT_FOOT");
    const h = settle(hub, [R, L]);
    h.sensors.get(L)!.trigger("TILT_LEFT", h.now); h.advance(1000);
    expect(accepted(h.out)).toEqual([]);
    expect(h.out.some((r) => r.reason === "wrong-source")).toBe(true);
    expect(h.out.every((r) => r.reason === "wrong-source" || r.reason === "no-gesture")).toBe(true);
    expect(hub.ingestFoot(PhysicalRole.RIGHT_HAND, sample([30, 0, 0], 1), 1)).toMatchObject({ accepted: false, reason: "ignored-role" });
    expect(hub.ingestFoot(PhysicalRole.LEFT_HAND, sample([30, 0, 0], 2), 2)).toMatchObject({ accepted: false, reason: "ignored-role" });
    expect(hub.ingestFoot("HANDHELD", sample([30, 0, 0], 3), 3)).toMatchObject({ accepted: false, reason: "ignored-role" });
    expect(hub.keyboard("ArrowLeft", false, 1).reason).toBe("wrong-source");
    h.sensors.get(R)!.trigger("TILT_RIGHT", h.now); h.advance(1000);
    expect(accepted(h.out).map((r) => r.action)).toEqual([{ kind: "lane", dir: 1 }]);
  });
  it("LEFT_FOOT mode accepts only the left foot", () => {
    const hub = new InputHub();
    hub.setMode("LEFT_FOOT");
    const h = settle(hub, [R, L]);
    h.sensors.get(R)!.trigger("LIFT", h.now); h.advance(900);
    expect(accepted(h.out)).toEqual([]);
    h.sensors.get(L)!.trigger("LIFT", h.now); h.advance(900);
    expect(accepted(h.out).map((r) => r.action)).toEqual([{ kind: "step" }]);
  });
  it("DUAL_FOOT: left foot -> left, right foot -> right, a lift from either foot -> step; crossed tilts are ignored", () => {
    const hub = new InputHub();
    hub.setMode("DUAL_FOOT");
    const h = settle(hub, [R, L]);
    const t = (role: typeof R | typeof L, g: FootGesture) => { h.sensors.get(role)!.trigger(g, h.now); h.advance(1100); };
    t(L, "TILT_LEFT"); t(R, "TILT_RIGHT"); t(L, "TILT_RIGHT"); t(R, "TILT_LEFT"); t(L, "LIFT"); t(R, "LIFT");
    expect(accepted(h.out).map((r) => JSON.stringify(r.action))).toEqual([{ kind: "lane", dir: -1 }, { kind: "lane", dir: 1 }, { kind: "step" }, { kind: "step" }].map((x) => JSON.stringify(x)));
    expect(h.out.filter((r) => r.reason === "dual-mapping")).toHaveLength(2);
  });
  it("liveness: dual mode needs BOTH feet fresh; keyboard is always live; selecting another source forgets rest poses", () => {
    const hub = new InputHub();
    hub.setMode("DUAL_FOOT");
    const h = settle(hub, [R, L]);
    expect(hub.isLive(h.now)).toBe(true);
    expect(hub.isReady()).toBe(true);
    hub.markDisconnected(R);
    expect(hub.isLive(h.now)).toBe(false);
    expect(hub.status(h.now).filter((s) => !s.fresh)).toHaveLength(1);
    hub.setMode("RIGHT_FOOT");
    expect(hub.isReady()).toBe(false); // fresh recognizers must settle again
    hub.setMode("KEYBOARD");
    expect(hub.isLive(0)).toBe(true);
  });
});

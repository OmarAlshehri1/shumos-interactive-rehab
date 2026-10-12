import { afterEach, describe, expect, it, vi } from "vitest";
import { PrototypeFlightInput } from "../prototypeInput";
import { PrototypeSimulation } from "../simulation";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function setup() {
  let now = 1000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  vi.spyOn(performance, "now").mockImplementation(() => now);
  class Channel { onmessage = null; close = vi.fn(); }
  const browser = Object.assign(new EventTarget(), { BroadcastChannel: Channel });
  vi.stubGlobal("window", browser); vi.stubGlobal("BroadcastChannel", Channel);
  const canvas = new EventTarget();
  const input = new PrototypeFlightInput(canvas as HTMLCanvasElement);
  const key = (code: string, type = "keydown") => canvas.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { code }));
  const send = (seq: number, x = 0.5, y = 0.5) => input.sensor.accept({ role: "RIGHT_HAND", visible: true, x, y, seq, sentAtMs: now });
  return { input, key, send, advance: () => { now += 20; } };
}

describe("exclusive prototype input modes", () => {
  it("clears held keys and cached sensor input on mode changes without snapping", () => {
    const { input, key, send, advance } = setup(); input.resume(); key("ArrowRight");
    const held = { ...input.sample(0.1)! }; expect(held.x).toBeGreaterThan(0.5);
    input.select("sensor"); expect(input.sample(0.1)).toBeNull();
    send(1); expect(input.sample(0.1)).toBeNull();
    advance(); send(2, held.x, held.y); expect(input.sample(0.1)).toEqual(held);
    key("ArrowLeft"); expect(input.sample(0.1)).toEqual(held);
    input.select("keyboard"); expect(input.sample(0.1)).toEqual(held);
    expect(send(3, 0.8)).toBe(false); key("ArrowLeft"); expect(input.sample(0.1)!.x).toBeLessThan(held.x);
    input.dispose();
  });

  it("freezes while paused, requires new sensor input on resume, and rearms after restart", () => {
    const { input, send, advance } = setup(); const sim = new PrototypeSimulation();
    sim.start(); input.select("sensor"); input.resume(); send(1); advance(); send(2, 0.7); sim.step(0.02, input.sample(0.02));
    expect(sim.ship.x).toBeCloseTo(1.92);
    sim.pause(); input.pause(); advance(); send(3, 0.5); sim.step(0.02, input.sample(0.02));
    expect(sim.ship.x).toBeCloseTo(1.92);
    sim.resume(); input.resume(); expect(input.sample(0.02)).toBeNull();
    advance(); send(4, 0.7); sim.step(0.02, input.sample(0.02)); expect(sim.ship.x).toBeCloseTo(1.92);
    input.reset(); sim.restart(); expect(input.sample(0.02)).toBeNull();
    advance(); send(5); sim.step(0.02, input.sample(0.02)); expect(sim.ship.x).toBe(0);
    input.dispose();
  });

  it("holds flight position while objects continue safely on input loss", () => {
    const sim = new PrototypeSimulation(); sim.start(); sim.step(0.02, { x: 0.8, y: 0.2 });
    const x = sim.ship.x, y = sim.ship.y, z = sim.objects[0].z;
    sim.step(0.02, null); expect(sim.ship.x).toBe(x); expect(sim.ship.y).toBe(y); expect(sim.objects[0].z).toBeGreaterThan(z);
  });
});

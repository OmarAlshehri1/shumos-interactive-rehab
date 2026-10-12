import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocalPointerMessage } from "@/lib/display/LocalPointerChannel";
import { RightHandFlightInput, SENSOR_STALE_MS, subscribeToRightHandFlightInput } from "../sensorInput";
import { FLIGHT_HALF_HEIGHT, FLIGHT_HALF_WIDTH, PrototypeSimulation } from "../simulation";

afterEach(() => vi.unstubAllGlobals());

function setup(position = { x: 0.5, y: 0.5 }) {
  let now = 1000;
  const input = new RightHandFlightInput(() => now, () => now);
  input.activate(position);
  const send = (seq: number, x = 0.5, y = 0.5, patch: Partial<LocalPointerMessage> = {}) => input.accept({ role: "RIGHT_HAND", visible: true, x, y, seq, sentAtMs: now, ...patch });
  return { input, send, advance: (delta = 20) => { now += delta; } };
}

describe("existing RIGHT_HAND transport adapter", () => {
  it("maps normalized center to the centered ship", () => {
    const { input, send } = setup();
    const sim = new PrototypeSimulation(); sim.start();
    send(1); sim.step(0.02, input.sample()); expect(sim.ship.x).toBe(0); expect(sim.ship.y).toBe(0);
  });

  it.each([[0.2, 0.5, -2.88, 0], [0.8, 0.5, 2.88, 0], [0.5, 0.2, 0, 1.68], [0.5, 0.8, 0, -1.68]])("directly maps (%s, %s) to the ship", (x, y, worldX, worldY) => {
    const { input, send, advance } = setup();
    send(1); advance(); send(2, x, y);
    const sim = new PrototypeSimulation(); sim.start(); sim.step(0.02, input.sample());
    expect(sim.ship.x).toBeCloseTo(worldX); expect(sim.ship.y).toBeCloseTo(worldY);
  });

  it.each([[1.2, -0.2, FLIGHT_HALF_WIDTH, FLIGHT_HALF_HEIGHT], [-0.2, 1.2, -FLIGHT_HALF_WIDTH, -FLIGHT_HALF_HEIGHT]])("clamps finite boundary input (%s, %s)", (x, y, worldX, worldY) => {
    const { input, send } = setup({ x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) });
    send(1, x, y); const sim = new PrototypeSimulation(); sim.start(); sim.step(0.02, input.sample());
    expect(sim.ship.x).toBe(worldX); expect(sim.ship.y).toBe(worldY);
  });

  it("rejects missing, non-finite, malformed and foreign-role input", () => {
    const { input, send } = setup();
    expect(input.sample()).toBeNull();
    expect(send(1, 0.9, 0.1, { role: "LEFT_HAND" })).toBe(false);
    expect(input.status).toBe("waiting");
    expect(send(1)).toBe(true);
    for (const raw of [null, {}, { role: "RIGHT_HAND" }, { role: "RIGHT_HAND", seq: NaN }]) {
      expect(input.accept(raw)).toBe(false); expect(input.sample()).toBeNull();
    }
    expect(send(2, NaN)).toBe(false); expect(send(3, 0.5, Infinity)).toBe(false);
    expect(send(4, 0.5, 0.5, { seq: 1.5 })).toBe(false);
  });

  it("rejects duplicates, reversed sequence, expired and future messages", () => {
    const { input, send, advance } = setup(); send(10); advance();
    expect(send(9, 0.7)).toBe(false); expect(send(10, 0.7)).toBe(false);
    expect(send(11, 0.7, 0.5, { sentAtMs: 1 })).toBe(false);
    expect(send(11, 0.7, 0.5, { sentAtMs: 2000 })).toBe(false);
    expect(input.sample()).toEqual({ x: 0.5, y: 0.5 });
  });

  it("holds on visibility loss and requires fresh aligned recovery", () => {
    const { input, send, advance } = setup(); send(1); advance(); send(2, 0.7, 0.5);
    input.notePosition(input.sample()!); advance(); send(3, 0, 0, { visible: false });
    expect(input.sample()).toBeNull(); expect(input.status).toBe("unavailable");
    advance(); send(4); expect(input.sample()).toBeNull(); expect(input.status).toBe("align");
    advance(); send(5, 0.7); expect(input.sample()).toEqual({ x: 0.7, y: 0.5 });
  });

  it("expires silence and accepts a fresh publisher sequence restart", () => {
    const { input, send, advance } = setup(); send(200);
    advance(SENSOR_STALE_MS + 1); expect(input.sample()).toBeNull(); expect(input.status).toBe("stale");
    expect(send(1, 0, 0, { visible: false })).toBe(true); advance();
    expect(send(2)).toBe(true); expect(input.sample()).toEqual({ x: 0.5, y: 0.5 });
    expect(send(300, 0.9, 0.5, { sentAtMs: 1000 })).toBe(false);
  });

  it("safely reacquires a restarted publisher even when its invisible packet was missed", () => {
    const { input, send, advance } = setup(); send(200); advance(300);
    expect(send(2)).toBe(true); expect(input.status).toBe("tracking");
  });

  it("rearms at held position for discontinuities and explicit recenter preparation", () => {
    const { input, send, advance } = setup({ x: 0.9, y: 0.5 }); send(1, 0.9); input.notePosition(input.sample()!);
    advance(); send(2, 0.1); expect(input.sample()).toBeNull(); expect(input.status).toBe("discontinuity");
    advance(); send(3, 0.9); expect(input.sample()).toEqual({ x: 0.9, y: 0.5 });
    input.rearm({ x: 0.9, y: 0.5 }); expect(input.sample()).toBeNull();
    advance(); send(4, 0.5); expect(input.sample()).toBeNull();
  });

  it("stops accepting packets after disposal", () => {
    const { input, send } = setup(); send(1); input.dispose(); expect(send(2)).toBe(false); expect(input.sample()).toBeNull();
  });

  it("subscribes using the unchanged channel and closes the subscription", () => {
    const channels: FakeChannel[] = [];
    class FakeChannel {
      onmessage: ((event: { data: unknown }) => void) | null = null;
      close = vi.fn();
      constructor(readonly name: string) { channels.push(this); }
    }
    vi.stubGlobal("window", { BroadcastChannel: FakeChannel }); vi.stubGlobal("BroadcastChannel", FakeChannel);
    const { input } = setup(); const unsubscribe = subscribeToRightHandFlightInput(input);
    const channel = channels[0];
    expect(channel.name).toBe("shumos-sensor-pointer");
    channel.onmessage!({ data: { role: "RIGHT_HAND", visible: true, x: 0.5, y: 0.5, seq: 1, sentAtMs: 1000 } });
    expect(input.sample()).toEqual({ x: 0.5, y: 0.5 });
    unsubscribe(); expect(channel.onmessage).toBeNull(); expect(channel.close).toHaveBeenCalledOnce();
  });

  it("reports an unsupported local channel without opening Bluetooth", () => {
    vi.stubGlobal("window", {});
    const { input } = setup(); subscribeToRightHandFlightInput(input);
    expect(input.sample()).toBeNull(); expect(input.status).toBe("unsupported");
  });
});

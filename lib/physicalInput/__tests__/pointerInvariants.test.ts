import { describe, expect, it } from "vitest";
import { ContinuousMotionController, type ContinuousMotionConfig } from "../ContinuousMotionController";
import type { MotionSample } from "../types";

/**
 * MANDATORY TEST E — "hard pointer visibility invariant." While the
 * controller has ever produced a pointer, pointer.x/pointer.y must ALWAYS
 * satisfy 0 <= value <= 1 and be finite (SensorHandCursor's visibility-inset
 * math — see that component's doc comment — depends on this being a real,
 * structural guarantee, not something each renderer must re-clamp itself).
 *
 * This is a deterministic pseudo-random stress test (fixed seed) rather than
 * a handful of hand-picked directions, specifically to catch the class of
 * bug this file's sibling suite (edge saturation / immediate reversal) was
 * written against: an internal accumulator that can wander somewhere a
 * hand-picked test wouldn't think to check.
 */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sample(gyroscopeDps: readonly [number, number, number], timestampMs: number): MotionSample {
  return { timestampMs, accelerationG: [0, 0, 1], gyroscopeDps, anglesDeg: [0, 0, 0] };
}

const CONFIG: Partial<ContinuousMotionConfig> = { invertX: false, invertY: false, deadZoneDeg: 1.25, smoothing: 0.35, sensitivity: 1 };

describe("pointer visibility invariant (mandatory test E)", () => {
  it("never produces an out-of-range or non-finite pointer across a long randomized session (holds, reversals, saturation, fast/slow/tiny motion, twist)", () => {
    const controller = new ContinuousMotionController(CONFIG);
    controller.observe(sample([0, 0, 0], 0));
    expect(controller.recenter()).toBe(true);

    const random = mulberry32(20260904);
    let timestampMs = 0;
    for (let step = 0; step < 5000; step += 1) {
      timestampMs += 20; // 50Hz cadence
      // A mixture of magnitudes so the walk regularly saturates every edge, tiny-jitters near a held
      // position, and twists (gyroscopeDps[0]) — the same shapes the real product complaints describe.
      const magnitude = random() < 0.15 ? 400 : random() < 0.5 ? 80 : 2;
      const twistDps = (random() * 2 - 1) * (random() < 0.1 ? 300 : 2);
      const pitchDps = (random() * 2 - 1) * magnitude;
      const yawDps = (random() * 2 - 1) * magnitude;
      const pointer = controller.observe(sample([twistDps, pitchDps, yawDps], timestampMs));
      if (!pointer) continue;
      expect(Number.isFinite(pointer.pointer.x)).toBe(true);
      expect(Number.isFinite(pointer.pointer.y)).toBe(true);
      expect(pointer.pointer.x).toBeGreaterThanOrEqual(0);
      expect(pointer.pointer.x).toBeLessThanOrEqual(1);
      expect(pointer.pointer.y).toBeGreaterThanOrEqual(0);
      expect(pointer.pointer.y).toBeLessThanOrEqual(1);
    }
  });

  it("stays in range immediately after a mid-session recenter, and after a reconnect (invalidate + re-center)", () => {
    const controller = new ContinuousMotionController(CONFIG);
    controller.observe(sample([0, 0, 0], 0));
    controller.recenter();
    for (let step = 1; step <= 50; step += 1) controller.observe(sample([0, 0, 60], step * 20));
    expect(controller.recenter()).toBe(true);
    const afterRecenter = controller.currentPointer!;
    expect(afterRecenter.pointer.x).toBe(0.5);
    expect(afterRecenter.pointer.y).toBe(0.5);

    controller.invalidate();
    expect(controller.currentPointer).toBeNull();
    controller.observe(sample([0, 0, 0], 2000));
    expect(controller.recenter()).toBe(true);
    const afterReconnect = controller.currentPointer!;
    expect(afterReconnect.pointer.x).toBeGreaterThanOrEqual(0);
    expect(afterReconnect.pointer.x).toBeLessThanOrEqual(1);
  });
});

import { describe, expect, it } from "vitest";
import { INTENT_WINDOW_MS, MotionIntentGate } from "../MotionFilters";

const STEP_MS = 20; // 50Hz

describe("MotionIntentGate", () => {
  it("keeps the pointer calm under oscillating micro-jitter that cancels itself out, once the window has enough history to tell", () => {
    const gate = new MotionIntentGate();
    gate.reset({ x: 0.5, y: 0.5 });
    let timestampMs = 0;
    let maxDeviation = 0;
    for (let i = 0; i < 40; i += 1) {
      timestampMs += STEP_MS;
      const jitter = i % 2 === 0 ? 0.01 : -0.01;
      const corrected = gate.apply({ x: 0.5 + jitter, y: 0.5 }, timestampMs);
      // Skip the cold-start transient: the first samples pass through near-unfiltered before the window has
      // enough history to detect a reversal at all, and that initial bias then decays over a couple of window
      // lengths (~400ms here) — by design (see INTENT_MIN_GAIN's doc comment), not a bug.
      if (i >= 20) maxDeviation = Math.max(maxDeviation, Math.abs(corrected.x - 0.5));
    }
    expect(maxDeviation).toBeLessThan(0.005);
  });

  it("lets a tiny but consistently-accumulating movement through", () => {
    const gate = new MotionIntentGate();
    gate.reset({ x: 0.5, y: 0.5 });
    let timestampMs = 0;
    let x = 0.5;
    let corrected = { x: 0.5, y: 0.5 };
    for (let i = 0; i < 60; i += 1) {
      timestampMs += STEP_MS;
      x += 0.002; // small, slow, one-directional
      corrected = gate.apply({ x, y: 0.5 }, timestampMs);
    }
    expect(corrected.x).toBeGreaterThan(0.55);
    expect(x - corrected.x).toBeLessThan(0.03); // tracks closely once the window fills with consistent direction
  });

  it("responds immediately to fast deliberate movement, no added lag", () => {
    const gate = new MotionIntentGate();
    gate.reset({ x: 0.5, y: 0.5 });
    const corrected = gate.apply({ x: 0.9, y: 0.5 }, STEP_MS);
    expect(corrected.x).toBeCloseTo(0.9, 6);
  });

  it("resolves a genuine step within roughly the window duration, far under a 10Hz-scale delay", () => {
    const gate = new MotionIntentGate();
    gate.reset({ x: 0.5, y: 0.5 });
    let timestampMs = 0;
    // Warm up on a jittery-but-stationary signal so the gate starts in "suppressing" mode.
    for (let i = 0; i < 10; i += 1) {
      timestampMs += STEP_MS;
      gate.apply({ x: 0.5 + (i % 2 === 0 ? 0.01 : -0.01), y: 0.5 }, timestampMs);
    }
    // A moderate, sustained, one-directional step begins here (below the fast-bypass speed).
    const target = 0.65;
    let resolvedAtMs: number | null = null;
    for (let i = 0; i < 30; i += 1) {
      timestampMs += STEP_MS;
      const corrected = gate.apply({ x: target, y: 0.5 }, timestampMs);
      if (resolvedAtMs === null && Math.abs(corrected.x - target) < 0.015) {
        resolvedAtMs = timestampMs;
      }
    }
    expect(resolvedAtMs).not.toBeNull();
    // Effective delay stays within a small multiple of the window — nowhere near the ~300-500ms a 10Hz-rate
    // heavier filter would need for the same steadiness.
    expect(resolvedAtMs! - (timestampMs - 30 * STEP_MS)).toBeLessThan(INTENT_WINDOW_MS * 2.5);
  });

  it("is inert once a sample is already this position (no motion, nothing to reject)", () => {
    const gate = new MotionIntentGate();
    gate.reset({ x: 0.5, y: 0.5 });
    const corrected = gate.apply({ x: 0.5, y: 0.5 }, STEP_MS);
    expect(corrected).toEqual({ x: 0.5, y: 0.5 });
  });
});

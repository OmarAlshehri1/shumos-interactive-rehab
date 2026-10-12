import { describe, expect, it } from "vitest";
import {
  ContinuousMotionController,
  angularDeltaDeg,
  type ContinuousMotionConfig,
} from "../ContinuousMotionController";
import type { MotionSample } from "../types";

/**
 * The controller is gyro-rate driven (see ContinuousMotionController.ts's
 * class doc comment for why), so tests drive it with gyroscopeDps + real
 * timestamps rather than canned anglesDeg snapshots. anglesDeg only matters
 * at commitCenter() time (the one-time reference-roll de-roll correction).
 */
function sample(
  gyroscopeDps: readonly [number, number, number],
  timestampMs: number,
  anglesDeg: readonly [number, number, number] = [0, 0, 0],
): MotionSample {
  return {
    timestampMs,
    accelerationG: [0, 0, 1],
    gyroscopeDps,
    anglesDeg,
  };
}

/** Deterministic clock for auto-center/drift-correction tests, which gate on this.now() (wall-clock), not on sample.timestampMs. */
function fakeClock(startMs = 0) {
  let ms = startMs;
  return { now: () => ms, advance: (deltaMs: number) => { ms += deltaMs; } };
}

/** Feeds a constant [twist, pitchRate, yawRate] gyro for durationMs in stepMs increments, starting at startMs. */
function feedConstantGyro(
  controller: ContinuousMotionController,
  gyroscopeDps: readonly [number, number, number],
  durationMs: number,
  options: { startMs?: number; stepMs?: number; anglesDeg?: readonly [number, number, number] } = {},
) {
  const stepMs = options.stepMs ?? 20;
  const startMs = options.startMs ?? 0;
  let last: ReturnType<ContinuousMotionController["observe"]> = null;
  for (let elapsed = stepMs; elapsed <= durationMs; elapsed += stepMs) {
    last = controller.observe(sample(gyroscopeDps, startMs + elapsed, options.anglesDeg));
  }
  return last!;
}

const ANALOG_CONFIG: Partial<ContinuousMotionConfig> = {
  invertX: false,
  invertY: false,
  deadZoneDeg: 0,
  smoothing: 0,
  sensitivity: 1,
};

/** Centers immediately (one still sample), then returns the controller ready to be driven by gyro. */
function centered(config: Partial<ContinuousMotionConfig> = {}): ContinuousMotionController {
  const controller = new ContinuousMotionController({ ...ANALOG_CONFIG, ...config });
  controller.observe(sample([0, 0, 0], 0));
  expect(controller.recenter()).toBe(true);
  return controller;
}

describe("ContinuousMotionController", () => {
  it("integrates yaw-rate into horizontal movement and pitch-rate into vertical movement", () => {
    const controller = centered();
    // 10 deg/s of yaw-rate and pitch-rate for 1000ms => ~10deg of aim change on each axis.
    const pointer = feedConstantGyro(controller, [0, 10, 10], 1000)!;
    expect(pointer.pointer.x).toBeGreaterThan(0.5);
    expect(pointer.pointer.y).toBeGreaterThan(0.5);
  });

  it("maps sustained gyro-rate into continuous, growing analog displacement", () => {
    const controller = centered();
    const small = feedConstantGyro(controller, [0, 0, 20], 350)!;
    const larger = feedConstantGyro(controller, [0, 0, 20], 350, { startMs: 350 })!;
    expect(larger.pointer.x).toBeGreaterThan(small.pointer.x);
    expect(small.pointer.x).toBeGreaterThan(0.5);
    expect(larger.pointer.x).toBeLessThan(1);
  });

  it("pure wrist twist (rotation about the sensor's own axis) does not move the pointer", () => {
    const controller = centered({ invertRotation: true });
    // Large, sustained twist-only rate (no pitch/yaw-rate component at all) — the exact real-hardware symptom this fixes.
    const pointer = feedConstantGyro(controller, [120, 0, 0], 800)!;
    expect(pointer.pointer.x).toBeCloseTo(0.5, 6);
    expect(pointer.pointer.y).toBeCloseTo(0.5, 6);
    expect(pointer.visualOrientation.rotationDeg).toBe(0);

    // Twisting the other way afterward still must not move it.
    const other = feedConstantGyro(controller, [-90, 0, 0], 800, { startMs: 800 })!;
    expect(other.pointer.x).toBeCloseTo(0.5, 6);
    expect(other.pointer.y).toBeCloseTo(0.5, 6);
  });

  it("twist does not contaminate genuine simultaneous aiming when twist is not dominant (child may twist and aim together)", () => {
    const controller = centered();
    // Real-world case the fix must handle: aiming right WHILE also twisting the wrist, twist not overwhelming (dominance below the gate threshold).
    const twistPlusAim = feedConstantGyro(controller, [50, 0, 40], 500)!;
    const aimOnlyController = centered();
    const aimOnly = feedConstantGyro(aimOnlyController, [0, 0, 40], 500)!;
    expect(twistPlusAim.pointer.x).toBeCloseTo(aimOnly.pointer.x, 6);
    expect(twistPlusAim.pointer.y).toBeCloseTo(aimOnly.pointer.y, 6);
  });

  it("dampens a small pitch/yaw remainder when twist utterly dominates the sample (real-hardware mount coupling), but preserves direction and never overcorrects a substantial simultaneous aim", () => {
    // Real RIGHT_HAND replay (tools/witmotion_ble/real_dataset/tune_twist_dominance_gate.py) showed a small
    // residual pitch/yaw during near-pure twist is real cross-axis mounting coupling, not aim intent — see
    // ContinuousMotionController's TWIST_DOMINANCE_THRESHOLD doc comment.
    const controller = centered();
    // Near-pure twist (dominance ~0.995, far past the 0.92 gate) with a small residual yaw, same shape as the
    // measured real coupling ratio.
    const twistPlusSmallResidual = feedConstantGyro(controller, [150, 0, 15], 500)!;
    const aimOnlyController = centered();
    const aimOnly = feedConstantGyro(aimOnlyController, [0, 0, 15], 500)!;
    expect(twistPlusSmallResidual.pointer.x).toBeGreaterThan(0.5); // direction preserved, not flipped or zeroed
    expect(twistPlusSmallResidual.pointer.x).toBeLessThan(aimOnly.pointer.x); // but damped well below the undamped aim-only case
  });

  it("dampens near-dominant twist symmetrically regardless of twist sign (no hardcoded left/right asymmetry)", () => {
    // Real data could not justify a stable per-direction coefficient (see the const doc comment) — the gate
    // reacts identically to twist magnitude regardless of sign, by construction.
    const rightTwist = centered();
    const leftTwist = centered();
    const rightResult = feedConstantGyro(rightTwist, [150, 0, 15], 500)!;
    const leftResult = feedConstantGyro(leftTwist, [-150, 0, 15], 500)!;
    expect(rightResult.pointer.x).toBeCloseTo(leftResult.pointer.x, 6);
    expect(rightResult.pointer.y).toBeCloseTo(leftResult.pointer.y, 6);
  });

  it("recentering at a rolled (mounted-sideways) reference still resolves bounded, continuous motion, and pure twist still parks at center", () => {
    // Simulates a strap mounted rotated ~45deg: recenter still happens at whatever roll the mount sits at.
    const controller = new ContinuousMotionController({ ...ANALOG_CONFIG, deadZoneDeg: 0 });
    controller.observe(sample([0, 0, 0], 0, [45, 0, 0]));
    expect(controller.recenter()).toBe(true);

    const pureTwist = feedConstantGyro(controller, [100, 0, 0], 500, { startMs: 0 })!;
    expect(pureTwist.pointer.x).toBeCloseTo(0.5, 6);
    expect(pureTwist.pointer.y).toBeCloseTo(0.5, 6);

    const moved = feedConstantGyro(controller, [0, 0, 15], 500, { startMs: 500 })!;
    expect(Number.isFinite(moved.pointer.x)).toBe(true);
    expect(Number.isFinite(moved.pointer.y)).toBe(true);
    expect(moved.pointer.x !== 0.5 || moved.pointer.y !== 0.5).toBe(true);
  });

  it("centers on the latest pose and supports recentering", () => {
    const controller = new ContinuousMotionController(ANALOG_CONFIG);
    expect(controller.recenter()).toBe(false);
    controller.observe(sample([0, 0, 0], 0));
    expect(controller.recenter()).toBe(true);
    expect(controller.currentPointer).toMatchObject({ pointer: { x: 0.5, y: 0.5 }, visualOrientation: { rotationDeg: 0 } });

    feedConstantGyro(controller, [0, 0, 15], 300);
    expect(controller.currentPointer!.pointer.x).toBeGreaterThan(0.5);
    expect(controller.recenter()).toBe(true);
    expect(controller.currentPointer).toMatchObject({ pointer: { x: 0.5, y: 0.5 }, visualOrientation: { rotationDeg: 0 } });
  });

  it("uses sensitivity to turn a small physical range into a larger virtual range", () => {
    const normal = centered({ sensitivity: 1 });
    const pediatric = centered({ sensitivity: 3 });
    const normalPointer = feedConstantGyro(normal, [0, 0, 20], 500)!;
    const pediatricPointer = feedConstantGyro(pediatric, [0, 0, 20], 500)!;
    expect(pediatricPointer.pointer.x).toBeGreaterThan(normalPointer.pointer.x);
    expect(pediatricPointer.pointer.x).toBeGreaterThan(0.9);
  });

  it("suppresses noise inside the configured dead zone", () => {
    const controller = centered({ deadZoneDeg: 2 });
    // ~1deg of accumulated yaw/pitch over 100ms — inside the dead zone.
    const pointer = feedConstantGyro(controller, [0, 10, 10], 100)!;
    expect(pointer.pointer.x).toBe(0.5);
    expect(pointer.pointer.y).toBe(0.5);
  });

  it("clamps the pointer safely inside every boundary", () => {
    const controller = centered();
    const farRight = feedConstantGyro(controller, [0, 0, 60], 1000)!;
    expect(farRight.pointer.x).toBe(1);
    const farLeftController = centered();
    const farLeft = feedConstantGyro(farLeftController, [0, 0, -60], 1000)!;
    expect(farLeft.pointer.x).toBe(0);
  });

  it("preserves simultaneous diagonal analog movement", () => {
    const controller = centered();
    const pointer = feedConstantGyro(controller, [0, 12, 12], 500)!;
    expect(pointer.pointer.x).toBeGreaterThan(0.5);
    expect(pointer.pointer.y).toBeGreaterThan(0.5);
    expect(pointer.pointer.x).toBeLessThan(1);
    expect(pointer.pointer.y).toBeLessThan(1);
  });

  it("lets adaptive filtering respond faster to a fast deliberate movement", () => {
    const slow = centered({ smoothing: 0.8, filterMode: "ADAPTIVE_EMA" });
    const fast = centered({ smoothing: 0.8, filterMode: "ADAPTIVE_EMA" });
    slow.observe(sample([0, 0, 0], 20));
    fast.observe(sample([0, 0, 300], 20));
    expect(fast.currentPointer!.pointer.x).toBeGreaterThan(slow.currentPointer!.pointer.x);
  });

  it("invalidates calibration and output on disconnect", () => {
    const controller = centered();
    controller.observe(sample([0, 0, 5], 20));
    controller.invalidate();
    expect(controller.isCentered).toBe(false);
    expect(controller.currentPointer).toBeNull();
    expect(controller.recenter()).toBe(false);
    expect(controller.observe(sample([0, 0, 5], 40))).toBeNull();
  });

  /**
   * MANDATORY TESTS B/C/D — edge saturation + immediate reversal ("no
   * hidden off-screen debt"). See ContinuousMotionController.ts's
   * "SATURATING INTEGRATOR" doc comment: without clamping the internal aim
   * accumulator, the pointer visually pins at an edge but the underlying
   * angle keeps growing while the physical hand keeps moving outward, so a
   * later reversal has to first consume that invisible excess before the
   * pointer moves at all. These tests drive well past saturation, then
   * reverse by only a small amount and require VISIBLE movement right away.
   */
  describe("edge saturation / immediate reversal (no hidden off-screen debt)", () => {
    it("reversing from RIGHT saturation moves the pointer immediately", () => {
      const controller = centered();
      const saturated = feedConstantGyro(controller, [0, 0, 60], 1000)!;
      expect(saturated.pointer.x).toBe(1);
      const reversed = feedConstantGyro(controller, [0, 0, -20], 100, { startMs: 1000 })!;
      expect(reversed.pointer.x).toBeLessThan(1);
    });

    it("reversing from LEFT saturation moves the pointer immediately", () => {
      const controller = centered();
      const saturated = feedConstantGyro(controller, [0, 0, -60], 1000)!;
      expect(saturated.pointer.x).toBe(0);
      const reversed = feedConstantGyro(controller, [0, 0, 20], 100, { startMs: 1000 })!;
      expect(reversed.pointer.x).toBeGreaterThan(0);
    });

    it("reversing from TOP saturation moves the pointer immediately", () => {
      const controller = centered();
      const saturated = feedConstantGyro(controller, [0, -60, 0], 1000)!;
      expect(saturated.pointer.y).toBe(0);
      const reversed = feedConstantGyro(controller, [0, 20, 0], 100, { startMs: 1000 })!;
      expect(reversed.pointer.y).toBeGreaterThan(0);
    });

    it("reversing from BOTTOM saturation moves the pointer immediately", () => {
      const controller = centered();
      const saturated = feedConstantGyro(controller, [0, 60, 0], 1000)!;
      expect(saturated.pointer.y).toBe(1);
      const reversed = feedConstantGyro(controller, [0, -20, 0], 100, { startMs: 1000 })!;
      expect(reversed.pointer.y).toBeLessThan(1);
    });

    it("continuing to push further past an already-saturated edge never grows a hidden internal debt — the reversal response is identical however long the extra outward push lasted", () => {
      const shortPush = centered();
      feedConstantGyro(shortPush, [0, 0, 60], 1000);
      const shortReversed = feedConstantGyro(shortPush, [0, 0, -40], 1000, { startMs: 1000 })!;

      const longPush = centered();
      feedConstantGyro(longPush, [0, 0, 60], 1000);
      feedConstantGyro(longPush, [0, 0, 60], 5000, { startMs: 1000 }); // keeps pushing outward for 5 more seconds
      const longReversed = feedConstantGyro(longPush, [0, 0, -40], 1000, { startMs: 6000 })!;

      // Both must have actually moved measurably off the edge, and by the same amount — proves the
      // 5 extra seconds of outward push left no invisible residue for the second controller to work off.
      expect(shortReversed.pointer.x).toBeLessThan(0.9);
      expect(longReversed.pointer.x).toBeCloseTo(shortReversed.pointer.x, 2);
    });
  });

  /** MANDATORY TEST G — an invalid/non-finite sample must never null out or corrupt the pointer, and must never fire a phantom contact (the pointer simply does not move for that sample). */
  describe("invalid sample recovery (pointer never disappears)", () => {
    it("ignores a NaN sample and keeps the last valid pointer available", () => {
      const controller = centered();
      const before = feedConstantGyro(controller, [0, 0, 15], 200)!;
      expect(controller.observe(sample([0, 0, NaN], 220))).toBeNull();
      expect(controller.currentPointer).toEqual(before);
      // A finite sample right after still works normally — the invalid sample did not corrupt any state.
      const after = feedConstantGyro(controller, [0, 0, 15], 200, { startMs: 220 })!;
      expect(after.pointer.x).toBeGreaterThan(before.pointer.x);
    });

    it("ignores an Infinity sample the same way", () => {
      const controller = centered();
      const before = feedConstantGyro(controller, [0, 0, 15], 200)!;
      expect(controller.observe(sample([0, Infinity, 0], 220))).toBeNull();
      expect(controller.currentPointer).toEqual(before);
    });
  });

  /** MANDATORY TEST A (controller half) — recenter from an off-center position snaps exactly to center and the next movement works immediately. Phantom-contact suppression is the SensorContactRouter/ContactActivationGate half — see notePendingRecenter's tests. */
  it("recentering from any held position (e.g. top-right) snaps exactly to center and the next movement responds immediately", () => {
    const controller = centered();
    const topRight = feedConstantGyro(controller, [0, -20, 20], 500)!;
    expect(topRight.pointer.x).toBeGreaterThan(0.5);
    expect(topRight.pointer.y).toBeLessThan(0.5);

    expect(controller.recenter()).toBe(true);
    expect(controller.currentPointer).toMatchObject({ pointer: { x: 0.5, y: 0.5 } });

    const moved = feedConstantGyro(controller, [0, 0, 10], 200, { startMs: 500 })!;
    expect(moved.pointer.x).toBeGreaterThan(0.5);
  });

  it("takes the shortest delta across the yaw wrap boundary", () => {
    expect(angularDeltaDeg(-179, 179)).toBe(2);
    expect(angularDeltaDeg(179, -179)).toBe(-2);
  });

  describe("autoCenter", () => {
    it("establishes a reference from a short buffered window without requiring recenter()", () => {
      const controller = new ContinuousMotionController({ ...ANALOG_CONFIG, autoCenter: true });
      expect(controller.isCentered).toBe(false);
      for (let index = 0; index < 5; index += 1) {
        controller.observe(sample([0, 0, 0], index * 10));
      }
      expect(controller.isCentered).toBe(true);
      expect(controller.currentPointer!.pointer.x).toBeCloseTo(0.5, 6);
      expect(controller.currentPointer!.pointer.y).toBeCloseTo(0.5, 6);
    });

    it("prefers the lowest-motion sample within the auto-center window", () => {
      const controller = new ContinuousMotionController({ ...ANALOG_CONFIG, autoCenter: true });
      controller.observe(sample([0, 0, 80], 0));
      controller.observe(sample([0, 0, 120], 20));
      controller.observe(sample([0, 0, 2], 40)); // near-still — should be the chosen center moment
      controller.observe(sample([0, 0, 60], 60));
      controller.observe(sample([0, 0, 70], 80));
      expect(controller.isCentered).toBe(true);
      // Whatever the chosen moment, a near-zero gyro sample right after centering should read back near (0.5, 0.5).
      const pointer = controller.observe(sample([0, 0, 0], 90))!;
      expect(pointer.pointer.x).toBeCloseTo(0.5, 1);
      expect(pointer.pointer.y).toBeCloseTo(0.5, 1);
    });

    it("does not block indefinitely waiting for a still pose", () => {
      const clock = fakeClock();
      const controller = new ContinuousMotionController({ ...ANALOG_CONFIG, autoCenter: true }, { now: clock.now });
      controller.observe(sample([0, 0, 50], 0));
      expect(controller.isCentered).toBe(false);
      clock.advance(500); // exceeds the max auto-center wait even with only 1 sample buffered
      controller.observe(sample([0, 0, 50], 500));
      expect(controller.isCentered).toBe(true);
    });

    it("introduces no spurious drift from an active out-and-back excursion (reference frozen throughout)", () => {
      const controller = new ContinuousMotionController({ ...ANALOG_CONFIG, deadZoneDeg: 0, autoCenter: true });
      for (let index = 0; index < 5; index += 1) controller.observe(sample([0, 0, 0], index));
      expect(controller.isCentered).toBe(true);

      // Gyro magnitude stays above the settle threshold throughout, so drift correction never engages —
      // the swing out and back should cancel exactly, landing back at center.
      feedConstantGyro(controller, [0, 0, 40], 500, { startMs: 5 });
      feedConstantGyro(controller, [0, 0, -40], 500, { startMs: 505 });
      const backAtCenter = controller.observe(sample([0, 0, 0], 1010))!;
      expect(backAtCenter.pointer.x).toBeCloseTo(0.5, 2);
    });

  });

  /**
   * REGRESSION SUITE — "stillness must never mean return pointer to center."
   * An earlier "conservative drift correction" pass re-anchored
   * centerYawDeg/centerPitchDeg toward the CURRENT aim whenever gyro stayed
   * quiet for ~300ms, which is exactly what holding a real pose looks like
   * (holding still IS near-zero angular velocity) — it silently walked the
   * pointer back toward (0.5, 0.5) within about a second of the child
   * holding any aimed position, making the controller unusable. This suite
   * proves the fix directly: once centered, the reference never moves on
   * its own, no matter how long or how still a held pose is fed in.
   */
  describe("hold-position stability (no auto-recenter during gameplay)", () => {
    const HOLD_MS = 10_000;
    const HOLD_STEP_MS = 20; // 50Hz, matching real runtime cadence

    /** Moves to `moveGyro` for moveMs, then holds (near-zero gyro) for holdMs — returns [pointer right after the move, pointer at the end of the hold]. */
    function moveThenHold(
      moveGyro: readonly [number, number, number],
      moveMs: number,
      holdMs: number,
      holdGyro: readonly [number, number, number] = [0, 0, 0],
    ): { afterMove: NonNullable<ReturnType<ContinuousMotionController["observe"]>>; afterHold: NonNullable<ReturnType<ContinuousMotionController["observe"]>> } {
      const controller = centered({ deadZoneDeg: 0, autoCenter: true });
      const afterMove = feedConstantGyro(controller, moveGyro, moveMs)!;
      const afterHold = feedConstantGyro(controller, holdGyro, holdMs, { startMs: moveMs })!;
      return { afterMove, afterHold };
    }

    it("holding RIGHT for 10s keeps the pointer at the held position, not drifting back to center", () => {
      const { afterMove, afterHold } = moveThenHold([0, 0, 30], 500, HOLD_MS);
      expect(afterMove.pointer.x).toBeGreaterThan(0.5);
      expect(afterHold.pointer.x).toBeCloseTo(afterMove.pointer.x, 6);
    });

    it("holding LEFT for 10s keeps the pointer at the held position, not drifting back to center", () => {
      const { afterMove, afterHold } = moveThenHold([0, 0, -30], 500, HOLD_MS);
      expect(afterMove.pointer.x).toBeLessThan(0.5);
      expect(afterHold.pointer.x).toBeCloseTo(afterMove.pointer.x, 6);
    });

    it("holding UP for 10s keeps the pointer at the held position, not drifting back to center", () => {
      const { afterMove, afterHold } = moveThenHold([0, -30, 0], 500, HOLD_MS);
      expect(afterMove.pointer.y).toBeLessThan(0.5);
      expect(afterHold.pointer.y).toBeCloseTo(afterMove.pointer.y, 6);
    });

    it("holding DOWN for 10s keeps the pointer at the held position, not drifting back to center", () => {
      const { afterMove, afterHold } = moveThenHold([0, 30, 0], 500, HOLD_MS);
      expect(afterMove.pointer.y).toBeGreaterThan(0.5);
      expect(afterHold.pointer.y).toBeCloseTo(afterMove.pointer.y, 6);
    });

    it("holding a DIAGONAL position for 10s keeps the pointer held on both axes, not drifting back to center", () => {
      const { afterMove, afterHold } = moveThenHold([0, -20, 20], 500, HOLD_MS);
      expect(afterMove.pointer.x).toBeGreaterThan(0.5);
      expect(afterMove.pointer.y).toBeLessThan(0.5);
      expect(afterHold.pointer.x).toBeCloseTo(afterMove.pointer.x, 6);
      expect(afterHold.pointer.y).toBeCloseTo(afterMove.pointer.y, 6);
    });

    it("tiny jitter while held stays around the held position, never pulled toward center", () => {
      const controller = centered({ deadZoneDeg: 0, autoCenter: true });
      const afterMove = feedConstantGyro(controller, [0, 0, 30], 500)!;
      expect(afterMove.pointer.x).toBeGreaterThan(0.5);

      // Small alternating jitter around zero gyro — a still hand's involuntary shake, not real re-aiming.
      let last = afterMove;
      for (let step = 1; step * HOLD_STEP_MS <= HOLD_MS; step += 1) {
        const jitter: readonly [number, number, number] = [0, 0, step % 2 === 0 ? 0.4 : -0.4];
        last = controller.observe(sample(jitter, 500 + step * HOLD_STEP_MS))!;
        // Never a visible jump, and never drifting toward 0.5 as the hold continues.
        expect(Math.abs(last.pointer.x - afterMove.pointer.x)).toBeLessThan(0.02);
      }
      expect(last.pointer.x).toBeGreaterThan(0.5);
    });

    it("pure twist while held does not erode the held position, and resuming genuine aim responds immediately afterward", () => {
      const controller = centered({ deadZoneDeg: 0, autoCenter: true });
      const afterMove = feedConstantGyro(controller, [0, 0, 30], 500)!;
      expect(afterMove.pointer.x).toBeGreaterThan(0.5);

      // Large sustained wrist twist while holding the same physical aim — twist rate never integrates into aim, so the held position must be untouched.
      const afterTwist = feedConstantGyro(controller, [120, 0, 0], 1000, { startMs: 500 })!;
      expect(afterTwist.pointer.x).toBeCloseTo(afterMove.pointer.x, 6);

      // Real aiming resumes immediately after — not stuck, not lagging behind a stale reference.
      const resumed = feedConstantGyro(controller, [0, 0, 30], 200, { startMs: 1500 })!;
      expect(resumed.pointer.x).toBeGreaterThan(afterTwist.pointer.x);
    });
  });

  describe("crossAxisCalibration (Problem 1 — straight physical motion producing a diagonal pointer path)", () => {
    it("is a no-op (default null) — identical output to no calibration configured", () => {
      const plain = centered();
      const calibrated = centered({ crossAxisCalibration: null });
      const a = feedConstantGyro(plain, [0, -15, 25], 500)!;
      const b = feedConstantGyro(calibrated, [0, -15, 25], 500)!;
      expect(b.pointer.x).toBeCloseTo(a.pointer.x, 10);
      expect(b.pointer.y).toBeCloseTo(a.pointer.y, 10);
    });

    it("a real coupling matrix straightens an intentionally-diagonal-by-construction raw signal back onto one axis", () => {
      // Simulate a mount where genuine "pure yaw" rate also leaks into pitch (observed = M * intended,
      // M = [[1,0],[0.3,1]] here via the RAW gyro itself, standing in for what a skewed sensor mount would
      // produce) — the calibration matrix passed to the controller is M^-1, so it should cancel that leak.
      const rawYawRateDps = 25;
      const leakedPitchRateDps = 0.3 * rawYawRateDps;
      const withoutCalibration = feedConstantGyro(centered(), [0, leakedPitchRateDps, rawYawRateDps], 500)!;
      expect(withoutCalibration.pointer.y).not.toBeCloseTo(0.5, 3); // leak visibly moved Y

      const mInverse: ContinuousMotionConfig["crossAxisCalibration"] = [
        [1, 0],
        [-0.3, 1],
      ];
      const withCalibration = feedConstantGyro(centered({ crossAxisCalibration: mInverse }), [0, leakedPitchRateDps, rawYawRateDps], 500)!;
      expect(withCalibration.pointer.x).toBeGreaterThan(0.5); // intended X motion preserved
      expect(withCalibration.pointer.y).toBeCloseTo(0.5, 6); // leaked Y cancelled
    });

    it("regression: correctly cancels a cross-axis leak when invertX and invertY disagree (the real RIGHT_HAND config: invertX=true, invertY=false)", () => {
      // Pins the exact placement bug this shipped with once: applying the calibration matrix to the
      // PRE-invert raw angle delta (instead of the POST-invert pointer-space offset it is derived and
      // validated in) computes S*(M*delta) instead of M*(S*delta) — these don't commute once invertX
      // and invertY disagree (S = diag(-1,+1) here). For a PURE single-axis input this only flips the
      // CROSS-leak term's sign (the primary axis is unaffected — see the analysis that traced this),
      // but for a genuinely MIXED raw signal (a real mount's leak, not an idealized pure axis) the wrong
      // placement doesn't just get the sign wrong, it actively DOUBLES the leak instead of cancelling it
      // — which is what this test exercises and would have caught before shipping.
      const leak = 0.25; // raw pitch-rate = leak * raw yaw-rate, standing in for a real mount's coupling
      const rawYawRateDps = 20;
      const rawPitchRateDps = leak * rawYawRateDps;
      const baseConfig: Partial<ContinuousMotionConfig> = { invertX: true, invertY: false, deadZoneDeg: 0 };

      const uncalibrated = feedConstantGyro(centered(baseConfig), [0, rawPitchRateDps, rawYawRateDps], 500)!;
      expect(uncalibrated.pointer.y).not.toBeCloseTo(0.5, 3); // leak visibly present before calibration

      // The correct pointer-space calibration matrix for THIS leak, given invertX=true flips the sign
      // relationship between raw-gyro leak and pointer-space leak (derived and explained above `c=leak`,
      // not `c=-leak`, precisely BECAUSE invertX=true — this is the sign a correct derivation/placement
      // must land on for THIS config).
      const calibration: ContinuousMotionConfig["crossAxisCalibration"] = [
        [1, 0],
        [leak, 1],
      ];
      const calibrated = feedConstantGyro(centered({ ...baseConfig, crossAxisCalibration: calibration }), [0, rawPitchRateDps, rawYawRateDps], 500)!;
      expect(calibrated.pointer.y).toBeCloseTo(0.5, 6); // leak cancelled, not doubled
    });
  });

  describe("twistTrackingMode: CONTINUOUS_GRAVITY_REFERENCED", () => {
    it("matches FROZEN_AT_RECENTER exactly when roll never changes after recenter (every real capture so far)", () => {
      const frozen = centered({ twistTrackingMode: "FROZEN_AT_RECENTER" });
      const continuous = centered({ twistTrackingMode: "CONTINUOUS_GRAVITY_REFERENCED" });
      // Same constant roll (default anglesDeg=[0,0,0] from the `sample()` helper) throughout — both modes
      // should be mathematically identical in this case.
      const a = feedConstantGyro(frozen, [0, -20, 15], 500)!;
      const b = feedConstantGyro(continuous, [0, -20, 15], 500)!;
      expect(b.pointer.x).toBeCloseTo(a.pointer.x, 10);
      expect(b.pointer.y).toBeCloseTo(a.pointer.y, 10);
    });

    it("keeps de-rolling correctly as roll actually changes mid-session, unlike the frozen mode", () => {
      const frozen = centered({ twistTrackingMode: "FROZEN_AT_RECENTER", deadZoneDeg: 0 });
      const continuous = centered({ twistTrackingMode: "CONTINUOUS_GRAVITY_REFERENCED", deadZoneDeg: 0 });
      // Roll physically rotates to 90° (anglesDeg[0]) WITHOUT any twist-rate gyro signal (as if the therapist
      // re-mounted/rotated the strap between phases rather than the wrist twisting live) — a stand-in for
      // "the wrist is now rotated 90° and stays there" without needing the twist-dominance gate's own gyro
      // heuristics in this unit test. A pure local-pitch-rate aim command should now map to a DIFFERENT
      // (roll-rotated) pair of screen axes for the frozen mode, but the SAME de-rolled axes for continuous.
      const rollAt90: readonly [number, number, number] = [90, 0, 0];
      const frozenAfterTwist = feedConstantGyro(frozen, [0, 25, 0], 500, { anglesDeg: rollAt90 })!;
      const continuousAfterTwist = feedConstantGyro(continuous, [0, 25, 0], 500, { anglesDeg: rollAt90 })!;
      // Frozen mode: the local-pitch-rate command gets rotated by the STALE (identity, roll=0) reference,
      // landing mostly on Y exactly as if no rotation had happened.
      expect(frozenAfterTwist.pointer.y).not.toBeCloseTo(0.5, 2);
      // Continuous mode: de-rolls using the CURRENT roll (90°), so the same local-pitch-rate command now
      // projects mostly onto the OTHER screen axis (X) instead — this is the axis-swap fix in miniature.
      expect(continuousAfterTwist.pointer.x).not.toBeCloseTo(0.5, 2);
      expect(continuousAfterTwist.pointer.y).toBeCloseTo(0.5, 1);
    });
  });

  describe("stabilizationLevel", () => {
    it("MEDIUM (default) matches the pre-existing MotionIntentGate defaults exactly", () => {
      const explicit = centered({ stabilizationLevel: "MEDIUM" });
      const implicitDefault = centered();
      const jitter: readonly [number, number, number] = [0, 0, 0.4];
      const a = feedConstantGyro(explicit, jitter, 200)!;
      const b = feedConstantGyro(implicitDefault, jitter, 200)!;
      expect(b.pointer.x).toBeCloseTo(a.pointer.x, 10);
      expect(b.pointer.y).toBeCloseTo(a.pointer.y, 10);
    });

    it("HIGH holds an incoherent (oscillating) small signal closer to center than LOW over the same window", () => {
      const high = centered({ stabilizationLevel: "HIGH", deadZoneDeg: 0 });
      const low = centered({ stabilizationLevel: "LOW", deadZoneDeg: 0 });
      let lastHigh: ReturnType<ContinuousMotionController["observe"]> = null;
      let lastLow: ReturnType<ContinuousMotionController["observe"]> = null;
      for (let step = 1; step <= 15; step += 1) {
        const jitter: readonly [number, number, number] = [0, 0, step % 2 === 0 ? 15 : -15];
        lastHigh = high.observe(sample(jitter, step * 20));
        lastLow = low.observe(sample(jitter, step * 20));
      }
      expect(Math.abs(lastHigh!.pointer.x - 0.5)).toBeLessThan(Math.abs(lastLow!.pointer.x - 0.5));
    });

    it("switching stabilizationLevel via updateConfig takes effect without resetting the pointer position", () => {
      const controller = centered({ stabilizationLevel: "LOW" });
      const before = feedConstantGyro(controller, [0, 0, 30], 300)!;
      controller.updateConfig({ stabilizationLevel: "HIGH" });
      const after = controller.observe(sample([0, 0, 0], 320))!;
      expect(after.pointer.x).toBeCloseTo(before.pointer.x, 2);
    });
  });

  describe("twistTrackingMode: ROLL_INVARIANT_TRANSVERSE_FRAME (validated against the real 2026-09-04 twist-invariance capture)", () => {
    function sampleWithAccel(gyroscopeDps: readonly [number, number, number], accelerationG: readonly [number, number, number], timestampMs: number): MotionSample {
      return { timestampMs, accelerationG, gyroscopeDps, anglesDeg: [0, 0, 0] };
    }

    /** Feeds `durationMs` of the SAME physical motion, expressed correctly for the given roll angle (rotating both accelerationG and the transverse gyro components by the same roll, as a real rotated mount would produce), after a short still settle period so the gravity estimate converges first. */
    function feedRolledMotion(controller: ContinuousMotionController, transverseGyro: readonly [number, number], rollDeg: number, durationMs: number, startMs = 0) {
      const rollRad = (rollDeg * Math.PI) / 180;
      const cos = Math.cos(rollRad);
      const sin = Math.sin(rollRad);
      // accelerationG at this roll: rotate the neutral [0,0,1] gravity reading by rollDeg around local X.
      const accel: readonly [number, number, number] = [0, Math.sin(rollRad), Math.cos(rollRad)];
      // Settle: 10 still samples so the gravity estimate (which starts from the first sample it sees) has
      // no work left to do once real motion starts.
      let ts = startMs;
      let last: ReturnType<ContinuousMotionController["observe"]> = null;
      for (let i = 0; i < 10; i += 1) {
        ts += 20;
        last = controller.observe(sampleWithAccel([0, 0, 0], accel, ts));
      }
      const [ty, tz] = transverseGyro;
      const rolledY = ty * cos + tz * sin;
      const rolledZ = -ty * sin + tz * cos;
      for (let elapsed = 20; elapsed <= durationMs; elapsed += 20) {
        ts += 20;
        last = controller.observe(sampleWithAccel([0, rolledY, rolledZ], accel, ts));
      }
      return last!;
    }

    function centerAtRoll(rollDeg: number): ContinuousMotionController {
      const controller = new ContinuousMotionController({
        ...ANALOG_CONFIG,
        twistTrackingMode: "ROLL_INVARIANT_TRANSVERSE_FRAME",
        deadZoneDeg: 0,
      });
      const rollRad = (rollDeg * Math.PI) / 180;
      const accel: readonly [number, number, number] = [0, Math.sin(rollRad), Math.cos(rollRad)];
      controller.observe(sampleWithAccel([0, 0, 0], accel, 0));
      expect(controller.recenter()).toBe(true);
      return controller;
    }

    it("the SAME physical transverse motion produces the SAME pointer displacement at 0° and 90° roll", () => {
      const transverse: readonly [number, number] = [20, 0]; // arbitrary fixed "physical" transverse rate

      const at0 = centerAtRoll(0);
      const resultAt0 = feedRolledMotion(at0, transverse, 0, 500);

      const at90 = centerAtRoll(90);
      const resultAt90 = feedRolledMotion(at90, transverse, 90, 500);

      expect(resultAt90.pointer.x).toBeCloseTo(resultAt0.pointer.x, 2);
      expect(resultAt90.pointer.y).toBeCloseTo(resultAt0.pointer.y, 2);
      // Sanity: this physical motion actually moved the pointer away from center (not a degenerate no-op).
      expect(Math.hypot(resultAt0.pointer.x - 0.5, resultAt0.pointer.y - 0.5)).toBeGreaterThan(0.05);
    });

    it("the SAME physical transverse motion produces the SAME pointer displacement at 45° roll too", () => {
      const transverse: readonly [number, number] = [-15, 12];

      const at0 = centerAtRoll(0);
      const resultAt0 = feedRolledMotion(at0, transverse, 0, 500);

      const at45 = centerAtRoll(45);
      const resultAt45 = feedRolledMotion(at45, transverse, 45, 500);

      expect(resultAt45.pointer.x).toBeCloseTo(resultAt0.pointer.x, 2);
      expect(resultAt45.pointer.y).toBeCloseTo(resultAt0.pointer.y, 2);
    });

    it("does not crash and stays finite when forward is nearly parallel to gravity (the one genuine singularity)", () => {
      const controller = new ContinuousMotionController({
        ...ANALOG_CONFIG,
        twistTrackingMode: "ROLL_INVARIANT_TRANSVERSE_FRAME",
        deadZoneDeg: 0,
      });
      // Gravity along local X (forward) - the singular configuration (pointing straight up/down).
      controller.observe(sampleWithAccel([0, 0, 0], [1, 0, 0], 0));
      expect(controller.recenter()).toBe(true);
      let last: ReturnType<ContinuousMotionController["observe"]> = null;
      for (let i = 1; i <= 20; i += 1) {
        last = controller.observe(sampleWithAccel([0, 10, -8], [1, 0, 0], i * 20));
      }
      expect(Number.isFinite(last!.pointer.x)).toBe(true);
      expect(Number.isFinite(last!.pointer.y)).toBe(true);
      expect(last!.pointer.x).toBeGreaterThanOrEqual(0);
      expect(last!.pointer.x).toBeLessThanOrEqual(1);
      expect(last!.pointer.y).toBeGreaterThanOrEqual(0);
      expect(last!.pointer.y).toBeLessThanOrEqual(1);
    });

    it("with the real 2026-09-04 personalized calibration matrix applied, a pure rightward-mapped raw signal ends up on ONE side of center consistently (sanity check for the shared crossAxisCalibration code path in this new mode)", () => {
      const calibration: ContinuousMotionConfig["crossAxisCalibration"] = [
        [1, 0],
        [0, 1],
      ];
      const controller = centerAtRoll(0);
      controller.updateConfig({ crossAxisCalibration: calibration });
      const result = feedRolledMotion(controller, [20, 0], 0, 500);
      expect(result.pointer.x === 0.5 && result.pointer.y === 0.5).toBe(false);
    });
  });
});

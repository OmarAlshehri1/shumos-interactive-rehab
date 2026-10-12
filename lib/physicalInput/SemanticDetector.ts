import type { CalibrationProfile, MotionSample, SemanticEvent } from "./types";

/**
 * The pluggable gesture-recognition contract PhysicalInputManager calls per
 * sample, per role. NOT a port of tools/witmotion_ble/semantic_detector.py's
 * RightHandRaiseSession yet - that state machine (dynamic rest envelope,
 * dual-path onset evidence, trajectory-commit classification) is still
 * being validated offline against real recordings (see
 * replay_gate_report.json / full_validation_gate_report.json) and tomorrow's
 * clean small-movement captures. Porting it here before it is validated
 * would mean shipping a second, untested reimplementation of a detector
 * whose whole point is being evidence-driven - so this interface exists
 * precisely so that port can happen later as a drop-in SemanticDetector
 * implementation, without PhysicalInputManager or any role wiring changing.
 *
 * `NullSemanticDetector` (never emits) and `ThresholdTestDetector` (a
 * deliberately naive fixed-threshold detector) below exist ONLY to exercise
 * PhysicalInputManager's plumbing in tests - neither is a real gesture
 * detector and neither should ever be reached for by production code.
 */
export interface SemanticDetector {
  /** Called once per role assignment/(re)calibration, before any observe(). */
  reset(profile: CalibrationProfile): void;
  /** Called once per incoming sample, in order. Returns an event only on the sample where a gesture commits. */
  observe(sample: MotionSample): SemanticEvent | null;
}

/** Test-only: never emits anything. Useful for isolating manager plumbing (routing, disconnect safety) from any detector logic at all. */
export class NullSemanticDetector implements SemanticDetector {
  reset(): void {}
  observe(): SemanticEvent | null {
    return null;
  }
}

/**
 * Test-only: fires whenever gyro magnitude exceeds a fixed constant, no
 * onset evidence, no rest envelope, no rearm hysteresis. This is
 * intentionally cruder than even the OLD (pre-redesign) Python detector -
 * it exists solely so PhysicalInputManager's tests can deterministically
 * produce an event without depending on the real, still-in-development
 * algorithm. Never use for anything resembling production behavior.
 */
export class ThresholdTestDetector implements SemanticDetector {
  constructor(
    private readonly role: SemanticEvent["role"],
    private readonly gesture: string,
    private readonly gyroThresholdDps = 40,
  ) {}

  reset(): void {}

  observe(sample: MotionSample): SemanticEvent | null {
    const magnitude = Math.hypot(...sample.gyroscopeDps);
    if (magnitude < this.gyroThresholdDps) return null;
    return { role: this.role, gesture: this.gesture, timestampMs: sample.timestampMs };
  }
}

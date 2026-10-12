import type { ContinuousMotionConfig, CrossAxisCalibrationMatrix } from "./ContinuousMotionController";
import { RIGHT_HAND_ADULT_2026_09_04_TWIST_INVARIANT_CALIBRATION } from "./RightHandAdultTwistInvariantCalibrationEvidence";
import { PhysicalRole } from "./types";

/**
 * FROZEN RIGHT_HAND / independent LEFT_HAND runtime configuration — the
 * "section 1: freeze RIGHT_HAND" baseline this dual-sensor brief calls for,
 * extracted from SensorRuntimeProvider.tsx's inline construction so both
 * roles instantiate the SAME reusable hook (useSensorHandRuntime.ts) with
 * DIFFERENT, independently-evidenced config objects, instead of two
 * duplicated provider implementations (see tonight's brief, "one reusable
 * controller implementation instantiated with independent profiles/state").
 *
 * RIGHT_HAND_RUNTIME_CONFIG's values are copied byte-for-byte from the
 * accepted, real-gameplay/video-validated implementation — see
 * SensorHandRuntimeConfig.test.ts for the regression lock (any future edit
 * to these specific values needs an explicit, reviewed reason, not an
 * accidental side effect of LEFT_HAND work). Do NOT retune these.
 */
export interface SensorHandRuntimeConfig {
  readonly role: PhysicalRole;
  /** Arabic label for this role, e.g. for the readiness dashboard and role-assignment UI. */
  readonly arabicLabel: string;
  /** localStorage key Wt901BleInputSource uses to remember this role's previously-authorized device — must be unique per role. */
  readonly deviceHintKey: string;
  readonly motionConfig: Partial<ContinuousMotionConfig>;
}

export const RIGHT_HAND_DEVICE_HINT_KEY = "shumos:sensor:right-hand:deviceId";
export const LEFT_HAND_DEVICE_HINT_KEY = "shumos:sensor:left-hand:deviceId";

/**
 * FROZEN — accepted from real gameplay and video testing (see tonight's
 * brief, section 1). twistTrackingMode/crossAxisCalibration is this ONE
 * adult's own (Omar, RIGHT_HAND) real evidence from the 2026-09-04
 * twist-invariance capture — see RightHandAdultTwistInvariantCalibrationEvidence.ts.
 * Do not change any field here without an explicit, reviewed reason; see
 * the regression test in __tests__/SensorHandRuntimeConfig.test.ts.
 */
export const RIGHT_HAND_RUNTIME_CONFIG: SensorHandRuntimeConfig = {
  role: PhysicalRole.RIGHT_HAND,
  arabicLabel: "حساس اليد اليمنى",
  deviceHintKey: RIGHT_HAND_DEVICE_HINT_KEY,
  motionConfig: {
    filterMode: "ADAPTIVE_EMA",
    autoCenter: true,
    twistTrackingMode: "ROLL_INVARIANT_TRANSVERSE_FRAME",
    crossAxisCalibration: RIGHT_HAND_ADULT_2026_09_04_TWIST_INVARIANT_CALIBRATION.matrix,
  },
};

/**
 * LEFT_HAND — architecture only, deliberately NOT RIGHT_HAND's numbers (see
 * tools/witmotion_ble/docs/left-hand-phase2-plan.md, "why LEFT_HAND is not
 * just RIGHT_HAND with a flipped sign"). Reuses the same proven
 * ROLL_INVARIANT_TRANSVERSE_FRAME architecture and ADAPTIVE_EMA filter
 * stack, but with `crossAxisCalibration` left `undefined` (the controller's
 * own default — an identity mapping, see DEFAULT_CONTINUOUS_MOTION_CONFIG)
 * until a real LEFT_HAND enrollment session produces its own measured
 * evidence. Never populate this with RIGHT_HAND's matrix "as a placeholder"
 * — an uncalibrated identity mapping is an honest default; a copied
 * right-hand matrix silently mounted on a mirrored wrist is not.
 */
export const LEFT_HAND_RUNTIME_CONFIG: SensorHandRuntimeConfig = {
  role: PhysicalRole.LEFT_HAND,
  arabicLabel: "حساس اليد اليسرى",
  deviceHintKey: LEFT_HAND_DEVICE_HINT_KEY,
  motionConfig: {
    filterMode: "ADAPTIVE_EMA",
    autoCenter: true,
    twistTrackingMode: "ROLL_INVARIANT_TRANSVERSE_FRAME",
  },
};

export function arabicLabelFor(role: PhysicalRole): string {
  if (role === PhysicalRole.RIGHT_HAND) return RIGHT_HAND_RUNTIME_CONFIG.arabicLabel;
  if (role === PhysicalRole.LEFT_HAND) return LEFT_HAND_RUNTIME_CONFIG.arabicLabel;
  return role;
}

/** Re-exported only so tests/tools can reference the exact frozen matrix type without importing ContinuousMotionController directly. */
export type { CrossAxisCalibrationMatrix };

/**
 * Physical hardware input domain types - shared vocabulary for
 * PhysicalInputManager and every InputSource/SemanticDetector implementation.
 *
 * NOT WIRED TO ANY GAME. Nothing in lib/game, lib/control, lib/display, or
 * components/* imports from lib/physicalInput, and nothing here imports
 * from those - this is prepared architecture only (see
 * tools/witmotion_ble/docs/balloon-quest-integration-plan.md for the exact
 * files a future, explicitly-approved task would touch to change that).
 *
 * MotionSample mirrors tools/witmotion_ble/calibration_engine.py's
 * MotionSample dataclass field-for-field (timestamp/acceleration_g/
 * gyroscope_dps/angles_deg) so a future WT901BLECL adapter and the
 * already-validated Python detection research describe literally the same
 * boundary, in whichever language ends up producing it in production.
 */

/** One IMU sample. Units match the Python prototype: g, degrees/second, degrees. */
export interface MotionSample {
  readonly timestampMs: number;
  readonly accelerationG: readonly [number, number, number];
  readonly gyroscopeDps: readonly [number, number, number];
  readonly anglesDeg: readonly [number, number, number];
  /** Optional host-side timing marks; telemetry values remain identical to the Python MotionSample boundary. */
  readonly pipelineTiming?: MotionSamplePipelineTiming;
}

export interface MotionSamplePipelineTiming {
  readonly bleNotificationAtMs: number;
  readonly parsingStartedAtMs: number;
  readonly parsedAtMs: number;
}

/**
 * The four physical input roles a therapist can eventually assign a sensor
 * (or other input device) to. Each role gets its own InputSource, its own
 * SemanticDetector instance, and its own CalibrationProfile - see
 * PhysicalInputManager's own doc comment for why these must never share
 * state ("no cross-triggering").
 */
export enum PhysicalRole {
  RIGHT_HAND = "RIGHT_HAND",
  LEFT_HAND = "LEFT_HAND",
  RIGHT_FOOT = "RIGHT_FOOT",
  LEFT_FOOT = "LEFT_FOOT",
}

/**
 * The kinds of physical input this architecture is meant to eventually
 * support (see tonight's brief). Only SIMULATED has a real implementation
 * right now (SimulatedInputSource.ts) - WT901BLECL_BLE and the rest are
 * named here so PhysicalInputManager's per-role wiring, calibration
 * profile shape, and role-assignment flow are not accidentally coupled to
 * "it's always a WITMOTION IMU".
 */
export enum InputSourceKind {
  WT901BLECL_BLE = "WT901BLECL_BLE",
  SIMULATED = "SIMULATED",
  ADAPTIVE_BUTTON = "ADAPTIVE_BUTTON",
  GAMEPAD = "GAMEPAD",
  STEERING_WHEEL_PEDALS = "STEERING_WHEEL_PEDALS",
}

export enum ConnectionState {
  DISCONNECTED = "DISCONNECTED",
  CONNECTING = "CONNECTING",
  CONNECTED = "CONNECTED",
  ERROR = "ERROR",
}

/**
 * A device's calibration standing for one role. NEEDS_RECALIBRATION is a
 * distinct state from NOT_CALIBRATED specifically for the disconnect-safety
 * requirement ("recalibration requirement is explicit if orientation/
 * profile becomes invalid") - a device that reconnects after a disconnect
 * long enough to plausibly have moved on the body must not silently resume
 * emitting semantic events against a possibly-stale profile.
 */
export enum CalibrationStatus {
  NOT_CALIBRATED = "NOT_CALIBRATED",
  CALIBRATED = "CALIBRATED",
  NEEDS_RECALIBRATION = "NEEDS_RECALIBRATION",
}

/**
 * One role's personalized calibration. Deliberately data, not a class per
 * role/gesture - see calibrationProfile.ts's doc comment for why a single
 * reusable engine keyed by role replaces four near-duplicate ones.
 */
export interface CalibrationProfile {
  readonly role: PhysicalRole;
  readonly status: CalibrationStatus;
  /** Opaque to this layer - whatever the chosen SemanticDetector needs (e.g. a ported BaselineProfile + directional prototypes). */
  readonly envelope: unknown;
  readonly skippedDirections: readonly string[];
  readonly calibratedAtMs: number | null;
  /** The InputSource device id this profile was captured against, for the "second sensor may not share axis signs" caution - see left-hand plan doc. */
  readonly deviceId: string | null;
}

/** One recognized gesture. `gesture` stays a free string (e.g. "RIGHT_HAND_RAISE") rather than a role-specific enum so new gestures do not require touching this shared type. */
export interface SemanticEvent {
  readonly role: PhysicalRole;
  readonly gesture: string;
  readonly timestampMs: number;
  readonly detail?: Readonly<Record<string, unknown>>;
}

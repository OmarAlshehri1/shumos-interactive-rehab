import { CalibrationStatus, type CalibrationProfile, type PhysicalRole } from "./types";

/**
 * Reusable calibration profile helpers - one shape for all four roles.
 * Deliberately NOT four separate calibration engines/types (RightHandProfile,
 * LeftHandProfile, ...): tonight's brief is explicit that the role is an
 * input/configuration to one engine, not a reason to duplicate it. Whatever
 * the eventual ported detector needs (a BaselineProfile-equivalent envelope,
 * directional prototypes, noise floor) goes in `envelope` as opaque data -
 * this module only owns the role-agnostic lifecycle around that data
 * (uncalibrated -> calibrated -> needs-recalibration), matching
 * CalibrationStatus in types.ts.
 */

export function createUncalibratedProfile(role: PhysicalRole, deviceId: string | null = null): CalibrationProfile {
  return {
    role,
    status: CalibrationStatus.NOT_CALIBRATED,
    envelope: null,
    skippedDirections: [],
    calibratedAtMs: null,
    deviceId,
  };
}

export function createCalibratedProfile(
  role: PhysicalRole,
  deviceId: string,
  envelope: unknown,
  options: { skippedDirections?: readonly string[]; calibratedAtMs?: number } = {},
): CalibrationProfile {
  return {
    role,
    status: CalibrationStatus.CALIBRATED,
    envelope,
    skippedDirections: options.skippedDirections ?? [],
    calibratedAtMs: options.calibratedAtMs ?? Date.now(),
    deviceId,
  };
}

export function withNeedsRecalibration(profile: CalibrationProfile): CalibrationProfile {
  return { ...profile, status: CalibrationStatus.NEEDS_RECALIBRATION };
}

export function isUsable(profile: CalibrationProfile): boolean {
  return profile.status === CalibrationStatus.CALIBRATED;
}

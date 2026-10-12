import { describe, expect, it } from "vitest";
import { LEFT_HAND_RUNTIME_CONFIG, RIGHT_HAND_RUNTIME_CONFIG, arabicLabelFor } from "../SensorHandRuntimeConfig";
import { PhysicalRole } from "../types";

/**
 * REGRESSION LOCK for the accepted RIGHT_HAND baseline (tonight's brief,
 * section 1: "freeze RIGHT_HAND... do NOT retune"). If this test starts
 * failing, someone changed a value SensorRuntimeProvider used to hardcode
 * inline before it was extracted here — that is exactly the kind of
 * accidental regression this test exists to catch while LEFT_HAND work is
 * in progress elsewhere in the same files.
 */
describe("RIGHT_HAND_RUNTIME_CONFIG — frozen baseline", () => {
  it("keeps the exact accepted motion config", () => {
    expect(RIGHT_HAND_RUNTIME_CONFIG.motionConfig.filterMode).toBe("ADAPTIVE_EMA");
    expect(RIGHT_HAND_RUNTIME_CONFIG.motionConfig.autoCenter).toBe(true);
    expect(RIGHT_HAND_RUNTIME_CONFIG.motionConfig.twistTrackingMode).toBe("ROLL_INVARIANT_TRANSVERSE_FRAME");
  });

  it("keeps the exact 2026-09-04 real twist-invariance calibration matrix", () => {
    expect(RIGHT_HAND_RUNTIME_CONFIG.motionConfig.crossAxisCalibration).toEqual([
      [0.06844522504384973, -0.99776377346668],
      [-0.9986642259056224, -0.05373137230794926],
    ]);
  });

  it("keeps the exact, long-standing device hint key (real therapists' authorized devices already rely on this)", () => {
    expect(RIGHT_HAND_RUNTIME_CONFIG.deviceHintKey).toBe("shumos:sensor:right-hand:deviceId");
  });

  it("is tagged RIGHT_HAND and carries the Arabic label used by the readiness dashboard", () => {
    expect(RIGHT_HAND_RUNTIME_CONFIG.role).toBe(PhysicalRole.RIGHT_HAND);
    expect(RIGHT_HAND_RUNTIME_CONFIG.arabicLabel).toBe("حساس اليد اليمنى");
  });
});

describe("LEFT_HAND_RUNTIME_CONFIG — independent architecture, not RIGHT_HAND's numbers", () => {
  it("is tagged LEFT_HAND with its own Arabic label and its own device hint key", () => {
    expect(LEFT_HAND_RUNTIME_CONFIG.role).toBe(PhysicalRole.LEFT_HAND);
    expect(LEFT_HAND_RUNTIME_CONFIG.arabicLabel).toBe("حساس اليد اليسرى");
    expect(LEFT_HAND_RUNTIME_CONFIG.deviceHintKey).not.toBe(RIGHT_HAND_RUNTIME_CONFIG.deviceHintKey);
  });

  it("reuses the same proven roll-invariant architecture as RIGHT_HAND", () => {
    expect(LEFT_HAND_RUNTIME_CONFIG.motionConfig.twistTrackingMode).toBe("ROLL_INVARIANT_TRANSVERSE_FRAME");
    expect(LEFT_HAND_RUNTIME_CONFIG.motionConfig.filterMode).toBe("ADAPTIVE_EMA");
  });

  it("does NOT inherit RIGHT_HAND's personalized cross-axis calibration - no evidence yet", () => {
    expect(LEFT_HAND_RUNTIME_CONFIG.motionConfig.crossAxisCalibration).toBeUndefined();
  });
});

describe("arabicLabelFor", () => {
  it("returns each role's Arabic label", () => {
    expect(arabicLabelFor(PhysicalRole.RIGHT_HAND)).toBe("حساس اليد اليمنى");
    expect(arabicLabelFor(PhysicalRole.LEFT_HAND)).toBe("حساس اليد اليسرى");
  });
});

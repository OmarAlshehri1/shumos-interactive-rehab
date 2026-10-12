import { describe, expect, it } from "vitest";
import { buildLeftHandEnrollmentExport, summarizeTwistPostureAngles } from "../LeftHandEnrollmentProfile";
import type { MotionDiagnosticRecord } from "../MotionDiagnostic";
import type { NormalizedPointer } from "../ContinuousMotionController";
import type { MotionSample } from "../types";

function sample(timestampMs: number, rollDeg = 0): MotionSample {
  return { timestampMs, accelerationG: [0, 0, 1], gyroscopeDps: [0, 0, 0], anglesDeg: [rollDeg, 0, 0] };
}

function pointerRecord(phase: string, timestampMs: number, x: number, y: number, rollDeg = 0): MotionDiagnosticRecord {
  const output: NormalizedPointer = {
    pointer: { x, y },
    unfilteredPointer: { x, y },
    visualOrientation: { rotationDeg: 0 },
    confidence: 1,
    timestampMs,
    timing: { bleNotificationAtMs: timestampMs, parsingStartedAtMs: timestampMs, parsedAtMs: timestampMs, controllerStartedAtMs: timestampMs, filterStartedAtMs: timestampMs, filterCompletedAtMs: timestampMs, pointerOutputAtMs: timestampMs },
  };
  return { phase, sample: sample(timestampMs, rollDeg), output };
}

const CONFIG = {
  xAxis: "yaw", yAxis: "pitch", rotationAxis: "roll", invertX: true, invertY: false, invertRotation: false,
  sensitivity: 1, deadZoneDeg: 1.25, smoothing: 0.35, filterMode: "ADAPTIVE_EMA", rotationCompensationX: 0,
  rotationCompensationY: 0, autoCenter: true, crossAxisCalibration: null, twistTrackingMode: "ROLL_INVARIANT_TRANSVERSE_FRAME", stabilizationLevel: "MEDIUM",
} as const;

describe("summarizeTwistPostureAngles", () => {
  it("measures the actual (gyroscope-fused) wrist roll per twist-invariance phase, relative to the session's own center", () => {
    const records = [
      pointerRecord("neutral_up", 0, 0.5, 0.4, 0),
      pointerRecord("neutral_up", 10, 0.5, 0.35, 2),
      pointerRecord("twist_45_up", 20, 0.5, 0.4, 45),
      pointerRecord("twist_45_up", 30, 0.5, 0.35, 47),
    ];
    const summary = summarizeTwistPostureAngles(records, 0);
    const neutralUp = summary.find((s) => s.phase === "neutral_up")!;
    const twist45Up = summary.find((s) => s.phase === "twist_45_up")!;
    const neutralDown = summary.find((s) => s.phase === "neutral_down")!;

    expect(neutralUp.sampleCount).toBe(2);
    expect(neutralUp.actualWristAngleDeg!.mean).toBeCloseTo(1, 6);
    expect(twist45Up.sampleCount).toBe(2);
    expect(twist45Up.actualWristAngleDeg!.mean).toBeCloseTo(46, 6);
    expect(neutralDown.sampleCount).toBe(0);
    expect(neutralDown.actualWristAngleDeg).toBeNull();
  });

  it("covers every TWIST_INVARIANCE_PHASES entry, in order, even when no records exist for any of them", () => {
    const summary = summarizeTwistPostureAngles([], 0);
    expect(summary.length).toBe(12); // 3 postures x 4 directions
    expect(summary.every((s) => s.sampleCount === 0 && s.actualWristAngleDeg === null)).toBe(true);
  });
});

describe("buildLeftHandEnrollmentExport", () => {
  it("assembles a LEFT_HAND-tagged evidence export with no crossAxisCalibration/profile field anywhere in its shape", () => {
    const stillRecords = [pointerRecord("still_start", 0, 0.5, 0.5)];
    const allRecords = [...stillRecords, pointerRecord("right", 20, 0.8, 0.5)];
    const built = buildLeftHandEnrollmentExport({
      deviceId: "AA:BB:CC:DD:EE:FF",
      liveRateHz: 49.6,
      config: CONFIG,
      stillRecords,
      allRecords,
      edgeReversal: [{ phase: "edge_right_reverse_left", reversalResponseMs: 30 }],
      centerRollDeg: 0,
      events: [{ type: "recenter", atMs: 5, noteAr: "test" }],
      notesAr: ["ملاحظة اختبار"],
    });

    expect(built.role).toBe("LEFT_HAND");
    expect(built.deviceId).toBe("AA:BB:CC:DD:EE:FF");
    expect(built.liveRateHz).toBeCloseTo(49.6, 6);
    expect(built.exportVersion).toBe("left-hand-enrollment-2026-09-05");
    expect(built.achievedRange.maxRightX).toBeCloseTo(0.8, 6);
    expect(built.edgeReversal[0].reversalResponseMs).toBe(30);
    expect(built.records).toBe(allRecords);
    expect(built.disclaimer).toContain("crossAxisCalibration");
    // No calibration/profile field anywhere in the exported shape — a plain JSON round-trip should
    // never produce a "crossAxisCalibration" key outside of the disclaimer string mentioning it by name.
    const serialized = JSON.stringify(built);
    const parsed = JSON.parse(serialized) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(parsed, "crossAxisCalibration")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(parsed, "profile")).toBe(false);
  });

  it("captures 0 samples honestly (never fabricates a value) when a phase category never occurred", () => {
    const built = buildLeftHandEnrollmentExport({
      deviceId: null,
      liveRateHz: null,
      config: CONFIG,
      stillRecords: [],
      allRecords: [],
      edgeReversal: [],
      centerRollDeg: 0,
      events: [],
      notesAr: [],
    });
    expect(built.deviceId).toBeNull();
    expect(built.noiseEnvelope.sampleCount).toBe(0);
    expect(built.achievedRange.maxRightX).toBeNull();
    expect(built.twistPostureAngles.every((s) => s.sampleCount === 0)).toBe(true);
  });
});

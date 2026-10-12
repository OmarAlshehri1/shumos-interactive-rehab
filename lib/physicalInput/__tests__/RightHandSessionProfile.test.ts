import { describe, expect, it } from "vitest";
import {
  buildNoiseEnvelope,
  buildRightHandSessionProfile,
  deriveCrossAxisCalibration,
  measureAchievedRange,
  measureEdgeReversalResponse,
  recommendConfig,
} from "../RightHandSessionProfile";
import type { WitmotionConfigTrialResult } from "../WitmotionConfigTrial";
import type { MotionDiagnosticRecord } from "../MotionDiagnostic";
import type { NormalizedPointer } from "../ContinuousMotionController";
import type { MotionSample } from "../types";

function axisStat(std: number, mean = 0) {
  return { mean, std, mad: std * 0.8 };
}

function trialResult(overrides: Partial<WitmotionConfigTrialResult>): WitmotionConfigTrialResult {
  return {
    candidate: { label: "test", rateHz: 50, bandwidthHz: 20 },
    originalRateCode: 8,
    originalBandwidthCode: 4,
    sampleCount: 100,
    measuredHz: 50,
    maximumIntervalMs: 22,
    stillNoiseGyroDps: [axisStat(1), axisStat(1), axisStat(1)],
    meanParsingLatencyMs: 5,
    restored: true,
    unstable: false,
    samples: [],
    ...overrides,
  };
}

describe("recommendConfig", () => {
  it("drops unstable candidates entirely, even if their raw noise/latency numbers look good", () => {
    const good = trialResult({ candidate: { label: "stable", rateHz: 50, bandwidthHz: 20 } });
    const unstableButQuiet = trialResult({ candidate: { label: "unstable", rateHz: 100, bandwidthHz: 42 }, unstable: true, stillNoiseGyroDps: [axisStat(0.1), axisStat(0.1), axisStat(0.1)] });
    const { winner, ranked } = recommendConfig([good, unstableButQuiet]);
    expect(winner!.candidate.label).toBe("stable");
    expect(ranked).toHaveLength(1);
  });

  it("prefers lower noise + latency, not automatically the highest Hz", () => {
    const fiftyHz = trialResult({ candidate: { label: "50Hz", rateHz: 50, bandwidthHz: 20 }, stillNoiseGyroDps: [axisStat(0.5), axisStat(0.5), axisStat(0.5)], meanParsingLatencyMs: 3 });
    const hundredHzNoisier = trialResult({ candidate: { label: "100Hz", rateHz: 100, bandwidthHz: 42 }, stillNoiseGyroDps: [axisStat(3), axisStat(3), axisStat(3)], meanParsingLatencyMs: 8 });
    const { winner } = recommendConfig([fiftyHz, hundredHzNoisier]);
    expect(winner!.candidate.label).toBe("50Hz");
  });

  it("breaks a near-tie by preferring the lower rate", () => {
    const fiftyHz = trialResult({ candidate: { label: "50Hz", rateHz: 50, bandwidthHz: 20 }, stillNoiseGyroDps: [axisStat(1), axisStat(1), axisStat(1)], meanParsingLatencyMs: 5 });
    const hundredHzSame = trialResult({ candidate: { label: "100Hz", rateHz: 100, bandwidthHz: 42 }, stillNoiseGyroDps: [axisStat(1.01), axisStat(1.01), axisStat(1.01)], meanParsingLatencyMs: 5.01 });
    const { winner } = recommendConfig([fiftyHz, hundredHzSame]);
    expect(winner!.candidate.rateHz).toBe(50);
  });

  it("reports no winner when nothing is stable", () => {
    const { winner, reasoningAr } = recommendConfig([trialResult({ unstable: true })]);
    expect(winner).toBeNull();
    expect(reasoningAr).toContain("مستقر");
  });
});

function sample(timestampMs: number, gyroscopeDps: readonly [number, number, number] = [0, 0, 0]): MotionSample {
  return { timestampMs, accelerationG: [0, 0, 1], gyroscopeDps, anglesDeg: [0, 0, 0] };
}

function pointerRecord(phase: string, timestampMs: number, x: number, y: number, gyroscopeDps: readonly [number, number, number] = [0, 0, 0]): MotionDiagnosticRecord {
  const output: NormalizedPointer = {
    pointer: { x, y },
    unfilteredPointer: { x, y },
    visualOrientation: { rotationDeg: 0 },
    confidence: 1,
    timestampMs,
    timing: { bleNotificationAtMs: timestampMs, parsingStartedAtMs: timestampMs, parsedAtMs: timestampMs, controllerStartedAtMs: timestampMs, filterStartedAtMs: timestampMs, filterCompletedAtMs: timestampMs, pointerOutputAtMs: timestampMs },
  };
  return { phase, sample: sample(timestampMs, gyroscopeDps), output };
}

describe("buildNoiseEnvelope", () => {
  it("computes robust MAD alongside mean/std per gyro axis from still-phase records", () => {
    const records = [
      pointerRecord("still_start", 0, 0.5, 0.5, [0.1, 0.2, 0.3]),
      pointerRecord("still_start", 20, 0.5, 0.5, [-0.1, -0.2, -0.3]),
      pointerRecord("still_start", 40, 0.5, 0.5, [0.2, 0.1, 0.1]),
    ];
    const envelope = buildNoiseEnvelope(records);
    expect(envelope.sampleCount).toBe(3);
    expect(envelope.gyroDps[0].mean).toBeCloseTo((0.1 - 0.1 + 0.2) / 3, 6);
  });
});

describe("measureAchievedRange", () => {
  it("finds the furthest displacement reached per directional phase", () => {
    const records = [
      pointerRecord("right", 0, 0.6, 0.5),
      pointerRecord("right", 20, 0.9, 0.5),
      pointerRecord("left", 40, 0.2, 0.5),
      pointerRecord("up", 60, 0.5, 0.1),
      pointerRecord("down", 80, 0.5, 0.85),
    ];
    const range = measureAchievedRange(records);
    expect(range.maxRightX).toBeCloseTo(0.9, 6);
    expect(range.maxLeftX).toBeCloseTo(0.2, 6);
    expect(range.maxUpY).toBeCloseTo(0.1, 6);
    expect(range.maxDownY).toBeCloseTo(0.85, 6);
  });

  it("returns null for a direction with no records", () => {
    const range = measureAchievedRange([pointerRecord("right", 0, 0.9, 0.5)]);
    expect(range.maxLeftX).toBeNull();
  });
});

describe("measureEdgeReversalResponse", () => {
  it("measures elapsed time from the last edge-pinned sample to the first sample that moved off it", () => {
    const records = [
      pointerRecord("edge_right_reverse_left", 0, 0.9, 0.5),
      pointerRecord("edge_right_reverse_left", 20, 1, 0.5),
      pointerRecord("edge_right_reverse_left", 40, 1, 0.5), // still pinned at the edge (continued pushing outward)
      pointerRecord("edge_right_reverse_left", 60, 0.98, 0.5), // reversal begins
      pointerRecord("edge_right_reverse_left", 80, 0.9, 0.5),
    ];
    const responseMs = measureEdgeReversalResponse(records, "x", 1);
    expect(responseMs).toBe(20); // from the sample at t=40 (last one still at 1) to t=60
  });

  it("returns null when the phase never actually reached the edge", () => {
    const records = [pointerRecord("edge_right_reverse_left", 0, 0.7, 0.5), pointerRecord("edge_right_reverse_left", 20, 0.75, 0.5)];
    expect(measureEdgeReversalResponse(records, "x", 1)).toBeNull();
  });
});

describe("buildRightHandSessionProfile", () => {
  it("assembles a profile from measured session data, including the personalization disclaimer", () => {
    const stillRecords = [pointerRecord("still_start", 0, 0.5, 0.5, [0.1, 0, 0])];
    const allRecords = [...stillRecords, pointerRecord("right", 20, 0.8, 0.5)];
    const profile = buildRightHandSessionProfile({
      hardware: { rateHz: 50, bandwidthHz: 20, source: "measured_today" },
      config: {
        xAxis: "yaw", yAxis: "pitch", rotationAxis: "roll", invertX: true, invertY: false, invertRotation: false,
        sensitivity: 1, deadZoneDeg: 1.25, smoothing: 0.35, filterMode: "ADAPTIVE_EMA", rotationCompensationX: 0,
        rotationCompensationY: 0, autoCenter: false, crossAxisCalibration: null, twistTrackingMode: "FROZEN_AT_RECENTER", stabilizationLevel: "MEDIUM",
      },
      stillRecords,
      allRecords,
      edgeReversal: [{ phase: "edge_right_reverse_left", reversalResponseMs: 20 }],
      notesAr: ["ملاحظة تجريبية"],
      datasetReferences: ["wt901-right-hand-final-session-123.json"],
    });
    expect(profile.role).toBe("RIGHT_HAND");
    expect(profile.hardware.rateHz).toBe(50);
    expect(profile.disclaimer).toContain("enrollment");
    expect(profile.edgeReversal[0].reversalResponseMs).toBe(20);
    expect(profile.achievedRange.maxRightX).toBeCloseTo(0.8, 6);
    expect(profile.crossAxisCalibration).toBeNull(); // fewer than 10 samples per cardinal phase in this fixture
  });
});

describe("deriveCrossAxisCalibration", () => {
  it("returns null when a cardinal phase has too few samples to trust a PCA direction from", () => {
    const records = [pointerRecord("up", 0, 0.5, 0.45), pointerRecord("up", 20, 0.5, 0.4)];
    expect(deriveCrossAxisCalibration(records)).toBeNull();
  });

  it("recovers a matrix that cancels a synthetic diagonal leak on straight up/down/left/right motion", () => {
    const records: MotionDiagnosticRecord[] = [];
    // "up": intended pure -Y, but leaks +0.2 * |dy| onto X each step (a stand-in for real mounting coupling).
    for (let i = 0; i <= 20; i += 1) {
      const dy = -i * 0.01;
      records.push(pointerRecord("up", i * 10, 0.5 + 0.2 * Math.abs(dy), 0.5 + dy));
    }
    // "down": mirror image (same leak sign convention relative to its own direction).
    for (let i = 0; i <= 20; i += 1) {
      const dy = i * 0.01;
      records.push(pointerRecord("down", 300 + i * 10, 0.5 - 0.2 * Math.abs(dy), 0.5 + dy));
    }
    // "left"/"right": clean, no leak, so the pooled horizontal direction is a trustworthy near-identity reference.
    for (let i = 0; i <= 20; i += 1) {
      records.push(pointerRecord("left", 600 + i * 10, 0.5 - i * 0.01, 0.5));
      records.push(pointerRecord("right", 900 + i * 10, 0.5 + i * 0.01, 0.5));
    }

    const evidence = deriveCrossAxisCalibration(records);
    expect(evidence).not.toBeNull();
    expect(evidence!.sampleCounts).toEqual({ up: 21, down: 21, left: 21, right: 21 });

    // Applying the derived matrix to the raw "up" displacement should straighten it back toward pure -Y.
    const [[a, b], [c, d]] = evidence!.matrix;
    const rawDx = 0.2 * 0.2; // leak at i=20 (dy=-0.2)
    const rawDy = -0.2;
    const correctedDx = a * rawDx + b * rawDy;
    const correctedDy = c * rawDx + d * rawDy;
    expect(Math.abs(correctedDx)).toBeLessThan(Math.abs(rawDx) * 0.15);
    expect(Math.abs(correctedDy)).toBeGreaterThan(0.15); // vertical motion itself preserved, not zeroed out (sign depends on eigenvector resolution, not asserted)
  });
});

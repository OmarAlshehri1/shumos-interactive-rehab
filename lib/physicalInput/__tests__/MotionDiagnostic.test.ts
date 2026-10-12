import { describe, expect, it } from "vitest";
import { analyzeRotationInPlace, summarizeMotionLatency, type MotionDiagnosticRecord } from "../MotionDiagnostic";
import type { NormalizedPointer } from "../ContinuousMotionController";
import type { MotionSample } from "../types";

function record(
  phase: MotionDiagnosticRecord["phase"],
  timestampMs: number,
  roll: number,
  pitch: number,
  yaw: number,
): MotionDiagnosticRecord {
  const sample: MotionSample = {
    timestampMs,
    accelerationG: [0, 0, 1],
    gyroscopeDps: [0, 0, 0],
    anglesDeg: [roll, pitch, yaw],
    pipelineTiming: { bleNotificationAtMs: timestampMs, parsingStartedAtMs: timestampMs + 1, parsedAtMs: timestampMs + 2 },
  };
  const output: NormalizedPointer = {
    pointer: { x: 0.5 + yaw / 100, y: 0.5 + pitch / 100 },
    unfilteredPointer: { x: 0.5 + yaw / 100, y: 0.5 + pitch / 100 },
    visualOrientation: { rotationDeg: roll },
    confidence: 1,
    timestampMs,
    timing: {
      bleNotificationAtMs: timestampMs,
      parsingStartedAtMs: timestampMs + 1,
      parsedAtMs: timestampMs + 2,
      controllerStartedAtMs: timestampMs + 2,
      filterStartedAtMs: timestampMs + 2.2,
      filterCompletedAtMs: timestampMs + 2.4,
      pointerOutputAtMs: timestampMs + 3,
    },
  };
  return { phase, sample, output, uiCommittedAtMs: timestampMs + 5, visualFrameAtMs: timestampMs + 10 };
}

describe("labeled motion diagnostic", () => {
  it("measures rotation-only pointer drift and estimates axis contamination", () => {
    const records = [
      record("still_start", 0, 0, 0, 0),
      record("rotate_one", 10, 0, 0, 0),
      record("rotate_one", 20, 10, -2.5, 5),
      record("rotate_one", 30, 20, -5, 10),
      record("rotate_other", 40, 0, 0, 0),
      record("rotate_other", 50, -10, 2.5, -5),
      record("rotate_other", 60, -20, 5, -10),
    ];
    const analysis = analyzeRotationInPlace(records, { xAxis: "yaw", yAxis: "pitch", rotationAxis: "roll" });
    expect(analysis.phases).toHaveLength(2);
    expect(analysis.phases[0].maximumPointerDrift).toBeGreaterThan(0.1);
    expect(analysis.suggestedCompensationX).toBeCloseTo(0.5);
    expect(analysis.suggestedCompensationY).toBeCloseTo(-0.25);

    // Both directions here were mirror images of each other (same slope
    // magnitude, negated together) - the pooled number must not silently
    // paper over disagreement that isn't actually present.
    expect(analysis.directionalCompensationX.rotate_one).toBeCloseTo(0.5);
    expect(analysis.directionalCompensationX.rotate_other).toBeCloseTo(0.5);
    expect(analysis.directionalCompensationX.agree).toBe(true);
    expect(analysis.directionalCompensationY.agree).toBe(true);
  });

  it("flags disagreement instead of quietly pooling when the two rotation directions imply different coupling", () => {
    const records = [
      record("still_start", 0, 0, 0, 0),
      // rotate_one: yaw drifts a full 1:1 with roll (strong coupling).
      record("rotate_one", 10, 0, 0, 0),
      record("rotate_one", 20, 10, 0, 10),
      record("rotate_one", 30, 20, 0, 20),
      // rotate_other: yaw barely drifts at all for the same roll swing.
      record("rotate_other", 40, 0, 0, 0),
      record("rotate_other", 50, -10, 0, -1),
      record("rotate_other", 60, -20, 0, -2),
    ];
    const analysis = analyzeRotationInPlace(records, { xAxis: "yaw", yAxis: "pitch", rotationAxis: "roll" });
    expect(analysis.directionalCompensationX.rotate_one).toBeCloseTo(1);
    expect(analysis.directionalCompensationX.rotate_other).toBeCloseTo(0.1);
    expect(analysis.directionalCompensationX.agree).toBe(false);
    // The pooled slope still exists (a caller may fall back to it) but it is
    // neither direction's true coupling - callers must consult `agree`.
    expect(analysis.suggestedCompensationX).not.toBeNull();
  });

  it("summarizes every host-side latency boundary separately", () => {
    const summary = summarizeMotionLatency([
      record("still_start", 0, 0, 0, 0),
      record("still_start", 20, 0, 0, 0),
    ]);
    expect(summary).toMatchObject({
      sampleIntervalMs: 20,
      parsingLatencyMs: 1,
      controllerLatencyMs: 1,
      outputToUiCommitMs: 2,
      outputToVisualFrameMs: 7,
      notificationToVisualFrameMs: 10,
    });
    expect(summary.filterProcessingMs).toBeCloseTo(0.2);
  });
});

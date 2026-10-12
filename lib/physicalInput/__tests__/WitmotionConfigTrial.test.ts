import { describe, expect, it } from "vitest";
import { runTemporaryWitmotionConfigTrial, runWitmotionConfigComparison, type ConfigTrialSource, type WitmotionConfigCandidate } from "../WitmotionConfigTrial";
import { ConnectionState, type MotionSample } from "../types";

function motionSample(timestampMs: number, gyroscopeDps: readonly [number, number, number] = [0, 0, 0]): MotionSample {
  return {
    timestampMs,
    accelerationG: [0, 0, 1],
    gyroscopeDps,
    anglesDeg: [0, 0, 0],
    pipelineTiming: { bleNotificationAtMs: timestampMs, parsingStartedAtMs: timestampMs, parsedAtMs: timestampMs + 2 },
  };
}

function fakeSource(overrides: Partial<ConfigTrialSource> = {}): { source: ConfigTrialSource; calls: string[] } {
  const calls: string[] = [];
  const source: ConfigTrialSource = {
    connectionState: ConnectionState.CONNECTED,
    async readOutputRateCode() { calls.push("readRate"); return 0x08; },
    async setTemporaryOutputRate(rate) { calls.push(`setRate:${rate}`); },
    async restoreOutputRateCode(code) { calls.push(`restoreRate:${code}`); },
    async readBandwidthCode() { calls.push("readBandwidth"); return 0x04; },
    async setTemporaryBandwidth(hz) { calls.push(`setBandwidth:${hz}`); },
    async restoreBandwidthCode(code) { calls.push(`restoreBandwidth:${code}`); },
    onSample() { return () => undefined; },
    ...overrides,
  };
  return { source, calls };
}

const CANDIDATE: WitmotionConfigCandidate = { label: "50Hz / 20Hz bandwidth", rateHz: 50, bandwidthHz: 20 };

describe("temporary WITMOTION rate+bandwidth config trial", () => {
  it("reads both registers first, applies both temporarily, measures, and restores both", async () => {
    let clock = 0;
    let handler: ((sample: MotionSample) => void) | null = null;
    const calls: string[] = [];
    const source: ConfigTrialSource = {
      connectionState: ConnectionState.CONNECTED,
      async readOutputRateCode() { calls.push("readRate"); return 0x08; },
      async setTemporaryOutputRate(rate) { calls.push(`setRate:${rate}`); },
      async restoreOutputRateCode(code) { calls.push(`restoreRate:${code}`); },
      async readBandwidthCode() { calls.push("readBandwidth"); return 0x04; },
      async setTemporaryBandwidth(hz) { calls.push(`setBandwidth:${hz}`); },
      async restoreBandwidthCode(code) { calls.push(`restoreBandwidth:${code}`); },
      onSample(next) { handler = next; return () => { handler = null; }; },
    };
    const result = await runTemporaryWitmotionConfigTrial(source, CANDIDATE, {
      settleMs: 10,
      measurementMs: 100,
      now: () => clock,
      wait: async (duration) => {
        if (duration === 100) {
          for (const time of [0, 20, 40, 60, 80, 100]) {
            clock = time;
            handler?.(motionSample(time, [0.5, -0.3, 0.1]));
          }
        }
      },
    });
    expect(calls).toEqual(["readRate", "readBandwidth", "setRate:50", "setBandwidth:20", "restoreRate:8", "restoreBandwidth:4"]);
    expect(result.measuredHz).toBeCloseTo(50, 0);
    expect(result.restored).toBe(true);
    expect(result.sampleCount).toBe(6);
    expect(result.stillNoiseGyroDps![0].mean).toBeCloseTo(0.5, 6);
    expect(result.meanParsingLatencyMs).toBeCloseTo(2, 6);
  });

  it("still restores both registers if applying the temporary config fails partway through", async () => {
    const { source, calls } = fakeSource({
      async setTemporaryBandwidth() {
        throw new Error("bandwidth write failed");
      },
    });
    await expect(runTemporaryWitmotionConfigTrial(source, CANDIDATE, { wait: async () => undefined })).rejects.toThrow("bandwidth write failed");
    expect(calls).toContain("restoreRate:8");
    expect(calls).toContain("restoreBandwidth:4");
  });

  it("refuses before writing anything when the current rate code cannot be safely restored", async () => {
    const { source, calls } = fakeSource({ async readOutputRateCode() { return 0x7f; } });
    await expect(runTemporaryWitmotionConfigTrial(source, CANDIDATE)).rejects.toThrow("CONFIG_TRIAL_REFUSES_UNRESTORABLE_RATE_CODE");
    expect(calls).toEqual([]);
  });

  it("refuses before writing anything when the current bandwidth code cannot be safely restored", async () => {
    const { source, calls } = fakeSource({ async readBandwidthCode() { calls.push("readBandwidth"); return 0x7f; } });
    await expect(runTemporaryWitmotionConfigTrial(source, CANDIDATE)).rejects.toThrow("CONFIG_TRIAL_REFUSES_UNRESTORABLE_BANDWIDTH_CODE");
    expect(calls).toEqual(["readRate", "readBandwidth"]);
  });

  it("runs a full comparison in sequence, restoring between every candidate", async () => {
    const { source, calls } = fakeSource();
    const candidates: WitmotionConfigCandidate[] = [
      { label: "A", rateHz: 50, bandwidthHz: 20 },
      { label: "B", rateHz: 100, bandwidthHz: 42 },
    ];
    const results = await runWitmotionConfigComparison(source, candidates, { wait: async () => undefined });
    expect(results).toHaveLength(2);
    expect(results[0].candidate.label).toBe("A");
    expect(results[1].candidate.label).toBe("B");
    // Restore happens after EACH candidate, before the next one's setTemporary* calls.
    expect(calls).toEqual([
      "readRate", "readBandwidth", "setRate:50", "setBandwidth:20", "restoreRate:8", "restoreBandwidth:4",
      "readRate", "readBandwidth", "setRate:100", "setBandwidth:42", "restoreRate:8", "restoreBandwidth:4",
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { runTemporaryWitmotionRateTrial, type RateTestSource } from "../WitmotionRateTest";
import { ConnectionState, type MotionSample } from "../types";

function motionSample(timestampMs: number): MotionSample {
  return { timestampMs, accelerationG: [0, 0, 1], gyroscopeDps: [0, 0, 0], anglesDeg: [0, 0, 0] };
}

describe("temporary WITMOTION output-rate trial", () => {
  it("reads first, measures 20 Hz, and restores the original code", async () => {
    let clock = 0;
    let handler: ((sample: MotionSample) => void) | null = null;
    const calls: string[] = [];
    const source: RateTestSource = {
      connectionState: ConnectionState.CONNECTED,
      async readOutputRateCode() { calls.push("read"); return 0x06; },
      async setTemporaryOutputRate(rate) { calls.push(`set:${rate}`); },
      async restoreOutputRateCode(code) { calls.push(`restore:${code}`); },
      onSample(next) { handler = next; return () => { handler = null; }; },
    };
    const result = await runTemporaryWitmotionRateTrial(source, 20, {
      settleMs: 10,
      measurementMs: 150,
      now: () => clock,
      wait: async (duration) => {
        if (duration === 150) {
          for (const time of [0, 50, 100, 150]) { clock = time; handler?.(motionSample(time)); }
        }
      },
    });
    expect(calls).toEqual(["read", "set:20", "restore:6"]);
    expect(result.measuredHz).toBe(20);
    expect(result.restored).toBe(true);
  });

  it("still restores if applying the temporary rate fails", async () => {
    const calls: string[] = [];
    const source: RateTestSource = {
      connectionState: ConnectionState.CONNECTED,
      async readOutputRateCode() { return 0x06; },
      async setTemporaryOutputRate() { throw new Error("write failed"); },
      async restoreOutputRateCode(code) { calls.push(`restore:${code}`); },
      onSample() { return () => undefined; },
    };
    await expect(runTemporaryWitmotionRateTrial(source, 50, { wait: async () => undefined })).rejects.toThrow("write failed");
    expect(calls).toEqual(["restore:6"]);
  });

  it("refuses before writing when the current code cannot be safely restored", async () => {
    const calls: string[] = [];
    const source: RateTestSource = {
      connectionState: ConnectionState.CONNECTED,
      async readOutputRateCode() { return 0x7f; },
      async setTemporaryOutputRate() { calls.push("set"); },
      async restoreOutputRateCode() { calls.push("restore"); },
      onSample() { return () => undefined; },
    };
    await expect(runTemporaryWitmotionRateTrial(source, 20)).rejects.toThrow("RATE_TEST_REFUSES_UNRESTORABLE_OR_UNKNOWN_CODE");
    expect(calls).toEqual([]);
  });
});

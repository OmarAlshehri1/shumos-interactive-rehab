import type { Unsubscribe } from "./InputSource";
import { ConnectionState, type MotionSample } from "./types";
import { isWitmotionRestorableRateCode } from "./WitmotionBleProtocol";

export interface RateTestSource {
  readonly connectionState: ConnectionState;
  readOutputRateCode(): Promise<number>;
  setTemporaryOutputRate(rateHz: 20 | 50): Promise<void>;
  restoreOutputRateCode(code: number): Promise<void>;
  onSample(handler: (sample: MotionSample) => void): Unsubscribe;
}

export interface WitmotionRateTrialResult {
  readonly requestedHz: 20 | 50;
  readonly originalRateCode: number;
  readonly sampleCount: number;
  readonly measuredHz: number;
  readonly maximumIntervalMs: number;
  readonly restored: boolean;
  readonly unstable: boolean;
}

export interface RateTestOptions {
  readonly measurementMs?: number;
  readonly settleMs?: number;
  readonly now?: () => number;
  readonly wait?: (durationMs: number) => Promise<void>;
  readonly onOriginalRateRead?: (rateCode: number) => void;
}

function defaultWait(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

/**
 * Guarded temporary trial: refuses to modify before reading the current rate,
 * measures received samples, and restores in finally even when measurement fails.
 */
export async function runTemporaryWitmotionRateTrial(
  source: RateTestSource,
  requestedHz: 20 | 50,
  options: RateTestOptions = {},
): Promise<WitmotionRateTrialResult> {
  if (source.connectionState !== ConnectionState.CONNECTED) throw new Error("RATE_TEST_REQUIRES_CONNECTION");
  const now = options.now ?? (() => performance.now());
  const wait = options.wait ?? defaultWait;
  const measurementMs = options.measurementMs ?? 3500;
  const settleMs = options.settleMs ?? 600;
  const originalRateCode = await source.readOutputRateCode();
  if (!isWitmotionRestorableRateCode(originalRateCode)) {
    throw new Error(`RATE_TEST_REFUSES_UNRESTORABLE_OR_UNKNOWN_CODE:${originalRateCode}`);
  }
  options.onOriginalRateRead?.(originalRateCode);

  const sampleTimes: number[] = [];
  let restored = false;
  let trialError: unknown = null;
  const unsubscribe = source.onSample(() => sampleTimes.push(now()));
  try {
    await source.setTemporaryOutputRate(requestedHz);
    await wait(settleMs);
    sampleTimes.length = 0;
    await wait(measurementMs);
  } catch (error) {
    trialError = error;
  } finally {
    unsubscribe();
    if (source.connectionState === ConnectionState.CONNECTED) {
      await source.restoreOutputRateCode(originalRateCode);
      restored = true;
    }
  }
  if (trialError) throw trialError;

  const intervals = sampleTimes.slice(1).map((time, index) => time - sampleTimes[index]);
  const elapsedMs = sampleTimes.length > 1 ? sampleTimes.at(-1)! - sampleTimes[0] : 0;
  const measuredHz = elapsedMs > 0 ? ((sampleTimes.length - 1) * 1000) / elapsedMs : 0;
  const maximumIntervalMs = intervals.length ? Math.max(...intervals) : 0;
  return {
    requestedHz,
    originalRateCode,
    sampleCount: sampleTimes.length,
    measuredHz,
    maximumIntervalMs,
    restored,
    unstable:
      source.connectionState !== ConnectionState.CONNECTED ||
      sampleTimes.length < 2 ||
      maximumIntervalMs > Math.max(1000, (1000 / requestedHz) * 8),
  };
}

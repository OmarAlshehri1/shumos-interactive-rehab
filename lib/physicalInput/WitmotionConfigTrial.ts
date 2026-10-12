import type { Unsubscribe } from "./InputSource";
import { ConnectionState, type MotionSample } from "./types";
import { isWitmotionRestorableRateCode, isWitmotionRestorableBandwidthCode, type WitmotionBandwidthHz } from "./WitmotionBleProtocol";

/**
 * TOMORROW'S HARDWARE CONFIG EXPERIMENT (overnight brief Part 15) — a
 * guarded, automated comparison across a SMALL set of candidate
 * (rate, bandwidth) configurations, built tonight without touching the
 * (powered-off) sensor. Combines WitmotionRateTest.ts's existing
 * rate-only guard with the newly-added bandwidth register (0x1F — see
 * WitmotionBleProtocol.ts's WITMOTION_BANDWIDTH_CODES doc comment and its
 * "not yet bench-verified" caveat) into ONE trial that measures both
 * together, since the brief's own example candidates vary both
 * ("50Hz + current bandwidth", "50Hz + alternative bandwidth", "100Hz +
 * appropriate bandwidth").
 *
 * Per candidate this measures, from passively captured samples during a
 * "hold still" trial window (the therapist/tester is expected to hold the
 * sensor still for the trial's duration — see runWitmotionConfigComparison's
 * doc comment for exactly what tomorrow's operator should do):
 *   - measuredHz / maximumIntervalMs -> actual received rate + BLE stability
 *   - stillNoise (per-axis gyro std/mad over the window)   -> noise
 *   - meanParsingLatencyMs (parsedAtMs - bleNotificationAtMs, averaged)
 *      -> latency (host-side only; see continuous-hand-pipeline-audit.md for
 *      why sensor-internal/radio latency isn't separately measurable)
 * Raw samples are also returned so a human can additionally eyeball a
 * "short movement response" by making one deliberate motion partway through
 * the held trial window and comparing the sample trace before/after it —
 * this cannot be scored unsupervised without knowing when that motion
 * happened.
 *
 * SAFETY (same policy as WitmotionRateTest.ts, applied to BOTH registers):
 * refuses to change either register unless it can first read a currently
 * restorable code for it; restores BOTH in `finally` even if measurement
 * throws; never sends the flash-persisting save command; each candidate's
 * restore happens before the next candidate is attempted, so a comparison
 * that fails partway through never leaves the sensor stuck on an
 * experimental config.
 */

export interface ConfigTrialSource {
  readonly connectionState: ConnectionState;
  readOutputRateCode(): Promise<number>;
  setTemporaryOutputRate(rateHz: 20 | 50 | 100): Promise<void>;
  restoreOutputRateCode(code: number): Promise<void>;
  readBandwidthCode(): Promise<number>;
  setTemporaryBandwidth(bandwidthHz: WitmotionBandwidthHz): Promise<void>;
  restoreBandwidthCode(code: number): Promise<void>;
  onSample(handler: (sample: MotionSample) => void): Unsubscribe;
}

export interface WitmotionConfigCandidate {
  readonly label: string;
  readonly rateHz: 20 | 50 | 100;
  readonly bandwidthHz: WitmotionBandwidthHz;
}

export interface AxisNoiseStats {
  readonly mean: number;
  readonly std: number;
  readonly mad: number;
}

export interface WitmotionConfigTrialResult {
  readonly candidate: WitmotionConfigCandidate;
  readonly originalRateCode: number;
  readonly originalBandwidthCode: number;
  readonly sampleCount: number;
  readonly measuredHz: number;
  readonly maximumIntervalMs: number;
  readonly stillNoiseGyroDps: readonly [AxisNoiseStats, AxisNoiseStats, AxisNoiseStats] | null;
  readonly meanParsingLatencyMs: number | null;
  readonly restored: boolean;
  readonly unstable: boolean;
  readonly samples: readonly MotionSample[];
}

export interface ConfigTrialOptions {
  readonly measurementMs?: number;
  readonly settleMs?: number;
  readonly now?: () => number;
  readonly wait?: (durationMs: number) => Promise<void>;
}

function defaultWait(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function axisStats(values: readonly number[]): AxisNoiseStats {
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const mad = [...values].map((v) => Math.abs(v - median)).sort((a, b) => a - b)[Math.floor(sorted.length / 2)];
  return { mean, std: Math.sqrt(variance), mad };
}

/** One candidate's guarded trial. See this file's doc comment for the full safety story. */
export async function runTemporaryWitmotionConfigTrial(
  source: ConfigTrialSource,
  candidate: WitmotionConfigCandidate,
  options: ConfigTrialOptions = {},
): Promise<WitmotionConfigTrialResult> {
  if (source.connectionState !== ConnectionState.CONNECTED) throw new Error("CONFIG_TRIAL_REQUIRES_CONNECTION");
  const now = options.now ?? (() => performance.now());
  const wait = options.wait ?? defaultWait;
  const measurementMs = options.measurementMs ?? 4000;
  const settleMs = options.settleMs ?? 600;

  const originalRateCode = await source.readOutputRateCode();
  if (!isWitmotionRestorableRateCode(originalRateCode)) {
    throw new Error(`CONFIG_TRIAL_REFUSES_UNRESTORABLE_RATE_CODE:${originalRateCode}`);
  }
  const originalBandwidthCode = await source.readBandwidthCode();
  if (!isWitmotionRestorableBandwidthCode(originalBandwidthCode)) {
    throw new Error(`CONFIG_TRIAL_REFUSES_UNRESTORABLE_BANDWIDTH_CODE:${originalBandwidthCode}`);
  }

  const collected: { sample: MotionSample; hostAtMs: number }[] = [];
  let trialError: unknown = null;
  const unsubscribe = source.onSample((sample) => collected.push({ sample, hostAtMs: now() }));
  try {
    await source.setTemporaryOutputRate(candidate.rateHz);
    await source.setTemporaryBandwidth(candidate.bandwidthHz);
    await wait(settleMs);
    collected.length = 0;
    await wait(measurementMs);
  } catch (error) {
    trialError = error;
  } finally {
    unsubscribe();
    let restored = false;
    if (source.connectionState === ConnectionState.CONNECTED) {
      await source.restoreOutputRateCode(originalRateCode);
      await source.restoreBandwidthCode(originalBandwidthCode);
      restored = true;
    }
    if (trialError) throw trialError;
    return buildResult(candidate, originalRateCode, originalBandwidthCode, collected, restored, source.connectionState);
  }
}

function buildResult(
  candidate: WitmotionConfigCandidate,
  originalRateCode: number,
  originalBandwidthCode: number,
  collected: { sample: MotionSample; hostAtMs: number }[],
  restored: boolean,
  connectionState: ConnectionState,
): WitmotionConfigTrialResult {
  const hostTimes = collected.map((entry) => entry.hostAtMs);
  const intervals = hostTimes.slice(1).map((time, index) => time - hostTimes[index]);
  const elapsedMs = hostTimes.length > 1 ? hostTimes.at(-1)! - hostTimes[0] : 0;
  const measuredHz = elapsedMs > 0 ? ((hostTimes.length - 1) * 1000) / elapsedMs : 0;
  const maximumIntervalMs = intervals.length ? Math.max(...intervals) : 0;

  const stillNoiseGyroDps =
    collected.length >= 2
      ? ([0, 1, 2].map((axis) => axisStats(collected.map((entry) => entry.sample.gyroscopeDps[axis]))) as [AxisNoiseStats, AxisNoiseStats, AxisNoiseStats])
      : null;

  const latencies = collected
    .map((entry) => entry.sample.pipelineTiming)
    .filter((timing): timing is NonNullable<typeof timing> => !!timing)
    .map((timing) => timing.parsedAtMs - timing.bleNotificationAtMs);
  const meanParsingLatencyMs = latencies.length ? latencies.reduce((sum, v) => sum + v, 0) / latencies.length : null;

  return {
    candidate,
    originalRateCode,
    originalBandwidthCode,
    sampleCount: collected.length,
    measuredHz,
    maximumIntervalMs,
    stillNoiseGyroDps,
    meanParsingLatencyMs,
    restored,
    unstable: connectionState !== ConnectionState.CONNECTED || collected.length < 2 || maximumIntervalMs > Math.max(1000, (1000 / candidate.rateHz) * 8),
    samples: collected.map((entry) => entry.sample),
  };
}

/**
 * Runs each candidate's guarded trial in sequence, restoring between every
 * one (see runTemporaryWitmotionConfigTrial), and stops immediately if any
 * candidate throws (its own `finally` has already restored before the
 * exception propagates, so the sensor never gets left mid-experiment) —
 * "automatically restore safe settings on failure" from the brief.
 *
 * TOMORROW'S OPERATOR PROCEDURE (not automatable — this file only owns the
 * safe register sequencing/measurement, not detecting stillness): hold the
 * sensor still for each candidate's full measurementMs window (default 4s)
 * so stillNoiseGyroDps reflects genuine noise, not motion. A convenient
 * default candidate set, matching the brief's own examples and staying
 * within what section 3 already ruled in (no untested 200Hz):
 *   { label: "50Hz / current bandwidth (baseline)", rateHz: 50, bandwidthHz: <read from device> }
 *   { label: "50Hz / narrower bandwidth",           rateHz: 50, bandwidthHz: 20 }
 *   { label: "100Hz / matched bandwidth",            rateHz: 100, bandwidthHz: 42 }
 * — the caller supplies the actual list (including the device's own current
 * bandwidth for the baseline, read once via source.readBandwidthCode()) so
 * this function stays a pure sequencer, not a source of hardcoded defaults.
 */
export interface ConfigComparisonCallbacks {
  /** Fired right before a candidate's guarded trial starts — e.g. to prompt "hold still now" in the UI. */
  readonly onCandidateStart?: (candidate: WitmotionConfigCandidate, index: number, total: number) => void;
  readonly onCandidateResult?: (result: WitmotionConfigTrialResult, index: number, total: number) => void;
}

export async function runWitmotionConfigComparison(
  source: ConfigTrialSource,
  candidates: readonly WitmotionConfigCandidate[],
  options: ConfigTrialOptions & ConfigComparisonCallbacks = {},
): Promise<WitmotionConfigTrialResult[]> {
  const results: WitmotionConfigTrialResult[] = [];
  for (const [index, candidate] of candidates.entries()) {
    options.onCandidateStart?.(candidate, index, candidates.length);
    const result = await runTemporaryWitmotionConfigTrial(source, candidate, options);
    results.push(result);
    options.onCandidateResult?.(result, index, candidates.length);
  }
  return results;
}

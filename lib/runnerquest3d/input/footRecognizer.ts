/**
 * Foot-action recognizer: turns a stream of normalised IMU samples (the same
 * MotionSample the rest of the platform uses) into three discrete, debounced
 * gestures: TILT_LEFT, TILT_RIGHT and LIFT.
 *
 * HONEST LIMITS (see docs/runnerquest3d/PHASE_R4_REPORT.md):
 *  - A WT901 gives orientation and acceleration, NOT absolute foot position or
 *    height. This does not measure foot height; it detects a deliberate change in
 *    the sensor's orientation relative to a learned rest pose.
 *  - Which physical axis a given mounting produces is UNVALIDATED. Axis choice,
 *    sign and thresholds are configuration, expected to be tuned on real hardware.
 *  - Thresholds are conservative defaults, not clinical values.
 */
import type { MotionSample } from "@/lib/physicalInput/types";
import type { Level3 } from "../types";

export type FootGesture = "TILT_LEFT" | "TILT_RIGHT" | "LIFT";
export type RecognizerState = "warming" | "neutral" | "active" | "lost";

export interface FootRecognizerConfig {
  /** Sideways tilt (degrees from rest) that counts as intentional. */
  tiltDeg: number;
  /** Lift/pitch change (degrees from rest) that counts as intentional. */
  liftDeg: number;
  /** Which angle index carries each gesture (0 roll, 1 pitch, 2 yaw) and its sign. UNVALIDATED defaults. */
  tiltAxis: 0 | 1 | 2;
  tiltSign: 1 | -1;
  liftAxis: 0 | 1 | 2;
  liftSign: 1 | -1;
  /** Fraction of the threshold the signal must fall back below before another gesture is allowed. */
  rearm: number;
  /** The signal must stay above threshold this long (rejects single-sample spikes). */
  dwellMs: number;
  /** Minimum time between gestures. */
  refractoryMs: number;
  /** Samples older than this make the source stale. */
  staleMs: number;
  /** After (re)connection or recenter, ignore input this long while learning the rest pose. */
  settleMs: number;
  /** Gyro magnitude below which the foot counts as resting (baseline may adapt). */
  restGyroDps: number;
}

export const BASE_CONFIG: FootRecognizerConfig = {
  tiltDeg: 15, liftDeg: 18, tiltAxis: 0, tiltSign: 1, liftAxis: 1, liftSign: 1,
  rearm: 0.5, dwellMs: 70, refractoryMs: 450, staleMs: 400, settleMs: 600, restGyroDps: 25,
};

const SENS: Record<Level3, number> = { low: 1.4, normal: 1, high: 0.7 };
const TOL: Record<Level3, { rearm: number; dwellMs: number; refractoryMs: number }> = {
  low: { rearm: 0.35, dwellMs: 110, refractoryMs: 600 },
  normal: { rearm: 0.5, dwellMs: 70, refractoryMs: 450 },
  high: { rearm: 0.65, dwellMs: 40, refractoryMs: 350 },
};

export function configFor(sensitivity: Level3, tolerance: Level3, base: FootRecognizerConfig = BASE_CONFIG): FootRecognizerConfig {
  const k = SENS[sensitivity];
  return { ...base, tiltDeg: base.tiltDeg * k, liftDeg: base.liftDeg * k, ...TOL[tolerance] };
}

const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
const finite3 = (v: readonly number[]) => v.length === 3 && v.every(Number.isFinite);

export class FootActionRecognizer {
  state: RecognizerState = "warming";
  private base: [number, number, number] | null = null;
  private settleUntil = 0;
  private lastSampleAt = -Infinity;
  private lastDeviceTs = -Infinity;
  private overSince: number | null = null;
  private lastEmitAt = -Infinity;
  /** Latest deviations, for diagnostics/UI. */
  dev = { tilt: 0, lift: 0 };

  constructor(public cfg: FootRecognizerConfig) {}

  setConfig(cfg: FootRecognizerConfig): void { this.cfg = cfg; }

  isFresh(nowMs: number): boolean {
    return this.state !== "lost" && nowMs - this.lastSampleAt <= this.cfg.staleMs;
  }

  /** The device dropped. Rest pose is forgotten: after reconnection the foot must settle again. */
  markDisconnected(): void {
    this.state = "lost";
    this.base = null;
    this.overSince = null;
    this.lastSampleAt = -Infinity;
  }

  /** Therapist/child "recenter": learn the current pose as neutral. */
  recenter(nowMs: number): void {
    this.base = null;
    this.state = "warming";
    this.settleUntil = nowMs + this.cfg.settleMs;
    this.overSince = null;
  }

  /** `receivedAtMs` is the Control clock; the device timestamp is only used for ordering. */
  push(sample: MotionSample, receivedAtMs: number): FootGesture | null {
    const a = sample.anglesDeg;
    if (!finite3(a) || !finite3(sample.gyroscopeDps) || !Number.isFinite(sample.timestampMs)) return null;
    if (sample.timestampMs <= this.lastDeviceTs && this.lastDeviceTs - sample.timestampMs < 2000) return null; // duplicate / out of order
    this.lastDeviceTs = sample.timestampMs;
    this.lastSampleAt = receivedAtMs;
    if (this.state === "lost" || (this.state === "warming" && this.settleUntil === 0)) {
      this.state = "warming";
      this.base = null;
      this.settleUntil = receivedAtMs + this.cfg.settleMs;
    }
    const gyro = Math.hypot(sample.gyroscopeDps[0], sample.gyroscopeDps[1], sample.gyroscopeDps[2]);
    if (this.state === "warming") {
      // Learn the rest pose only from a foot that stays still for the whole settle window;
      // any movement restarts the window, so a gesture during warm-up can never become the baseline.
      if (gyro >= this.cfg.restGyroDps) {
        this.base = null;
        this.settleUntil = receivedAtMs + this.cfg.settleMs;
        return null;
      }
      this.base = this.base ? [this.base[0] + wrap(a[0] - this.base[0]) * 0.25, this.base[1] + wrap(a[1] - this.base[1]) * 0.25, this.base[2] + wrap(a[2] - this.base[2]) * 0.25] : [a[0], a[1], a[2]];
      if (receivedAtMs >= this.settleUntil) this.state = "neutral";
      return null;
    }
    const b = this.base!;
    const tilt = wrap(a[this.cfg.tiltAxis] - b[this.cfg.tiltAxis]) * this.cfg.tiltSign;
    const lift = wrap(a[this.cfg.liftAxis] - b[this.cfg.liftAxis]) * this.cfg.liftSign;
    this.dev = { tilt, lift };
    const nt = Math.abs(tilt) / this.cfg.tiltDeg;
    const nl = lift / this.cfg.liftDeg;
    const peak = Math.max(nt, nl);
    if (this.state === "neutral") {
      // rest pose drifts slowly while the foot is resting near neutral
      if (gyro < this.cfg.restGyroDps && peak < 0.3) for (let i = 0; i < 3; i++) b[i] += wrap(a[i] - b[i]) * 0.01;
      if (peak >= 1) {
        this.overSince ??= receivedAtMs;
        if (receivedAtMs - this.overSince >= this.cfg.dwellMs && receivedAtMs - this.lastEmitAt >= this.cfg.refractoryMs) {
          this.state = "active";
          this.lastEmitAt = receivedAtMs;
          this.overSince = null;
          if (nl >= nt) return "LIFT"; // the dominant axis wins; a lift is never also a tilt
          return tilt < 0 ? "TILT_LEFT" : "TILT_RIGHT";
        }
      } else this.overSince = null;
      return null;
    }
    // active: wait for a return to neutral before another gesture can fire
    if (peak <= this.cfg.rearm) this.state = "neutral";
    return null;
  }
}

/**
 * SIMULATED foot sensors. Produces MotionSample streams shaped like a WT901 worn
 * on a foot (rest pose + small noise, and scripted tilt/lift gestures) so the
 * whole pipeline (recognizer -> hub -> session) is exercised end to end.
 * Everything here is simulation. It is never evidence of real hardware behaviour.
 */
import type { MotionSample } from "@/lib/physicalInput/types";
import { PhysicalRole } from "@/lib/physicalInput/types";
import { mulberry32 } from "../rng";
import type { FootGesture } from "./footRecognizer";

export const SAMPLE_INTERVAL_MS = 20; // 50 Hz
const RAMP_UP = 160, HOLD = 140, RAMP_DOWN = 220;

interface Active { gesture: FootGesture; startedAt: number; peak: number }

export class SimulatedFootSensor {
  connected = true;
  private active: Active | null = null;
  private rnd: () => number;
  private nextAt = 0;
  private ts = 1000;

  constructor(readonly role: PhysicalRole.RIGHT_FOOT | PhysicalRole.LEFT_FOOT, seed = 1, private rest: readonly [number, number, number] = [2, -4, 30]) {
    this.rnd = mulberry32(seed);
  }

  trigger(g: FootGesture, nowMs: number, peakDeg?: number): void {
    const peak = peakDeg ?? (g === "LIFT" ? 30 : 26);
    this.active = { gesture: g, startedAt: nowMs, peak };
  }

  /** Emits all samples due up to `nowMs` (wall time of the Control clock). */
  pump(nowMs: number, emit: (role: PhysicalRole, s: MotionSample, at: number) => void): void {
    if (this.nextAt === 0) this.nextAt = nowMs;
    while (this.nextAt <= nowMs) {
      const at = this.nextAt;
      this.nextAt += SAMPLE_INTERVAL_MS;
      this.ts += SAMPLE_INTERVAL_MS;
      if (!this.connected) continue;
      const a: [number, number, number] = [this.rest[0] + (this.rnd() - 0.5) * 0.6, this.rest[1] + (this.rnd() - 0.5) * 0.6, this.rest[2] + (this.rnd() - 0.5) * 0.4];
      let gyro = 1.5 + this.rnd();
      if (this.active) {
        const t = at - this.active.startedAt;
        const k = t < 0 ? 0 : t < RAMP_UP ? t / RAMP_UP : t < RAMP_UP + HOLD ? 1 : t < RAMP_UP + HOLD + RAMP_DOWN ? 1 - (t - RAMP_UP - HOLD) / RAMP_DOWN : -1;
        if (k < 0) this.active = null;
        else {
          const smooth = k * k * (3 - 2 * k) * this.active.peak;
          if (this.active.gesture === "TILT_LEFT") a[0] -= smooth;
          else if (this.active.gesture === "TILT_RIGHT") a[0] += smooth;
          else a[1] += smooth;
          gyro = 40 + 60 * Math.sin(k * Math.PI);
        }
      }
      emit(this.role, { timestampMs: this.ts, accelerationG: [0, 0, 1], gyroscopeDps: [gyro, 0, 0], anglesDeg: a }, at);
    }
  }
}

/** Both feet, as the Control uses them. */
export class SimulatedFootRig {
  readonly right = new SimulatedFootSensor(PhysicalRole.RIGHT_FOOT, 11);
  readonly left = new SimulatedFootSensor(PhysicalRole.LEFT_FOOT, 23);
  sensorFor(role: PhysicalRole): SimulatedFootSensor | null {
    return role === PhysicalRole.RIGHT_FOOT ? this.right : role === PhysicalRole.LEFT_FOOT ? this.left : null;
  }
  pump(nowMs: number, emit: (role: PhysicalRole, s: MotionSample, at: number) => void): void {
    this.right.pump(nowMs, emit);
    this.left.pump(nowMs, emit);
  }
}

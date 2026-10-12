export type MotionFilterMode = "LIGHT_EMA" | "ADAPTIVE_EMA" | "ONE_EURO";

export interface MotionVector {
  readonly x: number;
  readonly y: number;
  readonly rotationDeg: number;
}

export interface MotionFilterContext {
  readonly timestampMs: number;
  readonly gyroMagnitudeDps: number;
  /** User-selected smoothing strength: 0 is fastest, 0.9 is smoothest. */
  readonly smoothing: number;
}

export interface MotionVectorFilter {
  reset(value: MotionVector): void;
  filter(target: MotionVector, context: MotionFilterContext): MotionVector;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function blend(previous: MotionVector, target: MotionVector, retained: number): MotionVector {
  const applied = 1 - retained;
  return {
    x: previous.x * retained + target.x * applied,
    y: previous.y * retained + target.y * applied,
    rotationDeg: previous.rotationDeg * retained + target.rotationDeg * applied,
  };
}

class EmaVectorFilter implements MotionVectorFilter {
  private value: MotionVector | null = null;

  constructor(private readonly adaptive: boolean) {}

  reset(value: MotionVector): void {
    this.value = value;
  }

  filter(target: MotionVector, context: MotionFilterContext): MotionVector {
    if (!this.value) {
      this.value = target;
      return target;
    }
    const strength = clamp(context.smoothing, 0, 0.9);
    const deliberateMotion = clamp(context.gyroMagnitudeDps / 240, 0, 1);
    const retained = this.adaptive ? strength * (1 - deliberateMotion * 0.7) : strength * 0.55;
    this.value = blend(this.value, target, retained);
    return this.value;
  }
}

class OneEuroScalar {
  private value: number | null = null;
  private derivative = 0;
  private timestampMs: number | null = null;

  reset(value: number): void {
    this.value = value;
    this.derivative = 0;
    this.timestampMs = null;
  }

  filter(next: number, timestampMs: number, smoothing: number): number {
    if (this.value === null || this.timestampMs === null) {
      this.value = next;
      this.timestampMs = timestampMs;
      return next;
    }
    const dtSeconds = clamp((timestampMs - this.timestampMs) / 1000, 1 / 240, 0.5);
    this.timestampMs = timestampMs;
    const derivative = (next - this.value) / dtSeconds;
    this.derivative = lowPass(this.derivative, derivative, alpha(dtSeconds, 1));
    const minCutoffHz = 7.5 - clamp(smoothing, 0, 0.9) * 7;
    const cutoffHz = minCutoffHz + 0.06 * Math.abs(this.derivative);
    this.value = lowPass(this.value, next, alpha(dtSeconds, cutoffHz));
    return this.value;
  }
}

function alpha(dtSeconds: number, cutoffHz: number): number {
  const timeConstant = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + timeConstant / dtSeconds);
}

function lowPass(previous: number, next: number, applied: number): number {
  return previous + applied * (next - previous);
}

class OneEuroVectorFilter implements MotionVectorFilter {
  private readonly x = new OneEuroScalar();
  private readonly y = new OneEuroScalar();
  private readonly rotation = new OneEuroScalar();

  reset(value: MotionVector): void {
    this.x.reset(value.x);
    this.y.reset(value.y);
    this.rotation.reset(value.rotationDeg);
  }

  filter(target: MotionVector, context: MotionFilterContext): MotionVector {
    return {
      x: this.x.filter(target.x, context.timestampMs, context.smoothing),
      y: this.y.filter(target.y, context.timestampMs, context.smoothing),
      rotationDeg: this.rotation.filter(target.rotationDeg, context.timestampMs, context.smoothing),
    };
  }
}

export function createMotionVectorFilter(mode: MotionFilterMode): MotionVectorFilter {
  if (mode === "LIGHT_EMA") return new EmaVectorFilter(false);
  if (mode === "ONE_EURO") return new OneEuroVectorFilter();
  return new EmaVectorFilter(true);
}

/**
 * Short temporal directional-coherence gate, applied to the raw (x,y)
 * target BEFORE it reaches whichever MotionVectorFilter is active — a
 * distinct concern from those filters (which smooth by velocity/gyro
 * magnitude), so it composes with all three unchanged.
 *
 * WHY: at ~9.93Hz (the only real hardware rate captured so far — see
 * tools/witmotion_ble/real_dataset/), a still hand's tiny involuntary shake
 * can nudge the target position enough to read as movement even after dead
 * zone + the existing filter, because a plain low-pass filter cannot tell
 * "moving a little, consistently" apart from "wobbling in place" — both
 * look like a small nonzero delta per sample. A short rolling window over
 * the last INTENT_WINDOW_MS distinguishes them by shape, not just size:
 *   netDisplacement = distance between the window's oldest and newest point
 *   pathLength = sum of every step's length inside the window
 *   coherence = netDisplacement / pathLength (1 = a straight, one-directional
 *     path; near 0 = the path folds back on itself, canceling its own net
 *     progress — the oscillatory signature of jitter, not intent)
 * Below INTENT_COHERENCE_LOW the correction barely moves toward the new
 * sample (motion looks incoherent — likely jitter); above
 * INTENT_COHERENCE_HIGH it moves fully (motion looks deliberate, however
 * slow or small); in between it ramps linearly. A window this short (a
 * handful of samples at 50Hz) resolves consistent-vs-oscillating shape
 * within roughly the window duration, not the much longer settle time a
 * heavier low-pass would need to reach the same steadiness — see
 * MotionIntentGate.test.ts for the measured step-response delay.
 *
 * This needs at least ~3 points inside the window to detect a direction
 * reversal at all (2 points are always "coherent" by construction, since a
 * single segment can't fold back on itself) — replaying it against the 3
 * real 9.93Hz captures (tools/witmotion_ble/real_dataset/tune_intent_gate.py)
 * confirmed it is structurally inert there (only 1-2 samples fall inside
 * any window short enough to stay "short" at 50Hz), which is exactly why
 * this needed the raised sample rate, not a tuning miss. Speed (not just
 * coherence) also gates the correction: at/above INTENT_FAST_BYPASS_UNITS_
 * PER_SEC the gain is forced to 1 regardless of shape, so fast deliberate
 * motion is never slowed down.
 */
export const INTENT_WINDOW_MS = 180;
export const INTENT_COHERENCE_LOW = 0.35;
export const INTENT_COHERENCE_HIGH = 0.75;
export const INTENT_FAST_BYPASS_UNITS_PER_SEC = 3;
/**
 * Floor gain even when coherence reads fully incoherent. Not 0: a hard
 * freeze's residual bias from whatever sample happened to be "live" when
 * jitter started would otherwise only decay at this same near-zero rate
 * (an EMA's own settle time is set by its gain), leaving a slow-fading
 * offset for over a second after every stop — offline tuning
 * (tune_intent_gate.py) found 0.10 settles a cold-start bias back under a
 * visually-calm threshold within ~2-3 window-lengths while still holding
 * steady-state oscillating jitter to a small fraction of its raw amplitude.
 */
export const INTENT_MIN_GAIN = 0.1;

/**
 * Everything MotionIntentGate needs to tell "wobbling in place" from
 * "moving a little, consistently" — see the class doc comment above for
 * the shape/coherence reasoning. Pulled out of module constants (which
 * remain the MEDIUM/default values, unchanged, so every existing caller —
 * `new MotionIntentGate()` — behaves exactly as before) so
 * `StabilizationProfiles.ts` can hand the gate a different HIGH/LOW preset
 * per patient without a second parallel implementation.
 */
export interface MotionIntentGateConfig {
  readonly windowMs: number;
  readonly coherenceLow: number;
  readonly coherenceHigh: number;
  readonly fastBypassUnitsPerSec: number;
  readonly minGain: number;
}

export const DEFAULT_INTENT_GATE_CONFIG: MotionIntentGateConfig = {
  windowMs: INTENT_WINDOW_MS,
  coherenceLow: INTENT_COHERENCE_LOW,
  coherenceHigh: INTENT_COHERENCE_HIGH,
  fastBypassUnitsPerSec: INTENT_FAST_BYPASS_UNITS_PER_SEC,
  minGain: INTENT_MIN_GAIN,
};

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

interface IntentBufferEntry extends Point2D {
  readonly timestampMs: number;
}

function distance2D(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export class MotionIntentGate {
  private readonly config: MotionIntentGateConfig;
  private buffer: IntentBufferEntry[] = [];
  private corrected: Point2D | null = null;

  constructor(config: Partial<MotionIntentGateConfig> = {}) {
    this.config = { ...DEFAULT_INTENT_GATE_CONFIG, ...config };
  }

  reset(value: Point2D): void {
    this.buffer = [];
    this.corrected = { x: value.x, y: value.y };
  }

  apply(target: Point2D, timestampMs: number): Point2D {
    if (!this.corrected) {
      this.corrected = { x: target.x, y: target.y };
      this.buffer.push({ timestampMs, ...target });
      return this.corrected;
    }
    this.buffer.push({ timestampMs, ...target });
    const cutoffMs = timestampMs - this.config.windowMs;
    while (this.buffer.length > 1 && this.buffer[0].timestampMs < cutoffMs) this.buffer.shift();

    const first = this.buffer[0];
    const netDisplacement = distance2D(target, first);
    let pathLength = 0;
    for (let index = 1; index < this.buffer.length; index += 1) {
      pathLength += distance2D(this.buffer[index], this.buffer[index - 1]);
    }
    const windowSeconds = Math.max((timestampMs - first.timestampMs) / 1000, 1e-3);
    const speed = pathLength / windowSeconds;

    let intentGain: number;
    if (speed >= this.config.fastBypassUnitsPerSec || pathLength < 1e-6) {
      intentGain = 1;
    } else {
      const coherence = clamp(netDisplacement / pathLength, 0, 1);
      intentGain = clamp(
        (coherence - this.config.coherenceLow) / (this.config.coherenceHigh - this.config.coherenceLow),
        this.config.minGain,
        1,
      );
    }

    this.corrected = {
      x: this.corrected.x + intentGain * (target.x - this.corrected.x),
      y: this.corrected.y + intentGain * (target.y - this.corrected.y),
    };
    return this.corrected;
  }
}

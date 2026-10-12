import { createMotionVectorFilter, MotionIntentGate, type MotionFilterMode, type MotionVector, type MotionVectorFilter } from "./MotionFilters";
import { STABILIZATION_LEVELS, type StabilizationLevel } from "./StabilizationProfiles";
import type { MotionSample } from "./types";

/** Kept for the diagnostic lab's existing axis-picker UI/config shape; unused by the gyro-integrated model below (see observe()). */
export type OrientationAxis = "roll" | "pitch" | "yaw";

/**
 * A 2x2 linear map applied to the normalized POINTER-space offset from
 * center, `(x - 0.5, y - 0.5)` — i.e. AFTER `normalizedAxis` (invertX/
 * invertY + dead zone already applied), NOT the raw pre-invert angle
 * delta — as `[[a, b], [c, d]]` meaning `x' = 0.5 + a*(x-0.5) + b*(y-0.5)`,
 * `y' = 0.5 + c*(x-0.5) + d*(y-0.5)`. This is the CORRECTED direction (i.e.
 * already the inverse of the observed-vs-intended coupling matrix a real
 * session measures — see `deriveCrossAxisCalibration` in
 * RightHandSessionProfile.ts and `tools/witmotion_ble/real_dataset/
 * final_session_cross_coupling_report.json`'s `calibration_matrix.M_inverse`
 * for how one is derived from real up/down/left/right phases), not a raw
 * coupling measurement to invert again here.
 *
 * MUST be applied in this same pointer-space, not the pre-invert angle
 * space: `deriveCrossAxisCalibration` fits the matrix directly against
 * `unfilteredPointer` (already post-invertX/invertY). invertX and invertY
 * don't always agree in sign (this RIGHT_HAND profile: invertX=true,
 * invertY=false) — applying the matrix before that flip multiplies it by
 * the sign flip from the wrong side (`D*M` instead of `M*D`, which don't
 * commute once `M` has off-diagonal terms), silently inverting whichever
 * axis's sign convention differs between the two spaces. This exact bug
 * shipped once (RIGHT/LEFT inverted on `/control/right-hand-twist-
 * invariance` while UP/DOWN stayed correct — invertY=false meant the Y
 * math happened to still commute) before being caught by the mandatory
 * pre-capture direction check in that screen.
 */
export type CrossAxisCalibrationMatrix = readonly [readonly [number, number], readonly [number, number]];

export interface ContinuousMotionConfig {
  readonly xAxis: OrientationAxis;
  readonly yAxis: OrientationAxis;
  readonly rotationAxis: OrientationAxis;
  readonly invertX: boolean;
  readonly invertY: boolean;
  readonly invertRotation: boolean;
  readonly sensitivity: number;
  readonly deadZoneDeg: number;
  readonly smoothing: number;
  readonly filterMode: MotionFilterMode;
  /**
   * Unused by the gyro-integrated model (see observe()'s doc comment). A
   * REAL RIGHT_HAND WT901BLECL test at 50Hz showed the device's own fused
   * yaw is NOT reliably twist-independent (see docs/real-twist-rejection.md)
   * — a scalar correction on top of that fused value could not fix it
   * either. Kept only so the diagnostic lab's config/UI still type-checks.
   */
  readonly rotationCompensationX: number;
  readonly rotationCompensationY: number;
  /**
   * When true, the controller establishes its own center ONCE, automatically,
   * shortly after construction (see considerAutoCenter) instead of requiring
   * an explicit recenter() call. That reference is then FROZEN for the rest
   * of the session — see the class doc comment's "REFERENCE IS FROZEN"
   * section. This flag does not mean "keep adjusting the center"; it only
   * means "don't require a manual recenter() to get the first one."
   */
  readonly autoCenter: boolean;
  /**
   * Personalized cross-axis correction (Problem 1 — straight physical
   * up/down producing a diagonal pointer path). `null` (default) is
   * IDENTITY — no games/tests change behavior unless this is explicitly
   * set. Deliberately NOT baked into DEFAULT_CONTINUOUS_MOTION_CONFIG
   * below: a real session's matrix is that person's own mounting/
   * biomechanics evidence, not a universal pediatric constant — see
   * `deriveCrossAxisCalibration` (RightHandSessionProfile.ts) for how a
   * NEW session derives its own, and
   * `RightHandAdultCalibrationEvidence.ts` for where today's specific
   * adult evidence is stored (explicitly labeled, not exported as a
   * default here).
   */
  readonly crossAxisCalibration: CrossAxisCalibrationMatrix | null;
  /**
   * How pointer aim stays correctly aligned to the screen as the wrist/
   * forearm rolls around its own long axis DURING play — Problem 2 (a 90°
   * wrist rotation after recenter swapping which screen axis up/down and
   * left/right control).
   *
   * "FROZEN_AT_RECENTER" (default, unchanged behavior): a one-time de-roll
   * correction is captured from the device's fused roll at commitCenter
   * and reused for the rest of the session — correct only as long as the
   * physical roll doesn't change after that snapshot. Real 2026-09-04
   * evidence (`tools/witmotion_ble/real_dataset/
   * twist_invariance_replay_report.json`): directional error grows from
   * ~9° near 0° roll to ~81° near 90° roll — exactly the reported "axes
   * swap" complaint.
   *
   * "CONTINUOUS_GRAVITY_REFERENCED": recomputes the SAME 2D de-roll
   * rotation fresh every sample from the device's current fused roll
   * (`sample.anglesDeg[0]`) instead of a frozen snapshot. MEASURED WORSE
   * than FROZEN_AT_RECENTER on the same real capture (mean error ~124° at
   * ~45° roll, up to 172° — i.e. fully inverted at times): rotating the
   * raw pitch/yaw-rate pair by the device's own fused Euler roll angle
   * still inherits that fused angle's own nonlinearity/instability at
   * larger rolls (exactly the "may still inherit Euler coupling" risk —
   * do not use this mode for anything roll-varying; kept only for the
   * regression test that shows it degenerates to FROZEN_AT_RECENTER when
   * roll is constant).
   *
   * "ROLL_INVARIANT_TRANSVERSE_FRAME" (validated, real 2026-09-04 twist-
   * invariance capture, 4,960 samples spanning 0°-98° actual measured
   * roll): abandons the Euler-angle "roll" abstraction entirely. Tracks a
   * gravity direction estimate in sensor-local coordinates (gyro
   * integration for fast response, slow complementary blending toward the
   * raw accelerometer for drift correction, gated by how far
   * |accelerationG| sits from 1g so dynamic motion can't yank it — see
   * `updateGravityEstimate`), projects that estimate onto the plane
   * perpendicular to the sensor's local +X ("forward", the physical
   * longitudinal axis — the ONLY mounting requirement becomes "forward
   * points toward the fingers") to get a 2D transverse basis that rotates
   * WITH the sensor as it rolls, then projects the raw (damped) pitch/
   * yaw-rate vector onto THAT basis via plain dot products — an exact
   * change of orthonormal basis within a plane, not a small-angle Euler
   * approximation. Mean directional error on the real capture: ~2° near
   * 0°, ~2° near 45°, ~4° near 90° (vs. ~9°/~53°/~81° for
   * FROZEN_AT_RECENTER) — see `analyze_twist_invariance_capture.py`.
   * Requires a `crossAxisCalibration` matrix derived FOR THIS FRAME (not
   * the old frame's matrix — different geometry, different residual
   * error) to resolve which transverse axis is screen-X vs screen-Y and
   * their signs; see `deriveCrossAxisCalibration` and
   * `RightHandAdultCalibrationEvidence.ts`.
   */
  readonly twistTrackingMode: "FROZEN_AT_RECENTER" | "CONTINUOUS_GRAVITY_REFERENCED" | "ROLL_INVARIANT_TRANSVERSE_FRAME";
  /**
   * Selects a MotionIntentGate preset (see StabilizationProfiles.ts) —
   * "MEDIUM" (default) is byte-for-byte the shipped, already-validated
   * gate; HIGH/LOW only ever apply if explicitly chosen.
   */
  readonly stabilizationLevel: StabilizationLevel;
}

export const DEFAULT_CONTINUOUS_MOTION_CONFIG: ContinuousMotionConfig = {
  xAxis: "yaw",
  yAxis: "pitch",
  rotationAxis: "roll",
  invertX: true,
  invertY: false,
  invertRotation: false,
  sensitivity: 1,
  deadZoneDeg: 1.25,
  smoothing: 0.35,
  filterMode: "ADAPTIVE_EMA",
  rotationCompensationX: 0,
  rotationCompensationY: 0,
  autoCenter: false,
  crossAxisCalibration: null,
  twistTrackingMode: "FROZEN_AT_RECENTER",
  stabilizationLevel: "MEDIUM",
};

const BASE_HALF_RANGE_DEG = 28;

/** Auto-center: establish a reference within roughly half a second without requiring a held pose. */
const AUTO_CENTER_MAX_WAIT_MS = 450;
const AUTO_CENTER_MIN_SAMPLES = 5;
const AUTO_CENTER_BUFFER_CAP = 20;

/**
 * Twist-dominance gate: when a sample's angular rate is almost entirely
 * wrist-twist (gyroscopeDps[0]) with negligible pitch/yaw-rate alongside it,
 * treat that small pitch/yaw remainder as cross-axis mounting coupling
 * (twisting the wrist is never perfectly isolated to the sensor's local X
 * axis — see the class doc) rather than genuine aim intent, and damp it
 * before integration. Gated on DOMINANCE ratio, not a fixed axis or sign:
 * offline replay against the 3 real RIGHT_HAND captures
 * (tools/witmotion_ble/real_dataset/tune_twist_dominance_gate.py) found the
 * raw coupling magnitude is NOT a stable, session-independent constant by
 * twist direction (it flips which direction is worse between sessions) —
 * fitting a fixed directional coefficient would fit that noise, repeating
 * the mistake already documented in real_dataset/FINDINGS.md for the
 * earlier fused-angle model. Dominance gating instead reacts to whichever
 * direction is actually leaking THIS session (self-adapting, no hardcoded
 * sign) while staying inert whenever pitch/yaw-rate is substantial relative
 * to twist-rate — i.e. never during genuine right/left/up/down aiming,
 * where measured twist-rate stays near zero (see the same replay script).
 * threshold=0.92/maxSuppression=0.7 cut rotate_one/rotate_other max drift
 * ~60-70% across all 3 sessions while leaving every real aim phase's range
 * intact.
 */
const TWIST_DOMINANCE_THRESHOLD = 0.92;
const TWIST_DOMINANCE_MAX_SUPPRESSION = 0.7;

const DEG_TO_RAD = Math.PI / 180;

/**
 * ROLL_INVARIANT_TRANSVERSE_FRAME support (see that twistTrackingMode
 * value's own doc comment for the full derivation). A gravity direction
 * estimate is tracked in sensor-local coordinates via a standard gyro+
 * accel complementary filter: gyro integration for fast response between
 * corrections (GRAVITY_CORRECTION_BASE_GAIN's blend runs every sample
 * regardless, but its WEIGHT is gated by GRAVITY_CORRECTION_DEVIATION_GATE
 * below), slow blending toward the raw accelerometer reading for drift
 * correction. TRANSVERSE_SINGULARITY_GPERP_THRESHOLD guards the one
 * genuine physical ambiguity this method has: when the sensor's forward
 * axis points nearly parallel to gravity (straight up or down), gravity
 * alone cannot define "which way is screen-horizontal" — the basis is
 * frozen at its last valid value rather than updated from noise in that
 * configuration, which real 2026-09-04 data never actually hit (see
 * ContinuousMotionController.test.ts's singularity-handling test and
 * `twist_invariance_replay_report.json`'s `singularityHitsModelC: 0`).
 */
const GRAVITY_CORRECTION_BASE_GAIN = 0.03;
const GRAVITY_CORRECTION_DEVIATION_GATE = 0.35;
const TRANSVERSE_SINGULARITY_GPERP_THRESHOLD = 0.05;

type Vec3 = readonly [number, number, number];

function normalizeVec3(v: Vec3): Vec3 {
  const n = Math.hypot(v[0], v[1], v[2]);
  if (n < 1e-9) return [0, 0, 1];
  return [v[0] / n, v[1] / n, v[2] / n];
}

function crossVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function monotonicNow(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function angularDeltaDeg(angle: number, center: number): number {
  return ((angle - center + 540) % 360) - 180;
}

function removeDeadZone(delta: number, deadZone: number): number {
  const magnitude = Math.abs(delta);
  if (magnitude <= deadZone) return 0;
  return Math.sign(delta) * (magnitude - deadZone);
}

/**
 * The angular half-range (in degrees, on either side of center) that maps
 * onto the full [0,1] output range at the given sensitivity. Shared by
 * normalizedAxis (deg -> [0,1]) AND by observe()'s own aim-angle clamp (see
 * that clamp's doc comment) so the two can never disagree about where the
 * mapped range actually ends.
 */
function effectiveHalfRangeDeg(config: ContinuousMotionConfig): number {
  return BASE_HALF_RANGE_DEG / clamp(config.sensitivity, 0.25, 4);
}

function normalizedAxis(delta: number, inverted: boolean, config: ContinuousMotionConfig): number {
  const halfRange = effectiveHalfRangeDeg(config);
  const usableRange = Math.max(1, halfRange - config.deadZoneDeg);
  const analog = removeDeadZone(delta, config.deadZoneDeg) / usableRange;
  return clamp(0.5 + (inverted ? -analog : analog) * 0.5, 0, 1);
}

export interface NormalizedPointerPosition {
  readonly x: number;
  readonly y: number;
}

export interface VisualHandOrientation {
  readonly rotationDeg: number;
}

export interface MotionOutputTiming {
  readonly bleNotificationAtMs: number;
  readonly parsingStartedAtMs: number;
  readonly parsedAtMs: number;
  readonly controllerStartedAtMs: number;
  readonly filterStartedAtMs: number;
  readonly filterCompletedAtMs: number;
  readonly pointerOutputAtMs: number;
}

/** Pointer position and visual rotation are deliberately separate outputs; visual rotation is always 0 (no wrist-twist visual, per prototype requirement). */
export interface NormalizedPointer {
  readonly pointer: NormalizedPointerPosition;
  readonly visualOrientation: VisualHandOrientation;
  readonly unfilteredPointer: NormalizedPointerPosition;
  readonly confidence: number;
  readonly timestampMs: number;
  readonly timing: MotionOutputTiming;
}

interface AutoCenterCandidate {
  readonly sample: MotionSample;
  readonly gyroMagnitudeDps: number;
}

/**
 * 2-DOF aiming controller, driven by raw gyroscope rates rather than the
 * device's fused roll/pitch/yaw output.
 *
 * WHY: an earlier version reconstructed a rotation matrix from the device's
 * fused anglesDeg each sample and algebraically cancelled rotation about the
 * reported "roll" axis (mathematically exact for an ideal Euler
 * decomposition, and verified correct in isolated synthetic tests). A REAL
 * RIGHT_HAND WT901BLECL test at 50Hz disproved it: twisting the wrist in
 * place still moved the pointer strongly. Offline replay against the three
 * real labeled captures (tools/witmotion_ble/real_dataset/) explains why —
 * during the labeled rotate_one/rotate_other phases, the device's fused YAW
 * swings by up to ~47deg even though PCA on the raw gyroscope vectors shows
 * the true physical rotation axis is consistently within ~3-5deg of the
 * sensor's local X axis across all three sessions. In other words: the
 * physical axis assumption was fine, but the device's own fused yaw output
 * is not a trustworthy twist-independent quantity during fast rotation — no
 * amount of downstream algebra on that fused value can fix it.
 *
 * FIX: never read the fused yaw/pitch/roll for pointer math. Integrate the
 * pitch/yaw aim angles directly from raw gyroscopeDps[1]/[2] each sample,
 * and simply never integrate gyroscopeDps[0] (rotation about the wrist's own
 * long axis) at all — wrist twist cannot move the pointer because its rate
 * is never added to the running aim angle, not because it was geometrically
 * cancelled after the fact. A one-time reference-roll rotation captured at
 * recenter (see commitCenter) re-projects the raw gy/gz pair to account for
 * whatever angle the strap/mount happens to sit at, without needing to
 * continuously track roll (which is what made the fused-yaw approach
 * unreliable in the first place).
 *
 * Validated by replaying all three real sessions end to end (see
 * tools/witmotion_ble/real_dataset/ and this project's PR discussion): pure
 * rotation max drift dropped ~64-94% versus the fused-angle model, while
 * left/right/up/down/diagonal/tiny/slow/fast all remained strong and
 * correctly signed. A live RIGHT_HAND hardware test is still the authority
 * on whether this is good enough to ship — this offline replay is evidence
 * to justify running that test, not a substitute for it.
 *
 * REFERENCE IS FROZEN (position/hold-based controller, not a velocity
 * controller): this is a POSE controller — the pointer position is "current
 * aim minus a fixed reference," never a function of current angular
 * velocity alone. Once `centered` becomes true (see commitCenter), the
 * reference (centerYawDeg/centerPitchDeg) is changed ONLY by an explicit
 * recenter() call or a fresh commitCenter() after invalidate() (reconnect) —
 * NEVER as a side effect of gyro going quiet while playing. A held physical
 * pose has near-zero gyro by definition (holding still IS near-zero angular
 * velocity) — an earlier "conservative drift correction" pass here
 * mistook exactly that for sensor bias drift and kept nudging the
 * reference to match wherever the hand was currently held, which silently
 * walked the pointer back toward center every time the child held a pose
 * for about a second — do not reintroduce any per-sample reference
 * adjustment gated on "gyro is currently small," no matter how conservative
 * it looks on paper. See ContinuousMotionController.test.ts's
 * "hold-position stability" suite, which is the regression test for
 * exactly this.
 *
 * SATURATING INTEGRATOR (no hidden off-screen debt): aimYawDeg/aimPitchDeg
 * are clamped every sample to the same angular half-range normalizedAxis()
 * maps onto [0,1] (see effectiveHalfRangeDeg and the clamp in observe()) —
 * the real-hardware complaint was that pushing past an edge and then
 * reversing required first traveling back through however far past the
 * mapped range the physical hand had continued, because the accumulator
 * itself had no bound even though the visible pointer did. See the "edge
 * saturation" suite in ContinuousMotionController.test.ts.
 */
export class ContinuousMotionController {
  private config: ContinuousMotionConfig;
  private centered = false;
  private latestSample: MotionSample | null = null;
  private output: NormalizedPointer | null = null;
  private filter: MotionVectorFilter;
  private intentGate: MotionIntentGate;
  private readonly now: () => number;

  private aimYawDeg = 0;
  private aimPitchDeg = 0;
  private centerYawDeg = 0;
  private centerPitchDeg = 0;
  /** cos/sin of the one-time reference-roll correction captured at recenter; identity until first centered. */
  private referenceRollCos = 1;
  private referenceRollSin = 0;
  private previousTimestampMs: number | null = null;

  // ROLL_INVARIANT_TRANSVERSE_FRAME state — see that mode's own doc comment. Unused (left at these
  // defaults) whenever a different twistTrackingMode is active.
  private gravityEstimate: Vec3 | null = null;
  private transverseV: Vec3 | null = null;
  private transverseH: Vec3 | null = null;
  private aimVerticalDeg = 0;
  private aimHorizontalDeg = 0;
  private centerVerticalDeg = 0;
  private centerHorizontalDeg = 0;

  private autoCenterBuffer: AutoCenterCandidate[] = [];
  private autoCenterStartedAtMs: number | null = null;

  constructor(config: Partial<ContinuousMotionConfig> = {}, options: { now?: () => number } = {}) {
    this.config = this.sanitizeConfig({ ...DEFAULT_CONTINUOUS_MOTION_CONFIG, ...config });
    this.filter = createMotionVectorFilter(this.config.filterMode);
    this.intentGate = new MotionIntentGate(STABILIZATION_LEVELS[this.config.stabilizationLevel]);
    this.now = options.now ?? monotonicNow;
  }

  get currentConfig(): ContinuousMotionConfig {
    return this.config;
  }

  get isCentered(): boolean {
    return this.centered;
  }

  get currentPointer(): NormalizedPointer | null {
    return this.output;
  }

  updateConfig(patch: Partial<ContinuousMotionConfig>): void {
    const previousMode = this.config.filterMode;
    const previousStabilizationLevel = this.config.stabilizationLevel;
    this.config = this.sanitizeConfig({ ...this.config, ...patch });
    if (previousMode !== this.config.filterMode) {
      this.filter = createMotionVectorFilter(this.config.filterMode);
      if (this.output) {
        this.filter.reset({ ...this.output.pointer, rotationDeg: this.output.visualOrientation.rotationDeg });
      }
    }
    if (previousStabilizationLevel !== this.config.stabilizationLevel) {
      this.intentGate = new MotionIntentGate(STABILIZATION_LEVELS[this.config.stabilizationLevel]);
      if (this.output) this.intentGate.reset(this.output.pointer);
    }
  }

  /** Manual/therapist-fallback recenter. Always available; also resets auto-center bookkeeping so a fresh reference starts clean. */
  recenter(): boolean {
    if (!this.latestSample) return false;
    this.commitCenter(this.latestSample);
    return true;
  }

  observe(sample: MotionSample): NormalizedPointer | null {
    const rawValues = [...sample.accelerationG, ...sample.gyroscopeDps, ...sample.anglesDeg];
    if (!rawValues.every(Number.isFinite)) return null;
    this.latestSample = sample;

    const dtSeconds = this.previousTimestampMs === null ? 0 : Math.max(0, (sample.timestampMs - this.previousTimestampMs) / 1000);
    this.previousTimestampMs = sample.timestampMs;

    const [twistRateDps, rawPitchRateDps, rawYawRateDps] = sample.gyroscopeDps;
    const gyroMagnitudeDps = Math.hypot(twistRateDps, rawPitchRateDps, rawYawRateDps);
    // Twist-dominance gate (see const doc above): damp the pitch/yaw remainder only when twist utterly
    // dominates this sample's angular rate — inert during genuine aiming, where twist-rate stays near zero.
    const twistDominance = gyroMagnitudeDps > 1e-6 ? Math.abs(twistRateDps) / gyroMagnitudeDps : 0;
    const twistSuppression = clamp((twistDominance - TWIST_DOMINANCE_THRESHOLD) / (1 - TWIST_DOMINANCE_THRESHOLD), 0, 1);
    const twistDamping = 1 - twistSuppression * TWIST_DOMINANCE_MAX_SUPPRESSION;
    const dampedPitchRateDps = rawPitchRateDps * twistDamping;
    const dampedYawRateDps = rawYawRateDps * twistDamping;
    // SATURATING INTEGRATOR — no hidden off-screen debt (real-hardware
    // complaint: pushing LEFT past the screen edge, then reversing RIGHT,
    // used to require traveling back through however far past the mapped
    // range the physical hand had continued). Without this, the aim
    // accumulators are a plain unbounded gyro integral — normalizedAxis()
    // clamps the OUTPUT to [0,1], but the internal angle keeps growing past
    // whatever physical delta already saturated it, so a reversal had to
    // first consume that invisible excess before the pointer moved at all.
    // Instead, clamp the accumulator itself to exactly the angular range
    // normalizedAxis maps onto [0,1] (effectiveHalfRangeDeg — the SAME
    // formula, so the two can never disagree): once the pointer is visually
    // pinned to an edge, the logical aim angle is ALSO pinned there, so the
    // instant the gyro rate reverses sign, the very next sample starts
    // moving back off that edge — no lag, no recovery travel. This changes
    // nothing for any delta already inside the mapped range (the clamp is a
    // no-op there), so every prior non-saturating test is unaffected.
    const halfRangeDeg = effectiveHalfRangeDeg(this.config);
    let rawTarget: MotionVector;
    if (this.config.twistTrackingMode === "ROLL_INVARIANT_TRANSVERSE_FRAME") {
      this.updateGravityEstimate(sample.accelerationG, sample.gyroscopeDps, dtSeconds);
      const v = this.transverseV;
      const h = this.transverseH;
      // forward = sensor-local +X = (1,0,0), always — a physical direction, not a computed value; v/h
      // are the transverse basis derived from it in updateGravityEstimate (both have zero X-component by
      // construction, so projecting the pitch/yaw-rate pair — which already lives entirely in the Y-Z
      // plane — onto them via these two dot products is an exact change of orthonormal basis).
      const omegaVertical = v ? dampedPitchRateDps * v[1] + dampedYawRateDps * v[2] : 0;
      const omegaHorizontal = h ? dampedPitchRateDps * h[1] + dampedYawRateDps * h[2] : 0;
      this.aimVerticalDeg += omegaVertical * dtSeconds;
      this.aimHorizontalDeg += omegaHorizontal * dtSeconds;
      this.aimVerticalDeg = clamp(this.aimVerticalDeg, this.centerVerticalDeg - halfRangeDeg, this.centerVerticalDeg + halfRangeDeg);
      this.aimHorizontalDeg = clamp(this.aimHorizontalDeg, this.centerHorizontalDeg - halfRangeDeg, this.centerHorizontalDeg + halfRangeDeg);

      if (!this.centered) {
        if (this.config.autoCenter) this.considerAutoCenter(sample, gyroMagnitudeDps);
        if (!this.centered) return null;
      }
      // Deliberately NOT invertX/invertY here (always false): which transverse axis is screen-X vs
      // screen-Y, and their signs, is fully resolved by the crossAxisCalibration matrix below — applying
      // invertX/invertY on top would be a second, overlapping sign-resolution step. Verified redundant
      // against real data (analyze_twist_invariance_capture.py: forcing an opposite sign convention here
      // produces a correspondingly negated calibration matrix and byte-identical final output) — one
      // clean personalized-alignment step, not two.
      rawTarget = {
        x: normalizedAxis(this.aimHorizontalDeg - this.centerHorizontalDeg, false, this.config),
        y: normalizedAxis(this.aimVerticalDeg - this.centerVerticalDeg, false, this.config),
        rotationDeg: 0,
      };
    } else {
      // De-roll — twistRateDps (rotation about the wrist's own long axis) is deliberately never used below.
      // FROZEN_AT_RECENTER (default): reuse the one-time reference captured at recenter (see commitCenter).
      // CONTINUOUS_GRAVITY_REFERENCED: recompute the same correction fresh from THIS sample's own fused
      // roll — see the config field's own doc comment for why this measured WORSE than FROZEN_AT_RECENTER
      // on real roll-varying data and should not be used.
      let rollCos = this.referenceRollCos;
      let rollSin = this.referenceRollSin;
      if (this.config.twistTrackingMode === "CONTINUOUS_GRAVITY_REFERENCED") {
        const currentRollDeg = sample.anglesDeg[0];
        rollCos = Math.cos(-currentRollDeg * DEG_TO_RAD);
        rollSin = Math.sin(-currentRollDeg * DEG_TO_RAD);
      }
      const pitchRateDps = dampedPitchRateDps * rollCos - dampedYawRateDps * rollSin;
      const yawRateDps = dampedPitchRateDps * rollSin + dampedYawRateDps * rollCos;
      this.aimPitchDeg += pitchRateDps * dtSeconds;
      this.aimYawDeg += yawRateDps * dtSeconds;
      this.aimYawDeg = clamp(this.aimYawDeg, this.centerYawDeg - halfRangeDeg, this.centerYawDeg + halfRangeDeg);
      this.aimPitchDeg = clamp(this.aimPitchDeg, this.centerPitchDeg - halfRangeDeg, this.centerPitchDeg + halfRangeDeg);

      if (!this.centered) {
        if (this.config.autoCenter) this.considerAutoCenter(sample, gyroMagnitudeDps);
        if (!this.centered) return null;
      }
      rawTarget = {
        x: normalizedAxis(this.aimYawDeg - this.centerYawDeg, this.config.invertX, this.config),
        y: normalizedAxis(this.aimPitchDeg - this.centerPitchDeg, this.config.invertY, this.config),
        rotationDeg: 0,
      };
    }
    // REFERENCE IS FROZEN once centered — see the class doc comment. No
    // per-sample reference adjustment happens here on purpose, no matter how
    // still or how long the current pose is held.

    const controllerStartedAtMs = this.now();
    // Cross-axis calibration (Problem 1 — straight physical up/down producing a diagonal pointer path):
    // applied to the (x-0.5, y-0.5) POINTER-space offset, AFTER normalizedAxis (invertX/invertY + dead
    // zone already applied) — the SAME space `deriveCrossAxisCalibration` fits and validates the matrix
    // in (it operates on `unfilteredPointer`, i.e. this exact rawTarget). Applying it any earlier, to the
    // pre-invert raw angle delta, silently multiplies the matrix by the invertX/invertY sign flip from the
    // WRONG side (D*M instead of M*D — these don't commute once M has off-diagonal terms), which is
    // exactly what inverted RIGHT/LEFT the first time this shipped: invertX=true flips X's sign between
    // the two spaces, invertY=false doesn't touch Y's, so a matrix fit in pointer-space silently flipped
    // only its X row when misapplied pre-invert. Identity (null) unless a personalized matrix was
    // explicitly supplied — see the config field's own doc comment.
    let targetX = rawTarget.x;
    let targetY = rawTarget.y;
    if (this.config.crossAxisCalibration) {
      const [[a, b], [c, d]] = this.config.crossAxisCalibration;
      const dx = rawTarget.x - 0.5;
      const dy = rawTarget.y - 0.5;
      targetX = clamp(0.5 + a * dx + b * dy, 0, 1);
      targetY = clamp(0.5 + c * dx + d * dy, 0, 1);
    }
    const target: MotionVector = { x: targetX, y: targetY, rotationDeg: 0 };
    const filterStartedAtMs = this.now();
    const intentGated = this.intentGate.apply(target, sample.timestampMs);
    const filtered = this.filter.filter(
      { x: intentGated.x, y: intentGated.y, rotationDeg: target.rotationDeg },
      { timestampMs: sample.timestampMs, gyroMagnitudeDps, smoothing: this.config.smoothing },
    );
    const filterCompletedAtMs = this.now();
    const gravityMagnitude = Math.hypot(...sample.accelerationG);
    const accelerationDeviation = Math.max(0, Math.abs(gravityMagnitude - 1) - 0.35);
    const confidence = clamp(1 - accelerationDeviation * 0.25, 0.5, 1);
    const pointerOutputAtMs = this.now();
    this.output = this.buildOutput(sample, target, filtered, controllerStartedAtMs, filterStartedAtMs, filterCompletedAtMs, pointerOutputAtMs, confidence);
    return this.output;
  }

  invalidate(): void {
    this.centered = false;
    this.latestSample = null;
    this.output = null;
    this.aimYawDeg = 0;
    this.aimPitchDeg = 0;
    this.centerYawDeg = 0;
    this.centerPitchDeg = 0;
    this.referenceRollCos = 1;
    this.referenceRollSin = 0;
    this.previousTimestampMs = null;
    this.gravityEstimate = null;
    this.transverseV = null;
    this.transverseH = null;
    this.aimVerticalDeg = 0;
    this.aimHorizontalDeg = 0;
    this.centerVerticalDeg = 0;
    this.centerHorizontalDeg = 0;
    this.autoCenterBuffer = [];
    this.autoCenterStartedAtMs = null;
  }

  /**
   * ROLL_INVARIANT_TRANSVERSE_FRAME support — see that config value's own
   * doc comment for the full derivation. Updates `this.gravityEstimate`
   * (sensor-local direction of gravity) and, from it, `this.transverseV`/
   * `this.transverseH` (the rotating 2D basis perpendicular to the
   * sensor's local +X/forward axis).
   */
  private updateGravityEstimate(accelerationG: Vec3, gyroscopeDps: Vec3, dtSeconds: number): void {
    if (this.gravityEstimate === null) {
      this.gravityEstimate = normalizeVec3(accelerationG);
    } else if (dtSeconds > 0) {
      // d(g)/dt = -omega x g — the Poisson relation for a world-fixed vector (gravity, absent dynamic
      // acceleration) observed in a frame rotating with body-frame angular velocity omega. Plain forward-
      // Euler integration is adequate at this sample rate (~20ms steps).
      const omegaRad: Vec3 = [gyroscopeDps[0] * DEG_TO_RAD, gyroscopeDps[1] * DEG_TO_RAD, gyroscopeDps[2] * DEG_TO_RAD];
      const cross = crossVec3(omegaRad, this.gravityEstimate);
      const predicted: Vec3 = [
        this.gravityEstimate[0] - cross[0] * dtSeconds,
        this.gravityEstimate[1] - cross[1] * dtSeconds,
        this.gravityEstimate[2] - cross[2] * dtSeconds,
      ];
      this.gravityEstimate = normalizeVec3(predicted);
    }
    const accelMagnitude = Math.hypot(accelerationG[0], accelerationG[1], accelerationG[2]);
    const deviation = Math.abs(accelMagnitude - 1);
    const trust = clamp(1 - deviation / GRAVITY_CORRECTION_DEVIATION_GATE, 0, 1);
    const gain = GRAVITY_CORRECTION_BASE_GAIN * trust;
    if (gain > 0) {
      const accelNormalized = normalizeVec3(accelerationG);
      const blended: Vec3 = [
        this.gravityEstimate[0] * (1 - gain) + accelNormalized[0] * gain,
        this.gravityEstimate[1] * (1 - gain) + accelNormalized[1] * gain,
        this.gravityEstimate[2] * (1 - gain) + accelNormalized[2] * gain,
      ];
      this.gravityEstimate = normalizeVec3(blended);
    }

    const gPerp: Vec3 = [0, this.gravityEstimate[1], this.gravityEstimate[2]];
    const gPerpMagnitude = Math.hypot(gPerp[1], gPerp[2]);
    if (gPerpMagnitude > TRANSVERSE_SINGULARITY_GPERP_THRESHOLD) {
      const v = normalizeVec3(gPerp);
      this.transverseV = v;
      this.transverseH = crossVec3([1, 0, 0], v);
    }
    // else: forward is nearly parallel to gravity (pointing at the ceiling/floor) — a genuine physical
    // ambiguity gravity alone can't resolve. Freeze the last valid basis rather than update it from noise.
  }

  /** Buffers a short rolling window and commits the lowest-motion sample seen once enough samples (or enough time) have passed — never blocks indefinitely on a perfectly still pose. */
  private considerAutoCenter(sample: MotionSample, gyroMagnitudeDps: number): void {
    this.autoCenterBuffer.push({ sample, gyroMagnitudeDps });
    if (this.autoCenterBuffer.length > AUTO_CENTER_BUFFER_CAP) this.autoCenterBuffer.shift();
    if (this.autoCenterStartedAtMs === null) this.autoCenterStartedAtMs = this.now();
    const elapsedMs = this.now() - this.autoCenterStartedAtMs;
    if (this.autoCenterBuffer.length < AUTO_CENTER_MIN_SAMPLES && elapsedMs < AUTO_CENTER_MAX_WAIT_MS) return;
    const chosen = this.autoCenterBuffer.reduce((best, candidate) => (candidate.gyroMagnitudeDps < best.gyroMagnitudeDps ? candidate : best));
    this.commitCenter(chosen.sample);
  }

  private commitCenter(sample: MotionSample): void {
    this.centered = true;
    this.centerYawDeg = this.aimYawDeg;
    this.centerPitchDeg = this.aimPitchDeg;
    this.centerVerticalDeg = this.aimVerticalDeg;
    this.centerHorizontalDeg = this.aimHorizontalDeg;
    const referenceRollDeg = sample.anglesDeg[0];
    this.referenceRollCos = Math.cos(-referenceRollDeg * DEG_TO_RAD);
    this.referenceRollSin = Math.sin(-referenceRollDeg * DEG_TO_RAD);
    this.autoCenterBuffer = [];
    this.autoCenterStartedAtMs = null;
    const centeredVector: MotionVector = { x: 0.5, y: 0.5, rotationDeg: 0 };
    this.filter.reset(centeredVector);
    this.intentGate.reset(centeredVector);
    const now = this.now();
    this.output = this.buildOutput(sample, centeredVector, centeredVector, now, now, now, now);
  }

  private buildOutput(
    sample: MotionSample,
    target: MotionVector,
    filtered: MotionVector,
    controllerStartedAtMs: number,
    filterStartedAtMs: number,
    filterCompletedAtMs: number,
    pointerOutputAtMs: number,
    confidence = 1,
  ): NormalizedPointer {
    const sourceTiming = sample.pipelineTiming ?? {
      bleNotificationAtMs: sample.timestampMs,
      parsingStartedAtMs: sample.timestampMs,
      parsedAtMs: sample.timestampMs,
    };
    return {
      pointer: { x: clamp(filtered.x, 0, 1), y: clamp(filtered.y, 0, 1) },
      visualOrientation: { rotationDeg: filtered.rotationDeg },
      unfilteredPointer: { x: target.x, y: target.y },
      confidence,
      timestampMs: sample.timestampMs,
      timing: { ...sourceTiming, controllerStartedAtMs, filterStartedAtMs, filterCompletedAtMs, pointerOutputAtMs },
    };
  }

  private sanitizeConfig(config: ContinuousMotionConfig): ContinuousMotionConfig {
    return {
      ...config,
      sensitivity: clamp(config.sensitivity, 0.25, 4),
      deadZoneDeg: clamp(config.deadZoneDeg, 0, 8),
      smoothing: clamp(config.smoothing, 0, 0.9),
      rotationCompensationX: clamp(config.rotationCompensationX, -3, 3),
      rotationCompensationY: clamp(config.rotationCompensationY, -3, 3),
    };
  }
}

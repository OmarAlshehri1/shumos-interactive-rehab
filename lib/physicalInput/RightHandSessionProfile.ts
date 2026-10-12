import type { ContinuousMotionConfig, CrossAxisCalibrationMatrix } from "./ContinuousMotionController";
import type { MotionDiagnosticRecord } from "./MotionDiagnostic";
import type { WitmotionConfigTrialResult } from "./WitmotionConfigTrial";

/**
 * TODAY'S LIVE SESSION — pure, framework-free helpers for
 * RightHandFinalSessionScreen.tsx: picking the best measured hardware
 * config (Phase 2) and building the final downloadable RIGHT_HAND session
 * profile (Phase 13) from real captured records. Kept pure/testable
 * without a DOM or BLE harness, matching this codebase's established
 * pattern (gameSensorTargets.ts, MotionDiagnostic.ts are the same shape).
 */

export interface ConfigRecommendation {
  readonly winner: WitmotionConfigTrialResult | null;
  /** Every stable candidate's composite score, lowest (best) first — for the comparison table. */
  readonly ranked: readonly { readonly result: WitmotionConfigTrialResult; readonly noiseScore: number; readonly latencyScore: number; readonly compositeScore: number }[];
  readonly reasoningAr: string;
}

function meanAxisStd(result: WitmotionConfigTrialResult): number | null {
  if (!result.stillNoiseGyroDps) return null;
  return result.stillNoiseGyroDps.reduce((sum, axis) => sum + axis.std, 0) / result.stillNoiseGyroDps.length;
}

/**
 * "low jitter + low latency + stable BLE, do NOT automatically choose the
 * highest Hz" (today's brief, Phase 2). Unstable candidates are dropped
 * entirely (a config that can't hold a stable BLE link is never a
 * candidate regardless of how quiet/fast it looks in the sample it did
 * deliver). Among stable candidates, noise and latency are each normalized
 * against the WORST stable candidate (so both contribute comparably to one
 * composite score regardless of their raw units/scale), and a candidate is
 * preferred over another with a lower composite score UNLESS the
 * difference is within EPSILON — in that near-tie case the LOWER rateHz
 * wins, which is the concrete mechanism for "not automatically highest Hz."
 */
const NEAR_TIE_EPSILON = 0.05;

export function recommendConfig(results: readonly WitmotionConfigTrialResult[]): ConfigRecommendation {
  const stable = results.filter((result) => !result.unstable && result.stillNoiseGyroDps !== null);
  if (stable.length === 0) {
    return { winner: null, ranked: [], reasoningAr: "لم تكتمل أي إعداد بشكل مستقر — أعد المحاولة قبل اختيار الإعداد النهائي." };
  }

  const noiseValues = stable.map((result) => meanAxisStd(result)!);
  const latencyValues = stable.map((result) => result.meanParsingLatencyMs ?? 0);
  const worstNoise = Math.max(...noiseValues, 1e-9);
  const worstLatency = Math.max(...latencyValues, 1e-9);

  const scored = stable.map((result, index) => ({
    result,
    noiseScore: noiseValues[index] / worstNoise,
    latencyScore: latencyValues[index] / worstLatency,
    compositeScore: noiseValues[index] / worstNoise + latencyValues[index] / worstLatency,
  }));
  scored.sort((a, b) => {
    if (Math.abs(a.compositeScore - b.compositeScore) <= NEAR_TIE_EPSILON) {
      return a.result.candidate.rateHz - b.result.candidate.rateHz; // near-tie -> prefer the lower rate
    }
    return a.compositeScore - b.compositeScore;
  });

  const winner = scored[0].result;
  const reasoningAr =
    `تم اختيار «${winner.candidate.label}» (${winner.candidate.rateHz} Hz، فلتر ${winner.candidate.bandwidthHz} Hz) ` +
    `من بين ${stable.length} إعداد مستقر — أفضل توازن بين هدوء الحركة (ضجيج=${noiseValues[scored.findIndex((s) => s.result === winner)].toFixed(3)} °/ث) ` +
    `وزمن الاستجابة (${(winner.meanParsingLatencyMs ?? 0).toFixed(2)} مللي ثانية)، وليس أعلى معدل تلقائيًا.`;

  return { winner, ranked: scored, reasoningAr };
}

export interface AxisStat {
  readonly mean: number;
  readonly std: number;
  readonly mad: number;
}

function axisStat(values: readonly number[]): AxisStat {
  if (values.length === 0) return { mean: 0, std: 0, mad: 0 };
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const mad = [...values].map((v) => Math.abs(v - median)).sort((a, b) => a - b)[Math.floor(sorted.length / 2)];
  return { mean, std: Math.sqrt(variance), mad };
}

export interface RightHandNoiseEnvelope {
  readonly sampleCount: number;
  readonly gyroDps: readonly [AxisStat, AxisStat, AxisStat];
}

/** Robust (MAD-first) noise envelope from still-phase records — see analyze_still_noise.py's real-data finding that STD alone is dominated by rare settling-motion bursts, not sustained sensor noise. */
export function buildNoiseEnvelope(stillRecords: readonly MotionDiagnosticRecord[]): RightHandNoiseEnvelope {
  const axes = [0, 1, 2].map((axis) => axisStat(stillRecords.map((r) => r.sample.gyroscopeDps[axis]))) as [AxisStat, AxisStat, AxisStat];
  return { sampleCount: stillRecords.length, gyroDps: axes };
}

export interface AchievedRange {
  readonly maxRightX: number | null;
  readonly maxLeftX: number | null;
  readonly maxUpY: number | null;
  readonly maxDownY: number | null;
}

/** Furthest analog displacement actually reached during each directional phase — development/engineering data for THIS session, not a universal pediatric range (see the profile's own disclaimer field). */
export function measureAchievedRange(records: readonly MotionDiagnosticRecord[]): AchievedRange {
  const byPhase = (phase: string) => records.filter((r) => r.phase === phase).map((r) => r.output.pointer);
  const right = byPhase("right");
  const left = byPhase("left");
  const up = byPhase("up");
  const down = byPhase("down");
  return {
    maxRightX: right.length ? Math.max(...right.map((p) => p.x)) : null,
    maxLeftX: left.length ? Math.min(...left.map((p) => p.x)) : null,
    maxUpY: up.length ? Math.min(...up.map((p) => p.y)) : null,
    maxDownY: down.length ? Math.max(...down.map((p) => p.y)) : null,
  };
}

export interface EdgeReversalMeasurement {
  readonly phase: string;
  /** ms from the reversal sample (first sample after net direction actually flips) to the first sample that visibly moved back off the edge. Null if the phase never actually reached a saturated edge (0 or 1). */
  readonly reversalResponseMs: number | null;
}

/**
 * For one edge-reversal phase's records (already time-ordered): finds the
 * last sample still AT the saturated edge (x or y exactly 0 or 1,
 * whichever this phase drove toward) and the first sample after it that
 * moved measurably back off that edge, and returns the elapsed time
 * between them — the real "does it leave the edge immediately" evidence
 * the edge-saturation fix promises. A large value here on REAL hardware
 * (as opposed to the synthetic unit tests already covering this in
 * ContinuousMotionController.test.ts) would mean the fix doesn't hold up
 * against real sensor noise/timing and must be reported, not hidden.
 */
export function measureEdgeReversalResponse(records: readonly MotionDiagnosticRecord[], axis: "x" | "y", edgeValue: 0 | 1): number | null {
  const relevant = [...records].sort((a, b) => a.output.timestampMs - b.output.timestampMs);
  const lastAtEdgeIndex = relevant.map((r) => r.output.pointer[axis]).lastIndexOf(edgeValue);
  if (lastAtEdgeIndex === -1 || lastAtEdgeIndex === relevant.length - 1) return null;
  const movedAwayThreshold = 0.01;
  for (let i = lastAtEdgeIndex + 1; i < relevant.length; i += 1) {
    if (Math.abs(relevant[i].output.pointer[axis] - edgeValue) >= movedAwayThreshold) {
      return relevant[i].output.timestampMs - relevant[lastAtEdgeIndex].output.timestampMs;
    }
  }
  return null;
}

export interface CrossAxisCalibrationEvidence {
  /** Ready to pass straight into `ContinuousMotionConfig.crossAxisCalibration`. */
  readonly matrix: CrossAxisCalibrationMatrix;
  /** Measured angle between the pooled vertical and horizontal principal directions — 90° would be a perfect orthogonal gimbal; real wrist biomechanics won't hit that exactly. */
  readonly angleBetweenAxesDeg: number;
  readonly sampleCounts: { readonly up: number; readonly down: number; readonly left: number; readonly right: number };
}

/**
 * Fits a personalized 2x2 cross-axis calibration matrix from THIS session's
 * own `up`/`down`/`left`/`right` phases — Problem 1 from the 2026-09-04
 * targeted-testing brief (straight physical up/down producing a diagonal
 * pointer path). PCA on each phase's `unfilteredPointer` displacement cloud
 * (relative to that phase's own first sample) gives the REAL principal
 * direction of motion; pooling up+down (sign-aligned) and left+right
 * (sign-aligned) gives one vertical and one horizontal unit vector, and
 * inverting the 2x2 matrix formed from them maps observed motion back onto
 * the screen's true vertical/horizontal — see
 * `tools/witmotion_ble/real_dataset/analyze_final_session_cross_coupling.py`
 * for the offline validation this was ported from (residual angle dropped
 * from 4-11° to <2° on the 2026-09-04 real session).
 *
 * Deliberately a per-session function, not a lookup of a fixed constant:
 * every future patient's own enrollment should call this on THEIR OWN
 * up/down/left/right phases, not reuse another person's mounting/
 * biomechanics evidence — see `RightHandAdultCalibrationEvidence.ts` for
 * where today's specific adult session's own derived matrix is stored,
 * explicitly labeled as that.
 *
 * Returns null if any of the four phases has too few samples to trust a
 * PCA direction from (mirrors the `<10 samples` AMBIGUOUS threshold
 * `build_manifest.py` already uses) or the two pooled directions are
 * degenerate (near-parallel, undefinable inverse).
 */
export function deriveCrossAxisCalibration(records: readonly MotionDiagnosticRecord[]): CrossAxisCalibrationEvidence | null {
  const byPhase = (phase: string) => records.filter((r) => r.phase === phase);
  const up = byPhase("up");
  const down = byPhase("down");
  const left = byPhase("left");
  const right = byPhase("right");
  if (up.length < 10 || down.length < 10 || left.length < 10 || right.length < 10) return null;

  const displacementCloud = (phaseRecords: readonly MotionDiagnosticRecord[]): { x: number; y: number }[] => {
    const x0 = phaseRecords[0].output.unfilteredPointer.x;
    const y0 = phaseRecords[0].output.unfilteredPointer.y;
    return phaseRecords.map((r) => ({ x: r.output.unfilteredPointer.x - x0, y: r.output.unfilteredPointer.y - y0 }));
  };

  const meanOf = (points: readonly { x: number; y: number }[]) => ({
    x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
    y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
  });

  /** Mean ABSOLUTE unfilteredPointer position for a phase, relative to screen center (0.5, 0.5) — see principalUnitDirection's doc comment for why this, not a displacement-from-phase-start mean, is the sign ground truth. */
  const meanPositionRelativeToCenter = (phaseRecords: readonly MotionDiagnosticRecord[]) => {
    const mean = meanOf(phaseRecords.map((r) => r.output.unfilteredPointer));
    return { x: mean.x - 0.5, y: mean.y - 0.5 };
  };

  /**
   * Principal-axis unit vector via 2x2 eigen-decomposition of the
   * covariance matrix (SHAPE: which direction within-phase motion varies
   * along, from the phase's own displacement-from-its-first-sample cloud),
   * sign-aligned to an EXTERNAL `signReference` vector.
   *
   * `signReference` must NOT be the pooled cloud's own mean (pooling
   * `left` with a sign-flipped `right` to combine their SHAPE for one PCA
   * fit means the pooled cloud's own mean direction is an artifact of
   * whichever phase dominated the pooling) and must NOT be the phase's own
   * displacement-from-its-own-first-sample mean either — real guided-
   * capture phases are not clean "start at center, push one way" segments.
   * A real example from the 2026-09-04 session: the `down` phase's
   * recorded samples START already near the bottom (y≈0.78, carried over
   * from the previous phase) and drift back toward center by the phase's
   * end, so ITS OWN relative-displacement mean is dy≈-0.06 — backwards —
   * even though the phase unambiguously sits in the screen's lower half
   * throughout. Both of these caused RIGHT/LEFT to come out inverted on
   * real data (verified: UP/DOWN happened to survive by luck of which
   * phase dominated that pooling) before being caught by the mandatory
   * pre-capture direction check in RightHandTwistInvarianceScreen.tsx.
   *
   * The one reference that survives this: mean ABSOLUTE pointer position
   * relative to screen CENTER (`meanPositionRelativeToCenter`) — "which
   * half of the screen was this phase generally on" is stable regardless
   * of within-phase transition noise.
   */
  const principalUnitDirection = (points: readonly { x: number; y: number }[], signReference: { x: number; y: number }): { x: number; y: number } => {
    const mean = meanOf(points);
    const n = points.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (const p of points) {
      const dx = p.x - mean.x;
      const dy = p.y - mean.y;
      sxx += dx * dx;
      syy += dy * dy;
      sxy += dx * dy;
    }
    sxx /= n; syy /= n; sxy /= n;
    const angle = Math.abs(sxy) < 1e-15 && Math.abs(sxx - syy) < 1e-15 ? 0 : 0.5 * Math.atan2(2 * sxy, sxx - syy);
    let ux = Math.cos(angle);
    let uy = Math.sin(angle);
    if (ux * signReference.x + uy * signReference.y < 0) {
      ux = -ux;
      uy = -uy;
    }
    return { x: ux, y: uy };
  };

  const up0 = displacementCloud(up);
  const down0 = displacementCloud(down);
  const upMeanY = meanOf(up0).y;
  const downMeanYRelStart = meanOf(down0).y;
  const verticalFlip = upMeanY * downMeanYRelStart < 0 ? -1 : 1;
  const pooledVertical = [...up0, ...down0.map((p) => ({ x: verticalFlip * p.x, y: verticalFlip * p.y }))];
  // Screen convention: DOWN is the fixed positive-y reference (pointer.y=1 is down — see
  // RightHandFinalSessionScreen.tsx's own "y=0 is UP and y=1 is DOWN" convention comment).
  const eV = principalUnitDirection(pooledVertical, meanPositionRelativeToCenter(down));

  const left0 = displacementCloud(left);
  const right0 = displacementCloud(right);
  const leftMeanX = meanOf(left0).x;
  const rightMeanXRelStart = meanOf(right0).x;
  const horizontalFlip = leftMeanX * rightMeanXRelStart < 0 ? -1 : 1;
  const pooledHorizontal = [...left0, ...right0.map((p) => ({ x: horizontalFlip * p.x, y: horizontalFlip * p.y }))];
  // Screen convention: RIGHT is the fixed positive-x reference.
  const eH = principalUnitDirection(pooledHorizontal, meanPositionRelativeToCenter(right));

  // B = [eH | eV] as columns; invert so B^-1 maps observed motion onto the screen-aligned basis.
  const a = eH.x, c = eH.y, b = eV.x, d = eV.y;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-6) return null;

  const matrix: CrossAxisCalibrationMatrix = [
    [d / det, -b / det],
    [-c / det, a / det],
  ];
  const angleBetweenAxesDeg = (Math.acos(Math.max(-1, Math.min(1, eH.x * eV.x + eH.y * eV.y))) * 180) / Math.PI;

  return {
    matrix,
    angleBetweenAxesDeg,
    sampleCounts: { up: up.length, down: down.length, left: left.length, right: right.length },
  };
}

export interface RightHandSessionProfile {
  readonly profileVersion: string;
  readonly generatedAtIso: string;
  readonly role: "RIGHT_HAND";
  readonly disclaimer: string;
  readonly hardware: { readonly rateHz: number; readonly bandwidthHz: number; readonly source: "measured_today" | "unchanged_default" };
  readonly controller: {
    readonly filterMode: ContinuousMotionConfig["filterMode"];
    readonly sensitivity: number;
    readonly deadZoneDeg: number;
    readonly smoothing: number;
  };
  readonly noiseEnvelope: RightHandNoiseEnvelope;
  readonly achievedRange: AchievedRange;
  readonly edgeReversal: readonly EdgeReversalMeasurement[];
  /** This session's OWN personalized cross-axis calibration — see deriveCrossAxisCalibration. Null if up/down/left/right weren't all captured with enough samples. */
  readonly crossAxisCalibration: CrossAxisCalibrationEvidence | null;
  readonly notesAr: readonly string[];
  readonly datasetReferences: readonly string[];
}

export function buildRightHandSessionProfile(input: {
  hardware: RightHandSessionProfile["hardware"];
  config: ContinuousMotionConfig;
  stillRecords: readonly MotionDiagnosticRecord[];
  allRecords: readonly MotionDiagnosticRecord[];
  edgeReversal: readonly EdgeReversalMeasurement[];
  notesAr: readonly string[];
  datasetReferences: readonly string[];
}): RightHandSessionProfile {
  return {
    profileVersion: "right-hand-session-2026-09-04",
    generatedAtIso: new Date().toISOString(),
    role: "RIGHT_HAND",
    disclaimer:
      "هذا ملف تعريف هندسي لجلسة اختبار بالغ واحدة (وليس معايرة سريرية لطفل). المدى الشخصي (achievedRange) خاص بهذه الجلسة فقط. Hardware/filter/edge-behavior هي إعدادات عامة يمكن اعتمادها كافتراضي مشترك؛ كل مريض مستقبلاً يحتاج تسجيله (enrollment) الخاص به.",
    hardware: input.hardware,
    controller: {
      filterMode: input.config.filterMode,
      sensitivity: input.config.sensitivity,
      deadZoneDeg: input.config.deadZoneDeg,
      smoothing: input.config.smoothing,
    },
    noiseEnvelope: buildNoiseEnvelope(input.stillRecords),
    achievedRange: measureAchievedRange(input.allRecords),
    edgeReversal: input.edgeReversal,
    crossAxisCalibration: deriveCrossAxisCalibration(input.allRecords),
    notesAr: input.notesAr,
    datasetReferences: input.datasetReferences,
  };
}

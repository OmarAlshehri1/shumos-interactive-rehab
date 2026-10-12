import { angularDeltaDeg, type ContinuousMotionConfig } from "./ContinuousMotionController";
import { analyzeRotationInPlace, summarizeMotionLatency, type MotionDiagnosticRecord, type MotionLatencySummary, type RotationDiagnosticAnalysis } from "./MotionDiagnostic";
import { buildNoiseEnvelope, measureAchievedRange, type AchievedRange, type EdgeReversalMeasurement, type RightHandNoiseEnvelope } from "./RightHandSessionProfile";
import { TWIST_INVARIANCE_PHASES } from "./TwistInvarianceCapturePhases";

/**
 * LEFT_HAND ENROLLMENT EXPORT — pure, framework-free export-shape builder
 * for LeftHandEnrollmentScreen.tsx (tonight's dual-sensor brief).
 *
 * Deliberately NOT `buildRightHandSessionProfile` (RightHandSessionProfile.ts)
 * reused wholesale: that function (a) hardcodes `role: "RIGHT_HAND"` as a
 * literal type, and (b) ALWAYS calls `deriveCrossAxisCalibration`, producing
 * a personalized 2x2 cross-axis matrix from this session's own up/down/
 * left/right phases. Tonight's brief is explicit that LEFT_HAND enrollment
 * is for collecting real evidence to analyze LATER — "no crossAxisCalibration
 * matrix, no personalized numbers" — so this file is a genuinely different,
 * smaller shape: raw/descriptive measurements only (noise envelope, achieved
 * range, edge-reversal timing, rotation-coupling observations, twist-posture
 * angle evidence), never a derived correction matrix or anything fed back
 * into LEFT_HAND_RUNTIME_CONFIG.
 *
 * The generic, role-agnostic pieces this DOES reuse directly (rather than
 * duplicating) are re-exported/imported from RightHandSessionProfile.ts and
 * MotionDiagnostic.ts: buildNoiseEnvelope, measureAchievedRange,
 * analyzeRotationInPlace, summarizeMotionLatency, and the AchievedRange/
 * EdgeReversalMeasurement/RightHandNoiseEnvelope types all take/describe
 * plain MotionDiagnosticRecord[] with no role baked into their logic.
 */

export interface TwistPostureAngleSummary {
  readonly phase: string;
  readonly sampleCount: number;
  /** Measured (not nominal) wrist roll relative to the session's own center, from this session's own gyroscope-fused angles — see TwistInvarianceCapturePhases.ts's doc comment on why the nominal 0/45/90 label is never trusted as ground truth. Null when this phase has zero records. */
  readonly actualWristAngleDeg: { readonly mean: number; readonly min: number; readonly max: number } | null;
}

/** Per TWIST_INVARIANCE_PHASES entry: how far the wrist was actually rolled (measured), not the nominal posture label. Mirrors RightHandTwistInvarianceScreen.tsx's inline `twistPostureSummary` logic exactly, extracted here as a pure/testable function. */
export function summarizeTwistPostureAngles(records: readonly MotionDiagnosticRecord[], centerRollDeg: number): readonly TwistPostureAngleSummary[] {
  return TWIST_INVARIANCE_PHASES.map((phaseDef) => {
    const phaseRecords = records.filter((r) => r.phase === phaseDef.id);
    if (phaseRecords.length === 0) return { phase: phaseDef.id, sampleCount: 0, actualWristAngleDeg: null };
    const deltas = phaseRecords.map((r) => angularDeltaDeg(r.sample.anglesDeg[0], centerRollDeg));
    return {
      phase: phaseDef.id,
      sampleCount: phaseRecords.length,
      actualWristAngleDeg: { mean: deltas.reduce((sum, v) => sum + v, 0) / deltas.length, min: Math.min(...deltas), max: Math.max(...deltas) },
    };
  });
}

export const LEFT_HAND_ENROLLMENT_EXPORT_VERSION = "left-hand-enrollment-2026-09-05";

export interface LeftHandEnrollmentExport {
  /** Controller-version marker for this export shape — bump when this file's fields change. */
  readonly exportVersion: string;
  readonly capturedAtIso: string;
  readonly role: "LEFT_HAND";
  readonly sessionKind: string;
  readonly deviceId: string | null;
  readonly liveRateHz: number | null;
  readonly config: ContinuousMotionConfig;
  readonly noiseEnvelope: RightHandNoiseEnvelope;
  readonly achievedRange: AchievedRange;
  readonly edgeReversal: readonly EdgeReversalMeasurement[];
  readonly twistPostureAngles: readonly TwistPostureAngleSummary[];
  readonly rotationAnalysis: RotationDiagnosticAnalysis;
  readonly latency: MotionLatencySummary;
  readonly events: readonly { readonly type: string; readonly atMs: number; readonly noteAr: string }[];
  readonly disclaimer: string;
  readonly notesAr: readonly string[];
  readonly records: readonly MotionDiagnosticRecord[];
}

export function buildLeftHandEnrollmentExport(input: {
  deviceId: string | null;
  liveRateHz: number | null;
  config: ContinuousMotionConfig;
  stillRecords: readonly MotionDiagnosticRecord[];
  allRecords: readonly MotionDiagnosticRecord[];
  edgeReversal: readonly EdgeReversalMeasurement[];
  centerRollDeg: number;
  events: readonly { readonly type: string; readonly atMs: number; readonly noteAr: string }[];
  notesAr: readonly string[];
}): LeftHandEnrollmentExport {
  return {
    exportVersion: LEFT_HAND_ENROLLMENT_EXPORT_VERSION,
    capturedAtIso: new Date().toISOString(),
    role: "LEFT_HAND",
    sessionKind: "LEFT_HAND_ENROLLMENT_2026_09_05",
    deviceId: input.deviceId,
    liveRateHz: input.liveRateHz,
    config: input.config,
    noiseEnvelope: buildNoiseEnvelope(input.stillRecords),
    achievedRange: measureAchievedRange(input.allRecords),
    edgeReversal: input.edgeReversal,
    twistPostureAngles: summarizeTwistPostureAngles(input.allRecords, input.centerRollDeg),
    rotationAnalysis: analyzeRotationInPlace(input.allRecords, input.config),
    latency: summarizeMotionLatency(input.allRecords),
    events: input.events,
    disclaimer:
      "هذا ملف أدلة (evidence) خام لجلسة تسجيل واحدة لليد اليسرى — لا يحتوي على أي معايرة محورية متقاطعة (crossAxisCalibration) أو أرقام شخصية مُشتقة. الهدف الوحيد جمع بيانات حقيقية لتحليلها لاحقًا قبل أي معايرة فعلية؛ لا تُستخدم هذه البيانات تلقائيًا في أي إعداد تشغيلي.",
    notesAr: input.notesAr,
    records: input.allRecords,
  };
}

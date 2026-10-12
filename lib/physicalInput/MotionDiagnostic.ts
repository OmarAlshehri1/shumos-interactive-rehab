import { angularDeltaDeg, type ContinuousMotionConfig, type NormalizedPointer } from "./ContinuousMotionController";
import type { MotionSample } from "./types";

export const MOTION_DIAGNOSTIC_PHASES = [
  { id: "still_start", titleAr: "ثبت يدك", instructionAr: "ابقَ في وضع مريح وثابت، ثم اضغط التالي عندما تكون جاهزًا." },
  { id: "rotate_one", titleAr: "لف يدك فقط", instructionAr: "لف المعصم فقط مع محاولة إبقاء مكان اليد ثابتًا." },
  { id: "rotate_other", titleAr: "لفها بالاتجاه الآخر", instructionAr: "لف المعصم بالعكس مع بقاء مكان اليد ثابتًا." },
  { id: "right", titleAr: "حرّك لليمين", instructionAr: "وجّه يدك بوضوح إلى اليمين." },
  { id: "left", titleAr: "حرّك لليسار", instructionAr: "وجّه يدك بوضوح إلى اليسار." },
  { id: "up", titleAr: "حرّك للأعلى", instructionAr: "وجّه يدك بوضوح إلى الأعلى." },
  { id: "down", titleAr: "حرّك للأسفل", instructionAr: "وجّه يدك بوضوح إلى الأسفل." },
  { id: "diagonal", titleAr: "حرّك قطريًا", instructionAr: "حرّك اليد في مسار قطري متصل." },
  { id: "tiny", titleAr: "حركة صغيرة جدًا", instructionAr: "نفّذ أصغر حركة مريحة تستطيعها." },
  { id: "slow", titleAr: "حركة بطيئة", instructionAr: "تحرك ببطء وبشكل مستمر." },
  { id: "fast", titleAr: "حركة سريعة", instructionAr: "نفّذ حركة واضحة وسريعة مرة واحدة." },
  { id: "still_end", titleAr: "توقف وثبت يدك", instructionAr: "توقف تمامًا واثبت، ثم أنهِ التسجيل." },
] as const;

export type MotionDiagnosticPhaseId = (typeof MOTION_DIAGNOSTIC_PHASES)[number]["id"];

export interface MotionDiagnosticRecord {
  /**
   * A string, not narrowed to MotionDiagnosticPhaseId — SensorHandDemoScreen
   * only ever produces the ids above, but RightHandFinalSessionScreen (see
   * FinalSessionPhases.ts) reuses this exact record/analysis machinery with
   * its own superset of phase ids (edge-reversal, free play, recenter test)
   * without needing a parallel copy of this file. analyzeRotationInPlace
   * below only ever looks for the literal "rotate_one"/"rotate_other"
   * strings, so it works unchanged either way.
   */
  readonly phase: string;
  readonly sample: MotionSample;
  readonly output: NormalizedPointer;
  uiCommittedAtMs?: number;
  visualFrameAtMs?: number;
}

export interface RotationPhaseMetric {
  readonly phase: "rotate_one" | "rotate_other";
  readonly pointerDisplacementBeforeRotation: number;
  readonly maximumPointerDrift: number;
  readonly finalPointerDrift: number;
  readonly visualRotationAmountDeg: number;
}

/**
 * Per-direction breakdown so a pooled suggestion is never trusted blindly:
 * rotate_one and rotate_other are regressed separately, and `agree` tells
 * the caller whether the two directions' measured coupling is close enough
 * for the pooled coefficient to be a fair compromise rather than a number
 * that quietly averages away a real (or session-noise-driven) asymmetry.
 */
export interface DirectionalCompensation {
  readonly rotate_one: number | null;
  readonly rotate_other: number | null;
  /** null when either direction has too little data to regress at all. */
  readonly agree: boolean | null;
}

export interface RotationDiagnosticAnalysis {
  readonly phases: readonly RotationPhaseMetric[];
  readonly suggestedCompensationX: number | null;
  readonly suggestedCompensationY: number | null;
  readonly directionalCompensationX: DirectionalCompensation;
  readonly directionalCompensationY: DirectionalCompensation;
}

function axisIndex(axis: ContinuousMotionConfig["xAxis"]): number {
  return axis === "roll" ? 0 : axis === "pitch" ? 1 : 2;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function regressionSlope(xs: readonly number[], ys: readonly number[]): number | null {
  if (xs.length < 3 || xs.length !== ys.length) return null;
  const xMean = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const yMean = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  const variance = xs.reduce((sum, value) => sum + (value - xMean) ** 2, 0);
  if (variance < 1) return null;
  return ys.reduce((sum, value, index) => sum + (value - yMean) * (xs[index] - xMean), 0) / variance;
}

/** Regresses one phase alone (relative to that phase's own first sample), for the rotate_one-vs-rotate_other consistency check. */
function directionalSlopes(
  rotationRecords: readonly MotionDiagnosticRecord[],
  phase: "rotate_one" | "rotate_other",
  config: Pick<ContinuousMotionConfig, "xAxis" | "yAxis" | "rotationAxis">,
): { x: number | null; y: number | null } {
  const phaseRecords = rotationRecords.filter((record) => record.phase === phase);
  const first = phaseRecords[0]?.sample;
  if (!first) return { x: null, y: null };
  const rotationDeltas = phaseRecords.map(({ sample }) => angularDeltaDeg(sample.anglesDeg[axisIndex(config.rotationAxis)], first.anglesDeg[axisIndex(config.rotationAxis)]));
  const xDeltas = phaseRecords.map(({ sample }) => angularDeltaDeg(sample.anglesDeg[axisIndex(config.xAxis)], first.anglesDeg[axisIndex(config.xAxis)]));
  const yDeltas = phaseRecords.map(({ sample }) => angularDeltaDeg(sample.anglesDeg[axisIndex(config.yAxis)], first.anglesDeg[axisIndex(config.yAxis)]));
  return { x: regressionSlope(rotationDeltas, xDeltas), y: regressionSlope(rotationDeltas, yDeltas) };
}

/** Same-sign and within `maxRatio` of one another counts as agreement; a sign flip or a large magnitude gap never does, regardless of what the pooled slope says. */
function directionsAgree(a: number | null, b: number | null, maxRatio = 1.75): boolean | null {
  if (a === null || b === null) return null;
  if (a === 0 && b === 0) return true;
  if (Math.sign(a) !== Math.sign(b)) return false;
  const larger = Math.max(Math.abs(a), Math.abs(b));
  const smaller = Math.min(Math.abs(a), Math.abs(b));
  if (smaller === 0) return false;
  return larger / smaller <= maxRatio;
}

function directionalCompensation(
  rotationRecords: readonly MotionDiagnosticRecord[],
  config: Pick<ContinuousMotionConfig, "xAxis" | "yAxis" | "rotationAxis">,
): { x: DirectionalCompensation; y: DirectionalCompensation } {
  const one = directionalSlopes(rotationRecords, "rotate_one", config);
  const other = directionalSlopes(rotationRecords, "rotate_other", config);
  return {
    x: { rotate_one: one.x, rotate_other: other.x, agree: directionsAgree(one.x, other.x) },
    y: { rotate_one: one.y, rotate_other: other.y, agree: directionsAgree(one.y, other.y) },
  };
}

export function analyzeRotationInPlace(
  records: readonly MotionDiagnosticRecord[],
  config: Pick<ContinuousMotionConfig, "xAxis" | "yAxis" | "rotationAxis">,
): RotationDiagnosticAnalysis {
  const rotationRecords = records.filter((record) => record.phase === "rotate_one" || record.phase === "rotate_other");
  const metrics = (["rotate_one", "rotate_other"] as const).flatMap((phase): RotationPhaseMetric[] => {
    const phaseRecords = rotationRecords.filter((record) => record.phase === phase);
    if (!phaseRecords.length) return [];
    const baseline = phaseRecords[0].output.pointer;
    const before = records.filter((record) => record.output.timestampMs < phaseRecords[0].output.timestampMs).at(-1)?.output.pointer ?? baseline;
    const drifts = phaseRecords.map((record) => distance(record.output.pointer, baseline));
    const rotations = phaseRecords.map((record) => record.output.visualOrientation.rotationDeg);
    return [{
      phase,
      pointerDisplacementBeforeRotation: distance(before, baseline),
      maximumPointerDrift: Math.max(...drifts),
      finalPointerDrift: drifts.at(-1) ?? 0,
      visualRotationAmountDeg: Math.max(...rotations) - Math.min(...rotations),
    }];
  });

  const rotationDeltas: number[] = [];
  const xDeltas: number[] = [];
  const yDeltas: number[] = [];
  for (const phase of ["rotate_one", "rotate_other"] as const) {
    const phaseRecords = rotationRecords.filter((record) => record.phase === phase);
    const first = phaseRecords[0]?.sample;
    if (!first) continue;
    for (const { sample } of phaseRecords) {
      rotationDeltas.push(angularDeltaDeg(sample.anglesDeg[axisIndex(config.rotationAxis)], first.anglesDeg[axisIndex(config.rotationAxis)]));
      xDeltas.push(angularDeltaDeg(sample.anglesDeg[axisIndex(config.xAxis)], first.anglesDeg[axisIndex(config.xAxis)]));
      yDeltas.push(angularDeltaDeg(sample.anglesDeg[axisIndex(config.yAxis)], first.anglesDeg[axisIndex(config.yAxis)]));
    }
  }
  const directional = directionalCompensation(rotationRecords, config);
  return {
    phases: metrics,
    suggestedCompensationX: regressionSlope(rotationDeltas, xDeltas),
    suggestedCompensationY: regressionSlope(rotationDeltas, yDeltas),
    directionalCompensationX: directional.x,
    directionalCompensationY: directional.y,
  };
}

export interface MotionLatencySummary {
  readonly sampleIntervalMs: number | null;
  readonly parsingLatencyMs: number | null;
  readonly controllerLatencyMs: number | null;
  readonly filterProcessingMs: number | null;
  readonly outputToUiCommitMs: number | null;
  readonly outputToVisualFrameMs: number | null;
  readonly notificationToVisualFrameMs: number | null;
}

function average(values: readonly number[]): number | null {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
}

export function summarizeMotionLatency(records: readonly MotionDiagnosticRecord[]): MotionLatencySummary {
  const intervals = records.slice(1).map((record, index) => record.output.timestampMs - records[index].output.timestampMs).filter((value) => value > 0);
  return {
    sampleIntervalMs: average(intervals),
    parsingLatencyMs: average(records.map(({ output }) => output.timing.parsedAtMs - output.timing.parsingStartedAtMs)),
    controllerLatencyMs: average(records.map(({ output }) => output.timing.pointerOutputAtMs - output.timing.controllerStartedAtMs)),
    filterProcessingMs: average(records.map(({ output }) => output.timing.filterCompletedAtMs - output.timing.filterStartedAtMs)),
    outputToUiCommitMs: average(records.flatMap((record) => record.uiCommittedAtMs === undefined ? [] : [record.uiCommittedAtMs - record.output.timing.pointerOutputAtMs])),
    outputToVisualFrameMs: average(records.flatMap((record) => record.visualFrameAtMs === undefined ? [] : [record.visualFrameAtMs - record.output.timing.pointerOutputAtMs])),
    notificationToVisualFrameMs: average(records.flatMap((record) => record.visualFrameAtMs === undefined ? [] : [record.visualFrameAtMs - record.output.timing.bleNotificationAtMs])),
  };
}

import { EDGE_REVERSAL_PHASES, FREE_PLAY_PHASE_ID, RECENTER_TEST_PHASE_ID } from "./FinalSessionPhases";
import { MOTION_DIAGNOSTIC_PHASES } from "./MotionDiagnostic";
import { TWIST_INVARIANCE_PHASES } from "./TwistInvarianceCapturePhases";

/**
 * LEFT_HAND ENROLLMENT — the ONE combined guided session tonight's
 * dual-sensor brief (section 8) asks for, built entirely by reusing
 * already-validated phase lists rather than inventing a new capture
 * vocabulary: MOTION_DIAGNOSTIC_PHASES (still/rotate-in-place/right/left/
 * up/down/diagonal/tiny/slow/fast) already covers most of the requested
 * categories; TWIST_INVARIANCE_PHASES supplies the wrist-roll-normal/45°/90°
 * blocks; EDGE_REVERSAL_PHASES supplies the four edge/reversal checks. Only
 * two categories genuinely don't exist anywhere yet (see the 2026-09-04
 * overnight doc's own gap analysis) — HOLD_PHASE (distinct from
 * MOTION_DIAGNOSTIC_PHASES' "still_start", which doubles as centering) and
 * SMALL_NATURAL_SHAKE_PHASE (distinct from "tiny", which asks for an
 * intentional small movement rather than an unintentional natural one) —
 * added here as the only new phase definitions this file introduces.
 *
 * RECENTER_TEST_PHASE_ID and FREE_PLAY_PHASE_ID are re-exported, not
 * duplicated — LeftHandEnrollmentScreen.tsx handles them exactly like
 * RightHandFinalSessionScreen.tsx already does (interactive recenter() call
 * / time-based free play, neither sample-count-gated like the phases below).
 */
export const HOLD_PHASE = {
  id: "hold_naturally",
  titleAr: "ثبّت يدك بشكل طبيعي",
  instructionAr: "أبقِ يدك في مكانها بشكل مريح وطبيعي لبضع ثوانٍ — لا داعي للتصلب أو التثبيت بصرامة.",
} as const;

export const SMALL_NATURAL_SHAKE_PHASE = {
  id: "small_natural_shake",
  titleAr: "هزّة صغيرة طبيعية",
  instructionAr: "حرّك يدك برعشة/هزّة صغيرة كما تحدث بشكل طبيعي وغير مقصود، دون محاولة تحريك المؤشر عمدًا.",
} as const;

export const LEFT_HAND_ENROLLMENT_PHASES = [
  ...MOTION_DIAGNOSTIC_PHASES,
  HOLD_PHASE,
  SMALL_NATURAL_SHAKE_PHASE,
  ...TWIST_INVARIANCE_PHASES,
  ...EDGE_REVERSAL_PHASES,
] as const;

/** RECENTER_TEST_PHASE_ID/FREE_PLAY_PHASE_ID are already exported by FinalSessionPhases.ts (re-exported via this package's index.ts) — imported here only for this type, not re-exported again (an `export *` re-export of the same name from two modules would conflict). */
export type LeftHandEnrollmentPhaseId = (typeof LEFT_HAND_ENROLLMENT_PHASES)[number]["id"] | typeof RECENTER_TEST_PHASE_ID | typeof FREE_PLAY_PHASE_ID;

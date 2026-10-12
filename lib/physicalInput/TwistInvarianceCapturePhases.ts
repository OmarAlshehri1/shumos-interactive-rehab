import { EDGE_REVERSAL_PHASES } from "./FinalSessionPhases";
import { MOTION_DIAGNOSTIC_PHASES } from "./MotionDiagnostic";

/**
 * TWIST-INVARIANCE TARGETED CAPTURE — the ONE missing variable the
 * 2026-09-04 FINAL_SESSION (11,402 samples) does not cover: aiming
 * up/down/left/right WHILE the wrist/forearm is held rotated. That session's
 * rotate_one/rotate_other phases only test twisting IN PLACE (hold aim,
 * then twist) — see tools/witmotion_ble/real_dataset/
 * final_session_cross_coupling_report.json's twist_in_place section. They
 * say nothing about whether UP/DOWN and LEFT/RIGHT swap once the sensor sits
 * at a different roll angle on the wrist, which is the real pediatric
 * complaint (a rotated/pronated/supinated forearm must not change which
 * screen direction a movement produces).
 *
 * Deliberately reuses the exact {id, titleAr, instructionAr} shape as
 * MOTION_DIAGNOSTIC_PHASES/EDGE_REVERSAL_PHASES (see FinalSessionPhases.ts)
 * so it needs zero changes to MotionDiagnosticRecord, the recording screen
 * machinery, or replay/analysis scripts — phase is already a plain string
 * there specifically so a new superset like this one just works.
 *
 * Each block only needs a few seconds of aiming per direction (not a full
 * repeat of today's session) — this is 12 short phases total (3 wrist
 * postures x 4 directions), roughly a minute of active capture. The therapist
 * physically holds/rotates the forearm to roughly the stated angle before
 * each block; there is no way for firmware/software to verify the actual
 * physical roll achieved, so anglesDeg[0] (device fused roll, gravity-
 * referenced) recorded during each block is the source of truth for "how far
 * twisted was it really," not the block's nominal 0/45/90 label — see this
 * file's own analysis script once captured.
 *
 * NOT wired into any screen yet (same "prepared architecture, not
 * integrated" status as the rest of lib/physicalInput/** per AGENTS.md /
 * wt901-right-hand-calibration memory) — needs an explicit go-ahead before
 * building a RightHandTwistInvarianceScreen.tsx around this list.
 */
export const TWIST_POSTURES = ["neutral", "twist_45", "twist_90"] as const;
export type TwistPosture = (typeof TWIST_POSTURES)[number];

const POSTURE_INSTRUCTION_AR: Record<TwistPosture, string> = {
  neutral: "بوضع المعصم الطبيعي (كما لو كنت تستخدم جهاز التحكم بشكل معتاد)",
  twist_45: "بعد لفّ المعصم/الساعد حوالي 45 درجة عن الوضع الطبيعي (استمر بالإمساك بهذا اللف طوال هذا الجزء)",
  twist_90: "بعد لفّ المعصم/الساعد حوالي 90 درجة عن الوضع الطبيعي (الحساس الآن على جانب المعصم تقريبًا؛ استمر بالإمساك بهذا اللف طوال هذا الجزء)",
};

const DIRECTIONS = [
  { suffix: "up", ar: "للأعلى" },
  { suffix: "down", ar: "للأسفل" },
  { suffix: "left", ar: "لليسار" },
  { suffix: "right", ar: "لليمين" },
] as const;

export const TWIST_INVARIANCE_PHASES = TWIST_POSTURES.flatMap((posture) =>
  DIRECTIONS.map((direction) => ({
    id: `${posture}_${direction.suffix}` as const,
    titleAr: `${posture === "neutral" ? "طبيعي" : posture === "twist_45" ? "لفّ 45°" : "لفّ 90°"} — ${direction.ar}`,
    instructionAr: `${POSTURE_INSTRUCTION_AR[posture]}، وجّه يدك بوضوح ${direction.ar} لمدة ثانيتين إلى ثلاث ثوانٍ فقط.`,
  })),
);

export type TwistInvariancePhaseId = (typeof TWIST_INVARIANCE_PHASES)[number]["id"];

/**
 * Optional Part D from the brief ("opposite rotation") — supination vs
 * pronation, i.e. twisting the other way. Kept as a separate opt-in export
 * rather than appended by default: the brief marks it optional, and doubling
 * every block doubles capture time for a session already described as
 * "very short" on purpose.
 */
export const TWIST_INVARIANCE_OPPOSITE_PHASES = (["twist_neg45", "twist_neg90"] as const).flatMap((posture) =>
  DIRECTIONS.map((direction) => ({
    id: `${posture}_${direction.suffix}` as const,
    titleAr: `${posture === "twist_neg45" ? "لفّ -45° (الاتجاه المعاكس)" : "لفّ -90° (الاتجاه المعاكس)"} — ${direction.ar}`,
    instructionAr: `بعد لفّ المعصم/الساعد بالاتجاه المعاكس حوالي ${posture === "twist_neg45" ? "45" : "90"} درجة عن الوضع الطبيعي، وجّه يدك بوضوح ${direction.ar} لمدة ثانيتين إلى ثلاث ثوانٍ فقط.`,
  })),
);

/** Reference reminder only — this capture reuses the still_start phase for centering, exactly like every other MOTION_DIAGNOSTIC_PHASES-based screen. */
export const TWIST_INVARIANCE_CENTERING_PHASE = MOTION_DIAGNOSTIC_PHASES[0];

/**
 * The two edge-reversal directions the 2026-09-04 FINAL_SESSION did NOT
 * validate (`reversalResponseMs: null` in that session's own profile — see
 * FINDINGS.md's "Edge reversal: 2 of 4 directions validated this session").
 * Appended to the end of this same short capture per the brief's "do NOT
 * repeat the whole edge test... capture ONLY the two missing cases."
 */
export const MISSING_EDGE_REVERSAL_PHASES = EDGE_REVERSAL_PHASES.filter(
  (p) => p.id === "edge_left_reverse_right" || p.id === "edge_top_reverse_down",
);

/** Full capture session: centering (handled separately by the screen, like every other guided screen) + the 12 twist-invariance phases + the 2 still-missing edge-reversal phases. */
export const TWIST_INVARIANCE_SESSION_PHASES = [...TWIST_INVARIANCE_PHASES, ...MISSING_EDGE_REVERSAL_PHASES];

import { MOTION_DIAGNOSTIC_PHASES } from "./MotionDiagnostic";

/**
 * RIGHT_HAND FINAL SESSION — phase list for RightHandFinalSessionScreen.tsx
 * (the one live guided session with the real WT901BLECL). Reuses
 * MOTION_DIAGNOSTIC_PHASES verbatim (still/rotate/right/left/up/down/
 * diagonal/tiny/slow/fast/still_end already cover "hold naturally", "tiny
 * intentional movement", "comfortable range", "speed response", and
 * "twist validation" via rotate_one/rotate_other — see
 * analyzeRotationInPlace, which only ever looks for those exact two ids) and
 * appends the NEW categories tonight's edge-saturation fix and recenter
 * hardening need real-hardware evidence for, which no existing phase list
 * covers: pushing into and reversing off each of the four edges, and a
 * dedicated recenter validation. Free play is handled as its own screen
 * stage (time-based, not sample-count-gated — see the screen component),
 * not a MOTION_DIAGNOSTIC_PHASES-style phase.
 */
export const EDGE_REVERSAL_PHASES = [
  {
    id: "edge_right_reverse_left",
    titleAr: "الحافة اليمنى ثم الرجوع",
    instructionAr: "حرّك يدك لليمين حتى يصل المؤشر إلى الحافة، استمر بالدفع لليمين قليلاً أكثر، ثم اعكس الاتجاه بخفة نحو اليسار.",
  },
  {
    id: "edge_left_reverse_right",
    titleAr: "الحافة اليسرى ثم الرجوع",
    instructionAr: "حرّك يدك لليسار حتى يصل المؤشر إلى الحافة، استمر بالدفع لليسار قليلاً أكثر، ثم اعكس الاتجاه بخفة نحو اليمين.",
  },
  {
    id: "edge_top_reverse_down",
    titleAr: "الحافة العلوية ثم الرجوع",
    instructionAr: "حرّك يدك للأعلى حتى يصل المؤشر إلى الحافة، استمر بالدفع للأعلى قليلاً أكثر، ثم اعكس الاتجاه بخفة نحو الأسفل.",
  },
  {
    id: "edge_bottom_reverse_up",
    titleAr: "الحافة السفلية ثم الرجوع",
    instructionAr: "حرّك يدك للأسفل حتى يصل المؤشر إلى الحافة، استمر بالدفع للأسفل قليلاً أكثر، ثم اعكس الاتجاه بخفة نحو الأعلى.",
  },
] as const;

export type EdgeReversalPhaseId = (typeof EDGE_REVERSAL_PHASES)[number]["id"];

/** Not sample-gated like the phases above — this one needs the interactive recenter() call itself; see the screen component's dedicated stage handling. */
export const RECENTER_TEST_PHASE_ID = "recenter_test" as const;

export const FREE_PLAY_PHASE_ID = "free_play" as const;

export const FINAL_SESSION_PHASES = [...MOTION_DIAGNOSTIC_PHASES, ...EDGE_REVERSAL_PHASES] as const;

export type FinalSessionPhaseId = (typeof FINAL_SESSION_PHASES)[number]["id"] | typeof RECENTER_TEST_PHASE_ID | typeof FREE_PLAY_PHASE_ID;

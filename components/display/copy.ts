import type { StageNumber } from "@/lib/game";

/** Arabic feminine-ordinal forms agreeing with "المرحلة" (stage), for stages 1-5. */
const STAGE_ORDINAL_AR: Record<StageNumber, string> = {
  1: "الأولى",
  2: "الثانية",
  3: "الثالثة",
  4: "الرابعة",
  5: "الخامسة",
};

export function stageOrdinalAr(stageNumber: StageNumber): string {
  return STAGE_ORDINAL_AR[stageNumber];
}

/** Formats a duration as MM:SS for the session-complete summary card. Null (a stage/session with nothing timed — e.g. a never-entered SKIPPED stage) renders as "—", same convention as formatReactionTimeSeconds below. */
export function formatDurationClock(durationMs: number | null | undefined): string {
  if (durationMs === null || durationMs === undefined || !Number.isFinite(durationMs) || durationMs < 0) return "—";
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** Formats a 0-1 accuracy ratio as a whole-percent string for the child-facing summary. Null (nothing to measure — e.g. a never-entered SKIPPED stage) renders as "—", never 0%, which would misleadingly read as "played and failed." */
export function formatAccuracyPercent(accuracy: number | null | undefined): string {
  if (accuracy === null || accuracy === undefined || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 1) return "—";
  return `${Math.round(accuracy * 100)}%`;
}

/**
 * متوسط زمن الاستجابة المسجل — an interaction-timing metric derived from
 * therapist-confirmed taps (see lib/game/session.ts's selectBalloon), not a
 * clinical/sensor-precision reaction-time measurement. Shared by the
 * therapist stage/session views and the family report so the exact same
 * formatting (and the exact same "—" for "nothing recorded yet") appears
 * everywhere this number is shown — see the Task 9 report.
 */
export function formatReactionTimeSeconds(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return "—";
  return `${(ms / 1000).toFixed(1)} ث`;
}

export const CORRECT_ENCOURAGEMENTS_AR = ["رائع!", "أحسنت!", "ممتاز!", "عمل رائع!"] as const;
export const INCORRECT_ENCOURAGEMENT_AR = "حاول مرة أخرى";

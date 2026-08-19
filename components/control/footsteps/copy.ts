import { PathStyle, PathWidth, StepLength } from "@/lib/footsteps";

export const STEP_LENGTH_LABELS: Record<StepLength, string> = {
  [StepLength.SHORT]: "قصيرة",
  [StepLength.MEDIUM]: "متوسطة",
  [StepLength.LONG]: "طويلة",
};

export const PATH_STYLE_LABELS: Record<PathStyle, string> = {
  [PathStyle.STRAIGHT]: "مستقيم",
  [PathStyle.LEFT_RIGHT]: "يمين ويسار",
  [PathStyle.VARIED]: "متنوع",
};

export const PATH_WIDTH_LABELS: Record<PathWidth, string> = {
  [PathWidth.NARROW]: "ضيق",
  [PathWidth.MEDIUM]: "متوسط",
  [PathWidth.WIDE]: "واسع",
};

/** متوسط زمن الخطوة المسجل — same "honest interaction-timing, not clinical gait measurement" framing as lib/footsteps/types.ts's averageStepTimeMs. */
export function formatStepTimeSeconds(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return "—";
  return `${(ms / 1000).toFixed(1)} ث`;
}

export function formatCompletionPercent(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate) || rate < 0 || rate > 1) return "—";
  return `${Math.round(rate * 100)}%`;
}

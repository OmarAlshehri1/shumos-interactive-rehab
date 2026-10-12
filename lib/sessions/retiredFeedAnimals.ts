/** Read-only compatibility for discontinued Feed the Animals patient history. */
export const RETIRED_FEED_ANIMALS_ID = "feed-the-animals" as const;
export const RETIRED_FEED_ANIMALS_NAME_AR = "أطعم الحيوانات";

/** متوسط زمن الاستجابة المسجل — same "honest interaction-timing, not clinical" framing as the other games' formatters. */
export function formatResponseTimeSeconds(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return "—";
  return `${(ms / 1000).toFixed(1)} ث`;
}

export function formatCompletionPercent(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate) || rate < 0 || rate > 1) return "—";
  return `${Math.round(rate * 100)}%`;
}

export function formatAccuracyPercent(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate) || rate < 0 || rate > 1) return "—";
  return `${Math.round(rate * 100)}%`;
}

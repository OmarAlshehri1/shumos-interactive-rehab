import { StarLane } from "@/lib/spacepilot";

/** Arabic labels for the three flight lanes — therapist-facing only (the child never reads text, see the task's visual-first tutorial philosophy). */
export const STAR_LANE_NAME_AR: Record<StarLane, string> = {
  [StarLane.TOP]: "أعلى",
  [StarLane.MIDDLE]: "وسط",
  [StarLane.BOTTOM]: "أسفل",
};

/** Same 0-1 -> percentage formatting convention as every other game's own copy.ts (e.g. components/control/footsteps/copy.ts's formatCompletionPercent). */
export function formatSpacePilotCollectionPercent(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate) || rate < 0 || rate > 1) return "—";
  return `${Math.round(rate * 100)}%`;
}

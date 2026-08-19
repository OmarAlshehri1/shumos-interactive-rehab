import type { NormalizedPosition } from "@/lib/feedanimals";

/** Explicit physical origin prevents RTL static-position rules shifting the sprite by its own width. */
export const PATH_CONTACT_ANCHOR_STYLE = {
  left: 0,
  top: 0,
  transform: "translate(-50%, -100%)",
} as const;

/** Identical percentage serialization for every route-bound visual. */
export function pathPositionStyle(position: NormalizedPosition): { left: string; top: string } {
  return {
    left: `${(position.x * 100).toFixed(4)}%`,
    top: `${(position.y * 100).toFixed(4)}%`,
  };
}

/** Facing follows actual horizontal route travel, not the control label. */
export function facingForPathMovement(
  previous: NormalizedPosition,
  current: NormalizedPosition,
  fallback: "left" | "right",
): "left" | "right" {
  const dx = current.x - previous.x;
  if (Math.abs(dx) < 1e-6) return fallback;
  return dx > 0 ? "right" : "left";
}

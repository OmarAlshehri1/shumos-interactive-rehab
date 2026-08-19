import { StarLane } from "@/lib/spacepilot";

/**
 * CANONICAL LANE-Y MAPPING — the ONE source of vertical lane positions for
 * every lane-based visual in Space Pilot's /display world: the rocket, every
 * encounter type (star/asteroid/alien), the fire projectile, and the faint
 * lane guide lines. Nothing else in this game's display layer may define its
 * own approximate top-offset constant for a lane — always import this map,
 * so the rocket's center and a lane object's center are, by construction,
 * the exact same number and can never drift apart.
 */
export const LANE_Y_PERCENT: Record<StarLane, number> = {
  [StarLane.TOP]: 24,
  [StarLane.MIDDLE]: 50,
  [StarLane.BOTTOM]: 76,
};

/** The rocket's fixed horizontal position (task's "controlled horizontal flight region") — shared across every scene that renders it. */
export const ROCKET_X_PERCENT = 68;

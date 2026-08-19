import { RouteObstacleKind } from "./types";
import { Difficulty } from "@/lib/game";
import type { NormalizedPosition, StageNumber } from "./types";

/**
 * WAYPOINT-DRIVEN ROUTE DESIGN — named identity for each of the 15 real
 * stages, used for documentation/tests/copy validation, never consumed by
 * the generation math directly.
 */
export type JourneyShapeId =
  | "STRAIGHT"
  | "STRAIGHT_THEN_TURN_LEFT"
  | "DIAGONAL"
  | "WIDE_CURVE_C"
  | "SIMPLE_S"
  | "TWO_LEG_LEFT"
  | "CORNER_RIGHT"
  | "LARGE_S"
  | "HORSESHOE_U"
  | "STAR_TOUR"
  | "SOFT_ZIGZAG_Z"
  | "LARGE_C"
  | "LOOP_O"
  | "SNAKE"
  | "GRAND_COSMIC_JOURNEY";

/** One obstacle authored into an ADVANCED JourneyPlan — see lib/footsteps/types.ts's RouteObstacle for the runtime shape this resolves into. */
export interface JourneyObstaclePlan {
  /** 0-1 fraction through the stage's target sequence — the obstacle sits between the target just before this fraction and the one just after (see pathGenerator.ts's resolveObstaclePlacements). */
  afterFraction: number;
  kind: RouteObstacleKind;
}

/**
 * WAYPOINT-DRIVEN ROUTE DESIGN — one real, hand-designed SHAPE per
 * (difficulty, stage), 15 total. `waypoints` is the actual DESIGN of the
 * journey: real "start here -> turn here -> loop around here -> exit here"
 * route points, in the SAME normalized [0,1] floor coordinates pathGenerator
 * uses (x centered ~0.5, y decreasing = further from the child) — NOT an
 * abstract "lean" formula. pathGenerator.ts prepends the true Start Zone
 * departure point, builds one smooth 2D curve straight through these
 * waypoints (centerline.ts), and ONLY THEN uniformly rescales that whole
 * shape (preserving its silhouette exactly) so its real arc length matches
 * this stage's intended total walking distance. The waypoints decide the
 * journey; the spline only smooths it — never the other way around.
 *
 * Waypoints are authored already inside the safe floor corridor (see
 * pathGenerator.ts's X_MIN/X_MAX/TOP_MARGIN) specifically so no aggressive
 * homing/clamping is ever needed to keep a shape on-screen — a big
 * left-right journey is achieved by actually placing waypoints near the
 * left/right walls, not by scaling a small wiggle up until it clips.
 */
export interface JourneyPlan {
  shape: JourneyShapeId;
  /** The route's real design, AFTER the Start Zone departure point (which pathGenerator.ts always prepends) — the last entry is the stage's destination. */
  waypoints: readonly NormalizedPosition[];
  /** Fractions (0-1) through the stage's target sequence where a checkpoint star sits — always a real target's own position, chosen at a meaningful journey landmark (after a turn, mid-loop...), never decorative. Empty for EASY. */
  checkpointFractions: readonly number[];
  /** ADVANCED only — cosmic obstacles placed between two consecutive normal footprints, at meaningful journey landmarks. Undefined for EASY/MEDIUM. */
  obstacles?: readonly JourneyObstaclePlan[];
}

function wp(x: number, y: number): NormalizedPosition {
  return { x, y };
}

/** Mirrors pathGenerator.ts's own Start Zone departure point — the fixed origin every stage's shape is authored around and compressed toward below. */
const ROUTE_START = wp(0.5, 0.77);

/**
 * Scales a stage's REFERENCE-SIZED waypoints (the readable, generously-
 * proportioned coordinates authored below — "swing out to the left wall,"
 * "a broad loop") down toward ROUTE_START by `factor`, preserving the
 * silhouette exactly (see centerline.ts's scaleWaypointsFrom, which this
 * mirrors) so the resulting shape's own real arc length lands close to this
 * stage's actual footprint budget. Without this, pathGenerator.ts's own
 * runtime rescale would have to compress a much-too-large authored shape,
 * which — confirmed numerically — squeezes a bold turn into too little real
 * walking distance and makes it look sharp, exactly what this whole task
 * exists to fix. Tuned per stage from the shape's own measured raw length;
 * see the Route Shape Variety report for the measurements behind each value.
 */
function compress(waypoints: readonly NormalizedPosition[], factor: number): NormalizedPosition[] {
  return waypoints.map((p) => wp(ROUTE_START.x + (p.x - ROUTE_START.x) * factor, ROUTE_START.y + (p.y - ROUTE_START.y) * factor));
}

/** A point on an ellipse centered at `center` — the building block for LOOP_O's genuine loop/O journey (task's "large safe oval," never hand-guessed corner coordinates). angleDeg follows standard math convention (0 = +x/right, 90 = +y/down on our y-grows-toward-the-child screen, so 90 sits BELOW center — i.e. closer to the Start Zone — and 270 sits ABOVE it, i.e. further away), so a sweep from 90 down through 0/-90/-180 traces bottom -> right -> top -> left, exactly like a real walked loop. */
function ellipsePoint(center: NormalizedPosition, rx: number, ry: number, angleDeg: number): NormalizedPosition {
  const rad = (angleDeg * Math.PI) / 180;
  return wp(center.x + rx * Math.cos(rad), center.y + ry * Math.sin(rad));
}

/** A run of waypoints swept around an ellipse from `startAngleDeg` to `endAngleDeg` (may exceed a single 360° turn's worth of degrees for a spiral-like sweep) — LOOP_O's actual "travel around a large oval" journey section. */
function ellipseArc(center: NormalizedPosition, rx: number, ry: number, startAngleDeg: number, endAngleDeg: number, count: number): NormalizedPosition[] {
  const points: NormalizedPosition[] = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    points.push(ellipsePoint(center, rx, ry, startAngleDeg + (endAngleDeg - startAngleDeg) * t));
  }
  return points;
}

export const FOOTSTEPS_JOURNEY_PLANS: Record<Difficulty, readonly [JourneyPlan, JourneyPlan, JourneyPlan, JourneyPlan, JourneyPlan]> = {
  [Difficulty.EASY]: [
    // EASY 1 — STRAIGHT: a simple, short, straight introduction.
    { shape: "STRAIGHT", waypoints: compress([wp(0.5, 0.5), wp(0.5, 0.22)], 0.63), checkpointFractions: [] },
    // EASY 2 — STRAIGHT THEN TURN: walks straight, then an OBVIOUS gentle turn left toward the upper-left.
    {
      shape: "STRAIGHT_THEN_TURN_LEFT",
      waypoints: compress([wp(0.5, 0.6), wp(0.5, 0.46), wp(0.32, 0.3), wp(0.2, 0.17)], 0.57),
      checkpointFractions: [],
    },
    // EASY 3 — DIAGONAL: a clearly diagonal sweep from center toward the upper-right, monotonic (never doubles back toward the left) so the very first leg out of the Start Zone doesn't need a reversal.
    { shape: "DIAGONAL", waypoints: compress([wp(0.46, 0.56), wp(0.58, 0.4), wp(0.7, 0.26), wp(0.8, 0.14)], 0.85), checkpointFractions: [] },
    // EASY 4 — WIDE CURVE (C-shape): swings out to the left wall, hugs it, then curves broadly back toward the upper-center — a real C, not a nearly-straight line.
    {
      shape: "WIDE_CURVE_C",
      waypoints: compress([wp(0.5, 0.62), wp(0.24, 0.5), wp(0.21, 0.32), wp(0.36, 0.18), wp(0.56, 0.13)], 0.68),
      checkpointFractions: [],
    },
    // EASY 5 — SIMPLE S: a visible curve left then a visible curve right, an S silhouette obvious at a glance.
    {
      shape: "SIMPLE_S",
      waypoints: compress([wp(0.5, 0.64), wp(0.25, 0.48), wp(0.5, 0.34), wp(0.75, 0.2), wp(0.56, 0.12)], 0.75),
      checkpointFractions: [],
    },
  ],
  [Difficulty.MEDIUM]: [
    // MEDIUM 1 — TWO-LEG JOURNEY: travels toward the left side, checkpoint, turns, travels back toward upper-center.
    {
      shape: "TWO_LEG_LEFT",
      waypoints: compress([wp(0.4, 0.62), wp(0.22, 0.5), wp(0.2, 0.34), wp(0.34, 0.2), wp(0.52, 0.12)], 0.75),
      checkpointFractions: [0.42],
    },
    // MEDIUM 2 — CORNER JOURNEY: travels to the far safe right, a broad turn, then up toward upper-right/upper-center — mirrors MEDIUM 1 to visibly use the RIGHT side of the floor.
    {
      shape: "CORNER_RIGHT",
      waypoints: compress([wp(0.6, 0.62), wp(0.78, 0.5), wp(0.8, 0.34), wp(0.66, 0.2), wp(0.5, 0.12)], 0.85),
      checkpointFractions: [0.42],
    },
    // MEDIUM 3 — LARGE S: a much bigger S than EASY 5, using nearly the full safe corridor width, checkpoint near the middle crossing.
    {
      shape: "LARGE_S",
      waypoints: compress([wp(0.5, 0.68), wp(0.2, 0.5), wp(0.5, 0.36), wp(0.8, 0.22), wp(0.5, 0.11)], 0.75),
      checkpointFractions: [0.5],
    },
    // MEDIUM 4 — HORSESHOE/U: climbs up one side, a broad rounded arch across the whole upper area, comes back down the opposite side — a real ∩ shape, no sharp corners.
    {
      shape: "HORSESHOE_U",
      waypoints: compress([wp(0.28, 0.58), wp(0.21, 0.36), wp(0.32, 0.17), wp(0.5, 0.12), wp(0.68, 0.17), wp(0.79, 0.36), wp(0.73, 0.55)], 0.7),
      checkpointFractions: [0.55],
    },
    // MEDIUM 5 — STAR TOUR: left region + checkpoint, back through center, right region + checkpoint, final approach — a genuine multi-section tour, not one lean.
    {
      shape: "STAR_TOUR",
      waypoints: compress([wp(0.5, 0.68), wp(0.23, 0.53), wp(0.21, 0.38), wp(0.5, 0.29), wp(0.79, 0.23), wp(0.76, 0.13), wp(0.54, 0.1)], 0.8),
      checkpointFractions: [0.3, 0.68],
    },
  ],
  [Difficulty.ADVANCED]: [
    // ADVANCED 1 — SOFT ZIGZAG (Z): a broad left section, then a smooth sweeping turn across to the right, then up toward the destination — a softened Z, no sharp V corners. One meteor near the crossing.
    {
      shape: "SOFT_ZIGZAG_Z",
      waypoints: compress([wp(0.5, 0.7), wp(0.22, 0.57), wp(0.27, 0.43), wp(0.58, 0.35), wp(0.79, 0.27), wp(0.71, 0.14), wp(0.5, 0.1)], 0.85),
      checkpointFractions: [],
      obstacles: [{ afterFraction: 0.5, kind: RouteObstacleKind.METEOR }],
    },
    // ADVANCED 2 — LARGE C: drifts to the right wall, hugs it going up, then a broad C-curve sweeping left across the top — opens toward the bottom-right. Checkpoint mid-curve, rock obstacle after it.
    {
      shape: "LARGE_C",
      waypoints: compress([wp(0.64, 0.64), wp(0.8, 0.48), wp(0.74, 0.28), wp(0.54, 0.16), wp(0.34, 0.14)], 0.98),
      checkpointFractions: [0.45],
      obstacles: [{ afterFraction: 0.72, kind: RouteObstacleKind.ROCK }],
    },
    // ADVANCED 3 — LOOP / O JOURNEY: a genuine large oval arc (bottom -> right -> top), then exits CONTINUING the loop's own tangent direction (leftward, easing upward) rather than reversing back across itself — a real half-loop silhouette, unmistakably different from every earlier stage, with no sharp reversal at the exit.
    {
      shape: "LOOP_O",
      waypoints: compress([...ellipseArc(wp(0.5, 0.44), 0.3, 0.27, 90, -90, 6), wp(0.32, 0.16), wp(0.24, 0.1)], 0.8),
      checkpointFractions: [0.28, 0.62],
      obstacles: [{ afterFraction: 0.45, kind: RouteObstacleKind.COMET }],
    },
    // ADVANCED 4 — SNAKE: three full lateral sweeps (left, right, left again) across the safe width — a genuinely snake-like route, richer than any S/Z above. Two obstacles at two of its turns.
    {
      shape: "SNAKE",
      waypoints: compress(
        [wp(0.5, 0.72), wp(0.21, 0.6), wp(0.23, 0.46), wp(0.5, 0.4), wp(0.79, 0.34), wp(0.77, 0.22), wp(0.5, 0.16), wp(0.27, 0.1)],
        0.9,
      ),
      checkpointFractions: [0.35],
      obstacles: [
        { afterFraction: 0.25, kind: RouteObstacleKind.METEOR },
        { afterFraction: 0.65, kind: RouteObstacleKind.ROCK },
      ],
    },
    // ADVANCED 5 — GRAND COSMIC JOURNEY (the showcase): far left + checkpoint, a broad curve toward upper-center + obstacle, across to the right + checkpoint, a small arc/loop flourish + second obstacle, then a final approach into the star portal. A real adventure map, not a longer line.
    {
      shape: "GRAND_COSMIC_JOURNEY",
      waypoints: compress(
        [
          wp(0.5, 0.72),
          wp(0.22, 0.59),
          wp(0.18, 0.42), // far left + checkpoint 1 nearby
          wp(0.32, 0.26),
          wp(0.5, 0.19), // broad curve toward upper-center + obstacle 1 nearby
          wp(0.68, 0.25),
          wp(0.81, 0.4), // across to the right + checkpoint 2 nearby
          wp(0.78, 0.56), // small arc/loop flourish — rounds the bottom of a gentle hook
          wp(0.64, 0.62),
          wp(0.52, 0.54), // second obstacle nearby, exiting the flourish
          wp(0.42, 0.2),
          wp(0.44, 0.09), // final approach -> star portal
        ],
        0.8,
      ),
      checkpointFractions: [0.16, 0.42],
      obstacles: [
        { afterFraction: 0.3, kind: RouteObstacleKind.METEOR },
        { afterFraction: 0.66, kind: RouteObstacleKind.COMET },
      ],
    },
  ],
};

export function journeyPlanFor(difficulty: Difficulty, stageNumber: StageNumber): JourneyPlan {
  return FOOTSTEPS_JOURNEY_PLANS[difficulty][stageNumber - 1];
}

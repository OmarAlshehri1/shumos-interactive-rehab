import { buildArcLengthTable, buildWaypointCenterline, sampleAtDistance, type ArcLengthTable } from "./pathCurve";
import { ANIMAL_FOOD_MAP, Animal, Difficulty, Food, type NormalizedPosition, type StageNumber } from "./types";

/**
 * SAFARI ANIMAL ADVENTURE — "control the animal along a hand-designed
 * route" is now the mechanic for EVERY (difficulty, stageNumber): see
 * session.ts's buildStageRuntime, the one place that decides "path" vs the
 * original round-based "animal asks -> child picks food" mechanic
 * (feedGenerator.ts, kept only as a dormant fallback — getFeedAnimalsPathStage
 * below returns non-null for all 15 stages today, so that branch never
 * actually fires, but stays in place rather than being ripped out, per the
 * "minimal compatibility changes" / "keep history readable" guidance).
 *
 * A stage is one or more LEGS played strictly in order (task's "one animal
 * at a time" multi-animal stages — Medium 5, Advanced 4, Advanced 5): each
 * leg is its own hand-authored route for its own animal/food pair, with its
 * own optional obstacles. A single-animal stage is just a one-leg stage.
 */
export type FeedAnimalsObstacleKind = "BRANCH" | "PIT" | "LOG" | "ROCK";

/** ROCK is decorative only (task's "some obstacle may cause the route to curve AROUND it") — the route itself already bends around it, so crossing it never requires JUMP. BRANCH/PIT/LOG genuinely block forward RIGHT movement until JUMP is pressed. */
export function feedAnimalsObstacleRequiresJump(kind: FeedAnimalsObstacleKind): boolean {
  return kind !== "ROCK";
}

export interface FeedAnimalsPathObstacle {
  /** The step index the obstacle sits at — advancing from (atStep - 1) to atStep normally (RIGHT) is blocked for a jump-requiring kind; JUMP performs that same advance instead. */
  atStep: number;
  kind: FeedAnimalsObstacleKind;
}

/** A purely decorative pond/river the route visibly bends around (task's "the route should visibly go AROUND it" / "a visually strong river environment") — never gameplay-gating on its own; a nearby obstacle (LOG) is what actually requires JUMP, if the stage has one. */
export interface FeedAnimalsWaterFeature {
  kind: "POND" | "RIVER";
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface FeedAnimalsPathLeg {
  animal: Animal;
  food: Food;
  /** Hand-authored, normalized [0,1] — "start here -> broad smooth curve -> destination," never a procedurally-generated shape. Kept clear of the reserved control-pad strip at the bottom of the wall (y > ~0.82) and the very top instruction band. */
  waypoints: readonly NormalizedPosition[];
  obstacles: readonly FeedAnimalsPathObstacle[];
  /** Number of LEFT/RIGHT/JUMP presses from this leg's start to its destination. */
  totalSteps: number;
  waterFeature?: FeedAnimalsWaterFeature;
}

export interface FeedAnimalsPathStageDefinition {
  /** Played strictly in order — see FeedAnimalsStageRuntime.legIndex. Length 1 for every single-animal stage. */
  legs: readonly FeedAnimalsPathLeg[];
}

function leg(
  animal: Animal,
  waypoints: readonly NormalizedPosition[],
  obstacles: readonly FeedAnimalsPathObstacle[] = [],
  waterFeature?: FeedAnimalsWaterFeature,
): FeedAnimalsPathLeg {
  return { animal, food: ANIMAL_FOOD_MAP[animal], waypoints, obstacles, totalSteps: waypoints.length - 1, waterFeature };
}

function stage(...legs: readonly FeedAnimalsPathLeg[]): FeedAnimalsPathStageDefinition {
  return { legs };
}

// ==================================================================
// EASY — learn to control the animal. No obstacles, no JUMP control.
// ==================================================================

/** رحلة القرد — one broad, obvious, smooth curve from the lower-left safe region to the upper-right banana tree. APPROVED, unchanged. */
const EASY_1 = stage(
  leg(Animal.MONKEY, [
    { x: 0.13, y: 0.74 },
    { x: 0.27, y: 0.63 },
    { x: 0.41, y: 0.51 },
    { x: 0.55, y: 0.43 },
    { x: 0.69, y: 0.33 },
    { x: 0.8, y: 0.23 },
    { x: 0.86, y: 0.15 },
  ]),
);

/** منعطف الأرنب — a broad hook/turn from the lower-right, sweeping left then curving up, a clearly different silhouette from Stage 1's diagonal. */
const EASY_2 = stage(
  leg(Animal.RABBIT, [
    { x: 0.85, y: 0.76 },
    { x: 0.68, y: 0.7 },
    { x: 0.5, y: 0.68 },
    { x: 0.32, y: 0.6 },
    { x: 0.2, y: 0.46 },
    { x: 0.24, y: 0.3 },
    { x: 0.34, y: 0.18 },
  ]),
);

/** طريق الباندا — a longer gentle S-shaped Safari trail. */
const EASY_3 = stage(
  leg(Animal.PANDA, [
    { x: 0.15, y: 0.76 },
    { x: 0.33, y: 0.68 },
    { x: 0.26, y: 0.52 },
    { x: 0.46, y: 0.44 },
    { x: 0.4, y: 0.3 },
    { x: 0.6, y: 0.22 },
    { x: 0.76, y: 0.16 },
  ]),
);

/** بركة الفيل — curves around a small decorative pond (environment element), teaching that a path can bend around something without it being an obstacle yet. */
const EASY_4 = stage(
  leg(
    Animal.ELEPHANT,
    [
      { x: 0.16, y: 0.76 },
      { x: 0.2, y: 0.58 },
      { x: 0.32, y: 0.46 },
      { x: 0.48, y: 0.4 },
      { x: 0.64, y: 0.42 },
      { x: 0.76, y: 0.52 },
      { x: 0.8, y: 0.34 },
      { x: 0.74, y: 0.18 },
    ],
    [],
    { kind: "POND", cx: 0.48, cy: 0.52, rx: 0.15, ry: 0.11 },
  ),
);

/** رحلة الزرافة — the largest, broadest multi-turn Easy route, the finale of the difficulty. */
const EASY_5 = stage(
  leg(Animal.GIRAFFE, [
    { x: 0.12, y: 0.78 },
    { x: 0.3, y: 0.7 },
    { x: 0.22, y: 0.52 },
    { x: 0.4, y: 0.44 },
    { x: 0.34, y: 0.28 },
    { x: 0.54, y: 0.22 },
    { x: 0.7, y: 0.3 },
    { x: 0.85, y: 0.16 },
  ]),
);

// ==================================================================
// MEDIUM — obstacle adventure. JUMP introduced.
// ==================================================================

/** الغصن الساقط — a route distinct from Easy Monkey's, with one fallen branch across the trail. */
const MEDIUM_1 = stage(
  leg(
    Animal.MONKEY,
    [
      { x: 0.85, y: 0.76 },
      { x: 0.7, y: 0.66 },
      { x: 0.56, y: 0.72 },
      { x: 0.4, y: 0.6 },
      { x: 0.28, y: 0.46 },
      { x: 0.34, y: 0.3 },
      { x: 0.5, y: 0.18 },
    ],
    [{ atStep: 4, kind: "BRANCH" }],
  ),
);

/** حفرة الأرنب — a curved journey with a small safe-looking pit the rabbit must hop over. */
const MEDIUM_2 = stage(
  leg(
    Animal.RABBIT,
    [
      { x: 0.18, y: 0.76 },
      { x: 0.3, y: 0.62 },
      { x: 0.24, y: 0.46 },
      { x: 0.4, y: 0.36 },
      { x: 0.56, y: 0.4 },
      { x: 0.68, y: 0.28 },
      { x: 0.8, y: 0.16 },
    ],
    [{ atStep: 4, kind: "PIT" }],
  ),
);

/** طريق الباندا — a wide route using more horizontal space: a fallen log to jump plus a decorative rock section the trail simply curves around. */
const MEDIUM_3 = stage(
  leg(
    Animal.PANDA,
    [
      { x: 0.12, y: 0.76 },
      { x: 0.28, y: 0.68 },
      { x: 0.46, y: 0.7 },
      { x: 0.6, y: 0.56 },
      { x: 0.5, y: 0.4 },
      { x: 0.64, y: 0.28 },
      { x: 0.8, y: 0.34 },
      { x: 0.88, y: 0.18 },
    ],
    [
      { atStep: 3, kind: "LOG" },
      { atStep: 6, kind: "ROCK" },
    ],
  ),
);

/** حول البركة — a larger pond, the route traveling around it with multiple turns, plus one simple log obstacle near the end. */
const MEDIUM_4 = stage(
  leg(
    Animal.ELEPHANT,
    [
      { x: 0.16, y: 0.76 },
      { x: 0.18, y: 0.6 },
      { x: 0.3, y: 0.48 },
      { x: 0.46, y: 0.42 },
      { x: 0.6, y: 0.48 },
      { x: 0.7, y: 0.38 },
      { x: 0.62, y: 0.24 },
      { x: 0.46, y: 0.18 },
    ],
    [{ atStep: 6, kind: "LOG" }],
    { kind: "POND", cx: 0.42, cy: 0.5, rx: 0.18, ry: 0.13 },
  ),
);

/** رحلة الأصدقاء — a mini Safari mission: the monkey completes one short journey (with a branch to jump), then the rabbit appears for a second, different journey. One animal at a time. */
const MEDIUM_5 = stage(
  leg(
    Animal.MONKEY,
    [
      { x: 0.2, y: 0.76 },
      { x: 0.36, y: 0.64 },
      { x: 0.3, y: 0.48 },
      { x: 0.46, y: 0.36 },
      { x: 0.6, y: 0.24 },
    ],
    [{ atStep: 3, kind: "BRANCH" }],
  ),
  leg(Animal.RABBIT, [
    { x: 0.78, y: 0.76 },
    { x: 0.62, y: 0.66 },
    { x: 0.7, y: 0.5 },
    { x: 0.54, y: 0.4 },
    { x: 0.4, y: 0.24 },
  ]),
);

// ==================================================================
// ADVANCED — real Safari adventure. Longer routes, more turns, more
// decisions, multiple animals. Never faster controls, never bigger
// per-press distances.
// ==================================================================

/** طريق الصخور — a large, smooth zigzag Safari trail: decorative rocks the path curves around, and one fallen branch that genuinely needs a JUMP. */
const ADVANCED_1 = stage(
  leg(
    Animal.PANDA,
    [
      { x: 0.14, y: 0.78 },
      { x: 0.3, y: 0.7 },
      { x: 0.22, y: 0.56 },
      { x: 0.4, y: 0.48 },
      { x: 0.32, y: 0.34 },
      { x: 0.5, y: 0.26 },
      { x: 0.66, y: 0.32 },
      { x: 0.8, y: 0.2 },
    ],
    [
      { atStep: 2, kind: "ROCK" },
      { atStep: 5, kind: "ROCK" },
      { atStep: 6, kind: "BRANCH" },
    ],
  ),
);

/** النهر — a strong river environment; the route follows the river edge to one safe crossing point (a small log bridge) that needs a JUMP, never a confusing disconnected path. */
const ADVANCED_2 = stage(
  leg(
    Animal.ELEPHANT,
    [
      { x: 0.14, y: 0.78 },
      { x: 0.22, y: 0.62 },
      { x: 0.34, y: 0.5 },
      { x: 0.48, y: 0.56 },
      { x: 0.6, y: 0.46 },
      { x: 0.5, y: 0.32 },
      { x: 0.62, y: 0.2 },
      { x: 0.78, y: 0.14 },
    ],
    [{ atStep: 5, kind: "LOG" }],
    { kind: "RIVER", cx: 0.44, cy: 0.5, rx: 0.32, ry: 0.14 },
  ),
);

/** مغامرة الأرنب — a large winding trail with multiple obstacles: a pit, a fallen branch, and a decorative rock — JUMP used only at the two moments that matter. */
const ADVANCED_3 = stage(
  leg(
    Animal.RABBIT,
    [
      { x: 0.85, y: 0.78 },
      { x: 0.7, y: 0.68 },
      { x: 0.78, y: 0.52 },
      { x: 0.62, y: 0.42 },
      { x: 0.7, y: 0.26 },
      { x: 0.54, y: 0.18 },
      { x: 0.38, y: 0.24 },
      { x: 0.24, y: 0.14 },
    ],
    [
      { atStep: 2, kind: "PIT" },
      { atStep: 5, kind: "BRANCH" },
      { atStep: 6, kind: "ROCK" },
    ],
  ),
);

/** فريق السفاري — three animals sequentially, monkey then rabbit then elephant, each a short different journey. Every finished animal joins the visible Safari gathering area. */
const ADVANCED_4 = stage(
  leg(
    Animal.MONKEY,
    [
      { x: 0.18, y: 0.78 },
      { x: 0.32, y: 0.64 },
      { x: 0.24, y: 0.48 },
      { x: 0.4, y: 0.36 },
      { x: 0.52, y: 0.22 },
    ],
    [{ atStep: 3, kind: "BRANCH" }],
  ),
  leg(
    Animal.RABBIT,
    [
      { x: 0.8, y: 0.78 },
      { x: 0.64, y: 0.66 },
      { x: 0.72, y: 0.5 },
      { x: 0.56, y: 0.4 },
      { x: 0.42, y: 0.26 },
    ],
    [{ atStep: 2, kind: "PIT" }],
  ),
  leg(
    Animal.ELEPHANT,
    [
      { x: 0.5, y: 0.8 },
      { x: 0.34, y: 0.68 },
      { x: 0.5, y: 0.54 },
      { x: 0.36, y: 0.4 },
      { x: 0.5, y: 0.24 },
    ],
    [{ atStep: 3, kind: "LOG" }],
  ),
);

/** رحلة السفاري الكبرى — THE SHOWCASE STAGE. All five characters, one at a time, each a short unique journey; by the end all five stand together in the gathering area for the grand finale. */
const ADVANCED_5 = stage(
  leg(
    Animal.MONKEY,
    [
      { x: 0.16, y: 0.8 },
      { x: 0.3, y: 0.66 },
      { x: 0.22, y: 0.5 },
      { x: 0.38, y: 0.38 },
      { x: 0.5, y: 0.22 },
    ],
    [{ atStep: 3, kind: "BRANCH" }],
  ),
  leg(
    Animal.RABBIT,
    [
      { x: 0.84, y: 0.8 },
      { x: 0.68, y: 0.68 },
      { x: 0.76, y: 0.52 },
      { x: 0.6, y: 0.4 },
      { x: 0.46, y: 0.24 },
    ],
    [{ atStep: 2, kind: "PIT" }],
  ),
  leg(
    Animal.PANDA,
    [
      { x: 0.2, y: 0.8 },
      { x: 0.36, y: 0.66 },
      { x: 0.28, y: 0.5 },
      { x: 0.46, y: 0.42 },
      { x: 0.4, y: 0.24 },
    ],
    [{ atStep: 2, kind: "ROCK" }],
  ),
  leg(
    Animal.ELEPHANT,
    [
      { x: 0.8, y: 0.8 },
      { x: 0.64, y: 0.66 },
      { x: 0.72, y: 0.5 },
      { x: 0.56, y: 0.4 },
      { x: 0.42, y: 0.24 },
    ],
    [{ atStep: 3, kind: "LOG" }],
  ),
  leg(Animal.GIRAFFE, [
    { x: 0.16, y: 0.8 },
    { x: 0.34, y: 0.68 },
    { x: 0.24, y: 0.52 },
    { x: 0.44, y: 0.44 },
    { x: 0.36, y: 0.28 },
    { x: 0.52, y: 0.2 },
  ]),
);

const PATH_STAGES: Record<Difficulty, readonly [FeedAnimalsPathStageDefinition, FeedAnimalsPathStageDefinition, FeedAnimalsPathStageDefinition, FeedAnimalsPathStageDefinition, FeedAnimalsPathStageDefinition]> = {
  [Difficulty.EASY]: [EASY_1, EASY_2, EASY_3, EASY_4, EASY_5],
  [Difficulty.MEDIUM]: [MEDIUM_1, MEDIUM_2, MEDIUM_3, MEDIUM_4, MEDIUM_5],
  [Difficulty.ADVANCED]: [ADVANCED_1, ADVANCED_2, ADVANCED_3, ADVANCED_4, ADVANCED_5],
};

/** Kept for the original Stage 1 prototype's own call sites/tests — identical object to PATH_STAGES[EASY][0]. */
export const STAGE_1_EASY_PATH: FeedAnimalsPathStageDefinition = EASY_1;

/** Every (difficulty, stageNumber) is a hand-designed path stage today — see this module's own doc comment for why generateFeedStage/feedGenerator.ts still exists as a dormant fallback rather than being deleted. */
export function getFeedAnimalsPathStage(difficulty: Difficulty, stageNumber: StageNumber): FeedAnimalsPathStageDefinition | null {
  return PATH_STAGES[difficulty]?.[stageNumber - 1] ?? null;
}

export function getFeedAnimalsPathLeg(def: FeedAnimalsPathStageDefinition, legIndex: number): FeedAnimalsPathLeg {
  return def.legs[Math.min(Math.max(legIndex, 0), def.legs.length - 1)];
}

const arcTableCache = new WeakMap<readonly NormalizedPosition[], ArcLengthTable>();

function getArcTable(leg: FeedAnimalsPathLeg): ArcLengthTable {
  const cached = arcTableCache.get(leg.waypoints);
  if (cached) return cached;
  const table = buildArcLengthTable(buildWaypointCenterline(leg.waypoints));
  arcTableCache.set(leg.waypoints, table);
  return table;
}

export interface FeedAnimalsPathSample {
  position: NormalizedPosition;
  /** Direction of travel in degrees at this point (0 = toward smaller y, positive = toward larger x) — same convention as pathCurve.ts's sampleAtDistance. */
  headingDeg: number;
  /** 0..1 fraction of the whole leg traveled. */
  fraction: number;
}

/** Samples the active animal's on-path position/heading/fraction for a progress step in [0, leg.totalSteps] — clamped, so a caller can never sample past either end. */
export function sampleFeedAnimalsPathPosition(leg: FeedAnimalsPathLeg, progressStep: number): FeedAnimalsPathSample {
  const clampedStep = Math.min(Math.max(progressStep, 0), leg.totalSteps);
  const fraction = leg.totalSteps === 0 ? 0 : clampedStep / leg.totalSteps;
  return sampleFeedAnimalsPathFraction(leg, fraction);
}

/**
 * The one canonical visual sampler for both trail rendering and animal
 * movement. Keeping the cached arc table and distance sampling here means
 * no display component can rebuild an approximate copy of the route.
 */
export function sampleFeedAnimalsPathFraction(leg: FeedAnimalsPathLeg, fraction: number): FeedAnimalsPathSample {
  const table = getArcTable(leg);
  const clampedFraction = Math.min(Math.max(fraction, 0), 1);
  const sample = sampleAtDistance(table, table.totalLength * clampedFraction);
  return { position: sample.position, headingDeg: sample.headingDeg, fraction: clampedFraction };
}

/** Backwards-named alias kept for Stage 1's original call sites — identical to sampleFeedAnimalsPathPosition, operating on EASY_1's single leg. */
export function sampleFeedAnimalsMonkeyPosition(def: FeedAnimalsPathStageDefinition, progressStep: number): FeedAnimalsPathSample {
  return sampleFeedAnimalsPathPosition(def.legs[0], progressStep);
}

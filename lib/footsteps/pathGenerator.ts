import { createRng, nextFloat, type Rng, START_ZONE } from "@/lib/game";
import { buildArcLengthTable, buildWaypointCenterline, perpendicularOffset, sampleAtDistance, scaleWaypointsFrom } from "./centerline";
import { getFootstepsStageBlueprint } from "./difficultyRules";
import { journeyPlanFor, type JourneyObstaclePlan, type JourneyPlan } from "./journeyPlans";
import {
  Difficulty,
  Foot,
  type Footprint,
  type FootstepsSessionConfig,
  type NormalizedPosition,
  PathWidth,
  type RouteCheckpoint,
  type RouteObstacle,
  RouteObstacleKind,
  type StageNumber,
  StepLength,
} from "./types";

/**
 * WAYPOINT-DRIVEN ROUTE ARCHITECTURE — a stage's journey SHAPE is entirely
 * decided by its hand-authored JourneyPlan.waypoints (lib/footsteps/
 * journeyPlans.ts) — real "start here -> turn here -> loop around here ->
 * exit here" route design, drawn straight through with one smooth 2D
 * Catmull-Rom curve (centerline.ts). This file's own real (unscaled) arc
 * length decides how many footprints the stage gets — a bigger authored
 * silhouette gets MORE footprints, never bigger gaps — then uniformly
 * rescales that ONE authored shape (preserving its silhouette exactly,
 * never re-inventing it) so its real arc length matches that step count's
 * total walking distance exactly, then walks the curve's REAL arc length to
 * place every footprint/checkpoint/obstacle/destination exactly the
 * intended distance from the last — so every gap is, by construction, the
 * number this file decided, regardless of how the authored shape bends,
 * loops, or zigzags.
 *
 * (An earlier version of this file instead advanced one heading-and-distance
 * STEP at a time, later a single "lateral lean vs. linear-forward-progress"
 * curve — both structurally incapable of a real loop/U-turn, and the first
 * was the root cause of a "footprint -> huge gap -> footprint" bug: it
 * controlled forward distance only, never the real on-screen distance
 * between targets. Full 2D authored waypoints replace both.)
 */

/** Extra breathing room kept between the last footprint's row and the Start Zone's own boundary — mirrors Balloon Quest's START_ZONE_BALLOON_MARGIN. */
const START_ZONE_FOOT_MARGIN = 0.03;
/** The path's own safe horizontal corridor — footprints never render closer to either edge than this. */
const X_MIN = 0.16;
const X_MAX = 0.84;
const X_CENTER = (X_MIN + X_MAX) / 2;
/**
 * The path's own safe VERTICAL corridor — a defense-in-depth backstop, not
 * the primary mechanism (that's sizing stepCount from the un-widened shape's
 * own real length — see generateFootstepsPath's STEP 1). Confirmed
 * necessary numerically: before it existed, an extreme PathWidth+StepLength
 * combination briefly placed a footprint at y = -0.22 (entirely off the top
 * of the screen) while a fix to the root cause was still in progress.
 */
const Y_MIN = 0.05;
const Y_MAX = 0.94;
/** The destination marker reads visually larger than a footprint — keep it a little further from the edges. */
const DESTINATION_MARGIN = 0.06;

/**
 * NORMAL SPACING LIMITS — explicit, named, and tested (see
 * __tests__/pathGenerator.test.ts). Every consecutive NORMAL footprint-to-
 * footprint distance (i.e. not an obstacle transition, which has its own
 * explicit MAX_OBSTACLE_TRANSITION_DISTANCE below) must land inside
 * [MIN_NORMAL_STEP_DISTANCE, MAX_NORMAL_STEP_DISTANCE] — "walking steps, not
 * jumping between islands." IDEAL_NORMAL_STEP_DISTANCE is the aspirational
 * per-segment target the generator reaches for; MIN/MAX are hard bounds a
 * generated stage may never cross.
 */
export const MIN_NORMAL_STEP_DISTANCE = 0.04;
export const IDEAL_NORMAL_STEP_DISTANCE = 0.085;
export const MAX_NORMAL_STEP_DISTANCE = 0.14;
/** A deliberately bigger, but still explicitly bounded, gap — used ONLY for the transition across a cosmic obstacle (task's "even obstacle transitions must have an explicit MAX_OBSTACLE_TRANSITION_DISTANCE"), never for a normal step. */
export const MAX_OBSTACLE_TRANSITION_DISTANCE = 0.2;

/** Difficulty spacing (task: "EASY close... MEDIUM slightly larger... ADVANCED slightly larger again — but even ADVANCED normal footprints must still look walkable"). Applied on top of IDEAL_NORMAL_STEP_DISTANCE, then clamped into the MIN/MAX band above — difficulty can never itself produce an absurd gap. */
const DIFFICULTY_SPACING_MULTIPLIER: Record<Difficulty, number> = {
  [Difficulty.EASY]: 0.82,
  [Difficulty.MEDIUM]: 1.0,
  [Difficulty.ADVANCED]: 1.18,
};

const STEP_LENGTH_MULTIPLIER: Record<StepLength, number> = {
  [StepLength.SHORT]: 0.78,
  [StepLength.MEDIUM]: 1.0,
  [StepLength.LONG]: 1.22,
};

/** Small seeded per-segment variation so consecutive gaps aren't mechanically identical — task's "allow only small natural variation, roughly ±10-15%." */
const SEGMENT_JITTER = 0.08;

/**
 * How far apart the two feet's decorative side-offset sits from the
 * centerline — purely cosmetic alternation, never the route itself (task
 * section 6: "left/right alternation must NOT create the route itself").
 * Deliberately small relative to real step spacing: alternating LEFT/RIGHT
 * by a large offset creates a genuine zigzag ON TOP of the centerline's own
 * shape (confirmed numerically — an earlier, larger offset value added
 * 50-70° of pure alternation "turn" to an otherwise perfectly straight
 * route), which is exactly the kind of artificial sharp-turn look this
 * whole rewrite exists to eliminate.
 */
const FOOT_OFFSET = 0.005;

const PATH_WIDTH_MULTIPLIER: Record<PathWidth, number> = {
  [PathWidth.NARROW]: 0.55,
  [PathWidth.MEDIUM]: 1.0,
  [PathWidth.WIDE]: 1.45,
};

/** How many footprints a stage's own authored shape may add ON TOP OF its difficulty's ramp minimum (lib/footsteps/difficultyRules.ts) — bounds an unusually large silhouette (a full loop, the grand showcase) from ever running away unbounded, while still letting "a bigger journey gets more footprints, not bigger gaps" hold. */
const STEP_COUNT_HEADROOM = 5;

export interface GenerateFootstepsPathParams {
  seed: string;
  difficulty: Difficulty;
  stageNumber: StageNumber;
  config: Pick<FootstepsSessionConfig, "stepLength" | "pathWidth">;
}

export interface GeneratedFootstepsPath {
  stageNumber: StageNumber;
  footprints: Footprint[];
  checkpoints: RouteCheckpoint[];
  obstacles: RouteObstacle[];
  /** نجمة الهدف — the stage's cosmic destination marker, one more arc-length step past the last target, so the route always physically arrives there. Purely decorative; never tappable/confirmable. */
  destination: NormalizedPosition;
  /** Number of confirmable TARGETS. */
  totalSteps: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Which target index(es) `fractions` resolve to, rounded and clamped into the valid target range, de-duplicated, sorted. Shared by checkpoint and (indirectly) obstacle placement. */
function resolveIndices(fractions: readonly number[], stepCount: number, maxIndex: number): number[] {
  const indices = new Set<number>();
  for (const fraction of fractions) {
    const index = clamp(Math.round(fraction * stepCount), 0, maxIndex);
    indices.add(index);
  }
  return [...indices].sort((a, b) => a - b);
}

interface ObstaclePlacement {
  afterTargetIndex: number;
  kind: RouteObstacleKind;
}

/** Resolves each authored obstacle to a real `afterTargetIndex` in [0, stepCount-2] (so a real "safe footprint beyond it" always exists), nudging away from any index a checkpoint already occupies so the two milestones never visually collide. */
function resolveObstaclePlacements(obstaclePlans: readonly JourneyObstaclePlan[], stepCount: number, checkpointIndices: readonly number[]): ObstaclePlacement[] {
  const maxIndex = Math.max(0, stepCount - 2);
  const checkpointSet = new Set(checkpointIndices);
  const used = new Set<number>();
  const placements: ObstaclePlacement[] = [];

  for (const plan of obstaclePlans) {
    let index = clamp(Math.round(plan.afterFraction * stepCount), 0, maxIndex);
    // Nudge forward, then backward, away from any collision — bounded within the valid range.
    let attempts = 0;
    while ((checkpointSet.has(index) || used.has(index)) && attempts < stepCount) {
      index = index + 1 <= maxIndex ? index + 1 : Math.max(0, index - 1);
      attempts++;
    }
    used.add(index);
    placements.push({ afterTargetIndex: index, kind: plan.kind });
  }

  return placements.sort((a, b) => a.afterTargetIndex - b.afterTargetIndex);
}

/** This stage's ideal per-segment arc-length target — the number every normal segment aims for. */
function computeIdealSpacing(difficulty: Difficulty, config: Pick<FootstepsSessionConfig, "stepLength">): number {
  const raw = IDEAL_NORMAL_STEP_DISTANCE * DIFFICULTY_SPACING_MULTIPLIER[difficulty] * STEP_LENGTH_MULTIPLIER[config.stepLength];
  return clamp(raw, MIN_NORMAL_STEP_DISTANCE, MAX_NORMAL_STEP_DISTANCE);
}

/**
 * Generates one stage's footprint path. Pure function of its inputs — the
 * same (seed, difficulty, stageNumber, config) always produces the exact
 * same footprints/checkpoints/obstacles in the exact same positions, which
 * is what keeps /control and /display in canonical agreement and makes
 * "إعادة المرحلة" a genuine retry of the same challenge (see
 * lib/footsteps/session.ts's restartFootstepsStage).
 *
 * ARCHITECTURE (see this file's class doc comment for the full "why"):
 *  1. Build ONE smooth centerline curve (centerline.ts) straight through
 *     this stage's own hand-authored JourneyPlan.waypoints — the real route
 *     DESIGN — and measure its own real (unscaled) arc length. A bigger
 *     authored silhouette gets MORE footprints (bounded by
 *     STEP_COUNT_HEADROOM above the difficulty's own ramp minimum), never
 *     bigger gaps.
 *  2. Compute this stage's intended per-segment arc-length targets from that
 *     step count — ideal spacing for every normal target-to-target segment,
 *     MAX_OBSTACLE_TRANSITION_DISTANCE (capped, never unbounded) for a
 *     segment an obstacle sits inside — with small seeded jitter.
 *  3. Uniformly rescale the ONE authored curve (preserving its silhouette
 *     exactly) so its real arc length matches that total. Because the step
 *     count itself came from this same raw length, the correction stays
 *     small — never a shape-destroying stretch/squash.
 *  4. Walk the curve's REAL arc length, placing a footprint/obstacle/
 *     checkpoint/destination at each intended cumulative distance — so
 *     every gap is exactly the distance this file decided, regardless of
 *     curve shape.
 */
export function generateFootstepsPath({ seed, difficulty, stageNumber, config }: GenerateFootstepsPathParams): GeneratedFootstepsPath {
  const blueprint = getFootstepsStageBlueprint(difficulty, stageNumber);
  const plan: JourneyPlan = journeyPlanFor(difficulty, stageNumber);
  // Stage number is folded into the seed so stage 1/2/3 don't repeat the same layout.
  const stageSeed = `${seed}:footsteps:${difficulty}:${stageNumber}`;
  const rng: Rng = createRng(stageSeed);

  const startY = START_ZONE.yMin - START_ZONE_FOOT_MARGIN;
  const startPoint: NormalizedPosition = { x: X_CENTER, y: startY };
  const idealSpacing = computeIdealSpacing(difficulty, config);

  // STEP 1 — the authored shape's own real size decides how many footprints
  // it needs: task's "a larger journey means MORE footprints / longer route,
  // NOT larger gaps." blueprint.stepCount is a floor (the difficulty's own
  // teaching-progression minimum, e.g. EASY 1 stays a short 4-step intro even
  // though its own waypoints are shorter still) — a stage authored with a
  // genuinely bigger silhouette (a wide C, a full loop, the grand showcase)
  // automatically gets more footprints spread across it, bounded by
  // STEP_COUNT_HEADROOM so an extreme shape still can't run away unbounded.
  //
  // Deliberately measured on the UN-widened shape: PathWidth (a therapist
  // setting) only stretches/narrows how far the route swings left-right —
  // it must never change how MANY footprints a stage has. An earlier version
  // measured this after applying PathWidth, so a NARROW setting could shrink
  // the measured length well below stepCount's floor, forcing the later
  // uniform rescale (STEP 3) to stretch the whole shape — vertically too —
  // to compensate, sending footprints far outside the safe floor (confirmed
  // numerically: ADVANCED 2 at LONG+NARROW placed a footprint at y = -0.22,
  // entirely off the top of the screen).
  const unwidenedRawWaypoints = [startPoint, ...plan.waypoints];
  const unwidenedRawLength = buildArcLengthTable(buildWaypointCenterline(unwidenedRawWaypoints)).totalLength;
  const impliedStepCount = Math.round(unwidenedRawLength / idealSpacing) - 1;
  const stepCount = clamp(impliedStepCount, blueprint.stepCount, blueprint.stepCount + STEP_COUNT_HEADROOM);

  const checkpointIndices = resolveIndices(plan.checkpointFractions, stepCount, stepCount - 1);
  const obstaclePlacements = resolveObstaclePlacements(plan.obstacles ?? [], stepCount, checkpointIndices);
  const obstacleSegments = new Map(obstaclePlacements.map((o) => [o.afterTargetIndex + 1, o]));

  // STEP 2 — intended arc-length per segment (index 0 = startZone->target0, index i = target(i-1)->target(i), index stepCount = target(stepCount-1)->destination).
  const segmentLengths: number[] = [];
  for (let segmentIndex = 0; segmentIndex <= stepCount; segmentIndex++) {
    const jitter = 1 + nextFloat(rng, -SEGMENT_JITTER, SEGMENT_JITTER);
    const obstacle = obstacleSegments.get(segmentIndex);
    const base = obstacle ? Math.min(idealSpacing * 1.5, MAX_OBSTACLE_TRANSITION_DISTANCE) : idealSpacing;
    segmentLengths.push(base * jitter);
  }

  const cumulative: number[] = [0];
  for (const length of segmentLengths) cumulative.push(cumulative[cumulative.length - 1] + length);
  const targetTotalLength = cumulative[cumulative.length - 1];

  // STEP 3 — the authored shape, drawn straight through BEFORE any footprint
  // exists. PathWidth (a therapist setting) stretches/narrows the shape
  // horizontally around the floor's own center HERE, after stepCount was
  // already decided — width changes how wide the route swings, never how
  // many footprints it has. The whole curve is then uniformly rescaled from
  // the Start Zone departure point so its real arc length matches STEP 2's
  // target; because STEP 1 sized stepCount from this same (un-widened) raw
  // length, this scale factor stays close to 1 (a small correction, never a
  // shape-destroying stretch/squash) even after the width adjustment.
  const widthStretchedWaypoints = plan.waypoints.map((point) => ({
    x: X_CENTER + (point.x - X_CENTER) * PATH_WIDTH_MULTIPLIER[config.pathWidth],
    y: point.y,
  }));
  const rawWaypoints = [startPoint, ...widthStretchedWaypoints];
  const rawLength = buildArcLengthTable(buildWaypointCenterline(rawWaypoints)).totalLength;
  const lengthScale = rawLength > 1e-6 ? targetTotalLength / rawLength : 1;
  const scaledWaypoints = scaleWaypointsFrom(rawWaypoints, startPoint, lengthScale);
  const arcTable = buildArcLengthTable(buildWaypointCenterline(scaledWaypoints));

  // STEP 4 — walk the curve's real arc length, placing everything at its intended cumulative distance.
  const footprints: Footprint[] = [];
  const checkpoints: RouteCheckpoint[] = [];
  const obstacles: RouteObstacle[] = [];

  for (let index = 0; index < stepCount; index++) {
    const sample = sampleAtDistance(arcTable, cumulative[index + 1]);
    const centerPoint: NormalizedPosition = { x: clamp(sample.position.x, X_MIN, X_MAX), y: clamp(sample.position.y, Y_MIN, Y_MAX) };

    const foot: Foot = index % 2 === 0 ? Foot.LEFT : Foot.RIGHT;
    const footSideSign: -1 | 1 = foot === Foot.LEFT ? -1 : 1;
    const offset = perpendicularOffset(sample.headingDeg, FOOT_OFFSET, footSideSign);
    const point: NormalizedPosition = {
      x: clamp(centerPoint.x + offset.x, X_MIN, X_MAX),
      y: clamp(centerPoint.y + offset.y, Y_MIN, Y_MAX),
    };

    footprints.push({
      id: `${stageSeed}:target-${index}`,
      index,
      foot,
      position: point,
      rotationDeg: footRotation(rng, sample.headingDeg, footSideSign),
    });

    if (checkpointIndices.includes(index)) {
      checkpoints.push({ id: `${stageSeed}:checkpoint-${index}`, afterTargetIndex: index, position: centerPoint });
    }

    const obstacle = obstacleSegments.get(index + 1);
    if (obstacle) {
      const midDistance = (cumulative[index + 1] + cumulative[index + 2]) / 2;
      const obstacleSample = sampleAtDistance(arcTable, midDistance);
      obstacles.push({
        id: `${stageSeed}:obstacle-${obstacle.afterTargetIndex}`,
        afterTargetIndex: obstacle.afterTargetIndex,
        kind: obstacle.kind,
        position: { x: clamp(obstacleSample.position.x, X_MIN, X_MAX), y: clamp(obstacleSample.position.y, Y_MIN, Y_MAX) },
        rotationDeg: obstacleSample.headingDeg,
      });
    }
  }

  const destinationSample = sampleAtDistance(arcTable, cumulative[stepCount + 1]);
  const destination: NormalizedPosition = {
    x: clamp(destinationSample.position.x, X_MIN + DESTINATION_MARGIN, X_MAX - DESTINATION_MARGIN),
    y: clamp(destinationSample.position.y, Y_MIN, Y_MAX),
  };

  return { stageNumber, footprints, checkpoints, obstacles, destination, totalSteps: stepCount };
}

/** Deterministic decorative rotation: aligned with the curve's real direction of travel at this point, plus a small seeded jitter and a believable toe-out so consecutive footprints don't look mechanically identical. */
function footRotation(rng: Rng, headingDeg: number, footSideSign: number): number {
  const jitter = nextFloat(rng, -6, 6);
  const toeOut = footSideSign * 8;
  return headingDeg + toeOut + jitter;
}

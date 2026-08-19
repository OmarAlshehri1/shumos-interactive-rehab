import { createRng, type Rng, shuffle } from "@/lib/game";
import { BubbleMissionMode, BubbleSpeedTier, getBubbleStagePlan, type BubbleMovementMode, type BubbleStagePlan } from "./stagePlans";
import {
  type Bubble,
  BubbleColor,
  BubbleMoveDirection,
  BubbleShape,
  type BubblePopSessionConfig,
  Difficulty,
  type StageNumber,
  type StationToken,
} from "./types";

export { BUBBLE_COLOR_ORDER } from "./stagePlans";

/**
 * Kept for AudioManager's voice-line prefetch warm-up (every color x shape
 * combination gets cached ahead of time). Not used by generateBubbleField
 * itself — Advanced's real shape palette lives in stagePlans.ts's
 * BUBBLE_SHAPE_STATION_ORDER.
 */
export const BUBBLE_SHAPE_ORDER: readonly BubbleShape[] = [BubbleShape.CIRCLE, BubbleShape.STAR, BubbleShape.HEART, BubbleShape.TRIANGLE, BubbleShape.DIAMOND];

/** Edge-to-edge crossing duration per BubbleSpeedTier (task section 5's "smooth, calm... no frantic speed"). */
const SPEED_TRAVEL_MS: Record<BubbleSpeedTier, number> = {
  [BubbleSpeedTier.VERY_SLOW]: 10000,
  [BubbleSpeedTier.SLOW]: 8000,
  [BubbleSpeedTier.CALM]: 6500,
};

/** Fixed vertical lanes a mission bubble may travel along, normalized 0 (top of the ocean) to 1 (just above the station dock) — task section 5's "2-3 safe vertical bubble lanes." Lane INDEX parity also drives BubbleMovementMode.DUAL_CURRENT's direction (even = upper/RIGHT_TO_LEFT, odd = lower/LEFT_TO_RIGHT). */
const LANE_Y_BY_COUNT: Record<1 | 2 | 3, readonly number[]> = {
  1: [0.34],
  2: [0.22, 0.42],
  3: [0.16, 0.32, 0.48],
};

export interface GenerateBubbleFieldParams {
  seed: string;
  difficulty: Difficulty;
  stageNumber: StageNumber;
  /** Kept for signature stability with the therapist's session config — every stage plan (station colors, movement, lanes, pace) is fully determined by (difficulty, stageNumber) alone (task section 2's "stations stay in a consistent lower/reachable region," never a per-session reach/size knob). */
  config?: Pick<BubblePopSessionConfig, "bubbleSize" | "reachHeight" | "reachSide" | "targetMode">;
}

export interface GeneratedBubbleField {
  stageNumber: StageNumber;
  /** This stage's fixed station color palette, in display order — for a color+shape stage this is the PALETTE candidate tokens are drawn from, not the literal rendered station set (see each Bubble's own `stationTokens`). */
  stations: BubbleColor[];
  /** One mission bubble per entry, in play order — see Bubble's doc comment: exactly one is ever active/visible at a time. */
  bubbles: Bubble[];
  /** bubbles.map(b => b.id), kept as its own field for currentTargetId()'s pointer semantics — see BubblePopStageRuntime's doc comment. */
  targetSequence: string[];
}

/**
 * Generates one stage's mission sequence. Pure function of its inputs — the
 * same (seed, difficulty, stageNumber) always produces the exact same
 * station set, mission colors/shapes, directions, and lanes, which is what
 * keeps /control and /display in canonical agreement and makes "إعادة
 * المرحلة" a genuine retry of the same challenge (task section 17).
 */
export function generateBubbleField({ seed, difficulty, stageNumber }: GenerateBubbleFieldParams): GeneratedBubbleField {
  const plan = getBubbleStagePlan(difficulty, stageNumber);
  const stageSeed = `${seed}:bubblepop:${difficulty}:${stageNumber}`;
  const rng = createRng(stageSeed);

  const missionColors = pickMissionColors(rng, plan.stations, plan.missionCount);
  const lanes = LANE_Y_BY_COUNT[plan.laneCount];
  const travelMs = SPEED_TRAVEL_MS[plan.speed];

  let laneQueue: number[] = [];
  const bubbles: Bubble[] = missionColors.map((color, index) => {
    if (laneQueue.length === 0) laneQueue = shuffle(rng, lanes.map((_, i) => i));
    const laneIndex = laneQueue.shift()!;
    const requiresShape = missionRequiresShape(plan, index);
    const shape = requiresShape ? shuffle(rng, plan.allowedShapes)[0] : BubbleShape.CIRCLE;

    return {
      id: `${stageSeed}:mission-${index}`,
      index,
      color,
      shape,
      lane: lanes[laneIndex],
      direction: resolveDirection(plan.movementMode, index, laneIndex),
      travelMs,
      size: plan.baseSize,
      isPopped: false,
      requiresShape,
      stationTokens: requiresShape ? buildStationTokens(rng, color, shape, plan.stations, plan.allowedShapes, plan.stationCount) : [],
    };
  });

  return { stageNumber, stations: [...plan.stations], bubbles, targetSequence: bubbles.map((b) => b.id) };
}

/** Whether the mission at `missionIndex` needs color+shape matching — every mission when the stage's mode is COLOR_AND_SHAPE, or alternating (starting with plain COLOR) when `mixedMode` (task's Advanced 4/5). */
function missionRequiresShape(plan: BubbleStagePlan, missionIndex: number): boolean {
  if (plan.mixedMode) return missionIndex % 2 === 1;
  return plan.missionMode === BubbleMissionMode.COLOR_AND_SHAPE;
}

function resolveDirection(mode: BubbleMovementMode, missionIndex: number, laneIndex: number): BubbleMoveDirection {
  switch (mode) {
    case "RIGHT_TO_LEFT":
      return BubbleMoveDirection.RIGHT_TO_LEFT;
    case "LEFT_TO_RIGHT":
      return BubbleMoveDirection.LEFT_TO_RIGHT;
    case "DUAL_CURRENT":
      return laneIndex % 2 === 0 ? BubbleMoveDirection.RIGHT_TO_LEFT : BubbleMoveDirection.LEFT_TO_RIGHT;
    case "ALTERNATING":
    default:
      return missionIndex % 2 === 0 ? BubbleMoveDirection.RIGHT_TO_LEFT : BubbleMoveDirection.LEFT_TO_RIGHT;
  }
}

/**
 * Assigns one color per mission from `stations`, cycling through a shuffled
 * "bag" of every station color so every station gets a fair, balanced share
 * of missions (never one color dominating a stage), and swapping within a
 * fresh bag to avoid the SAME color repeating back-to-back across a bag
 * boundary whenever more than one station exists.
 */
function pickMissionColors(rng: Rng, stations: readonly BubbleColor[], missionCount: number): BubbleColor[] {
  const colors: BubbleColor[] = [];
  let bag: BubbleColor[] = [];
  let previous: BubbleColor | null = null;

  for (let i = 0; i < missionCount; i++) {
    if (bag.length === 0) bag = shuffle(rng, stations);
    if (bag[0] === previous && bag.length > 1) {
      [bag[0], bag[1]] = [bag[1], bag[0]];
    }
    const color = bag.shift()!;
    colors.push(color);
    previous = color;
  }

  return colors;
}

/**
 * EXACTLY ONE CORRECT ANSWER BY CONSTRUCTION (task Part G's non-negotiable
 * acceptance criterion) — decoys are drawn ONLY from (color, shape) combos
 * that are NOT the target's own combo, so the target can never accidentally
 * collide with a decoy. Mirrors bubbleGenerator's Phase 1
 * "AMBIGUITY PREVENTION BY CONSTRUCTION" discipline, one level down (per
 * candidate token instead of per field).
 */
function buildStationTokens(
  rng: Rng,
  targetColor: BubbleColor,
  targetShape: BubbleShape,
  colorPalette: readonly BubbleColor[],
  shapePalette: readonly BubbleShape[],
  count: number,
): StationToken[] {
  const allCombos: StationToken[] = [];
  for (const color of colorPalette) {
    for (const shape of shapePalette) {
      if (color === targetColor && shape === targetShape) continue;
      allCombos.push({ color, shape });
    }
  }
  const decoys = shuffle(rng, allCombos).slice(0, Math.max(0, count - 1));
  return shuffle(rng, [...decoys, { color: targetColor, shape: targetShape }]);
}

import { createRng, nextFloat, type Rng, shuffle } from "@/lib/game";
import { getFeedAnimalsStageBlueprint } from "./difficultyRules";
import {
  ANIMAL_FOOD_MAP,
  ANIMAL_ORDER,
  Animal,
  type FeedAnimalsSessionConfig,
  type FeedRound,
  Food,
  FOOD_ORDER,
  FoodSize,
  type NormalizedPosition,
  MovementPattern,
  ReachHeight,
  ReachSide,
  type StageNumber,
} from "./types";

/** Food target never shrinks below this, even under FoodSize.SMALL at max difficulty — stays reachable/tappable from a therapist's iPad and readable from across a room. */
export const MIN_FOOD_SIZE = 0.08;
/** Food target never grows past this, even under FoodSize.LARGE at min difficulty. */
export const MAX_FOOD_SIZE = 0.26;

const FOOD_SIZE_MULTIPLIER: Record<FoodSize, number> = {
  [FoodSize.LARGE]: 1.15,
  [FoodSize.MEDIUM]: 1.0,
  [FoodSize.SMALL]: 0.8,
};

/** Fraction of the wall kept clear at the left/right edges. */
const SAFE_MARGIN_X = 0.08;
/** Kept clear at the very bottom of the wall. */
const BOTTOM_SAFE_MARGIN = 0.06;
/** The animal always occupies the top band of the wall (task section 12's "animal appears" moment) — food choices are always placed BELOW this floor, so a choice can never overlap the animal regardless of ReachHeight (task section 22's "avoid animal overlap"). */
const ANIMAL_ZONE_BOTTOM = 0.34;
const ANIMAL_ZONE_TOP = 0.12;

/** Placement gives up relaxing the gap below this and just uses the best candidate found. */
const GAP_FLOOR = 0.0001;
const GAP_DECAY = 0.8;
const ATTEMPTS_PER_GAP = 30;

interface Bounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

/**
 * WALL-PROJECTION GEOMETRY (task section 6/16/17/22) for FOOD CHOICES only
 * — a vertical composition where ReachHeight controls which vertical band
 * of the wall food lands in and ReachSide controls which horizontal band,
 * always respecting the fixed safe margins AND always staying below the
 * animal's own zone (ANIMAL_ZONE_BOTTOM), regardless of the therapist's
 * choice. Purely a layout control — never claims to measure clinical reach.
 */
function computeFoodBounds(reachHeight: ReachHeight, reachSide: ReachSide): Bounds {
  const fullX = { xMin: SAFE_MARGIN_X, xMax: 1 - SAFE_MARGIN_X };
  const fullY = { yMin: ANIMAL_ZONE_BOTTOM, yMax: 1 - BOTTOM_SAFE_MARGIN };

  const xBand =
    reachSide === ReachSide.LEFT
      ? { xMin: fullX.xMin, xMax: (fullX.xMin + fullX.xMax) / 2 - 0.02 }
      : reachSide === ReachSide.RIGHT
        ? { xMin: (fullX.xMin + fullX.xMax) / 2 + 0.02, xMax: fullX.xMax }
        : fullX;

  const midY = (fullY.yMin + fullY.yMax) / 2;
  const yBand =
    reachHeight === ReachHeight.LOW
      ? { yMin: midY + 0.05, yMax: fullY.yMax }
      : reachHeight === ReachHeight.HIGH
        ? { yMin: fullY.yMin, yMax: midY - 0.05 }
        : reachHeight === ReachHeight.MEDIUM
          ? { yMin: Math.max(fullY.yMin, midY - 0.13), yMax: Math.min(fullY.yMax, midY + 0.13) }
          : fullY;

  return { xMin: xBand.xMin, xMax: xBand.xMax, yMin: yBand.yMin, yMax: yBand.yMax };
}

/** Shrinks bounds toward its own center — MovementPattern.CENTRAL's "food choices remain closer to central safe wall area" (task section 15). */
function narrowTowardCenter(bounds: Bounds, factor: number): Bounds {
  const cx = (bounds.xMin + bounds.xMax) / 2;
  const cy = (bounds.yMin + bounds.yMax) / 2;
  const halfW = ((bounds.xMax - bounds.xMin) * factor) / 2;
  const halfH = ((bounds.yMax - bounds.yMin) * factor) / 2;
  return { xMin: cx - halfW, xMax: cx + halfW, yMin: cy - halfH, yMax: cy + halfH };
}

/** Splits bounds at its own horizontal midpoint into a left half and a right half, each still within the configured ReachSide/ReachHeight envelope — used by MovementPattern.CROSS to keep the "opposite side" placement safely inside whatever zone the therapist already configured (task section 62's "no impossible geometry"). */
function splitHalves(bounds: Bounds): { left: Bounds; right: Bounds } {
  const midX = (bounds.xMin + bounds.xMax) / 2;
  const gap = Math.min(0.015, (bounds.xMax - bounds.xMin) / 4);
  return {
    left: { ...bounds, xMax: Math.max(bounds.xMin, midX - gap) },
    right: { ...bounds, xMin: Math.min(bounds.xMax, midX + gap) },
  };
}

export interface GenerateFeedStageParams {
  seed: string;
  difficulty: import("./types").Difficulty;
  stageNumber: StageNumber;
  config: Pick<FeedAnimalsSessionConfig, "foodSize" | "reachHeight" | "reachSide" | "movementPattern">;
}

export interface GeneratedFeedStage {
  stageNumber: StageNumber;
  rounds: FeedRound[];
}

/**
 * Generates one stage's full round sequence. Pure function of its inputs —
 * the same (seed, difficulty, stageNumber, config) always produces the
 * exact same animals, food choices, and positions, which is what keeps
 * /control and /display in canonical agreement and makes "إعادة المرحلة" a
 * genuine retry of the same challenge (task section 21).
 */
export function generateFeedStage({ seed, difficulty, stageNumber, config }: GenerateFeedStageParams): GeneratedFeedStage {
  const blueprint = getFeedAnimalsStageBlueprint(difficulty, stageNumber);
  const stageSeed = `${seed}:feedanimals:${difficulty}:${stageNumber}`;
  const rng = createRng(stageSeed);

  const foodSize = clamp(blueprint.baseSize * FOOD_SIZE_MULTIPLIER[config.foodSize], MIN_FOOD_SIZE, MAX_FOOD_SIZE);
  const gap = Math.max(0, blueprint.baseSpacing);

  const animalPool = ANIMAL_ORDER.slice(0, blueprint.animalPoolSize);
  const animalSequence = buildAnimalSequence(rng, animalPool, blueprint.roundCount);

  const foodBounds = computeFoodBounds(config.reachHeight, config.reachSide);
  const effectiveFoodBounds = config.movementPattern === MovementPattern.CENTRAL ? narrowTowardCenter(foodBounds, 0.45) : foodBounds;

  const rounds: FeedRound[] = animalSequence.map((animal, roundIndex) => {
    const correctFood = ANIMAL_FOOD_MAP[animal];
    const decoyPool = FOOD_ORDER.filter((food) => food !== correctFood);
    const decoyFoods = shuffle(rng, decoyPool).slice(0, Math.max(0, blueprint.choiceCount - 1));
    const roundFoods = shuffle(rng, [correctFood, ...decoyFoods]);

    const animalPosition = computeAnimalPosition(rng, config.movementPattern);
    const choiceBoundsList = roundFoods.map((food) => {
      if (config.movementPattern !== MovementPattern.CROSS || food !== correctFood) return effectiveFoodBounds;
      // MOVEMENT PATTERN — CROSS (task section 9/15/62): the correct food
      // lands on the OPPOSITE horizontal half from the animal, a controlled
      // cross-body reaching opportunity. Decoys stay in the normal bounds.
      const halves = splitHalves(foodBounds);
      const animalIsLeftOfCenter = animalPosition.x < (foodBounds.xMin + foodBounds.xMax) / 2;
      return animalIsLeftOfCenter ? halves.right : halves.left;
    });

    const positions = placeChoices(rng, choiceBoundsList, foodSize, gap);
    const choices = roundFoods.map((food, i) => ({
      id: `${stageSeed}:round-${roundIndex}:choice-${i}`,
      food,
      position: positions[i],
      size: foodSize,
    }));

    return {
      id: `${stageSeed}:round-${roundIndex}`,
      animal,
      correctFood,
      animalPosition,
      choices,
      fed: false,
    };
  });

  return { stageNumber, rounds };
}

/**
 * Builds a `roundCount`-long animal sequence from `pool`, cycling through
 * shuffled copies of the pool so every animal in it appears roughly evenly
 * (task section 19's "animal variety") without ever needing more distinct
 * animals than the stage's blueprint allows.
 */
function buildAnimalSequence(rng: Rng, pool: readonly Animal[], roundCount: number): Animal[] {
  const sequence: Animal[] = [];
  while (sequence.length < roundCount) {
    sequence.push(...shuffle(rng, pool));
  }
  return sequence.slice(0, roundCount);
}

/** The animal's own wall position for one round — always within its fixed top zone, x varying by MovementPattern (task section 9's example: "animal appears slightly left / food target appears right"). */
function computeAnimalPosition(rng: Rng, movementPattern: MovementPattern): NormalizedPosition {
  const y = nextFloat(rng, ANIMAL_ZONE_TOP, ANIMAL_ZONE_BOTTOM - 0.06);
  if (movementPattern === MovementPattern.CENTRAL) {
    return { x: nextFloat(rng, 0.42, 0.58), y };
  }
  // VARIED and CROSS both let the animal itself roam a bit across the wall
  // width — CROSS specifically needs the animal to sometimes sit left,
  // sometimes right, so the correct food has a genuine "opposite side" to
  // land on each round.
  return { x: nextFloat(rng, SAFE_MARGIN_X + 0.08, 1 - SAFE_MARGIN_X - 0.08), y };
}

/**
 * Places one normalized position per entry in `boundsList` via rejection
 * sampling, each constrained to its own bounds but all sharing one
 * minimum-separation check against every other already-placed choice — same
 * organic-not-gridded approach as lib/bubblepop/bubbleGenerator.ts's
 * placeBubbles, generalized to allow a per-item bounds override (needed for
 * MovementPattern.CROSS's opposite-half constraint on just the correct
 * choice). The required gap relaxes toward 0 if a candidate can't find room
 * within ATTEMPTS_PER_GAP tries, guaranteeing termination.
 */
function placeChoices(rng: Rng, boundsList: readonly Bounds[], size: number, gap: number): NormalizedPosition[] {
  const positions: NormalizedPosition[] = [];

  for (const bounds of boundsList) {
    const xMin = bounds.xMin + size / 2;
    const xMax = Math.max(xMin, bounds.xMax - size / 2);
    const yMin = bounds.yMin + size / 2;
    const yMax = Math.max(yMin, bounds.yMax - size / 2);

    let currentGap = gap;
    let bestCandidate: NormalizedPosition | null = null;
    let bestScore = -Infinity;
    let placed = false;

    while (!placed) {
      for (let attempt = 0; attempt < ATTEMPTS_PER_GAP; attempt++) {
        const candidate: NormalizedPosition = { x: nextFloat(rng, xMin, xMax), y: nextFloat(rng, yMin, yMax) };
        const minDistance = positions.reduce((min, p) => Math.min(min, distance(p, candidate)), Infinity);

        if (minDistance >= size + currentGap) {
          positions.push(candidate);
          placed = true;
          break;
        }
        if (minDistance > bestScore) {
          bestScore = minDistance;
          bestCandidate = candidate;
        }
      }

      if (placed) break;

      if (currentGap <= GAP_FLOOR) {
        positions.push(bestCandidate ?? { x: xMin, y: yMin });
        placed = true;
        break;
      }
      currentGap *= GAP_DECAY;
    }
  }

  return positions;
}

function distance(a: NormalizedPosition, b: NormalizedPosition): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// Re-exported so callers/tests can reference the exact food/animal vocabulary from this module too.
export { ANIMAL_FOOD_MAP, ANIMAL_ORDER, Animal, FOOD_ORDER, Food };

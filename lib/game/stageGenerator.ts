import { BALLOON_COLOR_ORDER, getStageBlueprint } from "./difficultyRules";
import { createRng, nextFloat, pick, shuffle, type Rng } from "./rng";
import { circleOverlapsStartZone } from "./startZone";
import {
  type Balloon,
  BalloonColor,
  type Difficulty,
  type NormalizedPosition,
  PlayArea,
  type SessionConfig,
  type StageNumber,
  TargetSize,
  TargetSpacing,
} from "./types";

/** Fraction of the play area kept clear at every edge, regardless of PlayArea zone. Exported for tests. */
export const SAFE_MARGIN = 0.08;

/** Balloons never shrink below this, even under TargetSize.SMALL at max difficulty. */
export const MIN_BALLOON_SIZE = 0.06;
/** Balloons never grow past this, even under TargetSize.LARGE at min difficulty. */
export const MAX_BALLOON_SIZE = 0.26;

const TARGET_SIZE_MULTIPLIER: Record<TargetSize, number> = {
  [TargetSize.LARGE]: 1.15,
  [TargetSize.MEDIUM]: 1.0,
  [TargetSize.SMALL]: 0.8,
};

const TARGET_SPACING_MULTIPLIER: Record<TargetSpacing, number> = {
  [TargetSpacing.CLOSE]: 0.7,
  [TargetSpacing.MEDIUM]: 1.0,
  [TargetSpacing.WIDE]: 1.4,
};

/** Placement gives up relaxing the gap below this and just uses the best candidate found. */
const GAP_FLOOR = 0.0001;
const GAP_DECAY = 0.8;
const ATTEMPTS_PER_GAP = 30;

export interface GenerateStageParams {
  seed: string;
  difficulty: Difficulty;
  stageNumber: StageNumber;
  config: Pick<SessionConfig, "targetSize" | "targetSpacing" | "playArea">;
}

export interface GeneratedStage {
  stageNumber: StageNumber;
  targetColor: BalloonColor;
  balloons: Balloon[];
  /** Number of balloons that are the target color, i.e. how many must be popped to complete the stage. */
  totalTargets: number;
}

/**
 * Generates one stage. Pure function of its inputs: the same seed,
 * difficulty, stageNumber, and config always produce the same balloons in
 * the same positions, which is what makes stages reproducible for
 * debugging and (later) for keeping /display and /control in sync.
 */
export function generateStage({ seed, difficulty, stageNumber, config }: GenerateStageParams): GeneratedStage {
  const blueprint = getStageBlueprint(difficulty, stageNumber);
  // Stage number is folded into the seed so stage 1/2/3 don't repeat the same layout.
  const stageSeed = `${seed}:${difficulty}:${stageNumber}`;
  const rng = createRng(stageSeed);

  const size = clamp(blueprint.baseSize * TARGET_SIZE_MULTIPLIER[config.targetSize], MIN_BALLOON_SIZE, MAX_BALLOON_SIZE);
  const gap = Math.max(0, blueprint.baseSpacing * TARGET_SPACING_MULTIPLIER[config.targetSpacing]);

  const palette = BALLOON_COLOR_ORDER.slice(0, blueprint.colorCount);
  const targetColor = pick(rng, palette);
  const distractorPalette = palette.filter((color) => color !== targetColor);

  const colors: BalloonColor[] = [];
  for (let i = 0; i < blueprint.targetCount; i++) colors.push(targetColor);
  for (let i = blueprint.targetCount; i < blueprint.totalBalloons; i++) {
    colors.push(pick(rng, distractorPalette));
  }
  const shuffledColors = shuffle(rng, colors);

  const bounds = computeBounds(config.playArea, Math.max(SAFE_MARGIN, size / 2));
  const positions = placeBalloons(rng, shuffledColors.length, size, gap, bounds);

  const balloons: Balloon[] = shuffledColors.map((color, index) => ({
    id: `${stageSeed}:balloon-${index}`,
    color,
    position: positions[index],
    size,
    isTarget: color === targetColor,
    isPopped: false,
  }));

  return {
    stageNumber,
    targetColor,
    balloons,
    totalTargets: blueprint.targetCount,
  };
}

interface Bounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

function computeBounds(playArea: PlayArea, margin: number): Bounds {
  const full: Bounds = { xMin: margin, xMax: 1 - margin, yMin: margin, yMax: 1 - margin };
  switch (playArea) {
    case PlayArea.FULL:
      return full;
    case PlayArea.LEFT:
      return { ...full, xMax: Math.min(full.xMax, 0.5) };
    case PlayArea.RIGHT:
      return { ...full, xMin: Math.max(full.xMin, 0.5) };
    case PlayArea.FRONT:
      // "Front" is the near side of the projected floor, modeled as the lower half of the image.
      return { ...full, yMin: Math.max(full.yMin, 0.5) };
  }
}

/**
 * Places `count` balloon centers via rejection sampling: repeatedly try a
 * random point and accept it once it's far enough from every point already
 * placed AND clear of the Child Start Zone (see startZone.ts — TASK 8.2).
 * Sequential rejection sampling (rather than a grid) is what makes the
 * layout look organic instead of gridded.
 *
 * The required distance relaxes (decays toward 0) if a balloon can't find
 * room at the full gap after ATTEMPTS_PER_GAP tries, which guarantees this
 * terminates even in a dense stage. Because the relaxation floor is 0 extra
 * gap (never negative), the accepted distance from other balloons is never
 * less than `size` itself — i.e. balloons may end up edge-to-edge with each
 * other in the worst case, but never overlapping — and the Start Zone
 * exclusion never relaxes at all: a candidate inside the zone always scores
 * as strictly worse than any candidate outside it (see `score` below), so
 * the eventual fallback still prefers a zone-clear position whenever the
 * play area has any room outside the zone at all — which every PlayArea
 * setting does, the zone occupying a modest fraction of only the near edge.
 */
function placeBalloons(rng: Rng, count: number, size: number, gap: number, bounds: Bounds): NormalizedPosition[] {
  const positions: NormalizedPosition[] = [];
  const xMin = bounds.xMin + size / 2;
  const xMax = Math.max(xMin, bounds.xMax - size / 2);
  const yMin = bounds.yMin + size / 2;
  const yMax = Math.max(yMin, bounds.yMax - size / 2);

  for (let i = 0; i < count; i++) {
    let currentGap = gap;
    let bestCandidate: NormalizedPosition | null = null;
    let bestScore = -Infinity;
    let placed = false;

    while (!placed) {
      for (let attempt = 0; attempt < ATTEMPTS_PER_GAP; attempt++) {
        const candidate: NormalizedPosition = {
          x: nextFloat(rng, xMin, xMax),
          y: nextFloat(rng, yMin, yMax),
        };
        const minDistance = positions.reduce((min, p) => Math.min(min, distance(p, candidate)), Infinity);
        const clearOfStartZone = !circleOverlapsStartZone(candidate, size / 2);

        if (minDistance >= size + currentGap && clearOfStartZone) {
          positions.push(candidate);
          placed = true;
          break;
        }
        // Any candidate overlapping the Start Zone is always worse than any
        // candidate that doesn't, regardless of its distance from other
        // balloons — never let the fallback prefer a zone-violating spot.
        const score = clearOfStartZone ? minDistance : -1;
        if (score > bestScore) {
          bestScore = score;
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

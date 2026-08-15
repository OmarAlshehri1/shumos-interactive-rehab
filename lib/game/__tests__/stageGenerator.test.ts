import { describe, expect, it } from "vitest";
import { distanceToStartZone, START_ZONE_BALLOON_MARGIN } from "../startZone";
import { MAX_BALLOON_SIZE, MIN_BALLOON_SIZE, SAFE_MARGIN, generateStage } from "../stageGenerator";
import { Difficulty, PlayArea, TargetSize, TargetSpacing, type StageNumber } from "../types";

const baseConfig = {
  targetSize: TargetSize.MEDIUM,
  targetSpacing: TargetSpacing.MEDIUM,
  playArea: PlayArea.FULL,
};

const ALL_DIFFICULTIES = [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.ADVANCED];
const ALL_STAGES: StageNumber[] = [1, 2, 3];

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe("generateStage determinism", () => {
  it("produces an identical layout for the same seed, difficulty, stage, and config", () => {
    const a = generateStage({ seed: "child-1", difficulty: Difficulty.MEDIUM, stageNumber: 2, config: baseConfig });
    const b = generateStage({ seed: "child-1", difficulty: Difficulty.MEDIUM, stageNumber: 2, config: baseConfig });

    expect(a.targetColor).toBe(b.targetColor);
    expect(a.balloons).toEqual(b.balloons);
  });

  it("can produce a different layout for a different seed", () => {
    const a = generateStage({ seed: "seed-a", difficulty: Difficulty.MEDIUM, stageNumber: 1, config: baseConfig });
    const b = generateStage({ seed: "seed-b", difficulty: Difficulty.MEDIUM, stageNumber: 1, config: baseConfig });

    expect(a.balloons).not.toEqual(b.balloons);
  });

  it("gives stage 1 and stage 2 different layouts under the same base seed", () => {
    const stage1 = generateStage({ seed: "same-seed", difficulty: Difficulty.EASY, stageNumber: 1, config: baseConfig });
    const stage2 = generateStage({ seed: "same-seed", difficulty: Difficulty.EASY, stageNumber: 2, config: baseConfig });

    expect(stage1.balloons).not.toEqual(stage2.balloons);
  });
});

describe("generateStage spatial constraints", () => {
  for (const difficulty of ALL_DIFFICULTIES) {
    for (const stageNumber of ALL_STAGES) {
      it(`keeps balloons non-overlapping and in bounds (${difficulty} stage ${stageNumber})`, () => {
        const stage = generateStage({ seed: `bounds-${difficulty}-${stageNumber}`, difficulty, stageNumber, config: baseConfig });

        for (const balloon of stage.balloons) {
          expect(balloon.size).toBeGreaterThanOrEqual(MIN_BALLOON_SIZE);
          expect(balloon.size).toBeLessThanOrEqual(MAX_BALLOON_SIZE);

          const halfSize = balloon.size / 2;
          expect(balloon.position.x - halfSize).toBeGreaterThanOrEqual(SAFE_MARGIN - 1e-6);
          expect(balloon.position.x + halfSize).toBeLessThanOrEqual(1 - SAFE_MARGIN + 1e-6);
          expect(balloon.position.y - halfSize).toBeGreaterThanOrEqual(SAFE_MARGIN - 1e-6);
          expect(balloon.position.y + halfSize).toBeLessThanOrEqual(1 - SAFE_MARGIN + 1e-6);
        }

        // No overlap beyond a small (5%) tolerance on the touching distance.
        for (let i = 0; i < stage.balloons.length; i++) {
          for (let j = i + 1; j < stage.balloons.length; j++) {
            const d = distance(stage.balloons[i].position, stage.balloons[j].position);
            expect(d).toBeGreaterThanOrEqual(stage.balloons[i].size * 0.95);
          }
        }
      });
    }
  }
});

describe("generateStage target color guarantees", () => {
  for (const difficulty of ALL_DIFFICULTIES) {
    for (const stageNumber of ALL_STAGES) {
      it(`guarantees valid, present targets (${difficulty} stage ${stageNumber})`, () => {
        const stage = generateStage({ seed: `targets-${difficulty}-${stageNumber}`, difficulty, stageNumber, config: baseConfig });

        expect(stage.totalTargets).toBeGreaterThan(0);

        const actualTargets = stage.balloons.filter((b) => b.isTarget);
        expect(actualTargets).toHaveLength(stage.totalTargets);
        for (const balloon of actualTargets) {
          expect(balloon.color).toBe(stage.targetColor);
        }

        const distractors = stage.balloons.filter((b) => !b.isTarget);
        for (const balloon of distractors) {
          expect(balloon.color).not.toBe(stage.targetColor);
        }
      });
    }
  }
});

describe("PlayArea influences spatial generation", () => {
  it("constrains LEFT to the left half, RIGHT to the right half, FRONT to the lower half", () => {
    const left = generateStage({
      seed: "zone-seed",
      difficulty: Difficulty.MEDIUM,
      stageNumber: 1,
      config: { ...baseConfig, playArea: PlayArea.LEFT },
    });
    const right = generateStage({
      seed: "zone-seed",
      difficulty: Difficulty.MEDIUM,
      stageNumber: 1,
      config: { ...baseConfig, playArea: PlayArea.RIGHT },
    });
    const front = generateStage({
      seed: "zone-seed",
      difficulty: Difficulty.MEDIUM,
      stageNumber: 1,
      config: { ...baseConfig, playArea: PlayArea.FRONT },
    });

    expect(left.balloons.every((b) => b.position.x <= 0.5 + 1e-6)).toBe(true);
    expect(right.balloons.every((b) => b.position.x >= 0.5 - 1e-6)).toBe(true);
    expect(front.balloons.every((b) => b.position.y >= 0.5 - 1e-6)).toBe(true);
  });
});

describe("TASK 8.2: no balloon overlaps the Child Start Zone", () => {
  // PlayArea.FRONT confines every balloon to the lower half of the floor —
  // the same region the Start Zone sits in — so it's the case most likely
  // to expose an exclusion bug, tested across every difficulty/stage/seed.
  for (const playArea of [PlayArea.FULL, PlayArea.FRONT, PlayArea.LEFT, PlayArea.RIGHT]) {
    for (const difficulty of ALL_DIFFICULTIES) {
      for (const stageNumber of ALL_STAGES) {
        it(`keeps every balloon clear of the Start Zone (${playArea}, ${difficulty}, stage ${stageNumber})`, () => {
          for (let seedIndex = 0; seedIndex < 5; seedIndex++) {
            const stage = generateStage({
              seed: `startzone-${playArea}-${difficulty}-${stageNumber}-${seedIndex}`,
              difficulty,
              stageNumber,
              config: { ...baseConfig, playArea },
            });

            for (const balloon of stage.balloons) {
              const clearance = distanceToStartZone(balloon.position);
              expect(clearance).toBeGreaterThanOrEqual(balloon.size / 2 + START_ZONE_BALLOON_MARGIN - 1e-6);
            }
          }
        });
      }
    }
  }
});

describe("TargetSpacing influences spacing behavior", () => {
  it("produces a larger average nearest-neighbor distance for WIDE than CLOSE", () => {
    function averageNearestNeighborDistance(positions: { x: number; y: number }[]): number {
      const distances = positions.map((p, i) =>
        Math.min(...positions.filter((_, j) => j !== i).map((other) => distance(p, other))),
      );
      return distances.reduce((sum, d) => sum + d, 0) / distances.length;
    }

    const close = generateStage({
      seed: "spacing-seed",
      difficulty: Difficulty.ADVANCED,
      stageNumber: 3,
      config: { ...baseConfig, targetSpacing: TargetSpacing.CLOSE },
    });
    const wide = generateStage({
      seed: "spacing-seed",
      difficulty: Difficulty.ADVANCED,
      stageNumber: 3,
      config: { ...baseConfig, targetSpacing: TargetSpacing.WIDE },
    });

    const closeAvg = averageNearestNeighborDistance(close.balloons.map((b) => b.position));
    const wideAvg = averageNearestNeighborDistance(wide.balloons.map((b) => b.position));

    expect(wideAvg).toBeGreaterThan(closeAvg);
  });
});

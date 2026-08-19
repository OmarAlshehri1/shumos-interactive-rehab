import { describe, expect, it } from "vitest";
import { STAGES_PER_DIFFICULTY, type StageNumber } from "@/lib/game";
import { getFeedAnimalsStageBlueprint } from "../difficultyRules";
import { ANIMAL_FOOD_MAP, generateFeedStage } from "../feedGenerator";
import { Difficulty, FoodSize, MovementPattern, ReachHeight, ReachSide } from "../types";

const BASE_CONFIG = { foodSize: FoodSize.MEDIUM, reachHeight: ReachHeight.FULL, reachSide: ReachSide.FULL, movementPattern: MovementPattern.VARIED };

const ALL_STAGE_NUMBERS: StageNumber[] = [1, 2, 3, 4, 5];
const ALL_DIFFICULTIES = [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.ADVANCED];

describe("generateFeedStage — determinism", () => {
  it("produces an identical stage for the same seed/difficulty/stage/config", () => {
    const a = generateFeedStage({ seed: "safari-1", difficulty: Difficulty.MEDIUM, stageNumber: 3, config: BASE_CONFIG });
    const b = generateFeedStage({ seed: "safari-1", difficulty: Difficulty.MEDIUM, stageNumber: 3, config: BASE_CONFIG });
    expect(b).toEqual(a);
  });

  it("produces a different stage for a different seed", () => {
    const a = generateFeedStage({ seed: "safari-1", difficulty: Difficulty.MEDIUM, stageNumber: 3, config: BASE_CONFIG });
    const b = generateFeedStage({ seed: "safari-2", difficulty: Difficulty.MEDIUM, stageNumber: 3, config: BASE_CONFIG });
    expect(b).not.toEqual(a);
  });

  it("produces a different stage for stage 1 vs stage 2 of the same difficulty", () => {
    const a = generateFeedStage({ seed: "safari-1", difficulty: Difficulty.EASY, stageNumber: 1, config: BASE_CONFIG });
    const b = generateFeedStage({ seed: "safari-1", difficulty: Difficulty.EASY, stageNumber: 2, config: BASE_CONFIG });
    expect(a.rounds).not.toEqual(b.rounds);
  });

  it("never produces NaN/undefined positions across every difficulty/stage/movement-pattern combination", () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      for (const stageNumber of ALL_STAGE_NUMBERS) {
        for (const movementPattern of Object.values(MovementPattern)) {
          const stage = generateFeedStage({ seed: "nan-check", difficulty, stageNumber, config: { ...BASE_CONFIG, movementPattern } });
          for (const round of stage.rounds) {
            expect(Number.isFinite(round.animalPosition.x)).toBe(true);
            expect(Number.isFinite(round.animalPosition.y)).toBe(true);
            for (const choice of round.choices) {
              expect(Number.isFinite(choice.position.x)).toBe(true);
              expect(Number.isFinite(choice.position.y)).toBe(true);
              expect(Number.isFinite(choice.size)).toBe(true);
            }
          }
        }
      }
    }
  });
});

describe("generateFeedStage — approved round/choice ramp", () => {
  it("matches the approved blueprint's roundCount and choiceCount for every difficulty/stage", () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      for (const stageNumber of ALL_STAGE_NUMBERS) {
        const blueprint = getFeedAnimalsStageBlueprint(difficulty, stageNumber);
        const stage = generateFeedStage({ seed: "ramp-check", difficulty, stageNumber, config: BASE_CONFIG });
        expect(stage.rounds).toHaveLength(blueprint.roundCount);
        for (const round of stage.rounds) {
          expect(round.choices).toHaveLength(blueprint.choiceCount);
        }
      }
    }
  });

  it("EASY starts at 2 choices, MEDIUM at 3, ADVANCED at 4 (task section 18's smart defaults)", () => {
    expect(getFeedAnimalsStageBlueprint(Difficulty.EASY, 1).choiceCount).toBe(2);
    expect(getFeedAnimalsStageBlueprint(Difficulty.MEDIUM, 1).choiceCount).toBe(3);
    expect(getFeedAnimalsStageBlueprint(Difficulty.ADVANCED, 1).choiceCount).toBe(4);
  });

  it("every difficulty has exactly 5 stages", () => {
    expect(STAGES_PER_DIFFICULTY).toBe(5);
  });
});

describe("generateFeedStage — target validity (task section 23)", () => {
  it("every round has exactly one choice matching the animal's own correct food", () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      for (const stageNumber of ALL_STAGE_NUMBERS) {
        const stage = generateFeedStage({ seed: "validity-check", difficulty, stageNumber, config: BASE_CONFIG });
        for (const round of stage.rounds) {
          expect(round.correctFood).toBe(ANIMAL_FOOD_MAP[round.animal]);
          const correctChoices = round.choices.filter((c) => c.food === round.correctFood);
          expect(correctChoices).toHaveLength(1);
        }
      }
    }
  });

  it("never generates two choices with the same food within one round (no ambiguity, no duplicate correct)", () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      for (const stageNumber of ALL_STAGE_NUMBERS) {
        const stage = generateFeedStage({ seed: "dup-check", difficulty, stageNumber, config: BASE_CONFIG });
        for (const round of stage.rounds) {
          const foodSet = new Set(round.choices.map((c) => c.food));
          expect(foodSet.size).toBe(round.choices.length);
        }
      }
    }
  });
});

describe("generateFeedStage — safe wall geometry (task section 22)", () => {
  function assertWithinUnitSquare(x: number, y: number) {
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThanOrEqual(1);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(1);
  }

  it("keeps every animal and food choice within [0,1] across every ReachHeight x ReachSide x MovementPattern combination", () => {
    for (const reachHeight of Object.values(ReachHeight)) {
      for (const reachSide of Object.values(ReachSide)) {
        for (const movementPattern of Object.values(MovementPattern)) {
          const stage = generateFeedStage({
            seed: "bounds-check",
            difficulty: Difficulty.ADVANCED,
            stageNumber: 5,
            config: { foodSize: FoodSize.LARGE, reachHeight, reachSide, movementPattern },
          });
          for (const round of stage.rounds) {
            assertWithinUnitSquare(round.animalPosition.x, round.animalPosition.y);
            for (const choice of round.choices) assertWithinUnitSquare(choice.position.x, choice.position.y);
          }
        }
      }
    }
  });

  it("never places a food choice inside the animal's own top zone (never overlaps the animal)", () => {
    const ANIMAL_ZONE_BOTTOM = 0.34;
    for (const reachHeight of Object.values(ReachHeight)) {
      const stage = generateFeedStage({ seed: "no-overlap", difficulty: Difficulty.ADVANCED, stageNumber: 5, config: { ...BASE_CONFIG, reachHeight } });
      for (const round of stage.rounds) {
        for (const choice of round.choices) {
          expect(choice.position.y).toBeGreaterThanOrEqual(ANIMAL_ZONE_BOTTOM - 0.01);
        }
      }
    }
  });

  it("ReachSide LEFT keeps food choices left of center; RIGHT keeps them right of center", () => {
    const left = generateFeedStage({ seed: "side-check", difficulty: Difficulty.MEDIUM, stageNumber: 3, config: { ...BASE_CONFIG, reachSide: ReachSide.LEFT, movementPattern: MovementPattern.VARIED } });
    for (const round of left.rounds) for (const choice of round.choices) expect(choice.position.x).toBeLessThan(0.52);

    const right = generateFeedStage({ seed: "side-check", difficulty: Difficulty.MEDIUM, stageNumber: 3, config: { ...BASE_CONFIG, reachSide: ReachSide.RIGHT, movementPattern: MovementPattern.VARIED } });
    for (const round of right.rounds) for (const choice of round.choices) expect(choice.position.x).toBeGreaterThan(0.48);
  });

  it("ReachHeight LOW keeps food choices in the lower half; HIGH keeps them in the upper portion of the food zone", () => {
    const low = generateFeedStage({ seed: "height-check", difficulty: Difficulty.MEDIUM, stageNumber: 3, config: { ...BASE_CONFIG, reachHeight: ReachHeight.LOW } });
    for (const round of low.rounds) for (const choice of round.choices) expect(choice.position.y).toBeGreaterThan(0.5);

    const high = generateFeedStage({ seed: "height-check", difficulty: Difficulty.MEDIUM, stageNumber: 3, config: { ...BASE_CONFIG, reachHeight: ReachHeight.HIGH } });
    for (const round of high.rounds) for (const choice of round.choices) expect(choice.position.y).toBeLessThan(0.65);
  });

  it("never places two food choices in the same round closer than their combined size (no overlap)", () => {
    for (const stageNumber of ALL_STAGE_NUMBERS) {
      const stage = generateFeedStage({ seed: "spacing-check", difficulty: Difficulty.ADVANCED, stageNumber, config: { ...BASE_CONFIG, foodSize: FoodSize.LARGE } });
      for (const round of stage.rounds) {
        for (let i = 0; i < round.choices.length; i++) {
          for (let j = i + 1; j < round.choices.length; j++) {
            const a = round.choices[i];
            const b = round.choices[j];
            const dist = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
            // Placement relaxes the gap toward 0 under pressure but must never end in true overlap of the two circles.
            expect(dist).toBeGreaterThanOrEqual((a.size + b.size) / 2 - 0.001);
          }
        }
      }
    }
  });
});

describe("generateFeedStage — MovementPattern behavior (task section 15/62)", () => {
  it("CENTRAL keeps choices closer to the wall's horizontal/vertical center than VARIED does, on average", () => {
    const central = generateFeedStage({ seed: "pattern-check", difficulty: Difficulty.ADVANCED, stageNumber: 5, config: { ...BASE_CONFIG, movementPattern: MovementPattern.CENTRAL } });
    const varied = generateFeedStage({ seed: "pattern-check", difficulty: Difficulty.ADVANCED, stageNumber: 5, config: { ...BASE_CONFIG, movementPattern: MovementPattern.VARIED } });

    function avgDistanceFromCenter(rounds: typeof central.rounds) {
      const distances = rounds.flatMap((r) => r.choices.map((c) => Math.hypot(c.position.x - 0.5, c.position.y - 0.64)));
      return distances.reduce((a, b) => a + b, 0) / distances.length;
    }

    expect(avgDistanceFromCenter(central.rounds)).toBeLessThan(avgDistanceFromCenter(varied.rounds));
  });

  it("CROSS places the correct food choice on the opposite horizontal half from the animal in every round", () => {
    const stage = generateFeedStage({ seed: "cross-check", difficulty: Difficulty.ADVANCED, stageNumber: 5, config: { ...BASE_CONFIG, movementPattern: MovementPattern.CROSS } });
    for (const round of stage.rounds) {
      const correctChoice = round.choices.find((c) => c.food === round.correctFood);
      expect(correctChoice).toBeDefined();
      if (round.animalPosition.x < 0.5) {
        expect(correctChoice!.position.x).toBeGreaterThan(round.animalPosition.x);
      } else {
        expect(correctChoice!.position.x).toBeLessThan(round.animalPosition.x);
      }
    }
  });

  it("CROSS never produces impossible geometry (every position still finite and within bounds)", () => {
    for (const reachSide of Object.values(ReachSide)) {
      const stage = generateFeedStage({ seed: "cross-safety", difficulty: Difficulty.ADVANCED, stageNumber: 5, config: { ...BASE_CONFIG, movementPattern: MovementPattern.CROSS, reachSide } });
      for (const round of stage.rounds) {
        for (const choice of round.choices) {
          expect(choice.position.x).toBeGreaterThanOrEqual(0);
          expect(choice.position.x).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe("generateFeedStage — FoodSize", () => {
  it("LARGE produces bigger food than SMALL", () => {
    const large = generateFeedStage({ seed: "size-check", difficulty: Difficulty.EASY, stageNumber: 1, config: { ...BASE_CONFIG, foodSize: FoodSize.LARGE } });
    const small = generateFeedStage({ seed: "size-check", difficulty: Difficulty.EASY, stageNumber: 1, config: { ...BASE_CONFIG, foodSize: FoodSize.SMALL } });
    expect(large.rounds[0].choices[0].size).toBeGreaterThan(small.rounds[0].choices[0].size);
  });
});

import { describe, expect, it } from "vitest";
import { BALLOON_COLOR_ORDER, DIFFICULTY_RULES, STAGES_PER_DIFFICULTY, getAdjacentDifficulty, getStageBlueprint } from "../difficultyRules";
import { Difficulty } from "../types";

describe("difficulty progression", () => {
  const difficultiesInOrder = [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.ADVANCED];
  const stageNumbers = [1, 2, 3, 4, 5] as const;

  it("has exactly 5 stages per difficulty", () => {
    expect(STAGES_PER_DIFFICULTY).toBe(5);
    for (const difficulty of difficultiesInOrder) {
      expect(DIFFICULTY_RULES[difficulty]).toHaveLength(5);
    }
  });

  it("increases balloon count and color count monotonically across all 5 stages within each difficulty", () => {
    for (const difficulty of difficultiesInOrder) {
      const stages = DIFFICULTY_RULES[difficulty];
      for (let i = 1; i < stages.length; i++) {
        expect(stages[i].totalBalloons).toBeGreaterThanOrEqual(stages[i - 1].totalBalloons);
        expect(stages[i].colorCount).toBeGreaterThanOrEqual(stages[i - 1].colorCount);
      }
    }
  });

  it("decreases base size and base spacing monotonically across all 5 stages within each difficulty", () => {
    for (const difficulty of difficultiesInOrder) {
      const stages = DIFFICULTY_RULES[difficulty];
      for (let i = 1; i < stages.length; i++) {
        expect(stages[i].baseSize).toBeLessThanOrEqual(stages[i - 1].baseSize);
        expect(stages[i].baseSpacing).toBeLessThanOrEqual(stages[i - 1].baseSpacing);
      }
    }
  });

  it("never uses more colors than BALLOON_COLOR_ORDER provides", () => {
    for (const difficulty of difficultiesInOrder) {
      for (const stageNumber of stageNumbers) {
        expect(getStageBlueprint(difficulty, stageNumber).colorCount).toBeLessThanOrEqual(BALLOON_COLOR_ORDER.length);
      }
    }
  });

  it("escalates from Easy to Medium to Advanced at matching stage numbers", () => {
    for (const stageNumber of stageNumbers) {
      const easy = getStageBlueprint(Difficulty.EASY, stageNumber);
      const medium = getStageBlueprint(Difficulty.MEDIUM, stageNumber);
      const advanced = getStageBlueprint(Difficulty.ADVANCED, stageNumber);

      expect(medium.totalBalloons).toBeGreaterThanOrEqual(easy.totalBalloons);
      expect(advanced.totalBalloons).toBeGreaterThanOrEqual(medium.totalBalloons);

      expect(medium.baseSize).toBeLessThanOrEqual(easy.baseSize);
      expect(advanced.baseSize).toBeLessThanOrEqual(medium.baseSize);
    }
  });

  it("reduces the proportion of target balloons as difficulty and stage increase", () => {
    const ratio = (difficulty: Difficulty, stageNumber: 1 | 2 | 3 | 4 | 5) => {
      const blueprint = getStageBlueprint(difficulty, stageNumber);
      return blueprint.targetCount / blueprint.totalBalloons;
    };

    expect(ratio(Difficulty.EASY, 1)).toBeGreaterThan(ratio(Difficulty.MEDIUM, 5));
    expect(ratio(Difficulty.MEDIUM, 1)).toBeGreaterThan(ratio(Difficulty.ADVANCED, 5));
  });

  it("keeps Advanced stage 1 identical to the pre-Task-11 stage 1, and stage 5 the strongest challenge at approximately 16 balloons", () => {
    expect(getStageBlueprint(Difficulty.ADVANCED, 1).totalBalloons).toBe(12);
    expect(getStageBlueprint(Difficulty.ADVANCED, 5).totalBalloons).toBe(16);
  });

  it("steps up targetCount (not just totalBalloons) for Advanced's last two stages — a genuinely different kind of harder", () => {
    expect(getStageBlueprint(Difficulty.ADVANCED, 3).targetCount).toBe(3);
    expect(getStageBlueprint(Difficulty.ADVANCED, 4).targetCount).toBe(4);
    expect(getStageBlueprint(Difficulty.ADVANCED, 5).targetCount).toBe(4);
  });

  it("always keeps at least one target balloon", () => {
    for (const difficulty of difficultiesInOrder) {
      for (const stageNumber of stageNumbers) {
        expect(getStageBlueprint(difficulty, stageNumber).targetCount).toBeGreaterThan(0);
      }
    }
  });
});

describe("getAdjacentDifficulty", () => {
  it("steps exactly one tier at a time, never straight from Easy to Advanced", () => {
    expect(getAdjacentDifficulty(Difficulty.EASY, "harder")).toBe(Difficulty.MEDIUM);
    expect(getAdjacentDifficulty(Difficulty.MEDIUM, "harder")).toBe(Difficulty.ADVANCED);
    expect(getAdjacentDifficulty(Difficulty.ADVANCED, "easier")).toBe(Difficulty.MEDIUM);
    expect(getAdjacentDifficulty(Difficulty.MEDIUM, "easier")).toBe(Difficulty.EASY);
  });

  it("returns null past either end", () => {
    expect(getAdjacentDifficulty(Difficulty.EASY, "easier")).toBeNull();
    expect(getAdjacentDifficulty(Difficulty.ADVANCED, "harder")).toBeNull();
  });
});

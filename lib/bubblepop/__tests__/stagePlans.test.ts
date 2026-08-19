import { describe, expect, it } from "vitest";
import { generateBubbleField } from "../bubbleGenerator";
import { BUBBLE_POP_EASY_STAGE_PLANS, getBubbleStagePlan, getEasyBubbleStagePlan } from "../stagePlans";
import { Difficulty, type StageNumber } from "../types";

const ALL_STAGES: StageNumber[] = [1, 2, 3, 4, 5];

describe("BUBBLE_POP_EASY_STAGE_PLANS — single source of truth (task section 14)", () => {
  it("has all 5 Easy stages, each with 2 or 3 stations and at least one mission", () => {
    for (const stageNumber of ALL_STAGES) {
      const plan = getEasyBubbleStagePlan(stageNumber);
      expect(plan.stageNumber).toBe(stageNumber);
      expect([2, 3]).toContain(plan.stations.length);
      expect(plan.missionCount).toBeGreaterThan(0);
      expect(plan.titleAr.length).toBeGreaterThan(0);
    }
  });

  it("getBubbleStagePlan(EASY, n) resolves to the exact same object as BUBBLE_POP_EASY_STAGE_PLANS[n]", () => {
    for (const stageNumber of ALL_STAGES) {
      expect(getBubbleStagePlan(Difficulty.EASY, stageNumber)).toBe(BUBBLE_POP_EASY_STAGE_PLANS[stageNumber]);
    }
  });

  it("drives generateBubbleField directly — the generator never invents its own station/mission counts", () => {
    for (const stageNumber of ALL_STAGES) {
      const plan = getEasyBubbleStagePlan(stageNumber);
      const field = generateBubbleField({ seed: "sot-seed", difficulty: Difficulty.EASY, stageNumber });
      expect(field.stations).toEqual([...plan.stations]);
      expect(field.bubbles).toHaveLength(plan.missionCount);
    }
  });

  it("Easy 1 introduces the mechanic: 2 stations, no decorations at all", () => {
    const plan = getEasyBubbleStagePlan(1);
    expect(plan.stations).toEqual(["BLUE", "YELLOW"]);
    expect(plan.features).toEqual({ fish: false, turtle: false, treasure: false });
  });

  it("Easy 2 onward always includes the Pink station", () => {
    for (const stageNumber of [2, 3, 4, 5] as StageNumber[]) {
      expect(getEasyBubbleStagePlan(stageNumber).stations).toContain("PINK");
    }
  });

  it("stage progression never decreases mission count", () => {
    for (let i = 2; i <= 5; i++) {
      const previous = getEasyBubbleStagePlan((i - 1) as StageNumber);
      const current = getEasyBubbleStagePlan(i as StageNumber);
      expect(current.missionCount).toBeGreaterThanOrEqual(previous.missionCount);
    }
  });
});

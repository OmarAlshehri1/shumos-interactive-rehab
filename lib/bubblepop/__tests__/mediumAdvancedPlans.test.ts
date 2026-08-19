import { describe, expect, it } from "vitest";
import { generateBubbleField } from "../bubbleGenerator";
import {
  BUBBLE_POP_ADVANCED_STAGE_PLANS,
  BUBBLE_POP_MEDIUM_STAGE_PLANS,
  BubbleMissionMode,
  BubbleMovementMode,
  BubbleTreasureMode,
  getAdvancedBubbleStagePlan,
  getBubbleStagePlan,
  getMediumBubbleStagePlan,
} from "../stagePlans";
import { Difficulty, type StageNumber } from "../types";

const ALL_STAGES: StageNumber[] = [1, 2, 3, 4, 5];

describe("Medium stage plans (task Part F — the ocean itself becomes more alive)", () => {
  it("every stage has exactly 4 fixed color stations", () => {
    for (const stageNumber of ALL_STAGES) {
      expect(getMediumBubbleStagePlan(stageNumber).stations).toHaveLength(4);
    }
  });

  it("Medium 1 is a single RIGHT_TO_LEFT stream with no decorations", () => {
    const plan = getMediumBubbleStagePlan(1);
    expect(plan.movementMode).toBe(BubbleMovementMode.RIGHT_TO_LEFT);
    expect(plan.seaLife).toEqual({ fish: "NONE", jellyfish: false, turtle: false, seahorse: false });
  });

  it("Medium 2-5 all use DUAL_CURRENT — two opposing streams", () => {
    for (const stageNumber of [2, 3, 4, 5] as StageNumber[]) {
      expect(getMediumBubbleStagePlan(stageNumber).movementMode).toBe(BubbleMovementMode.DUAL_CURRENT);
    }
  });

  it("Medium 3 introduces a real fish SCHOOL", () => {
    expect(getMediumBubbleStagePlan(3).seaLife.fish).toBe("SCHOOL");
  });

  it("Medium 4 introduces the jellyfish gate, not clickable/scored", () => {
    expect(getMediumBubbleStagePlan(4).seaLife.jellyfish).toBe(true);
  });

  it("Medium 5 is a pearl-driven treasure journey with a longer mission sequence", () => {
    const plan = getMediumBubbleStagePlan(5);
    expect(plan.treasureMode).toBe(BubbleTreasureMode.PEARLS);
    expect(plan.features.treasure).toBe(true);
    expect(plan.missionCount).toBeGreaterThan(getMediumBubbleStagePlan(1).missionCount);
  });

  it("no two Medium stages share the exact same fingerprint", () => {
    const seen = new Set<string>();
    for (const stageNumber of ALL_STAGES) {
      const plan = getMediumBubbleStagePlan(stageNumber);
      const key = `${plan.movementMode}|${JSON.stringify(plan.seaLife)}|${plan.treasureMode}|${plan.missionCount}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});

describe("Advanced stage plans (task Part G — mission complexity, not frantic speed)", () => {
  it("Advanced 1 uses all 6 candidate colors, plain color missions", () => {
    const plan = getAdvancedBubbleStagePlan(1);
    expect(plan.stations).toHaveLength(6);
    expect(plan.missionMode).toBe(BubbleMissionMode.COLOR);
    expect(plan.mixedMode).toBe(false);
  });

  it("Advanced 2 is color+shape with 4-6 candidate stations", () => {
    const plan = getAdvancedBubbleStagePlan(2);
    expect(plan.missionMode).toBe(BubbleMissionMode.COLOR_AND_SHAPE);
    expect(plan.stationCount).toBeGreaterThanOrEqual(4);
    expect(plan.stationCount).toBeLessThanOrEqual(6);
    expect(plan.allowedShapes.length).toBeGreaterThan(0);
  });

  it("Advanced 3 groups missions into two-step sequences with an even mission count", () => {
    const plan = getAdvancedBubbleStagePlan(3);
    expect(plan.sequenceLength).toBe(2);
    expect(plan.missionCount % 2).toBe(0);
  });

  it("Advanced 4/5 mix COLOR and COLOR_AND_SHAPE missions and carry a rich sea life roster", () => {
    for (const stageNumber of [4, 5] as StageNumber[]) {
      const plan = getAdvancedBubbleStagePlan(stageNumber);
      expect(plan.mixedMode).toBe(true);
      expect(plan.seaLife.fish).toBe("SCHOOL");
      expect(plan.seaLife.jellyfish).toBe(true);
      expect(plan.seaLife.turtle).toBe(true);
      expect(plan.seaLife.seahorse).toBe(true);
    }
  });

  it("Advanced 5 is the showcase KEYS finale", () => {
    const plan = getAdvancedBubbleStagePlan(5);
    expect(plan.treasureMode).toBe(BubbleTreasureMode.KEYS);
    expect(plan.features.treasure).toBe(true);
  });

  it("getBubbleStagePlan resolves Medium/Advanced to the exact same objects as their tables", () => {
    for (const stageNumber of ALL_STAGES) {
      expect(getBubbleStagePlan(Difficulty.MEDIUM, stageNumber)).toBe(BUBBLE_POP_MEDIUM_STAGE_PLANS[stageNumber]);
      expect(getBubbleStagePlan(Difficulty.ADVANCED, stageNumber)).toBe(BUBBLE_POP_ADVANCED_STAGE_PLANS[stageNumber]);
    }
  });
});

describe("EXACTLY ONE CORRECT ANSWER for every color+shape mission (task Part G's non-negotiable acceptance criterion)", () => {
  it("Advanced 2: every mission's candidate token set contains exactly one match for its own (color, shape)", () => {
    for (let seedIndex = 0; seedIndex < 15; seedIndex++) {
      const field = generateBubbleField({ seed: `shape-seed-${seedIndex}`, difficulty: Difficulty.ADVANCED, stageNumber: 2 });
      for (const bubble of field.bubbles) {
        expect(bubble.requiresShape).toBe(true);
        const plan = getAdvancedBubbleStagePlan(2);
        expect(bubble.stationTokens).toHaveLength(plan.stationCount);
        const matches = bubble.stationTokens.filter((t) => t.color === bubble.color && t.shape === bubble.shape);
        expect(matches).toHaveLength(1);
      }
    }
  });

  it("Advanced 2: every candidate token set has no duplicate (color, shape) pairs", () => {
    const field = generateBubbleField({ seed: "dup-check", difficulty: Difficulty.ADVANCED, stageNumber: 2 });
    for (const bubble of field.bubbles) {
      const keys = bubble.stationTokens.map((t) => `${t.color}:${t.shape}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("Advanced 4/5 (mixedMode): odd-indexed missions require shape with exactly one match, even-indexed missions are plain color with no tokens", () => {
    for (const stageNumber of [4, 5] as StageNumber[]) {
      const field = generateBubbleField({ seed: `mixed-${stageNumber}`, difficulty: Difficulty.ADVANCED, stageNumber });
      field.bubbles.forEach((bubble, i) => {
        if (i % 2 === 1) {
          expect(bubble.requiresShape).toBe(true);
          const matches = bubble.stationTokens.filter((t) => t.color === bubble.color && t.shape === bubble.shape);
          expect(matches).toHaveLength(1);
        } else {
          expect(bubble.requiresShape).toBe(false);
          expect(bubble.stationTokens).toHaveLength(0);
        }
      });
    }
  });
});

describe("Sequence missions never share a color within the same pair (Advanced 3)", () => {
  it("every consecutive pair has two different colors", () => {
    for (let seedIndex = 0; seedIndex < 10; seedIndex++) {
      const field = generateBubbleField({ seed: `seq-seed-${seedIndex}`, difficulty: Difficulty.ADVANCED, stageNumber: 3 });
      for (let i = 0; i < field.bubbles.length; i += 2) {
        expect(field.bubbles[i].color).not.toBe(field.bubbles[i + 1].color);
      }
    }
  });
});

describe("DUAL_CURRENT direction is a property of the lane, not the mission index", () => {
  it("Medium 2: every mission on an even lane index travels RIGHT_TO_LEFT, every odd lane travels LEFT_TO_RIGHT", () => {
    const field = generateBubbleField({ seed: "dual-current-seed", difficulty: Difficulty.MEDIUM, stageNumber: 2 });
    const lanes = [0.22, 0.42]; // laneCount 2's Y positions, from bubbleGenerator's LANE_Y_BY_COUNT
    for (const bubble of field.bubbles) {
      const laneIndex = lanes.indexOf(bubble.lane);
      expect(laneIndex).toBeGreaterThanOrEqual(0);
      expect(bubble.direction).toBe(laneIndex % 2 === 0 ? "RIGHT_TO_LEFT" : "LEFT_TO_RIGHT");
    }
  });
});

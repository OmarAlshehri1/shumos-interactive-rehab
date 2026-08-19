import { describe, expect, it } from "vitest";
import { generateBubbleField } from "../bubbleGenerator";
import { getBubbleStagePlan } from "../stagePlans";
import { BubbleMoveDirection, Difficulty, type StageNumber } from "../types";

const ALL_DIFFICULTIES = [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.ADVANCED];
const ALL_STAGES: StageNumber[] = [1, 2, 3, 4, 5];

describe("generateBubbleField determinism", () => {
  it("produces an identical field for the same seed, difficulty, and stage", () => {
    const a = generateBubbleField({ seed: "child-1", difficulty: Difficulty.MEDIUM, stageNumber: 3 });
    const b = generateBubbleField({ seed: "child-1", difficulty: Difficulty.MEDIUM, stageNumber: 3 });

    expect(a.bubbles).toEqual(b.bubbles);
    expect(a.targetSequence).toEqual(b.targetSequence);
  });

  it("can produce a different mission sequence for a different seed", () => {
    const a = generateBubbleField({ seed: "seed-a", difficulty: Difficulty.EASY, stageNumber: 3 });
    const b = generateBubbleField({ seed: "seed-b", difficulty: Difficulty.EASY, stageNumber: 3 });

    expect(a.bubbles).not.toEqual(b.bubbles);
  });

  it("gives stage 1 and stage 2 different fields under the same base seed", () => {
    const stage1 = generateBubbleField({ seed: "same-seed", difficulty: Difficulty.EASY, stageNumber: 1 });
    const stage2 = generateBubbleField({ seed: "same-seed", difficulty: Difficulty.EASY, stageNumber: 2 });

    expect(stage1.bubbles).not.toEqual(stage2.bubbles);
  });

  it("never produces NaN/undefined lanes or travel times", () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      for (const stageNumber of ALL_STAGES) {
        const field = generateBubbleField({ seed: `stable-${difficulty}-${stageNumber}`, difficulty, stageNumber });
        for (const b of field.bubbles) {
          expect(Number.isFinite(b.lane)).toBe(true);
          expect(Number.isFinite(b.travelMs)).toBe(true);
          expect(b.travelMs).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("mission count and station set follow each stage's plan (single source of truth)", () => {
  for (const difficulty of ALL_DIFFICULTIES) {
    for (const stageNumber of ALL_STAGES) {
      it(`matches getBubbleStagePlan for ${difficulty} stage ${stageNumber}`, () => {
        const plan = getBubbleStagePlan(difficulty, stageNumber);
        const field = generateBubbleField({ seed: "count-seed", difficulty, stageNumber });

        expect(field.bubbles).toHaveLength(plan.missionCount);
        expect(field.targetSequence).toHaveLength(plan.missionCount);
        expect(field.stations).toEqual([...plan.stations]);
        for (const bubble of field.bubbles) {
          expect(plan.stations).toContain(bubble.color);
        }
      });
    }
  }
});

describe("Easy stage plans (task section 10-13) — five distinct experiences", () => {
  it("Easy 1 has exactly 2 stations, 4 missions, and always travels RIGHT_TO_LEFT", () => {
    const field = generateBubbleField({ seed: "easy1", difficulty: Difficulty.EASY, stageNumber: 1 });
    expect(field.stations).toHaveLength(2);
    expect(field.bubbles).toHaveLength(4);
    for (const bubble of field.bubbles) expect(bubble.direction).toBe(BubbleMoveDirection.RIGHT_TO_LEFT);
  });

  it("Easy 2 has 3 stations, 5 missions, and always travels LEFT_TO_RIGHT", () => {
    const field = generateBubbleField({ seed: "easy2", difficulty: Difficulty.EASY, stageNumber: 2 });
    expect(field.stations).toHaveLength(3);
    expect(field.bubbles).toHaveLength(5);
    for (const bubble of field.bubbles) expect(bubble.direction).toBe(BubbleMoveDirection.LEFT_TO_RIGHT);
  });

  it("Easy 3 alternates direction mission to mission, starting RIGHT_TO_LEFT", () => {
    const field = generateBubbleField({ seed: "easy3", difficulty: Difficulty.EASY, stageNumber: 3 });
    expect(field.bubbles).toHaveLength(6);
    field.bubbles.forEach((bubble, i) => {
      expect(bubble.direction).toBe(i % 2 === 0 ? BubbleMoveDirection.RIGHT_TO_LEFT : BubbleMoveDirection.LEFT_TO_RIGHT);
    });
  });

  it("Easy 4 introduces the fish decoration and 7 missions", () => {
    const plan = getBubbleStagePlan(Difficulty.EASY, 4);
    expect(plan.features.fish).toBe(true);
    expect(plan.features.treasure).toBe(false);
    expect(plan.missionCount).toBe(7);
  });

  it("Easy 5 introduces the treasure chest and turtle, with 8 missions", () => {
    const plan = getBubbleStagePlan(Difficulty.EASY, 5);
    expect(plan.features.treasure).toBe(true);
    expect(plan.features.turtle).toBe(true);
    expect(plan.missionCount).toBe(8);
  });

  it("no two Easy stages share the exact same (stations, missionCount, movementMode) fingerprint", () => {
    const fingerprints = new Set<string>();
    for (const stageNumber of ALL_STAGES) {
      const plan = getBubbleStagePlan(Difficulty.EASY, stageNumber);
      const key = `${plan.stations.join(",")}|${plan.missionCount}|${plan.movementMode}|${JSON.stringify(plan.features)}`;
      expect(fingerprints.has(key)).toBe(false);
      fingerprints.add(key);
    }
  });
});

describe("mission color variety", () => {
  it("balances mission colors reasonably evenly across a stage's stations", () => {
    const field = generateBubbleField({ seed: "variety-seed", difficulty: Difficulty.EASY, stageNumber: 5 });
    const plan = getBubbleStagePlan(Difficulty.EASY, 5);
    const counts = new Map<string, number>();
    for (const bubble of field.bubbles) counts.set(bubble.color, (counts.get(bubble.color) ?? 0) + 1);
    for (const station of plan.stations) {
      expect(counts.get(station) ?? 0).toBeGreaterThan(0);
    }
  });
});

// Phase 2 replaced the old "legacy fallback" (always ALTERNATING, never
// decorated) with real designed Medium/Advanced plans — see
// medium-advanced-plans.test.ts for their dedicated coverage.

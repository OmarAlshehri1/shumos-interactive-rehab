import { describe, expect, it } from "vitest";
import { BUBBLE_POP_DIFFICULTY_RULES, Difficulty, generateBubbleField, getBubbleStagePlan, STAGES_PER_DIFFICULTY, type StageNumber } from "@/lib/bubblepop";
import { BUBBLE_POP_STAGE_PREVIEW_SEED, getBubblePopStagePreset } from "../stagePreset";
import { BUBBLE_POP_STAGE_COPY } from "../stageCopy";

const ALL_DIFFICULTIES = [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.ADVANCED];
const ALL_STAGES: StageNumber[] = [1, 2, 3, 4, 5];

describe("getBubblePopStagePreset — single source of truth", () => {
  for (const difficulty of ALL_DIFFICULTIES) {
    for (const stageNumber of ALL_STAGES) {
      it(`produces a valid, engine-matching preset for ${difficulty} stage ${stageNumber}`, () => {
        const preset = getBubblePopStagePreset(difficulty, stageNumber);

        expect(preset.config.difficulty).toBe(difficulty);
        expect(preset.config.startingStage).toBe(stageNumber);
        expect(preset.blueprint).toBe(BUBBLE_POP_DIFFICULTY_RULES[difficulty][stageNumber - 1]);
        // Phase 1 redesign: one mission bubble per mission (no decoys) — the
        // real field size is the stage PLAN's missionCount (lib/bubblepop/stagePlans.ts),
        // not the legacy difficultyRules blueprint's bubbleCount.
        expect(preset.stage.bubbles).toHaveLength(getBubbleStagePlan(difficulty, stageNumber).missionCount);

        // The exact same call the engine itself makes (lib/bubblepop/session.ts's
        // createBubblePopSession/enterBubblePopStage) must reproduce this
        // preset's field byte-for-byte — proves the preview and the actual
        // session can never drift apart.
        const direct = generateBubbleField({ seed: BUBBLE_POP_STAGE_PREVIEW_SEED, difficulty, stageNumber, config: preset.config });
        expect(preset.stage).toEqual(direct);
      });
    }
  }

  it("is deterministic across repeated calls (fixed preview seed)", () => {
    const a = getBubblePopStagePreset(Difficulty.MEDIUM, 3);
    const b = getBubblePopStagePreset(Difficulty.MEDIUM, 3);
    expect(a.stage).toEqual(b.stage);
  });
});

describe("BUBBLE_POP_STAGE_COPY — matches the approved difficulty ramp", () => {
  for (const difficulty of ALL_DIFFICULTIES) {
    it(`has all ${STAGES_PER_DIFFICULTY} stages for ${difficulty}, each with exactly 3 characteristics`, () => {
      expect(BUBBLE_POP_STAGE_COPY[difficulty]).toHaveLength(STAGES_PER_DIFFICULTY);
      for (const entry of BUBBLE_POP_STAGE_COPY[difficulty]) {
        expect(entry.title.length).toBeGreaterThan(0);
        expect(entry.description.length).toBeGreaterThan(0);
        expect(entry.characteristics).toHaveLength(3);
      }
    });

    it(`${difficulty}'s blueprint bubbleCount never decreases and baseSize strictly decreases across stages 1-5 (what the copy's progression describes)`, () => {
      const blueprints = BUBBLE_POP_DIFFICULTY_RULES[difficulty];
      for (let i = 1; i < blueprints.length; i++) {
        expect(blueprints[i].bubbleCount).toBeGreaterThanOrEqual(blueprints[i - 1].bubbleCount);
        expect(blueprints[i].baseSize).toBeLessThanOrEqual(blueprints[i - 1].baseSize);
      }
    });
  }
});

import { describe, expect, it } from "vitest";
import { Difficulty, FEED_ANIMALS_DIFFICULTY_RULES, generateFeedStage, STAGES_PER_DIFFICULTY, type StageNumber } from "@/lib/feedanimals";
import { getFeedAnimalsStagePreset, FEED_ANIMALS_STAGE_PREVIEW_SEED } from "../stagePreset";
import { FEED_ANIMALS_STAGE_COPY } from "../stageCopy";

const ALL_DIFFICULTIES = [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.ADVANCED];
const ALL_STAGES: StageNumber[] = [1, 2, 3, 4, 5];

describe("getFeedAnimalsStagePreset — single source of truth", () => {
  for (const difficulty of ALL_DIFFICULTIES) {
    for (const stageNumber of ALL_STAGES) {
      it(`produces a valid, engine-matching preset for ${difficulty} stage ${stageNumber}`, () => {
        const preset = getFeedAnimalsStagePreset(difficulty, stageNumber);

        expect(preset.config.difficulty).toBe(difficulty);
        expect(preset.config.startingStage).toBe(stageNumber);
        expect(preset.blueprint).toBe(FEED_ANIMALS_DIFFICULTY_RULES[difficulty][stageNumber - 1]);
        expect(preset.stage.rounds).toHaveLength(preset.blueprint.roundCount);
        for (const round of preset.stage.rounds) {
          expect(round.choices).toHaveLength(preset.blueprint.choiceCount);
        }

        // The exact same call the engine itself makes
        // (lib/feedanimals/session.ts's createFeedAnimalsSession/
        // enterFeedAnimalsStage) must reproduce this preset's stage
        // byte-for-byte — proves the preview and the actual session can
        // never drift apart.
        const direct = generateFeedStage({ seed: FEED_ANIMALS_STAGE_PREVIEW_SEED, difficulty, stageNumber, config: preset.config });
        expect(preset.stage).toEqual(direct);
      });
    }
  }

  it("is deterministic across repeated calls (fixed preview seed)", () => {
    const a = getFeedAnimalsStagePreset(Difficulty.MEDIUM, 3);
    const b = getFeedAnimalsStagePreset(Difficulty.MEDIUM, 3);
    expect(a.stage).toEqual(b.stage);
  });
});

describe("FEED_ANIMALS_STAGE_COPY — matches the approved difficulty ramp", () => {
  for (const difficulty of ALL_DIFFICULTIES) {
    it(`has all ${STAGES_PER_DIFFICULTY} stages for ${difficulty}, each with exactly 3 characteristics`, () => {
      expect(FEED_ANIMALS_STAGE_COPY[difficulty]).toHaveLength(STAGES_PER_DIFFICULTY);
      for (const entry of FEED_ANIMALS_STAGE_COPY[difficulty]) {
        expect(entry.title.length).toBeGreaterThan(0);
        expect(entry.description.length).toBeGreaterThan(0);
        expect(entry.characteristics).toHaveLength(3);
      }
    });

    it(`${difficulty}'s blueprint roundCount/choiceCount/animalPoolSize never decrease and baseSize never increases across stages 1-5 (what the copy's progression describes)`, () => {
      const blueprints = FEED_ANIMALS_DIFFICULTY_RULES[difficulty];
      for (let i = 1; i < blueprints.length; i++) {
        expect(blueprints[i].roundCount).toBeGreaterThanOrEqual(blueprints[i - 1].roundCount);
        expect(blueprints[i].choiceCount).toBeGreaterThanOrEqual(blueprints[i - 1].choiceCount);
        expect(blueprints[i].animalPoolSize).toBeGreaterThanOrEqual(blueprints[i - 1].animalPoolSize);
        expect(blueprints[i].baseSize).toBeLessThanOrEqual(blueprints[i - 1].baseSize);
      }
    });
  }
});

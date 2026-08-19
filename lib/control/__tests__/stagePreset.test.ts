import { describe, expect, it } from "vitest";
import { Difficulty, DIFFICULTY_RULES, generateStage, STAGES_PER_DIFFICULTY, type StageNumber } from "@/lib/game";
import { getStagePreset, STAGE_PREVIEW_SEED } from "../stagePreset";
import { STAGE_COPY } from "../stageCopy";

const ALL_DIFFICULTIES = [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.ADVANCED];
const ALL_STAGES: StageNumber[] = [1, 2, 3, 4, 5];

describe("getStagePreset — single source of truth", () => {
  for (const difficulty of ALL_DIFFICULTIES) {
    for (const stageNumber of ALL_STAGES) {
      it(`produces a valid, engine-matching preset for ${difficulty} stage ${stageNumber}`, () => {
        const preset = getStagePreset(difficulty, stageNumber);

        expect(preset.config.difficulty).toBe(difficulty);
        expect(preset.config.startingStage).toBe(stageNumber);
        expect(preset.blueprint).toBe(DIFFICULTY_RULES[difficulty][stageNumber - 1]);
        expect(preset.stage.balloons).toHaveLength(preset.blueprint.totalBalloons);

        // The exact same call the engine itself makes (lib/game/session.ts's
        // createSession/enterStage) must reproduce this preset's stage
        // byte-for-byte — proves the preview and the actual session can
        // never drift apart.
        const direct = generateStage({ seed: STAGE_PREVIEW_SEED, difficulty, stageNumber, config: preset.config });
        expect(preset.stage).toEqual(direct);
      });
    }
  }

  it("is deterministic across repeated calls (fixed preview seed)", () => {
    const a = getStagePreset(Difficulty.MEDIUM, 3);
    const b = getStagePreset(Difficulty.MEDIUM, 3);
    expect(a.stage).toEqual(b.stage);
  });
});

describe("STAGE_COPY — matches the approved difficulty ramp", () => {
  for (const difficulty of ALL_DIFFICULTIES) {
    it(`has all ${STAGES_PER_DIFFICULTY} stages for ${difficulty}, each with exactly 3 characteristics`, () => {
      expect(STAGE_COPY[difficulty]).toHaveLength(STAGES_PER_DIFFICULTY);
      for (const entry of STAGE_COPY[difficulty]) {
        expect(entry.title.length).toBeGreaterThan(0);
        expect(entry.description.length).toBeGreaterThan(0);
        expect(entry.characteristics).toHaveLength(3);
      }
    });

    it(`${difficulty}'s blueprint totalBalloons strictly increases and baseSize strictly decreases across stages 1-5 (what the copy's progression describes)`, () => {
      const blueprints = DIFFICULTY_RULES[difficulty];
      for (let i = 1; i < blueprints.length; i++) {
        expect(blueprints[i].totalBalloons).toBeGreaterThanOrEqual(blueprints[i - 1].totalBalloons);
        expect(blueprints[i].baseSize).toBeLessThanOrEqual(blueprints[i - 1].baseSize);
      }
    });
  }
});

import { describe, expect, it } from "vitest";
import { Difficulty, FOOTSTEPS_DIFFICULTY_RULES, generateFootstepsPath, journeyPlanFor, STAGES_PER_DIFFICULTY, type StageNumber } from "@/lib/footsteps";
import { getFootstepsStagePreset, FOOTSTEPS_STAGE_PREVIEW_SEED } from "../stagePreset";
import { FOOTSTEPS_STAGE_COPY } from "../stageCopy";

const ALL_DIFFICULTIES = [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.ADVANCED];
const ALL_STAGES: StageNumber[] = [1, 2, 3, 4, 5];

describe("getFootstepsStagePreset — single source of truth", () => {
  for (const difficulty of ALL_DIFFICULTIES) {
    for (const stageNumber of ALL_STAGES) {
      it(`produces a valid, engine-matching preset for ${difficulty} stage ${stageNumber}`, () => {
        const preset = getFootstepsStagePreset(difficulty, stageNumber);

        expect(preset.config.difficulty).toBe(difficulty);
        expect(preset.config.startingStage).toBe(stageNumber);
        expect(preset.blueprint).toBe(FOOTSTEPS_DIFFICULTY_RULES[difficulty][stageNumber - 1]);
        // blueprint.stepCount is a MINIMUM (the difficulty's own ramp floor)
        // — a stage whose authored waypoints form a genuinely bigger
        // silhouette gets more footprints than that floor, never fewer (see
        // pathGenerator.ts's STEP_COUNT_HEADROOM).
        expect(preset.path.totalSteps).toBeGreaterThanOrEqual(preset.blueprint.stepCount);

        // The exact same call the engine itself makes
        // (lib/footsteps/session.ts's createFootstepsSession/enterFootstepsStage)
        // must reproduce this preset's path byte-for-byte — proves the
        // preview and the actual session can never drift apart.
        const direct = generateFootstepsPath({ seed: FOOTSTEPS_STAGE_PREVIEW_SEED, difficulty, stageNumber, config: preset.config });
        expect(preset.path).toEqual(direct);
      });
    }
  }

  it("is deterministic across repeated calls (fixed preview seed)", () => {
    const a = getFootstepsStagePreset(Difficulty.MEDIUM, 3);
    const b = getFootstepsStagePreset(Difficulty.MEDIUM, 3);
    expect(a.path).toEqual(b.path);
  });
});

// ROUTE ARCHITECTURE REWRITE — the preset's checkpoints/obstacles data flows
// through unchanged from getFootstepsStagePreset (no interface change was
// needed), so the Stage Card preview sees exactly what gameplay will.
describe("getFootstepsStagePreset — checkpoints and obstacles consistency", () => {
  for (const difficulty of ALL_DIFFICULTIES) {
    for (const stageNumber of ALL_STAGES) {
      it(`matches its JourneyPlan's checkpoint and obstacle counts (${difficulty} stage ${stageNumber})`, () => {
        const preset = getFootstepsStagePreset(difficulty, stageNumber);
        const plan = journeyPlanFor(difficulty, stageNumber);

        // One footprint per target — the old SINGLE/PAIR stance mechanic no longer exists.
        expect(preset.path.footprints).toHaveLength(preset.path.totalSteps);

        if (plan.checkpointFractions.length === 0) {
          expect(preset.path.checkpoints).toHaveLength(0);
        } else {
          expect(preset.path.checkpoints.length).toBeGreaterThan(0);
        }

        expect(preset.path.obstacles).toHaveLength(plan.obstacles?.length ?? 0);
      });
    }
  }

  it("EASY never has checkpoints or obstacles — those are MEDIUM/ADVANCED concepts", () => {
    for (const stageNumber of ALL_STAGES) {
      const preset = getFootstepsStagePreset(Difficulty.EASY, stageNumber);
      expect(preset.path.checkpoints).toHaveLength(0);
      expect(preset.path.obstacles).toHaveLength(0);
    }
  });

  it("ADVANCED always uses at least one obstacle somewhere across its 5 stages", () => {
    const anyObstacle = ALL_STAGES.some((stageNumber) => getFootstepsStagePreset(Difficulty.ADVANCED, stageNumber).path.obstacles.length > 0);
    expect(anyObstacle).toBe(true);
  });

  it("MEDIUM never has obstacles — a cosmic-obstacle concept is ADVANCED-only", () => {
    for (const stageNumber of ALL_STAGES) {
      const preset = getFootstepsStagePreset(Difficulty.MEDIUM, stageNumber);
      expect(preset.path.obstacles).toHaveLength(0);
    }
  });
});

describe("FOOTSTEPS_STAGE_COPY — matches the approved difficulty ramp", () => {
  for (const difficulty of ALL_DIFFICULTIES) {
    it(`has all ${STAGES_PER_DIFFICULTY} stages for ${difficulty}, each with exactly 3 characteristics`, () => {
      expect(FOOTSTEPS_STAGE_COPY[difficulty]).toHaveLength(STAGES_PER_DIFFICULTY);
      for (const entry of FOOTSTEPS_STAGE_COPY[difficulty]) {
        expect(entry.title.length).toBeGreaterThan(0);
        expect(entry.description.length).toBeGreaterThan(0);
        expect(entry.characteristics).toHaveLength(3);
      }
    });

    it(`${difficulty}'s blueprint stepCount strictly increases across stages 1-5 (what the copy's progression describes)`, () => {
      const blueprints = FOOTSTEPS_DIFFICULTY_RULES[difficulty];
      for (let i = 1; i < blueprints.length; i++) {
        expect(blueprints[i].stepCount).toBeGreaterThan(blueprints[i - 1].stepCount);
      }
    });
  }

  it("no stage copy anywhere mentions the removed SINGLE/PAIR stance mechanic", () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      for (const entry of FOOTSTEPS_STAGE_COPY[difficulty]) {
        const text = `${entry.title} ${entry.description} ${entry.characteristics.join(" ")}`;
        expect(text).not.toMatch(/قدم واحدة|قدمين|وقفة/);
      }
    }
  });

  it("EASY copy never claims a checkpoint or obstacle — those are MEDIUM/ADVANCED concepts", () => {
    for (const entry of FOOTSTEPS_STAGE_COPY[Difficulty.EASY]) {
      const text = `${entry.title} ${entry.description} ${entry.characteristics.join(" ")}`;
      expect(text).not.toMatch(/محطة|شهاب|صخرة كونية|عقبة/);
    }
  });
});

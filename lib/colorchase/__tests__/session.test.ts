import { describe, expect, it } from "vitest";
import {
  allColorChaseStagePlans,
  applyColorChaseTransition,
  confirmColorChasePad,
  createColorChaseSession,
  Difficulty,
  GameState,
  PAD_IDS,
  pauseColorChaseSession,
  jumpToColorChaseStage,
  restartColorChaseStage,
  resumeColorChaseSession,
  switchColorChaseDifficulty,
} from "../index";

function playing(difficulty = Difficulty.EASY, startingStage: 1 | 2 | 3 | 4 | 5 = 1) {
  let state = createColorChaseSession({ childFirstName: "سارة", difficulty, startingStage, seed: "fixed", now: 1000 });
  for (const next of [GameState.SETUP, GameState.START_ZONE, GameState.INSTRUCTIONS, GameState.COUNTDOWN, GameState.PLAYING]) {
    const result = applyColorChaseTransition(state, next, 1000);
    if (!result.success) throw new Error(result.reason);
    state = result.state;
  }
  return state;
}

describe("Color Chase canonical stage plans", () => {
  it("defines all 15 deterministic stage plans with valid PAD_1..PAD_9 inputs", () => {
    const plans = allColorChaseStagePlans();
    expect(plans).toHaveLength(15);
    for (const plan of plans) {
      expect(plan.steps.length).toBeGreaterThanOrEqual(2);
      for (const step of plan.steps) {
        expect(PAD_IDS).toContain(step.correctPadId);
        expect(new Set(step.distractors.map((candidate) => candidate.padId)).size).toBe(step.distractors.length);
        expect(step.distractors.some((candidate) => candidate.padId === step.correctPadId)).toBe(false);
        expect(step.distractors.some((candidate) => candidate.color === step.targetColor)).toBe(false);
        expect(plan.dangerPadIds).not.toContain(step.correctPadId);
        for (const distractor of step.distractors) expect(plan.dangerPadIds).not.toContain(distractor.padId);
      }
    }
  });

  it("gives every Medium decision exactly one correct active pad", () => {
    for (const plan of allColorChaseStagePlans().filter((candidate) => candidate.difficulty === Difficulty.MEDIUM)) {
      for (const step of plan.steps) {
        const active = [step.correctPadId, ...step.distractors.map((candidate) => candidate.padId)];
        expect(active.filter((padId) => padId === step.correctPadId)).toHaveLength(1);
        expect(step.distractors.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("establishes Advanced danger pads outside every correct route", () => {
    for (const plan of allColorChaseStagePlans().filter((candidate) => candidate.difficulty === Difficulty.ADVANCED)) {
      expect(plan.dangerPadIds.length).toBeGreaterThanOrEqual(1);
      for (const danger of plan.dangerPadIds) expect(plan.steps.some((step) => step.correctPadId === danger)).toBe(false);
    }
  });
});

describe("confirmColorChasePad sensor-ready action", () => {
  it("drives gameplay from canonical pad data without any React button", () => {
    let state = playing();
    const first = state.currentStage.plan.steps[0];
    const result = confirmColorChasePad(state, { padId: first.correctPadId, inputId: "sensor-event-1", timestamp: 2000 });
    expect(result.success).toBe(true);
    if (!result.success) return;
    state = result.state;
    expect(result.outcome).toBe("correct");
    expect(state.currentStage.currentStepIndex).toBe(1);
  });

  it("deduplicates an input id and suppresses same-pad sensor bounce", () => {
    const state = playing();
    const padId = state.currentStage.plan.steps[0].correctPadId;
    const first = confirmColorChasePad(state, { padId, inputId: "pressure-7", timestamp: 2000 });
    if (!first.success) throw new Error(first.reason);
    const duplicate = confirmColorChasePad(first.state, { padId, inputId: "pressure-7", timestamp: 2100 });
    const bounce = confirmColorChasePad(first.state, { padId, inputId: "pressure-8", timestamp: 2200 });
    expect(duplicate.success && duplicate.outcome).toBe("duplicate");
    expect(bounce.success && bounce.outcome).toBe("duplicate");
    expect(duplicate.state.currentStage.currentStepIndex).toBe(1);
    expect(bounce.state.currentStage.currentStepIndex).toBe(1);
  });

  it("keeps progress on wrong/danger inputs and disables scoring while paused", () => {
    const medium = playing(Difficulty.MEDIUM, 1);
    const wrongPad = medium.currentStage.plan.steps[0].distractors[0].padId;
    const wrong = confirmColorChasePad(medium, { padId: wrongPad, inputId: "wrong", timestamp: 2000 });
    expect(wrong.success && wrong.outcome).toBe("incorrect");
    expect(wrong.state.currentStage.currentStepIndex).toBe(0);

    const advanced = playing(Difficulty.ADVANCED, 1);
    const danger = confirmColorChasePad(advanced, { padId: advanced.currentStage.plan.dangerPadIds[0], inputId: "danger", timestamp: 2000 });
    expect(danger.success && danger.outcome).toBe("danger");
    expect(danger.state.currentStage.currentStepIndex).toBe(0);

    const paused = pauseColorChaseSession(medium, 1500);
    if (!paused.success) throw new Error(paused.reason);
    const ignored = confirmColorChasePad(paused.state, { padId: medium.currentStage.plan.steps[0].correctPadId, inputId: "paused", timestamp: 2000 });
    expect(ignored.success).toBe(false);
  });

  it("restart reconstructs the identical plan and clears stats", () => {
    const state = playing(Difficulty.ADVANCED, 5);
    const originalPlan = state.currentStage.plan;
    const wrong = confirmColorChasePad(state, { padId: "PAD_3", inputId: "danger", timestamp: 2000 });
    const restarted = restartColorChaseStage(wrong.state, 3000);
    expect(restarted.success).toBe(true);
    expect(restarted.state.currentStage.plan).toEqual(originalPlan);
    expect(restarted.state.currentStage.currentStepIndex).toBe(0);
    expect(restarted.state.currentStage.dangerPressCount).toBe(0);
  });

  it.each([
    [Difficulty.EASY, 1], [Difficulty.EASY, 5],
    [Difficulty.MEDIUM, 1], [Difficulty.MEDIUM, 3], [Difficulty.MEDIUM, 5],
    [Difficulty.ADVANCED, 1], [Difficulty.ADVANCED, 3], [Difficulty.ADVANCED, 5],
  ] as const)("completes the required smoke stage %s/%s from canonical PAD inputs", (difficulty, stageNumber) => {
    let state = playing(difficulty, stageNumber);
    for (const [index, step] of state.currentStage.plan.steps.entries()) {
      const result = confirmColorChasePad(state, { padId: step.correctPadId, inputId: `${difficulty}-${stageNumber}-${index}`, timestamp: 2000 + index * 1000 });
      if (!result.success) throw new Error(result.reason);
      state = result.state;
    }
    expect(state.gameState).toBe(GameState.STAGE_COMPLETE);
    expect(state.currentStage.correctCount).toBe(state.currentStage.plan.steps.length);
  });

  it("resumes cleanly without scoring during the paused interval", () => {
    const state = playing();
    const paused = pauseColorChaseSession(state, 1500);
    const resumed = resumeColorChaseSession(paused.state, 2500);
    expect(resumed.success).toBe(true);
    expect(resumed.state.currentStage.pausedAt).toBeNull();
    expect(resumed.state.currentStage.totalPausedMs).toBe(1000);
  });

  it("supports backward stage navigation and active difficulty switching", () => {
    const stageFour = playing(Difficulty.EASY, 4);
    const back = jumpToColorChaseStage(stageFour, 2, 2000);
    expect(back.success).toBe(true);
    expect(back.state.currentStage.stageNumber).toBe(2);
    expect(back.state.results).toHaveLength(1);
    const changed = switchColorChaseDifficulty(back.state, Difficulty.ADVANCED, 2500);
    expect(changed.success).toBe(true);
    expect(changed.state.currentDifficulty).toBe(Difficulty.ADVANCED);
    expect(changed.state.currentStage.stageNumber).toBe(1);
  });
});

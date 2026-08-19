import { describe, expect, it } from "vitest";
import { GameState } from "@/lib/game";
import { FINAL_ACTION_FAILSAFE_MS, shouldBeginFinalActionHandoff } from "../useStageCompletionPresentation";

describe("final-action presentation handoff", () => {
  it("holds the Playing presentation when canonical state first reaches STAGE_COMPLETE", () => {
    expect(shouldBeginFinalActionHandoff(GameState.PLAYING, GameState.STAGE_COMPLETE)).toBe(true);
    expect(shouldBeginFinalActionHandoff(GameState.STAGE_COMPLETE, GameState.STAGE_COMPLETE)).toBe(false);
    expect(shouldBeginFinalActionHandoff(GameState.COUNTDOWN, GameState.STAGE_COMPLETE)).toBe(false);
  });

  it("uses bounded timings tailored to each real animation chain", () => {
    expect(FINAL_ACTION_FAILSAFE_MS.balloonQuest).toBeGreaterThanOrEqual(1_000);
    expect(FINAL_ACTION_FAILSAFE_MS.footsteps).toBeGreaterThanOrEqual(950);
    expect(FINAL_ACTION_FAILSAFE_MS.bubblePop).toBeGreaterThanOrEqual(1_450);
    expect(FINAL_ACTION_FAILSAFE_MS.feedAnimalsChoice).toBeGreaterThanOrEqual(1_300);
    expect(FINAL_ACTION_FAILSAFE_MS.feedAnimalsPath).toBeGreaterThanOrEqual(900);
    expect(FINAL_ACTION_FAILSAFE_MS.spacePilot).toBeGreaterThanOrEqual(1_000);
    expect(FINAL_ACTION_FAILSAFE_MS.colorChase).toBeGreaterThanOrEqual(850);
    expect(new Set(Object.values(FINAL_ACTION_FAILSAFE_MS)).size).toBeGreaterThan(3);
  });
});

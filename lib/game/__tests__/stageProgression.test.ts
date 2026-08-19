import { describe, expect, it } from "vitest";
import { Difficulty, getNextStageTarget, getStageDecisionTarget } from "@/lib/game";

describe("canonical stage progression", () => {
  it("advances within a difficulty", () => {
    expect(getNextStageTarget(Difficulty.EASY, 1)).toEqual({ difficulty: Difficulty.EASY, stageNumber: 2 });
    expect(getNextStageTarget(Difficulty.MEDIUM, 4)).toEqual({ difficulty: Difficulty.MEDIUM, stageNumber: 5 });
  });

  it("resets to stage 1 at a difficulty boundary", () => {
    expect(getStageDecisionTarget(Difficulty.EASY, 5, "continue")).toEqual({ difficulty: Difficulty.MEDIUM, stageNumber: 1 });
    expect(getStageDecisionTarget(Difficulty.MEDIUM, 5, "continue")).toEqual({ difficulty: Difficulty.ADVANCED, stageNumber: 1 });
    expect(getStageDecisionTarget(Difficulty.ADVANCED, 5, "continue")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { Difficulty, StageStatus } from "@/lib/game";
import { BALLOON_QUEST_GAME_ID, BUBBLE_POP_WALL_GAME_ID, FEED_THE_ANIMALS_GAME_ID } from "@/lib/games/registry";
import { suggestResumePoint } from "../resumeSuggestion";
import type { StoredBubblePopSession, StoredFeedAnimalsSession, StoredSession, StoredStageResult } from "../types";

function makeStageResult(overrides: Partial<StoredStageResult>): StoredStageResult {
  return {
    difficulty: Difficulty.EASY,
    stageNumber: 1,
    status: StageStatus.COMPLETED,
    correct: 3,
    incorrect: 0,
    accuracy: 1,
    durationMs: 1000,
    averageReactionTimeMs: 500,
    ...overrides,
  };
}

function makeSession(stageResults: StoredStageResult[], overrides: Partial<StoredSession> = {}): StoredSession {
  return {
    sessionId: "s1",
    patientId: "p1",
    gameId: BALLOON_QUEST_GAME_ID,
    startedAt: 0,
    completedAt: 1000,
    createdByUid: "u1",
    startingDifficulty: Difficulty.EASY,
    startingStage: 1,
    endingDifficulty: Difficulty.EASY,
    endingStage: 1,
    completedStageCount: stageResults.filter((r) => r.status === StageStatus.COMPLETED).length,
    skippedStageCount: stageResults.filter((r) => r.status === StageStatus.SKIPPED).length,
    totalCorrect: 0,
    totalIncorrect: 0,
    accuracy: 0,
    durationMs: 0,
    averageReactionTimeMs: null,
    bestStage: null,
    stageResults,
    ...overrides,
  };
}

describe("suggestResumePoint", () => {
  it("suggests the session's own starting point when no stage was ever entered", () => {
    const session = makeSession([], { startingDifficulty: Difficulty.MEDIUM, startingStage: 3 });
    expect(suggestResumePoint(session)).toEqual({ difficulty: Difficulty.MEDIUM, startingStage: 3, reason: "session-start" });
  });

  it("suggests resuming the SAME stage when the last stage was skipped (never finished it)", () => {
    const session = makeSession([makeStageResult({ difficulty: Difficulty.MEDIUM, stageNumber: 2, status: StageStatus.SKIPPED })]);
    expect(suggestResumePoint(session)).toEqual({ difficulty: Difficulty.MEDIUM, startingStage: 2, reason: "resume-skipped" });
  });

  it("suggests the next stage number when the last stage was completed and isn't the difficulty's final stage", () => {
    const session = makeSession([makeStageResult({ difficulty: Difficulty.MEDIUM, stageNumber: 3, status: StageStatus.COMPLETED })]);
    expect(suggestResumePoint(session)).toEqual({ difficulty: Difficulty.MEDIUM, startingStage: 4, reason: "next-stage" });
  });

  it("suggests the next harder difficulty's stage 1 after completing a difficulty's final (5th) stage", () => {
    const session = makeSession([makeStageResult({ difficulty: Difficulty.EASY, stageNumber: 5, status: StageStatus.COMPLETED })]);
    expect(suggestResumePoint(session)).toEqual({ difficulty: Difficulty.MEDIUM, startingStage: 1, reason: "next-difficulty" });
  });

  it("suggests repeating the final stage after completing ADVANCED's final stage — nowhere harder to suggest", () => {
    const session = makeSession([makeStageResult({ difficulty: Difficulty.ADVANCED, stageNumber: 5, status: StageStatus.COMPLETED })]);
    expect(suggestResumePoint(session)).toEqual({ difficulty: Difficulty.ADVANCED, startingStage: 5, reason: "repeat-final-stage" });
  });

  it("only looks at the LAST stageResults entry, never an earlier one", () => {
    const session = makeSession([
      makeStageResult({ difficulty: Difficulty.EASY, stageNumber: 1, status: StageStatus.COMPLETED }),
      makeStageResult({ difficulty: Difficulty.EASY, stageNumber: 2, status: StageStatus.SKIPPED }),
    ]);
    expect(suggestResumePoint(session)).toEqual({ difficulty: Difficulty.EASY, startingStage: 2, reason: "resume-skipped" });
  });

  it("never suggests progression as a fact — the therapist-editable difficulty/stage is data, not a claim", () => {
    const session = makeSession([makeStageResult({ difficulty: Difficulty.EASY, stageNumber: 5, status: StageStatus.COMPLETED })]);
    const suggestion = suggestResumePoint(session);
    expect(Object.keys(suggestion).sort()).toEqual(["difficulty", "reason", "startingStage"]);
  });

  it("MULTI-GAME PLATFORM — a StoredBubblePopSession satisfies StoredSessionLike structurally, no cast/adapter needed, and progression is computed identically to Balloon Quest/Follow the Footsteps", () => {
    const bubblePopSession: StoredBubblePopSession = {
      sessionId: "bp-1",
      patientId: "p1",
      gameId: BUBBLE_POP_WALL_GAME_ID,
      startedAt: 0,
      completedAt: 1000,
      createdByUid: "u1",
      startingDifficulty: Difficulty.MEDIUM,
      startingStage: 1,
      endingDifficulty: Difficulty.MEDIUM,
      endingStage: 3,
      completedStageCount: 1,
      skippedStageCount: 0,
      totalTargetsPresented: 4,
      totalTargetsCompleted: 4,
      totalIncorrect: 0,
      completionRate: 1,
      accuracy: 1,
      durationMs: 1000,
      averageResponseTimeMs: 400,
      bestStage: { difficulty: Difficulty.MEDIUM, stageNumber: 3 },
      stageResults: [
        { difficulty: Difficulty.MEDIUM, stageNumber: 3, status: StageStatus.COMPLETED, targetsPresented: 4, targetsCompleted: 4, incorrectCount: 0, durationMs: 1000, averageResponseTimeMs: 400 },
      ],
    };

    expect(suggestResumePoint(bubblePopSession)).toEqual({ difficulty: Difficulty.MEDIUM, startingStage: 4, reason: "next-stage" });
  });

  it("MULTI-GAME PLATFORM — a StoredFeedAnimalsSession satisfies StoredSessionLike structurally too, no cast/adapter needed, and progression is computed identically to every other game", () => {
    const feedAnimalsSession: StoredFeedAnimalsSession = {
      sessionId: "fa-1",
      patientId: "p1",
      gameId: FEED_THE_ANIMALS_GAME_ID,
      startedAt: 0,
      completedAt: 1000,
      createdByUid: "u1",
      startingDifficulty: Difficulty.EASY,
      startingStage: 1,
      endingDifficulty: Difficulty.EASY,
      endingStage: 5,
      completedStageCount: 1,
      skippedStageCount: 0,
      totalRoundsPresented: 5,
      totalRoundsCompleted: 5,
      totalIncorrect: 0,
      completionRate: 1,
      accuracy: 1,
      durationMs: 1000,
      averageResponseTimeMs: 500,
      bestStage: { difficulty: Difficulty.EASY, stageNumber: 5 },
      stageResults: [
        { difficulty: Difficulty.EASY, stageNumber: 5, status: StageStatus.COMPLETED, roundsPresented: 5, roundsCompleted: 5, incorrectCount: 0, durationMs: 1000, averageResponseTimeMs: 500 },
      ],
    };

    expect(suggestResumePoint(feedAnimalsSession)).toEqual({ difficulty: Difficulty.MEDIUM, startingStage: 1, reason: "next-difficulty" });
  });
});

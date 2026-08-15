import type { Balloon, SessionState, SessionSummary, StageResult, StageRuntime } from "@/lib/game";
import { Difficulty, StageStatus } from "@/lib/game";

/**
 * Realtime Database has no true "array" or "null" storage: an empty array
 * ([]) and a scalar explicitly set to `null` are BOTH indistinguishable
 * from "this field was never written" once read back — the JS SDK gives
 * you `undefined`, not `[]` or `null`. lib/game's SessionState type
 * promises `results: StageResult[]` (never undefined) and
 * `pausedAt: number | null` (never undefined) — code throughout the app
 * (this project's own `stage.pausedAt !== null` checks, LiveSessionScreen's
 * `session.results.length`, etc.) relies on that promise being true, and it
 * silently breaks the instant a SessionState round-trips through Firebase
 * with an empty stage result list or an unset timestamp — which is the
 * COMMON case, not a rare edge case (every brand-new session has
 * `results: []`, every not-yet-started stage has `pausedAt: null`).
 *
 * This function is the ONE place that repairs that: it reconstructs the
 * exact shape lib/game's types promise, field by field, so every consumer
 * (the controller's own read of what it just published, and the display)
 * always sees genuinely well-formed data — never `undefined` where the
 * type says `[]` or `null`. Found and fixed via the emulator-based
 * two-browser test in the Task 6 report; see that report for the full story.
 *
 * TASK 11: revived around `currentStage`/`currentDifficulty` (a session's
 * one active stage) instead of the old fixed `stages`/`currentStageIndex`
 * array — see lib/game/session.ts's class doc comment for why stages are
 * now generated lazily one at a time rather than all up front.
 */
export function reviveSessionState(raw: unknown): SessionState {
  const s = raw as Partial<SessionState> & { results?: unknown; summary?: unknown };
  return {
    sessionId: s.sessionId as string,
    seed: s.seed as string,
    config: s.config as SessionState["config"],
    gameState: s.gameState as SessionState["gameState"],
    currentDifficulty: s.currentDifficulty as Difficulty,
    currentStage: reviveStageRuntime(s.currentStage),
    results: ((s.results as StageResult[] | undefined) ?? []).map(reviveStageResult),
    createdAt: s.createdAt as number,
    endedAt: (s.endedAt as number | undefined) ?? null,
    summary: s.summary ? reviveSummary(s.summary as SessionSummary) : null,
  };
}

function reviveStageRuntime(raw: unknown): StageRuntime {
  const s = raw as Partial<StageRuntime> & { balloons?: unknown; reactionTimesMs?: unknown };
  return {
    difficulty: s.difficulty as Difficulty,
    stageNumber: s.stageNumber as StageRuntime["stageNumber"],
    targetColor: s.targetColor as StageRuntime["targetColor"],
    balloons: (s.balloons as Balloon[] | undefined) ?? [],
    totalTargets: s.totalTargets as number,
    correctCount: s.correctCount as number,
    incorrectCount: s.incorrectCount as number,
    reactionTimesMs: (s.reactionTimesMs as number[] | undefined) ?? [],
    startedAt: (s.startedAt as number | undefined) ?? null,
    completedAt: (s.completedAt as number | undefined) ?? null,
    pausedAt: (s.pausedAt as number | undefined) ?? null,
    totalPausedMs: (s.totalPausedMs as number) ?? 0,
  };
}

function reviveStageResult(raw: unknown): StageResult {
  const s = raw as Partial<StageResult>;
  return {
    difficulty: s.difficulty as Difficulty,
    stageNumber: s.stageNumber as StageResult["stageNumber"],
    status: (s.status as StageStatus | undefined) ?? StageStatus.COMPLETED,
    targetColor: (s.targetColor as StageResult["targetColor"] | undefined) ?? null,
    correctCount: s.correctCount as number,
    incorrectCount: s.incorrectCount as number,
    totalTargets: s.totalTargets as number,
    accuracy: (s.accuracy as number | undefined) ?? null,
    durationMs: (s.durationMs as number | undefined) ?? null,
    averageReactionTimeMs: (s.averageReactionTimeMs as number | undefined) ?? null,
  };
}

function reviveSummary(raw: unknown): SessionSummary {
  const s = raw as Partial<SessionSummary> & { stageResults?: unknown; difficultiesPlayed?: unknown };
  return {
    sessionId: s.sessionId as string,
    childFirstName: s.childFirstName as string,
    startingDifficulty: s.startingDifficulty as Difficulty,
    difficultiesPlayed: (s.difficultiesPlayed as Difficulty[] | undefined) ?? [],
    stageResults: ((s.stageResults as StageResult[] | undefined) ?? []).map(reviveStageResult),
    totalCorrect: s.totalCorrect as number,
    totalIncorrect: s.totalIncorrect as number,
    overallAccuracy: s.overallAccuracy as number,
    totalDurationMs: s.totalDurationMs as number,
    averageReactionTimeMs: (s.averageReactionTimeMs as number | undefined) ?? null,
    bestStage: (s.bestStage as SessionSummary["bestStage"] | undefined) ?? null,
    completedAt: s.completedAt as string,
  };
}

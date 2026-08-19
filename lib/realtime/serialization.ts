import type { Balloon, SessionState, SessionSummary, StageResult, StageRuntime } from "@/lib/game";
import { BalloonColor, Difficulty, GameState, StageStatus } from "@/lib/game";
import type {
  Footprint,
  FootstepsSessionState,
  FootstepsSessionSummary,
  FootstepsStageResult,
  FootstepsStageRuntime,
} from "@/lib/footsteps";
import { Foot, FootstepsStageStatus, RouteObstacleKind } from "@/lib/footsteps";
import type {
  Bubble,
  BubblePopSessionState,
  BubblePopSessionSummary,
  BubblePopStageResult,
  BubblePopStageRuntime,
} from "@/lib/bubblepop";
import { BubbleColor, BubbleMoveDirection, BubblePopStageStatus, BubbleShape } from "@/lib/bubblepop";
import type {
  FeedAnimalsSessionState,
  FeedAnimalsSessionSummary,
  FeedAnimalsStageResult,
  FeedAnimalsStageRuntime,
  FeedRound,
} from "@/lib/feedanimals";
import { ANIMAL_FOOD_MAP, Animal, FeedAnimalsStageStatus, Food } from "@/lib/feedanimals";
import type {
  CollectibleStar,
  SpaceEncounter,
  SpacePilotAnyStageRuntime,
  SpacePilotEncounterStageRuntime,
  SpacePilotSessionState,
  SpacePilotSessionSummary,
  SpacePilotStageRuntime,
} from "@/lib/spacepilot";
import { CollectibleStarStatus, EncounterOutcome, EncounterType, StarLane } from "@/lib/spacepilot";
import type { ColorChaseSessionState, ColorChaseStageResult, ColorChaseStageRuntime } from "@/lib/colorchase";
import { ColorChaseStageStatus, getColorChaseStagePlan, PAD_IDS } from "@/lib/colorchase";
import { getFeedAnimalsPathStage } from "@/lib/feedanimals/pathStages";
import { assertFirebaseSafeValue, finiteCount, finiteNumber, nonNegativeFiniteNumber, safeRatio, sumFinite } from "@/lib/dataIntegrity/numeric";
import { normalizeSessionWorkflowMetadata } from "@/lib/sessions/workflowMetadata";

function record(raw: unknown, label: string): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Invalid ${label}`);
  assertFirebaseSafeValue(raw);
  return raw as Record<string, unknown>;
}

function requiredString(raw: unknown, label: string): string {
  if (typeof raw !== "string" || raw.length === 0) throw new Error(`Invalid ${label}`);
  return raw;
}

function requiredBoolean(raw: unknown, label: string): boolean {
  if (typeof raw !== "boolean") throw new Error(`Invalid ${label}`);
  return raw;
}

function requiredFiniteNumber(raw: unknown, label: string): number {
  const value = finiteNumber(raw);
  if (value === null) throw new Error(`Invalid ${label}`);
  return value;
}

function requiredEnumValue<T extends string>(raw: unknown, values: readonly T[], label: string): T {
  if (typeof raw !== "string" || !values.includes(raw as T)) throw new Error(`Invalid ${label}`);
  return raw as T;
}

function requiredUnitPosition(raw: unknown, label: string): { x: number; y: number } {
  const value = record(raw, label);
  const x = requiredFiniteNumber(value.x, `${label}.x`);
  const y = requiredFiniteNumber(value.y, `${label}.y`);
  if (x < 0 || x > 1 || y < 0 || y > 1) throw new Error(`Invalid ${label}`);
  return { x, y };
}

function requiredNormalizedSize(raw: unknown, label: string): number {
  const value = requiredFiniteNumber(raw, label);
  if (value <= 0 || value > 1) throw new Error(`Invalid ${label}`);
  return value;
}

function requiredIsoDate(raw: unknown, label: string): string {
  const value = requiredString(raw, label);
  if (!Number.isFinite(Date.parse(value))) throw new Error(`Invalid ${label}`);
  return value;
}

function requiredCount(raw: unknown, label: string): number {
  const value = finiteCount(raw);
  if (value === null) throw new Error(`Invalid ${label}`);
  return value;
}

function requiredTime(raw: unknown, label: string): number {
  const value = nonNegativeFiniteNumber(raw);
  if (value === null) throw new Error(`Invalid ${label}`);
  return value;
}

function nullableTime(raw: unknown, label: string): number | null {
  if (raw === undefined || raw === null) return null;
  return requiredTime(raw, label);
}

function requiredDifficulty(raw: unknown): Difficulty {
  if (raw !== Difficulty.EASY && raw !== Difficulty.MEDIUM && raw !== Difficulty.ADVANCED) throw new Error("Invalid difficulty");
  return raw;
}

function requiredStageNumber(raw: unknown): 1 | 2 | 3 | 4 | 5 {
  if (raw !== 1 && raw !== 2 && raw !== 3 && raw !== 4 && raw !== 5) throw new Error("Invalid stage number");
  return raw;
}

function valuesArray(raw: unknown): unknown[] {
  if (raw === undefined || raw === null) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "object") return Object.values(raw);
  throw new Error("Invalid Firebase array representation");
}

function requiredDifficulties(raw: unknown): Difficulty[] {
  return valuesArray(raw).map(requiredDifficulty);
}

function optionalBestStage(raw: unknown): { difficulty: Difficulty; stageNumber: 1 | 2 | 3 | 4 | 5 } | null {
  if (raw === undefined || raw === null) return null;
  const value = record(raw, "bestStage");
  return { difficulty: requiredDifficulty(value.difficulty), stageNumber: requiredStageNumber(value.stageNumber) };
}

function workflowField(raw: unknown): { workflow?: NonNullable<ReturnType<typeof normalizeSessionWorkflowMetadata>> } {
  const workflow = normalizeSessionWorkflowMetadata(raw);
  return workflow ? { workflow } : {};
}

function validateSessionEnvelope(raw: unknown): Record<string, unknown> {
  const value = record(raw, "session");
  requiredString(value.sessionId, "sessionId");
  requiredString(value.seed, "seed");
  const config = record(value.config, "config");
  requiredString(config.childFirstName, "childFirstName");
  if (!Object.values(GameState).includes(value.gameState as GameState)) throw new Error("Invalid gameState");
  requiredDifficulty(value.currentDifficulty);
  record(value.currentStage, "currentStage");
  const createdAt = requiredTime(value.createdAt, "createdAt");
  const endedAt = nullableTime(value.endedAt, "endedAt");
  if (endedAt !== null && endedAt < createdAt) throw new Error("Invalid session timestamp order");
  return value;
}

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
  validateSessionEnvelope(raw);
  const s = raw as Partial<SessionState> & { results?: unknown; summary?: unknown };
  return {
    sessionId: s.sessionId as string,
    seed: s.seed as string,
    config: s.config as SessionState["config"],
    ...workflowField(s.workflow),
    gameState: s.gameState as SessionState["gameState"],
    currentDifficulty: s.currentDifficulty as Difficulty,
    currentStage: reviveStageRuntime(s.currentStage),
    results: valuesArray(s.results).map(reviveStageResult),
    createdAt: requiredTime(s.createdAt, "createdAt"),
    endedAt: nullableTime(s.endedAt, "endedAt"),
    summary: s.summary ? reviveSummary(s.summary as SessionSummary) : null,
  };
}

export function reviveColorChaseSessionState(raw: unknown): ColorChaseSessionState {
  validateSessionEnvelope(raw);
  const s = raw as Partial<ColorChaseSessionState> & { results?: unknown; summary?: unknown };
  const results = Array.isArray(s.results) ? s.results : s.results && typeof s.results === "object" ? Object.values(s.results) : [];
  return {
    sessionId: s.sessionId as string,
    seed: s.seed as string,
    config: s.config as ColorChaseSessionState["config"],
    ...workflowField(s.workflow),
    gameState: s.gameState as ColorChaseSessionState["gameState"],
    currentDifficulty: s.currentDifficulty as ColorChaseSessionState["currentDifficulty"],
    currentStage: reviveColorChaseStageRuntime(s.currentStage),
    results: (results as ColorChaseStageResult[]).map((result) => ({
      ...result,
      status:
        result.status === undefined
          ? ColorChaseStageStatus.COMPLETED
          : requiredEnumValue(result.status, Object.values(ColorChaseStageStatus), "Color Chase result status"),
      targetsPresented: requiredCount(result.targetsPresented, "targetsPresented"),
      correctCount: requiredCount(result.correctCount, "correctCount"),
      incorrectCount: requiredCount(result.incorrectCount, "incorrectCount"),
      dangerPressCount: requiredCount(result.dangerPressCount, "dangerPressCount"),
      accuracy: safeRatio(result.correctCount, sumFinite([finiteCount(result.correctCount), finiteCount(result.incorrectCount), finiteCount(result.dangerPressCount)])),
      durationMs: nullableTime(result.durationMs, "durationMs"),
      averageResponseTimeMs: nullableTime(result.averageResponseTimeMs, "averageResponseTimeMs"),
    })),
    createdAt: requiredTime(s.createdAt, "createdAt"),
    endedAt: nullableTime(s.endedAt, "endedAt"),
    summary: s.summary ? reviveColorChaseSummary(s.summary) : null,
  };
}

function reviveColorChaseSummary(raw: unknown): NonNullable<ColorChaseSessionState["summary"]> {
  record(raw, "Color Chase summary");
  const summary = raw as NonNullable<ColorChaseSessionState["summary"]> & { stageResults?: unknown; difficultiesPlayed?: unknown };
  const stageResults = Array.isArray(summary.stageResults) ? summary.stageResults : summary.stageResults && typeof summary.stageResults === "object" ? Object.values(summary.stageResults) : [];
  const difficultiesPlayed = Array.isArray(summary.difficultiesPlayed) ? summary.difficultiesPlayed : summary.difficultiesPlayed && typeof summary.difficultiesPlayed === "object" ? Object.values(summary.difficultiesPlayed) : [];
  return {
    ...summary,
    sessionId: requiredString(summary.sessionId, "sessionId"),
    childFirstName: requiredString(summary.childFirstName, "childFirstName"),
    startingDifficulty: requiredDifficulty(summary.startingDifficulty),
    difficultiesPlayed: difficultiesPlayed.map(requiredDifficulty),
    stageResults: (stageResults as ColorChaseStageResult[]).map((result) => ({
      ...result,
      status:
        result.status === undefined
          ? ColorChaseStageStatus.COMPLETED
          : requiredEnumValue(result.status, Object.values(ColorChaseStageStatus), "Color Chase result status"),
      targetsPresented: requiredCount(result.targetsPresented, "targetsPresented"),
      correctCount: requiredCount(result.correctCount, "correctCount"),
      incorrectCount: requiredCount(result.incorrectCount, "incorrectCount"),
      dangerPressCount: requiredCount(result.dangerPressCount, "dangerPressCount"),
      accuracy: safeRatio(result.correctCount, sumFinite([finiteCount(result.correctCount), finiteCount(result.incorrectCount), finiteCount(result.dangerPressCount)])),
      durationMs: nullableTime(result.durationMs, "durationMs"),
      averageResponseTimeMs: nullableTime(result.averageResponseTimeMs, "averageResponseTimeMs"),
    })),
    totalTargetsPresented: requiredCount(summary.totalTargetsPresented, "totalTargetsPresented"),
    totalCorrect: requiredCount(summary.totalCorrect, "totalCorrect"),
    totalIncorrect: requiredCount(summary.totalIncorrect, "totalIncorrect"),
    totalDangerPresses: requiredCount(summary.totalDangerPresses, "totalDangerPresses"),
    accuracy: safeRatio(summary.totalCorrect, sumFinite([finiteCount(summary.totalCorrect), finiteCount(summary.totalIncorrect), finiteCount(summary.totalDangerPresses)])),
    totalDurationMs: requiredTime(summary.totalDurationMs, "totalDurationMs"),
    averageResponseTimeMs: nullableTime(summary.averageResponseTimeMs, "averageResponseTimeMs"),
    bestStage: optionalBestStage(summary.bestStage),
    completedAt: requiredIsoDate(summary.completedAt, "completedAt"),
  };
}

function reviveColorChaseStageRuntime(raw: unknown): ColorChaseStageRuntime {
  record(raw, "Color Chase stage");
  const stage = raw as Partial<ColorChaseStageRuntime>;
  const difficulty = requiredDifficulty(stage.difficulty);
  const stageNumber = requiredStageNumber(stage.stageNumber);
  const responseTimes = Array.isArray(stage.responseTimesMs) ? stage.responseTimesMs : stage.responseTimesMs && typeof stage.responseTimesMs === "object" ? Object.values(stage.responseTimesMs) : [];
  const processedInputs = Array.isArray(stage.processedInputIds) ? stage.processedInputIds : stage.processedInputIds && typeof stage.processedInputIds === "object" ? Object.values(stage.processedInputIds) : [];
  const plan = getColorChaseStagePlan(difficulty, stageNumber);
  const currentStepIndex = requiredCount(stage.currentStepIndex ?? 0, "currentStepIndex");
  if (currentStepIndex > plan.steps.length) throw new Error("Invalid Color Chase progress");
  return {
    difficulty,
    stageNumber,
    // Rebuild from the canonical preset. Firebase drops empty distractor arrays,
    // so trusting the serialized copy would make Easy refreshes malformed.
    plan,
    currentStepIndex,
    correctCount: requiredCount(stage.correctCount ?? 0, "correctCount"),
    incorrectCount: requiredCount(stage.incorrectCount ?? 0, "incorrectCount"),
    dangerPressCount: requiredCount(stage.dangerPressCount ?? 0, "dangerPressCount"),
    responseTimesMs: responseTimes.map((value) => requiredTime(value, "responseTime")),
    startedAt: nullableTime(stage.startedAt, "startedAt"),
    completedAt: nullableTime(stage.completedAt, "completedAt"),
    pausedAt: nullableTime(stage.pausedAt, "pausedAt"),
    totalPausedMs: requiredTime(stage.totalPausedMs ?? 0, "totalPausedMs"),
    stepStartedAt: nullableTime(stage.stepStartedAt, "stepStartedAt"),
    stepPausedMs: requiredTime(stage.stepPausedMs ?? 0, "stepPausedMs"),
    processedInputIds: processedInputs.map((value) => requiredString(value, "processedInputId")),
    lastAcceptedInput: reviveLastAcceptedPadInput(stage.lastAcceptedInput),
  };
}

function reviveLastAcceptedPadInput(raw: unknown): ColorChaseStageRuntime["lastAcceptedInput"] {
  if (raw === undefined || raw === null) return null;
  const value = record(raw, "lastAcceptedInput");
  return {
    padId: requiredEnumValue(value.padId, PAD_IDS, "lastAcceptedInput.padId"),
    timestamp: requiredTime(value.timestamp, "lastAcceptedInput.timestamp"),
  };
}

function reviveStageRuntime(raw: unknown): StageRuntime {
  record(raw, "Balloon stage");
  const s = raw as Partial<StageRuntime> & { balloons?: unknown; reactionTimesMs?: unknown };
  const balloons = valuesArray(s.balloons).map(reviveBalloon);
  const totalTargets = requiredCount(s.totalTargets, "totalTargets");
  const correctCount = requiredCount(s.correctCount, "correctCount");
  if (totalTargets === 0 || balloons.length < totalTargets || correctCount > totalTargets) throw new Error("Invalid Balloon stage targets");
  return {
    difficulty: requiredDifficulty(s.difficulty),
    stageNumber: requiredStageNumber(s.stageNumber),
    targetColor: s.targetColor as StageRuntime["targetColor"],
    balloons,
    totalTargets,
    correctCount,
    incorrectCount: requiredCount(s.incorrectCount, "incorrectCount"),
    reactionTimesMs: valuesArray(s.reactionTimesMs).map((value) => requiredTime(value, "reactionTime")),
    startedAt: nullableTime(s.startedAt, "startedAt"),
    completedAt: nullableTime(s.completedAt, "completedAt"),
    pausedAt: nullableTime(s.pausedAt, "pausedAt"),
    totalPausedMs: requiredTime(s.totalPausedMs ?? 0, "totalPausedMs"),
  };
}

function reviveBalloon(raw: unknown): Balloon {
  const value = record(raw, "balloon");
  return {
    id: requiredString(value.id, "balloon.id"),
    color: requiredEnumValue(value.color, Object.values(BalloonColor), "balloon.color"),
    position: requiredUnitPosition(value.position, "balloon.position"),
    size: requiredNormalizedSize(value.size, "balloon.size"),
    isTarget: requiredBoolean(value.isTarget, "balloon.isTarget"),
    isPopped: requiredBoolean(value.isPopped, "balloon.isPopped"),
  };
}

function reviveStageResult(raw: unknown): StageResult {
  record(raw, "Balloon stage result");
  const s = raw as Partial<StageResult>;
  return {
    difficulty: requiredDifficulty(s.difficulty),
    stageNumber: requiredStageNumber(s.stageNumber),
    status: s.status === undefined ? StageStatus.COMPLETED : requiredEnumValue(s.status, Object.values(StageStatus), "stageResult.status"),
    targetColor: s.targetColor == null ? null : requiredEnumValue(s.targetColor, Object.values(BalloonColor), "stageResult.targetColor"),
    correctCount: requiredCount(s.correctCount, "correctCount"),
    incorrectCount: requiredCount(s.incorrectCount, "incorrectCount"),
    totalTargets: requiredCount(s.totalTargets, "totalTargets"),
    accuracy: safeRatio(s.correctCount, sumFinite([finiteCount(s.correctCount), finiteCount(s.incorrectCount)])),
    durationMs: nullableTime(s.durationMs, "durationMs"),
    averageReactionTimeMs: nullableTime(s.averageReactionTimeMs, "averageReactionTimeMs"),
  };
}

/**
 * MULTI-GAME PLATFORM — Follow the Footsteps' own revive function, same
 * "RTDB drops empty arrays / null scalars on read-back" repair job
 * reviveSessionState performs for Balloon Quest, applied to
 * FootstepsSessionState's field names instead. See
 * lib/realtime/sessionRepository.ts's parseLiveSessionValue, which picks
 * between this and reviveSessionState by the record's own `gameId`.
 */
export function reviveFootstepsSessionState(raw: unknown): FootstepsSessionState {
  validateSessionEnvelope(raw);
  const s = raw as Partial<FootstepsSessionState> & { results?: unknown; summary?: unknown };
  return {
    sessionId: s.sessionId as string,
    seed: s.seed as string,
    config: s.config as FootstepsSessionState["config"],
    ...workflowField(s.workflow),
    gameState: s.gameState as FootstepsSessionState["gameState"],
    currentDifficulty: s.currentDifficulty as Difficulty,
    currentStage: reviveFootstepsStageRuntime(s.currentStage),
    results: valuesArray(s.results).map(reviveFootstepsStageResult),
    createdAt: requiredTime(s.createdAt, "createdAt"),
    endedAt: nullableTime(s.endedAt, "endedAt"),
    summary: s.summary ? reviveFootstepsSummary(s.summary as FootstepsSessionSummary) : null,
  };
}

function reviveFootstepsStageRuntime(raw: unknown): FootstepsStageRuntime {
  record(raw, "Footsteps stage");
  const s = raw as Partial<FootstepsStageRuntime> & { footprints?: unknown; checkpoints?: unknown; stepTimesMs?: unknown };
  const footprints = valuesArray(s.footprints).map(reviveFootprint);
  const totalSteps = requiredCount(s.totalSteps, "totalSteps");
  const currentIndex = requiredCount(s.currentIndex ?? 0, "currentIndex");
  if (totalSteps === 0 || footprints.length < totalSteps || currentIndex > totalSteps) throw new Error("Invalid Footsteps progress");
  return {
    difficulty: requiredDifficulty(s.difficulty),
    stageNumber: requiredStageNumber(s.stageNumber),
    footprints,
    // JOURNEY REDESIGN — new array field; RTDB drops an empty array on
    // read-back the same way it drops every other array field here, so this
    // needs the same explicit `?? []` repair.
    checkpoints: valuesArray(s.checkpoints).map((rawCheckpoint) => {
      const checkpoint = record(rawCheckpoint, "Footsteps checkpoint");
      return {
        id: requiredString(checkpoint.id, "checkpoint.id"),
        afterTargetIndex: requiredCount(checkpoint.afterTargetIndex, "checkpoint.afterTargetIndex"),
        position: requiredUnitPosition(checkpoint.position, "checkpoint.position"),
      };
    }),
    // ROUTE ARCHITECTURE REWRITE — same "RTDB drops an empty array" repair.
    // `?? []` also transparently handles an in-flight OLD session record
    // (created before this field existed) — it simply has no obstacles.
    obstacles: valuesArray(s.obstacles).map((rawObstacle) => {
      const obstacle = record(rawObstacle, "Footsteps obstacle");
      return {
        id: requiredString(obstacle.id, "obstacle.id"),
        afterTargetIndex: requiredCount(obstacle.afterTargetIndex, "obstacle.afterTargetIndex"),
        kind: requiredEnumValue(obstacle.kind, Object.values(RouteObstacleKind), "obstacle.kind"),
        position: requiredUnitPosition(obstacle.position, "obstacle.position"),
        rotationDeg: requiredFiniteNumber(obstacle.rotationDeg, "obstacle.rotationDeg"),
      };
    }),
    destination: requiredUnitPosition(s.destination, "Footsteps destination"),
    totalSteps,
    currentIndex,
    stepTimesMs: valuesArray(s.stepTimesMs).map((value) => requiredTime(value, "stepTime")),
    startedAt: nullableTime(s.startedAt, "startedAt"),
    completedAt: nullableTime(s.completedAt, "completedAt"),
    pausedAt: nullableTime(s.pausedAt, "pausedAt"),
    totalPausedMs: requiredTime(s.totalPausedMs ?? 0, "totalPausedMs"),
    stepStartedAt: nullableTime(s.stepStartedAt, "stepStartedAt"),
    stepPausedMs: requiredTime(s.stepPausedMs ?? 0, "stepPausedMs"),
  };
}

function reviveFootprint(raw: unknown): Footprint {
  const value = record(raw, "footprint");
  return {
    id: requiredString(value.id, "footprint.id"),
    index: requiredCount(value.index, "footprint.index"),
    foot: requiredEnumValue(value.foot, Object.values(Foot), "footprint.foot"),
    position: requiredUnitPosition(value.position, "footprint.position"),
    rotationDeg: requiredFiniteNumber(value.rotationDeg, "footprint.rotationDeg"),
  };
}

function reviveFootstepsStageResult(raw: unknown): FootstepsStageResult {
  record(raw, "Footsteps stage result");
  const s = raw as Partial<FootstepsStageResult>;
  return {
    difficulty: requiredDifficulty(s.difficulty),
    stageNumber: requiredStageNumber(s.stageNumber),
    status:
      s.status === undefined
        ? FootstepsStageStatus.COMPLETED
        : requiredEnumValue(s.status, Object.values(FootstepsStageStatus), "Footsteps result status"),
    stepsPresented: requiredCount(s.stepsPresented, "stepsPresented"),
    stepsCompleted: requiredCount(s.stepsCompleted, "stepsCompleted"),
    durationMs: nullableTime(s.durationMs, "durationMs"),
    averageStepTimeMs: nullableTime(s.averageStepTimeMs, "averageStepTimeMs"),
  };
}

function reviveFootstepsSummary(raw: unknown): FootstepsSessionSummary {
  record(raw, "Footsteps summary");
  const s = raw as Partial<FootstepsSessionSummary> & { stageResults?: unknown; difficultiesPlayed?: unknown };
  return {
    sessionId: requiredString(s.sessionId, "sessionId"),
    childFirstName: requiredString(s.childFirstName, "childFirstName"),
    startingDifficulty: requiredDifficulty(s.startingDifficulty),
    difficultiesPlayed: requiredDifficulties(s.difficultiesPlayed),
    stageResults: valuesArray(s.stageResults).map(reviveFootstepsStageResult),
    totalStepsPresented: requiredCount(s.totalStepsPresented, "totalStepsPresented"),
    totalStepsCompleted: requiredCount(s.totalStepsCompleted, "totalStepsCompleted"),
    completionRate: safeRatio(s.totalStepsCompleted, s.totalStepsPresented),
    totalDurationMs: requiredTime(s.totalDurationMs, "totalDurationMs"),
    averageStepTimeMs: nullableTime(s.averageStepTimeMs, "averageStepTimeMs"),
    bestStage: optionalBestStage(s.bestStage),
    completedAt: requiredIsoDate(s.completedAt, "completedAt"),
  };
}

/**
 * MULTI-GAME PLATFORM — Bubble Pop Wall's own revive function, same
 * "RTDB drops empty arrays / null scalars on read-back" repair job
 * reviveSessionState performs for Balloon Quest, applied to
 * BubblePopSessionState's field names instead. See
 * lib/realtime/sessionRepository.ts's parseLiveSessionValue, which picks
 * between this and the other two revivers by the record's own `gameId`.
 */
export function reviveBubblePopSessionState(raw: unknown): BubblePopSessionState {
  validateSessionEnvelope(raw);
  const s = raw as Partial<BubblePopSessionState> & { results?: unknown; summary?: unknown };
  return {
    sessionId: s.sessionId as string,
    seed: s.seed as string,
    config: s.config as BubblePopSessionState["config"],
    ...workflowField(s.workflow),
    gameState: s.gameState as BubblePopSessionState["gameState"],
    currentDifficulty: s.currentDifficulty as Difficulty,
    currentStage: reviveBubblePopStageRuntime(s.currentStage),
    results: valuesArray(s.results).map(reviveBubblePopStageResult),
    createdAt: requiredTime(s.createdAt, "createdAt"),
    endedAt: nullableTime(s.endedAt, "endedAt"),
    summary: s.summary ? reviveBubblePopSummary(s.summary as BubblePopSessionSummary) : null,
  };
}

/**
 * Phase 2 — a plain color mission's `stationTokens` is an EMPTY array,
 * which RTDB drops on read-back just like any other empty array (see this
 * file's own doc comment). Bubble.stationTokens/requiresShape are
 * non-optional (task Part G relies on them always being present), so every
 * bubble needs its own repair pass, not just the top-level `bubbles` array.
 */
function reviveBubble(raw: unknown): Bubble {
  const b = record(raw, "bubble");
  const index = requiredCount(b.index, "bubble.index");
  // Pre-moving-ocean sessions stored a static {x,y} position instead of
  // lane/direction/travelMs. Preserve that legitimate legacy shape with a
  // calm deterministic motion profile; malformed coordinates still fail
  // closed rather than reaching CSS as NaN/undefined.
  const legacyPosition = b.lane === undefined ? requiredUnitPosition(b.position, "bubble.position") : null;
  return {
    id: requiredString(b.id, "bubble.id"),
    index,
    color: requiredEnumValue(b.color, Object.values(BubbleColor), "bubble.color"),
    shape: requiredEnumValue(b.shape, Object.values(BubbleShape), "bubble.shape"),
    lane: b.lane === undefined ? legacyPosition!.y : requiredUnitCoordinate(b.lane, "bubble.lane"),
    direction:
      b.direction === undefined
        ? index % 2 === 0
          ? BubbleMoveDirection.RIGHT_TO_LEFT
          : BubbleMoveDirection.LEFT_TO_RIGHT
        : requiredEnumValue(b.direction, Object.values(BubbleMoveDirection), "bubble.direction"),
    travelMs: b.travelMs === undefined ? 8_000 : requiredPositiveNumber(b.travelMs, "bubble.travelMs"),
    size: requiredNormalizedSize(b.size, "bubble.size"),
    isPopped: requiredBoolean(b.isPopped, "bubble.isPopped"),
    requiresShape: b.requiresShape === undefined ? false : requiredBoolean(b.requiresShape, "bubble.requiresShape"),
    stationTokens: valuesArray(b.stationTokens).map((rawToken) => {
      const token = record(rawToken, "bubble station token");
      return {
        color: requiredEnumValue(token.color, Object.values(BubbleColor), "stationToken.color"),
        shape: requiredEnumValue(token.shape, Object.values(BubbleShape), "stationToken.shape"),
      };
    }),
  };
}

function requiredUnitCoordinate(raw: unknown, label: string): number {
  const value = requiredFiniteNumber(raw, label);
  if (value < 0 || value > 1) throw new Error(`Invalid ${label}`);
  return value;
}

function requiredPositiveNumber(raw: unknown, label: string): number {
  const value = requiredFiniteNumber(raw, label);
  if (value <= 0) throw new Error(`Invalid ${label}`);
  return value;
}

function reviveBubblePopStageRuntime(raw: unknown): BubblePopStageRuntime {
  record(raw, "Bubble Pop stage");
  const s = raw as Partial<BubblePopStageRuntime> & { bubbles?: unknown; targetSequence?: unknown; responseTimesMs?: unknown };
  const bubbles = valuesArray(s.bubbles).map(reviveBubble);
  const targetSequence = valuesArray(s.targetSequence).map((value) => requiredString(value, "target id"));
  const currentTargetIndex = requiredCount(s.currentTargetIndex ?? 0, "currentTargetIndex");
  if (bubbles.length === 0 || targetSequence.length === 0 || currentTargetIndex > targetSequence.length) throw new Error("Invalid Bubble Pop progress");
  return {
    difficulty: requiredDifficulty(s.difficulty),
    stageNumber: requiredStageNumber(s.stageNumber),
    bubbles,
    targetSequence,
    currentTargetIndex,
    incorrectCount: requiredCount(s.incorrectCount ?? 0, "incorrectCount"),
    responseTimesMs: valuesArray(s.responseTimesMs).map((value) => requiredTime(value, "responseTime")),
    startedAt: nullableTime(s.startedAt, "startedAt"),
    completedAt: nullableTime(s.completedAt, "completedAt"),
    pausedAt: nullableTime(s.pausedAt, "pausedAt"),
    totalPausedMs: requiredTime(s.totalPausedMs ?? 0, "totalPausedMs"),
    targetStartedAt: nullableTime(s.targetStartedAt, "targetStartedAt"),
    targetPausedMs: requiredTime(s.targetPausedMs ?? 0, "targetPausedMs"),
    treasureProgress: requiredCount(s.treasureProgress ?? 0, "treasureProgress"),
  };
}

function reviveBubblePopStageResult(raw: unknown): BubblePopStageResult {
  record(raw, "Bubble Pop stage result");
  const s = raw as Partial<BubblePopStageResult>;
  return {
    difficulty: requiredDifficulty(s.difficulty),
    stageNumber: requiredStageNumber(s.stageNumber),
    status:
      s.status === undefined
        ? BubblePopStageStatus.COMPLETED
        : requiredEnumValue(s.status, Object.values(BubblePopStageStatus), "Bubble Pop result status"),
    targetsPresented: requiredCount(s.targetsPresented, "targetsPresented"),
    targetsCompleted: requiredCount(s.targetsCompleted, "targetsCompleted"),
    incorrectCount: requiredCount(s.incorrectCount ?? 0, "incorrectCount"),
    durationMs: nullableTime(s.durationMs, "durationMs"),
    averageResponseTimeMs: nullableTime(s.averageResponseTimeMs, "averageResponseTimeMs"),
  };
}

function reviveBubblePopSummary(raw: unknown): BubblePopSessionSummary {
  record(raw, "Bubble Pop summary");
  const s = raw as Partial<BubblePopSessionSummary> & { stageResults?: unknown; difficultiesPlayed?: unknown };
  return {
    sessionId: requiredString(s.sessionId, "sessionId"),
    childFirstName: requiredString(s.childFirstName, "childFirstName"),
    startingDifficulty: requiredDifficulty(s.startingDifficulty),
    difficultiesPlayed: requiredDifficulties(s.difficultiesPlayed),
    stageResults: valuesArray(s.stageResults).map(reviveBubblePopStageResult),
    totalTargetsPresented: requiredCount(s.totalTargetsPresented, "totalTargetsPresented"),
    totalTargetsCompleted: requiredCount(s.totalTargetsCompleted, "totalTargetsCompleted"),
    totalIncorrect: requiredCount(s.totalIncorrect ?? 0, "totalIncorrect"),
    completionRate: safeRatio(s.totalTargetsCompleted, s.totalTargetsPresented),
    accuracy: safeRatio(s.totalTargetsCompleted, sumFinite([finiteCount(s.totalTargetsCompleted), finiteCount(s.totalIncorrect ?? 0)])),
    totalDurationMs: requiredTime(s.totalDurationMs, "totalDurationMs"),
    averageResponseTimeMs: nullableTime(s.averageResponseTimeMs, "averageResponseTimeMs"),
    bestStage: optionalBestStage(s.bestStage),
    completedAt: requiredIsoDate(s.completedAt, "completedAt"),
  };
}

/**
 * MULTI-GAME PLATFORM — Feed the Animals' own revive function, same
 * "RTDB drops empty arrays / null scalars on read-back" repair job
 * reviveSessionState performs for Balloon Quest, applied to
 * FeedAnimalsSessionState's field names instead. See
 * lib/realtime/sessionRepository.ts's parseLiveSessionValue, which picks
 * between this and the other three revivers by the record's own `gameId`.
 */
export function reviveFeedAnimalsSessionState(raw: unknown): FeedAnimalsSessionState {
  validateSessionEnvelope(raw);
  const s = raw as Partial<FeedAnimalsSessionState> & { results?: unknown; summary?: unknown };
  return {
    sessionId: s.sessionId as string,
    seed: s.seed as string,
    config: s.config as FeedAnimalsSessionState["config"],
    ...workflowField(s.workflow),
    gameState: s.gameState as FeedAnimalsSessionState["gameState"],
    currentDifficulty: s.currentDifficulty as Difficulty,
    currentStage: reviveFeedAnimalsStageRuntime(s.currentStage),
    results: valuesArray(s.results).map(reviveFeedAnimalsStageResult),
    createdAt: requiredTime(s.createdAt, "createdAt"),
    endedAt: nullableTime(s.endedAt, "endedAt"),
    summary: s.summary ? reviveFeedAnimalsSummary(s.summary as FeedAnimalsSessionSummary) : null,
  };
}

function reviveFeedAnimalsStageRuntime(raw: unknown): FeedAnimalsStageRuntime {
  record(raw, "Feed Animals stage");
  const s = raw as Partial<FeedAnimalsStageRuntime> & { rounds?: unknown; responseTimesMs?: unknown };
  const kind = s.kind === undefined ? "rounds" : requiredEnumValue(s.kind, ["rounds", "path"] as const, "Feed Animals stage kind");
  const rounds = valuesArray(s.rounds).map(reviveFeedRound);
  const currentRoundIndex = requiredCount(s.currentRoundIndex ?? 0, "currentRoundIndex");
  if (kind === "rounds" && (rounds.length === 0 || currentRoundIndex > rounds.length)) throw new Error("Invalid Feed Animals rounds");
  const legIndex = requiredCount(s.legIndex ?? 0, "legIndex");
  const pathProgressStep = requiredCount(s.pathProgressStep ?? 0, "pathProgressStep");
  if (kind === "path") {
    const path = getFeedAnimalsPathStage(requiredDifficulty(s.difficulty), requiredStageNumber(s.stageNumber));
    const leg = path?.legs[legIndex];
    if (!leg || pathProgressStep > leg.totalSteps) throw new Error("Invalid Feed Animals path progress");
  }
  return {
    // SAFARI ANIMAL ADVENTURE PROTOTYPE — defaults to "rounds" so an
    // in-flight OLD session record (published before this field existed)
    // still revives correctly as the original mechanic.
    kind,
    difficulty: requiredDifficulty(s.difficulty),
    stageNumber: requiredStageNumber(s.stageNumber),
    rounds,
    currentRoundIndex,
    legIndex,
    pathProgressStep,
    incorrectCount: requiredCount(s.incorrectCount ?? 0, "incorrectCount"),
    responseTimesMs: valuesArray(s.responseTimesMs).map((value) => requiredTime(value, "responseTime")),
    startedAt: nullableTime(s.startedAt, "startedAt"),
    completedAt: nullableTime(s.completedAt, "completedAt"),
    pausedAt: nullableTime(s.pausedAt, "pausedAt"),
    totalPausedMs: requiredTime(s.totalPausedMs ?? 0, "totalPausedMs"),
    roundStartedAt: nullableTime(s.roundStartedAt, "roundStartedAt"),
    roundPausedMs: requiredTime(s.roundPausedMs ?? 0, "roundPausedMs"),
  };
}

function reviveFeedRound(raw: unknown): FeedRound {
  const s = record(raw, "Feed Animals round");
  const animal = requiredEnumValue(s.animal, Object.values(Animal), "round.animal");
  const correctFood = requiredEnumValue(s.correctFood, Object.values(Food), "round.correctFood");
  const choices = valuesArray(s.choices).map((rawChoice) => {
    const choice = record(rawChoice, "food choice");
    return {
      id: requiredString(choice.id, "foodChoice.id"),
      food: requiredEnumValue(choice.food, Object.values(Food), "foodChoice.food"),
      position: requiredUnitPosition(choice.position, "foodChoice.position"),
      size: requiredNormalizedSize(choice.size, "foodChoice.size"),
    };
  });
  if (ANIMAL_FOOD_MAP[animal] !== correctFood || choices.filter((choice) => choice.food === correctFood).length !== 1) {
    throw new Error("Invalid Feed Animals correct choice");
  }
  return {
    id: requiredString(s.id, "round.id"),
    animal,
    correctFood,
    animalPosition: requiredUnitPosition(s.animalPosition, "round.animalPosition"),
    choices,
    fed: s.fed === undefined ? false : requiredBoolean(s.fed, "round.fed"),
  };
}

function reviveFeedAnimalsStageResult(raw: unknown): FeedAnimalsStageResult {
  record(raw, "Feed Animals stage result");
  const s = raw as Partial<FeedAnimalsStageResult>;
  return {
    difficulty: requiredDifficulty(s.difficulty),
    stageNumber: requiredStageNumber(s.stageNumber),
    status:
      s.status === undefined
        ? FeedAnimalsStageStatus.COMPLETED
        : requiredEnumValue(s.status, Object.values(FeedAnimalsStageStatus), "Feed Animals result status"),
    roundsPresented: requiredCount(s.roundsPresented, "roundsPresented"),
    roundsCompleted: requiredCount(s.roundsCompleted, "roundsCompleted"),
    incorrectCount: requiredCount(s.incorrectCount ?? 0, "incorrectCount"),
    durationMs: nullableTime(s.durationMs, "durationMs"),
    averageResponseTimeMs: nullableTime(s.averageResponseTimeMs, "averageResponseTimeMs"),
  };
}

function reviveFeedAnimalsSummary(raw: unknown): FeedAnimalsSessionSummary {
  record(raw, "Feed Animals summary");
  const s = raw as Partial<FeedAnimalsSessionSummary> & { stageResults?: unknown; difficultiesPlayed?: unknown };
  return {
    sessionId: requiredString(s.sessionId, "sessionId"),
    childFirstName: requiredString(s.childFirstName, "childFirstName"),
    startingDifficulty: requiredDifficulty(s.startingDifficulty),
    difficultiesPlayed: requiredDifficulties(s.difficultiesPlayed),
    stageResults: valuesArray(s.stageResults).map(reviveFeedAnimalsStageResult),
    totalRoundsPresented: requiredCount(s.totalRoundsPresented, "totalRoundsPresented"),
    totalRoundsCompleted: requiredCount(s.totalRoundsCompleted, "totalRoundsCompleted"),
    totalIncorrect: requiredCount(s.totalIncorrect ?? 0, "totalIncorrect"),
    completionRate: safeRatio(s.totalRoundsCompleted, s.totalRoundsPresented),
    accuracy: safeRatio(s.totalRoundsCompleted, sumFinite([finiteCount(s.totalRoundsCompleted), finiteCount(s.totalIncorrect ?? 0)])),
    totalDurationMs: requiredTime(s.totalDurationMs, "totalDurationMs"),
    averageResponseTimeMs: nullableTime(s.averageResponseTimeMs, "averageResponseTimeMs"),
    bestStage: optionalBestStage(s.bestStage),
    completedAt: requiredIsoDate(s.completedAt, "completedAt"),
  };
}

/**
 * MULTI-GAME PLATFORM — Space Pilot's own revive function, same "RTDB drops
 * empty arrays / null scalars on read-back" repair job as every other
 * reviver in this file. Space Pilot has no `results`/`difficultiesPlayed`
 * concept (single fixed level, see lib/spacepilot/session.ts's doc
 * comment) so this is the shortest of the five revivers.
 */
export function reviveSpacePilotSessionState(raw: unknown): SpacePilotSessionState {
  validateSessionEnvelope(raw);
  const s = raw as Partial<SpacePilotSessionState> & { summary?: unknown };
  return {
    sessionId: s.sessionId as string,
    seed: s.seed as string,
    config: s.config as SpacePilotSessionState["config"],
    ...workflowField(s.workflow),
    gameState: s.gameState as SpacePilotSessionState["gameState"],
    currentDifficulty: s.currentDifficulty as Difficulty,
    currentStage: reviveSpacePilotStageRuntime(s.currentStage),
    createdAt: requiredTime(s.createdAt, "createdAt"),
    endedAt: nullableTime(s.endedAt, "endedAt"),
    summary: s.summary ? reviveSpacePilotSummary(s.summary as SpacePilotSessionSummary) : null,
  };
}

function reviveSpacePilotStar(raw: unknown): CollectibleStar {
  const s = record(raw, "Space Pilot star");
  return {
    id: requiredString(s.id, "star.id"),
    index: requiredCount(s.index, "star.index"),
    lane: requiredEnumValue(s.lane, Object.values(StarLane), "star.lane"),
    status: s.status === undefined ? CollectibleStarStatus.PENDING : requiredEnumValue(s.status, Object.values(CollectibleStarStatus), "star.status"),
  };
}

function reviveSpacePilotEncounter(raw: unknown): SpaceEncounter {
  const e = record(raw, "Space Pilot encounter");
  return {
    id: requiredString(e.id, "encounter.id"),
    index: requiredCount(e.index, "encounter.index"),
    type: requiredEnumValue(e.type, Object.values(EncounterType), "encounter.type"),
    lane: requiredEnumValue(e.lane, Object.values(StarLane), "encounter.lane"),
    status: e.status === undefined ? EncounterOutcome.PENDING : requiredEnumValue(e.status, Object.values(EncounterOutcome), "encounter.status"),
  };
}

/** MEDIUM/ADVANCED's runtime carries `encounters` instead of EASY's `stars` — that's the only reliable discriminator once `kind` has round-tripped through Firebase's own undefined-vs-missing ambiguity (see this file's own doc comment above). */
function reviveSpacePilotEncounterStageRuntime(raw: Partial<SpacePilotEncounterStageRuntime> & { encounters?: unknown }): SpacePilotEncounterStageRuntime {
  const encounters = valuesArray(raw.encounters).map(reviveSpacePilotEncounter);
  const currentEncounterIndex = requiredCount(raw.currentEncounterIndex ?? 0, "currentEncounterIndex");
  if (encounters.length === 0 || currentEncounterIndex > encounters.length) throw new Error("Invalid Space Pilot encounters");
  return {
    kind: "ENCOUNTER",
    encounters,
    currentEncounterIndex,
    collectedStars: requiredCount(raw.collectedStars ?? 0, "collectedStars"),
    asteroidsCleared: requiredCount(raw.asteroidsCleared ?? 0, "asteroidsCleared"),
    asteroidsAvoided: requiredCount(raw.asteroidsAvoided ?? 0, "asteroidsAvoided"),
    rocketLane: raw.rocketLane === undefined ? StarLane.MIDDLE : requiredEnumValue(raw.rocketLane, Object.values(StarLane), "rocketLane"),
    startedAt: nullableTime(raw.startedAt, "startedAt"),
    completedAt: nullableTime(raw.completedAt, "completedAt"),
    pausedAt: nullableTime(raw.pausedAt, "pausedAt"),
    totalPausedMs: requiredTime(raw.totalPausedMs ?? 0, "totalPausedMs"),
    lastFiredAt: nullableTime(raw.lastFiredAt, "lastFiredAt"),
  };
}

function reviveSpacePilotStageRuntime(raw: unknown): SpacePilotAnyStageRuntime {
  record(raw, "Space Pilot stage");
  const s = (raw ?? {}) as Partial<SpacePilotStageRuntime> & Partial<SpacePilotEncounterStageRuntime> & { stars?: unknown; encounters?: unknown };
  if (s.encounters !== undefined) return reviveSpacePilotEncounterStageRuntime(s);
  const stars = valuesArray(s.stars).map(reviveSpacePilotStar);
  const currentStarIndex = requiredCount(s.currentStarIndex ?? 0, "currentStarIndex");
  if (stars.length === 0 || currentStarIndex > stars.length) throw new Error("Invalid Space Pilot stars");
  return {
    kind: "STAR_ONLY",
    stars,
    currentStarIndex,
    collectedCount: requiredCount(s.collectedCount ?? 0, "collectedCount"),
    rocketLane: s.rocketLane === undefined ? StarLane.MIDDLE : requiredEnumValue(s.rocketLane, Object.values(StarLane), "rocketLane"),
    startedAt: nullableTime(s.startedAt, "startedAt"),
    completedAt: nullableTime(s.completedAt, "completedAt"),
    pausedAt: nullableTime(s.pausedAt, "pausedAt"),
    totalPausedMs: requiredTime(s.totalPausedMs ?? 0, "totalPausedMs"),
  };
}

function reviveSpacePilotSummary(raw: unknown): SpacePilotSessionSummary {
  record(raw, "Space Pilot summary");
  const s = raw as Partial<SpacePilotSessionSummary>;
  return {
    sessionId: requiredString(s.sessionId, "sessionId"),
    childFirstName: requiredString(s.childFirstName, "childFirstName"),
    difficulty: requiredDifficulty(s.difficulty),
    starsPresented: requiredCount(s.starsPresented, "starsPresented"),
    starsCollected: requiredCount(s.starsCollected, "starsCollected"),
    collectionRate: safeRatio(s.starsCollected, s.starsPresented),
    finalUpgradeLevel: requiredCount(s.finalUpgradeLevel ?? s.starsCollected, "finalUpgradeLevel"),
    asteroidsCleared: s.asteroidsCleared == null ? null : requiredCount(s.asteroidsCleared, "asteroidsCleared"),
    asteroidsAvoided: s.asteroidsAvoided == null ? null : requiredCount(s.asteroidsAvoided, "asteroidsAvoided"),
    totalDurationMs: nullableTime(s.totalDurationMs, "totalDurationMs"),
    completedAt: requiredIsoDate(s.completedAt, "completedAt"),
  };
}

function reviveSummary(raw: unknown): SessionSummary {
  record(raw, "Balloon summary");
  const s = raw as Partial<SessionSummary> & { stageResults?: unknown; difficultiesPlayed?: unknown };
  return {
    sessionId: requiredString(s.sessionId, "sessionId"),
    childFirstName: requiredString(s.childFirstName, "childFirstName"),
    startingDifficulty: requiredDifficulty(s.startingDifficulty),
    difficultiesPlayed: requiredDifficulties(s.difficultiesPlayed),
    stageResults: valuesArray(s.stageResults).map(reviveStageResult),
    totalCorrect: requiredCount(s.totalCorrect, "totalCorrect"),
    totalIncorrect: requiredCount(s.totalIncorrect, "totalIncorrect"),
    overallAccuracy: safeRatio(s.totalCorrect, sumFinite([finiteCount(s.totalCorrect), finiteCount(s.totalIncorrect)])),
    totalDurationMs: requiredTime(s.totalDurationMs, "totalDurationMs"),
    averageReactionTimeMs: nullableTime(s.averageReactionTimeMs, "averageReactionTimeMs"),
    bestStage: optionalBestStage(s.bestStage),
    completedAt: requiredIsoDate(s.completedAt, "completedAt"),
  };
}

import { getAdjacentDifficulty, GameState, isSequentialStageTarget, STAGES_PER_DIFFICULTY, transition } from "@/lib/game";
import type { SessionWorkflowMetadata } from "@/lib/sessions/workflowMetadata";
import { safeElapsedMs } from "@/lib/dataIntegrity/numeric";
import { averageColorChaseResponse, buildColorChaseSummary, colorChaseAccuracy } from "./scoring";
import { getColorChaseStagePlan } from "./stagePlans";
import {
  ColorChaseStageStatus,
  Difficulty,
  type ColorChaseActionResult,
  type ColorChaseSessionState,
  type ColorChaseStageResult,
  type ColorChaseStageRuntime,
  type ConfirmPadInput,
  type StageNumber,
} from "./types";

export const PAD_INPUT_BOUNCE_MS = 450;

function stageRuntime(difficulty: Difficulty, stageNumber: StageNumber): ColorChaseStageRuntime {
  return {
    difficulty,
    stageNumber,
    plan: getColorChaseStagePlan(difficulty, stageNumber),
    currentStepIndex: 0,
    correctCount: 0,
    incorrectCount: 0,
    dangerPressCount: 0,
    responseTimesMs: [],
    startedAt: null,
    completedAt: null,
    pausedAt: null,
    totalPausedMs: 0,
    stepStartedAt: null,
    stepPausedMs: 0,
    processedInputIds: [],
    lastAcceptedInput: null,
  };
}

export function createColorChaseSession(params: {
  childFirstName: string;
  difficulty: Difficulty;
  startingStage?: StageNumber;
  seed?: string;
  now?: number;
  workflow?: SessionWorkflowMetadata;
}): ColorChaseSessionState {
  const startingStage = params.startingStage ?? 1;
  const seed = params.seed ?? randomToken();
  return {
    sessionId: randomToken(),
    seed,
    config: { childFirstName: params.childFirstName, difficulty: params.difficulty, startingStage },
    gameState: GameState.WELCOME,
    currentDifficulty: params.difficulty,
    currentStage: stageRuntime(params.difficulty, startingStage),
    results: [],
    createdAt: params.now ?? Date.now(),
    endedAt: null,
    summary: null,
    ...(params.workflow ? { workflow: params.workflow } : {}),
  };
}

export function currentColorChaseStep(stage: ColorChaseStageRuntime) {
  return stage.plan.steps[stage.currentStepIndex] ?? null;
}

export function applyColorChaseTransition(state: ColorChaseSessionState, to: GameState, timestamp: number): ColorChaseActionResult {
  if (safeElapsedMs(timestamp, state.createdAt) === null) return { success: false, state, reason: "Invalid action timestamp." };
  const result = transition(state.gameState, to);
  if (!result.success) return { success: false, state, reason: result.reason };
  const next = { ...state, gameState: result.state };
  if (to !== GameState.PLAYING || state.currentStage.startedAt !== null) return { success: true, state: next };
  return { success: true, state: { ...next, currentStage: { ...next.currentStage, startedAt: timestamp, stepStartedAt: timestamp } } };
}

/** Canonical controller/sensor boundary. No DOM or transport assumptions. */
export function confirmColorChasePad(state: ColorChaseSessionState, input: ConfirmPadInput): ColorChaseActionResult {
  if (safeElapsedMs(input.timestamp, state.createdAt) === null) return { success: false, state, reason: "Invalid action timestamp." };
  if (state.gameState !== GameState.PLAYING) return { success: false, state, reason: "Pads are only active while PLAYING." };
  const stage = state.currentStage;
  if (stage.pausedAt !== null) return { success: false, state, reason: "Cannot confirm a pad while paused." };
  if (stage.processedInputIds.includes(input.inputId)) return { success: true, state, outcome: "duplicate" };
  if (stage.lastAcceptedInput?.padId === input.padId && input.timestamp - stage.lastAcceptedInput.timestamp < PAD_INPUT_BOUNCE_MS) {
    return { success: true, state, outcome: "duplicate" };
  }
  const current = currentColorChaseStep(stage);
  if (!current) return { success: false, state, reason: "Stage already complete." };
  const common = {
    processedInputIds: [...stage.processedInputIds.slice(-63), input.inputId],
    lastAcceptedInput: { padId: input.padId, timestamp: input.timestamp },
  };
  if (stage.plan.dangerPadIds.includes(input.padId)) {
    return { success: true, outcome: "danger", state: { ...state, currentStage: { ...stage, ...common, dangerPressCount: stage.dangerPressCount + 1 } } };
  }
  if (input.padId !== current.correctPadId) {
    return { success: true, outcome: "incorrect", state: { ...state, currentStage: { ...stage, ...common, incorrectCount: stage.incorrectCount + 1 } } };
  }
  const response = safeElapsedMs(input.timestamp, stage.stepStartedAt ?? input.timestamp, stage.stepPausedMs);
  const nextIndex = stage.currentStepIndex + 1;
  const updated: ColorChaseStageRuntime = {
    ...stage,
    ...common,
    currentStepIndex: nextIndex,
    correctCount: stage.correctCount + 1,
    responseTimesMs: response === null ? stage.responseTimesMs : [...stage.responseTimesMs, response],
    stepStartedAt: input.timestamp,
    stepPausedMs: 0,
  };
  let nextState = { ...state, currentStage: updated };
  if (nextIndex >= stage.plan.steps.length) {
    nextState = finalizeCurrentStage(nextState, input.timestamp, ColorChaseStageStatus.COMPLETED);
    const completed = transition(nextState.gameState, GameState.STAGE_COMPLETE);
    if (completed.success) nextState = { ...nextState, gameState: completed.state };
  }
  return { success: true, state: nextState, outcome: "correct" };
}

export function pauseColorChaseSession(state: ColorChaseSessionState, timestamp: number): ColorChaseActionResult {
  if (safeElapsedMs(timestamp, state.createdAt) === null) return { success: false, state, reason: "Invalid action timestamp." };
  if (state.gameState !== GameState.PLAYING || state.currentStage.pausedAt !== null) return { success: false, state, reason: "Cannot pause now." };
  return { success: true, state: { ...state, currentStage: { ...state.currentStage, pausedAt: timestamp } } };
}

export function resumeColorChaseSession(state: ColorChaseSessionState, timestamp: number): ColorChaseActionResult {
  if (safeElapsedMs(timestamp, state.createdAt) === null) return { success: false, state, reason: "Invalid action timestamp." };
  const stage = state.currentStage;
  if (state.gameState !== GameState.PLAYING || stage.pausedAt === null) return { success: false, state, reason: "Cannot resume now." };
  const duration = safeElapsedMs(timestamp, stage.pausedAt);
  if (duration === null) return { success: false, state, reason: "Invalid pause timestamp." };
  return { success: true, state: { ...state, currentStage: { ...stage, pausedAt: null, totalPausedMs: stage.totalPausedMs + duration, stepPausedMs: stage.stepPausedMs + duration } } };
}

export function restartColorChaseStage(state: ColorChaseSessionState, timestamp: number): ColorChaseActionResult {
  if (safeElapsedMs(timestamp, state.createdAt) === null) return { success: false, state, reason: "Invalid action timestamp." };
  if (state.gameState !== GameState.PLAYING) return { success: false, state, reason: "Can only restart while playing." };
  return { success: true, state: { ...state, currentStage: { ...stageRuntime(state.currentDifficulty, state.currentStage.stageNumber), startedAt: timestamp, stepStartedAt: timestamp } } };
}

export function jumpToColorChaseStage(state: ColorChaseSessionState, target: StageNumber, timestamp: number): ColorChaseActionResult {
  if (safeElapsedMs(timestamp, state.createdAt) === null) return { success: false, state, reason: "Invalid action timestamp." };
  if (target === state.currentStage.stageNumber) return { success: true, state };
  const valid = [GameState.START_ZONE, GameState.INSTRUCTIONS, GameState.COUNTDOWN, GameState.PLAYING, GameState.STAGE_COMPLETE].includes(state.gameState);
  if (!valid) return { success: false, state, reason: "Cannot jump now." };
  const next = state.gameState === GameState.STAGE_COMPLETE || state.gameState === GameState.START_ZONE ? state : finalizeCurrentStage(state, timestamp, ColorChaseStageStatus.SKIPPED);
  return enterStage(next, state.currentDifficulty, target);
}

export function switchColorChaseDifficulty(state: ColorChaseSessionState, difficulty: Difficulty, timestamp: number): ColorChaseActionResult {
  if (safeElapsedMs(timestamp, state.createdAt) === null) return { success: false, state, reason: "Invalid action timestamp." };
  if (difficulty === state.currentDifficulty) return { success: true, state };
  const valid = [GameState.START_ZONE, GameState.INSTRUCTIONS, GameState.COUNTDOWN, GameState.PLAYING, GameState.STAGE_COMPLETE].includes(state.gameState);
  if (!valid) return { success: false, state, reason: "Cannot change difficulty now." };
  const finalized = state.gameState === GameState.STAGE_COMPLETE || state.gameState === GameState.START_ZONE ? state : finalizeCurrentStage(state, timestamp, ColorChaseStageStatus.SKIPPED);
  return enterStage(finalized, difficulty, 1);
}

export function skipColorChaseStage(state: ColorChaseSessionState, timestamp: number): ColorChaseActionResult {
  const next = state.currentStage.stageNumber + 1;
  return next > STAGES_PER_DIFFICULTY ? { success: false, state, reason: "Last stage." } : jumpToColorChaseStage(state, next as StageNumber, timestamp);
}

export function advanceColorChaseStage(state: ColorChaseSessionState, target: { difficulty: Difficulty; stageNumber: StageNumber }): ColorChaseActionResult {
  if (state.gameState !== GameState.STAGE_COMPLETE) return { success: false, state, reason: "Can only advance after completion." };
  const same = isSequentialStageTarget({ difficulty: state.currentDifficulty, stageNumber: state.currentStage.stageNumber }, target);
  const adjacent = target.stageNumber === state.currentStage.stageNumber && (getAdjacentDifficulty(state.currentDifficulty, "easier") === target.difficulty || getAdjacentDifficulty(state.currentDifficulty, "harder") === target.difficulty);
  return same || adjacent ? enterStage(state, target.difficulty, target.stageNumber) : { success: false, state, reason: "Invalid advance." };
}

function enterStage(state: ColorChaseSessionState, difficulty: Difficulty, stageNumber: StageNumber): ColorChaseActionResult {
  const result = state.gameState === GameState.START_ZONE ? { success: true as const, state: GameState.START_ZONE } : transition(state.gameState, GameState.START_ZONE);
  if (!result.success) return { success: false, state, reason: result.reason };
  return { success: true, state: { ...state, gameState: result.state, currentDifficulty: difficulty, currentStage: stageRuntime(difficulty, stageNumber) } };
}

export function endColorChaseSession(state: ColorChaseSessionState, timestamp: number): ColorChaseActionResult {
  const totalDurationMs = safeElapsedMs(timestamp, state.createdAt);
  if (totalDurationMs === null) return { success: false, state, reason: "Invalid session timestamp." };
  if (state.gameState === GameState.SESSION_COMPLETE) return { success: false, state, reason: "Session already ended." };
  const active = [GameState.INSTRUCTIONS, GameState.COUNTDOWN, GameState.PLAYING].includes(state.gameState);
  const finalized = active ? finalizeCurrentStage(state, timestamp, ColorChaseStageStatus.SKIPPED) : state;
  const summary = buildColorChaseSummary({
    sessionId: finalized.sessionId,
    childFirstName: finalized.config.childFirstName,
    startingDifficulty: finalized.config.difficulty,
    stageResults: finalized.results,
    totalDurationMs,
    completedAt: new Date(timestamp).toISOString(),
  });
  return { success: true, state: { ...finalized, gameState: GameState.SESSION_COMPLETE, endedAt: timestamp, summary } };
}

function finalizeCurrentStage(state: ColorChaseSessionState, timestamp: number, status: ColorChaseStageStatus): ColorChaseSessionState {
  const stage = state.currentStage;
  if (stage.completedAt !== null) return state;
  const openPauseMs = stage.pausedAt === null ? 0 : safeElapsedMs(timestamp, stage.pausedAt);
  const result: ColorChaseStageResult = {
    difficulty: stage.difficulty,
    stageNumber: stage.stageNumber,
    status,
    targetsPresented: stage.plan.steps.length,
    correctCount: stage.correctCount,
    incorrectCount: stage.incorrectCount,
    dangerPressCount: stage.dangerPressCount,
    accuracy: status === ColorChaseStageStatus.SKIPPED && stage.correctCount + stage.incorrectCount + stage.dangerPressCount === 0 ? null : colorChaseAccuracy(stage.correctCount, stage.incorrectCount, stage.dangerPressCount),
    durationMs: stage.startedAt === null || openPauseMs === null ? null : safeElapsedMs(timestamp, stage.startedAt, stage.totalPausedMs + openPauseMs),
    averageResponseTimeMs: averageColorChaseResponse(stage.responseTimesMs),
  };
  return { ...state, currentStage: { ...stage, completedAt: timestamp }, results: [...state.results, result] };
}

function randomToken(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

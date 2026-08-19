import { getAdjacentDifficulty, GameState, isSequentialStageTarget, STAGES_PER_DIFFICULTY, transition } from "@/lib/game";
import type { SessionWorkflowMetadata } from "@/lib/sessions/workflowMetadata";
import { generateFootstepsPath, type GeneratedFootstepsPath } from "./pathGenerator";
import { buildFootstepsSessionSummary, finalizeFootstepsStageResult } from "./scoring";
import {
  Difficulty,
  type Footprint,
  type FootstepsSessionConfig,
  type FootstepsSessionSummary,
  type FootstepsStageResult,
  FootstepsStageStatus,
  type NormalizedPosition,
  type PathStyle,
  type PathWidth,
  type RouteCheckpoint,
  type RouteObstacle,
  type StageNumber,
  type StepLength,
} from "./types";
import { safeElapsedMs } from "@/lib/dataIntegrity/numeric";

/** Runtime state for the one currently-active stage: its generated footprints plus everything tracked during play. */
export interface FootstepsStageRuntime {
  difficulty: Difficulty;
  stageNumber: StageNumber;
  footprints: Footprint[];
  checkpoints: RouteCheckpoint[];
  obstacles: RouteObstacle[];
  destination: NormalizedPosition;
  totalSteps: number;
  /** 0-indexed pointer to the CURRENT (next-to-confirm) footprint. Equal to totalSteps once every footprint is confirmed. Footprints at index < currentIndex are completed; index === currentIndex is the active one; index > currentIndex are previews. */
  currentIndex: number;
  stepTimesMs: number[];
  /** Epoch ms when this stage's PLAYING phase began; null until then. */
  startedAt: number | null;
  /** Epoch ms when this stage was finalized (completed or skipped). */
  completedAt: number | null;
  /** Epoch ms this stage was paused at; null when not currently paused. */
  pausedAt: number | null;
  /** Cumulative paused duration for the whole stage, excluded from stage duration. */
  totalPausedMs: number;
  /** Epoch ms the CURRENT footprint became active — the baseline step timing is measured from (paused time excluded via stepPausedMs). */
  stepStartedAt: number | null;
  /** Paused ms accumulated specifically since the current footprint became active — reset every time currentIndex advances. */
  stepPausedMs: number;
}

/**
 * The full state of one Follow the Footsteps session. Immutable — every
 * action returns a new FootstepsSessionState. Mirrors lib/game/session.ts's
 * SessionState navigation model exactly (lazy per-stage generation, forward-
 * only jump, always returning through START_ZONE between stages) so the
 * platform's realtime/state-machine guarantees apply identically to both
 * games — see lib/game/stateMachine.ts's transition(), reused here unchanged.
 */
export interface FootstepsSessionState {
  sessionId: string;
  seed: string;
  config: FootstepsSessionConfig;
  gameState: GameState;
  currentDifficulty: Difficulty;
  currentStage: FootstepsStageRuntime;
  results: FootstepsStageResult[];
  createdAt: number;
  endedAt: number | null;
  summary: FootstepsSessionSummary | null;
  workflow?: SessionWorkflowMetadata;
}

export type FootstepsActionResult =
  | { success: true; state: FootstepsSessionState }
  | { success: false; state: FootstepsSessionState; reason: string };

export interface CreateFootstepsSessionParams {
  childFirstName: string;
  difficulty: Difficulty;
  stepLength: StepLength;
  pathStyle: PathStyle;
  pathWidth: PathWidth;
  startingStage?: StageNumber;
  seed?: string;
  now?: number;
  workflow?: SessionWorkflowMetadata;
}

function stageRuntimeFromGenerated(generated: GeneratedFootstepsPath, difficulty: Difficulty): FootstepsStageRuntime {
  return {
    difficulty,
    stageNumber: generated.stageNumber,
    footprints: generated.footprints,
    checkpoints: generated.checkpoints,
    obstacles: generated.obstacles,
    destination: generated.destination,
    totalSteps: generated.totalSteps,
    currentIndex: 0,
    stepTimesMs: [],
    startedAt: null,
    completedAt: null,
    pausedAt: null,
    totalPausedMs: 0,
    stepStartedAt: null,
    stepPausedMs: 0,
  };
}

export function createFootstepsSession(params: CreateFootstepsSessionParams): FootstepsSessionState {
  const startingStage = params.startingStage ?? 1;
  const config: FootstepsSessionConfig = {
    childFirstName: params.childFirstName,
    difficulty: params.difficulty,
    stepLength: params.stepLength,
    pathStyle: params.pathStyle,
    pathWidth: params.pathWidth,
    startingStage,
  };
  const seed = params.seed ?? randomToken();

  const generated = generateFootstepsPath({ seed, difficulty: config.difficulty, stageNumber: startingStage, config });

  return {
    sessionId: randomToken(),
    seed,
    config,
    gameState: GameState.WELCOME,
    currentDifficulty: config.difficulty,
    currentStage: stageRuntimeFromGenerated(generated, config.difficulty),
    results: [],
    createdAt: params.now ?? Date.now(),
    endedAt: null,
    summary: null,
    ...(params.workflow ? { workflow: params.workflow } : {}),
  };
}

/**
 * Applies a WELCOME -> SETUP -> INSTRUCTIONS -> COUNTDOWN -> PLAYING style
 * transition — reuses lib/game/stateMachine.ts's transition() directly
 * (pure over GameState alone, no balloon dependency). Entering PLAYING
 * stamps the current footprint's step-timing baseline.
 */
export function applyFootstepsGameTransition(state: FootstepsSessionState, to: GameState, timestamp: number): FootstepsActionResult {
  if (safeElapsedMs(timestamp, state.createdAt) === null) return { success: false, state, reason: "Invalid action timestamp." };
  const result = transition(state.gameState, to);
  if (!result.success) {
    return { success: false, state, reason: result.reason };
  }

  let nextState: FootstepsSessionState = { ...state, gameState: result.state };
  if (to === GameState.PLAYING) {
    nextState = stampStepStart(nextState, timestamp);
  }
  return { success: true, state: nextState };
}

/** Same "continue same difficulty" / "step to the adjacent easier/harder difficulty at the same stage number" decision as Balloon Quest's advanceToStage. */
export function advanceFootstepsStage(
  state: FootstepsSessionState,
  target: { difficulty: Difficulty; stageNumber: StageNumber },
  /**
   * THERAPIST SETUP SIMPLIFICATION (task section 53) — the calling hook's
   * freshly-resolved preset technical fields for `target.difficulty`
   * (getFootstepsStagePreset(target.difficulty, target.stageNumber).config),
   * passed only when this is an actual difficulty change. Ignored/omitted on
   * a same-difficulty "continue" — config is stage-invariant within one
   * difficulty by design, so nothing needs to be re-resolved there. Mirrors
   * lib/game/session.ts's advanceToStage exactly.
   */
  presetFields?: Pick<FootstepsSessionConfig, "stepLength" | "pathStyle" | "pathWidth">,
): FootstepsActionResult {
  if (state.gameState !== GameState.STAGE_COMPLETE) {
    return { success: false, state, reason: "Can only advance from STAGE_COMPLETE." };
  }

  const current = state.currentStage;
  const sameDifficulty = target.difficulty === state.currentDifficulty;
  const isContinue = isSequentialStageTarget({ difficulty: state.currentDifficulty, stageNumber: current.stageNumber }, target);
  const isDifficultyChange =
    !sameDifficulty &&
    target.stageNumber === current.stageNumber &&
    (getAdjacentDifficulty(state.currentDifficulty, "easier") === target.difficulty ||
      getAdjacentDifficulty(state.currentDifficulty, "harder") === target.difficulty);

  if (!isContinue && !isDifficultyChange) {
    return {
      success: false,
      state,
      reason: `Invalid stage advance: ${state.currentDifficulty}#${current.stageNumber} -> ${target.difficulty}#${target.stageNumber}`,
    };
  }

  return enterFootstepsStage(state, target.difficulty, target.stageNumber, !sameDifficulty ? presetFields : undefined);
}

/** Direct navigation to any other stage; only the entered attempt being left is recorded as skipped. */
export function jumpToFootstepsStage(state: FootstepsSessionState, targetStageNumber: StageNumber, timestamp: number): FootstepsActionResult {
  if (safeElapsedMs(timestamp, state.createdAt) === null) return { success: false, state, reason: "Invalid action timestamp." };
  const validFrom: readonly GameState[] = [GameState.START_ZONE, GameState.INSTRUCTIONS, GameState.COUNTDOWN, GameState.PLAYING, GameState.STAGE_COMPLETE];
  if (!validFrom.includes(state.gameState)) {
    return { success: false, state, reason: "Can only navigate stages while a stage is active or just completed." };
  }

  const currentStageNumber = state.currentStage.stageNumber;
  if (targetStageNumber === currentStageNumber) return { success: true, state };

  const alreadyFinalized = state.gameState === GameState.STAGE_COMPLETE;
  const stateWithCurrentFinalized = alreadyFinalized || state.gameState === GameState.START_ZONE ? state : finalizeCurrentFootstepsStage(state, timestamp, FootstepsStageStatus.SKIPPED);

  return enterFootstepsStage(stateWithCurrentFinalized, state.currentDifficulty, targetStageNumber);
}

export function switchFootstepsDifficulty(
  state: FootstepsSessionState,
  difficulty: Difficulty,
  timestamp: number,
  presetFields: Pick<FootstepsSessionConfig, "stepLength" | "pathStyle" | "pathWidth">,
): FootstepsActionResult {
  if (difficulty === state.currentDifficulty) return { success: true, state };
  const valid = [GameState.START_ZONE, GameState.INSTRUCTIONS, GameState.COUNTDOWN, GameState.PLAYING, GameState.STAGE_COMPLETE].includes(state.gameState);
  if (!valid) return { success: false, state, reason: "Cannot change difficulty now." };
  const finalized = state.gameState === GameState.STAGE_COMPLETE || state.gameState === GameState.START_ZONE ? state : finalizeCurrentFootstepsStage(state, timestamp, FootstepsStageStatus.SKIPPED);
  return enterFootstepsStage(finalized, difficulty, 1, presetFields);
}

/** Ends the CURRENT stage early and moves to stageNumber + 1 in the same difficulty — the therapist's "تخطي المرحلة". Rejected with no effect if already the difficulty's last (5th) stage. */
export function skipFootstepsStage(state: FootstepsSessionState, timestamp: number): FootstepsActionResult {
  const nextNumber = state.currentStage.stageNumber + 1;
  if (nextNumber > STAGES_PER_DIFFICULTY) {
    return { success: false, state, reason: "Already the last stage of this difficulty — end the session instead." };
  }
  return jumpToFootstepsStage(state, nextNumber as StageNumber, timestamp);
}

/** Shared by advanceFootstepsStage and jumpToFootstepsStage: generates the target stage and lands on START_ZONE. */
function enterFootstepsStage(
  state: FootstepsSessionState,
  difficulty: Difficulty,
  stageNumber: StageNumber,
  presetFields?: Pick<FootstepsSessionConfig, "stepLength" | "pathStyle" | "pathWidth">,
): FootstepsActionResult {
  const transitionResult = state.gameState === GameState.START_ZONE ? { success: true as const, state: GameState.START_ZONE } : transition(state.gameState, GameState.START_ZONE);
  if (!transitionResult.success) {
    return { success: false, state, reason: transitionResult.reason };
  }
  // THERAPIST SETUP SIMPLIFICATION — config.difficulty/startingStage always
  // stay the ORIGINAL setup choice (currentDifficulty is the live indicator
  // — see FootstepsSessionState's doc comment and
  // buildStoredFootstepsSession's startingDifficulty). Only the technical
  // fields are refreshed here, from the new difficulty's preset, so a mid-
  // session "أسهل"/"أصعب" decision actually feels like that difficulty
  // instead of reusing stale values. Mirrors lib/game/session.ts's
  // enterStage exactly.
  const config = presetFields ? { ...state.config, ...presetFields } : state.config;
  const generated = generateFootstepsPath({ seed: state.seed, difficulty, stageNumber, config });
  return {
    success: true,
    state: {
      ...state,
      config,
      gameState: transitionResult.state,
      currentDifficulty: difficulty,
      currentStage: stageRuntimeFromGenerated(generated, difficulty),
    },
  };
}

/**
 * Resolves the therapist's confirmation that the child has reached the
 * CURRENT footprint (the only normally-confirmable one — see NO CAMERA/NO
 * SENSOR). Advances currentIndex exactly once; a second confirmation for
 * the same footprint (currentIndex unchanged) is impossible to express from
 * the caller's side since the UI only ever calls this for the live
 * currentIndex, but this function is additionally idempotent-safe: it
 * always operates on the CURRENT index only, never a caller-supplied
 * footprint id, so there is no way to double-count or skip via a stale
 * reference. Auto-finalizes + transitions to STAGE_COMPLETE once every
 * footprint is confirmed. There is no incorrect/failure branch — see NO
 * NEGATIVE SCORING.
 */
export function confirmCurrentFootstep(state: FootstepsSessionState, timestamp: number): FootstepsActionResult {
  if (safeElapsedMs(timestamp, state.createdAt) === null) return { success: false, state, reason: "Invalid action timestamp." };
  if (state.gameState !== GameState.PLAYING) {
    return { success: false, state, reason: "A footprint can only be confirmed while PLAYING." };
  }

  const stage = state.currentStage;
  if (stage.pausedAt !== null) {
    return { success: false, state, reason: "Cannot confirm a footprint while paused." };
  }
  if (stage.currentIndex >= stage.totalSteps) {
    return { success: false, state, reason: "Every footprint in this stage is already confirmed." };
  }

  const stepTimeMs = safeElapsedMs(timestamp, stage.stepStartedAt ?? timestamp, stage.stepPausedMs);
  const nextIndex = stage.currentIndex + 1;
  const updatedStage: FootstepsStageRuntime = {
    ...stage,
    currentIndex: nextIndex,
    stepTimesMs: stepTimeMs === null ? stage.stepTimesMs : [...stage.stepTimesMs, stepTimeMs],
    stepStartedAt: timestamp,
    stepPausedMs: 0,
  };

  let nextState: FootstepsSessionState = { ...state, currentStage: updatedStage };

  if (nextIndex >= updatedStage.totalSteps) {
    nextState = finalizeCurrentFootstepsStage(nextState, timestamp, FootstepsStageStatus.COMPLETED);
    const stageCompleteResult = transition(nextState.gameState, GameState.STAGE_COMPLETE);
    if (stageCompleteResult.success) {
      nextState = { ...nextState, gameState: stageCompleteResult.state };
    }
  }

  return { success: true, state: nextState };
}

/** Pauses the current stage — the active footprint remains visible, confirmation disabled, timing paused (both stage-level and current-step-level). */
export function pauseFootstepsSession(state: FootstepsSessionState, timestamp: number): FootstepsActionResult {
  if (safeElapsedMs(timestamp, state.createdAt) === null) return { success: false, state, reason: "Invalid action timestamp." };
  if (state.gameState !== GameState.PLAYING) {
    return { success: false, state, reason: "Can only pause while PLAYING." };
  }
  const stage = state.currentStage;
  if (stage.pausedAt !== null) {
    return { success: false, state, reason: "Already paused." };
  }
  return { success: true, state: { ...state, currentStage: { ...stage, pausedAt: timestamp } } };
}

export function resumeFootstepsSession(state: FootstepsSessionState, timestamp: number): FootstepsActionResult {
  if (safeElapsedMs(timestamp, state.createdAt) === null) return { success: false, state, reason: "Invalid action timestamp." };
  if (state.gameState !== GameState.PLAYING) {
    return { success: false, state, reason: "Can only resume while PLAYING." };
  }
  const stage = state.currentStage;
  if (stage.pausedAt === null) {
    return { success: false, state, reason: "Not paused." };
  }
  const pausedFor = safeElapsedMs(timestamp, stage.pausedAt);
  if (pausedFor === null) return { success: false, state, reason: "Invalid pause timestamp." };
  const updatedStage: FootstepsStageRuntime = {
    ...stage,
    pausedAt: null,
    totalPausedMs: stage.totalPausedMs + pausedFor,
    stepPausedMs: stage.stepPausedMs + pausedFor,
  };
  return { success: true, state: { ...state, currentStage: updatedStage } };
}

/** Regenerates the current stage from the same (seed, difficulty, stageNumber, config) — deterministically identical path — and resets every runtime metric. A restart is a clean retry, not a new random path. */
export function restartFootstepsStage(state: FootstepsSessionState, timestamp: number): FootstepsActionResult {
  if (safeElapsedMs(timestamp, state.createdAt) === null) return { success: false, state, reason: "Invalid action timestamp." };
  if (state.gameState !== GameState.PLAYING) {
    return { success: false, state, reason: "Can only restart while PLAYING." };
  }
  const stage = state.currentStage;
  const regenerated = generateFootstepsPath({
    seed: state.seed,
    difficulty: stage.difficulty,
    stageNumber: stage.stageNumber,
    config: state.config,
  });
  const freshStage: FootstepsStageRuntime = {
    ...stageRuntimeFromGenerated(regenerated, stage.difficulty),
    startedAt: timestamp,
    stepStartedAt: timestamp,
  };
  return { success: true, state: { ...state, currentStage: freshStage } };
}

/** Therapist-initiated early end — same semantics as Balloon Quest's endSession: a stage actively announced but not yet finalized is recorded SKIPPED with its real partial progress; nothing further is added for a stage never entered or already finalized. */
export function endFootstepsSession(state: FootstepsSessionState, timestamp: number): FootstepsActionResult {
  const totalDurationMs = safeElapsedMs(timestamp, state.createdAt);
  if (totalDurationMs === null) return { success: false, state, reason: "Invalid session timestamp." };
  if (state.gameState === GameState.SESSION_COMPLETE) {
    return { success: false, state, reason: "Session already ended." };
  }

  const inProgressStates: readonly GameState[] = [GameState.INSTRUCTIONS, GameState.COUNTDOWN, GameState.PLAYING];
  const stateWithFinalStage = inProgressStates.includes(state.gameState)
    ? finalizeCurrentFootstepsStage(state, timestamp, FootstepsStageStatus.SKIPPED)
    : state;

  const summary = buildFootstepsSessionSummary({
    sessionId: stateWithFinalStage.sessionId,
    childFirstName: stateWithFinalStage.config.childFirstName,
    startingDifficulty: stateWithFinalStage.config.difficulty,
    stageResults: stateWithFinalStage.results,
    totalDurationMs,
    completedAt: new Date(timestamp).toISOString(),
  });

  return {
    success: true,
    state: { ...stateWithFinalStage, gameState: GameState.SESSION_COMPLETE, endedAt: timestamp, summary },
  };
}

function stampStepStart(state: FootstepsSessionState, timestamp: number): FootstepsSessionState {
  const stage = state.currentStage;
  if (stage.startedAt !== null) return state;
  return { ...state, currentStage: { ...stage, startedAt: timestamp, stepStartedAt: timestamp } };
}

function finalizeCurrentFootstepsStage(state: FootstepsSessionState, timestamp: number, status: FootstepsStageStatus): FootstepsSessionState {
  const stage = state.currentStage;
  if (stage.completedAt !== null) return state;

  const openPauseMs = stage.pausedAt === null ? 0 : safeElapsedMs(timestamp, stage.pausedAt);
  const durationMs = openPauseMs === null ? null : safeElapsedMs(timestamp, stage.startedAt ?? timestamp, stage.totalPausedMs + openPauseMs);
  const result = finalizeFootstepsStageResult({
    difficulty: stage.difficulty,
    stageNumber: stage.stageNumber,
    status,
    stepsPresented: stage.totalSteps,
    stepsCompleted: stage.currentIndex,
    durationMs,
    stepTimesMs: stage.stepTimesMs,
  });

  return {
    ...state,
    currentStage: { ...stage, completedAt: timestamp },
    results: [...state.results, result],
  };
}

function randomToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

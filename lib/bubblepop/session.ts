import { getAdjacentDifficulty, GameState, isSequentialStageTarget, STAGES_PER_DIFFICULTY, transition } from "@/lib/game";
import type { SessionWorkflowMetadata } from "@/lib/sessions/workflowMetadata";
import { generateBubbleField, type GeneratedBubbleField } from "./bubbleGenerator";
import { buildBubblePopSessionSummary, finalizeBubblePopStageResult } from "./scoring";
import { getBubbleStagePlan } from "./stagePlans";
import {
  type Bubble,
  type BubbleColor,
  type BubblePopSessionConfig,
  type BubblePopSessionSummary,
  type BubblePopStageResult,
  BubblePopStageStatus,
  type BubbleShape,
  type BubbleSize,
  Difficulty,
  type ReachHeight,
  type ReachSide,
  type StageNumber,
  type TargetMode,
} from "./types";
import { safeElapsedMs } from "@/lib/dataIntegrity/numeric";

/**
 * Runtime state for the one currently-active stage: its generated mission
 * sequence plus everything scored during play.
 *
 * SEQUENTIAL SINGLE MISSION (Phase 1 station redesign): `targetSequence` is
 * an ORDERED list of mission-bubble ids and `currentTargetIndex` is a
 * pointer into it — only `bubbles.find(b => b.id ===
 * targetSequence[currentTargetIndex])` is ever "the current request" at any
 * moment (see currentTargetId() below), mirroring Follow the Footsteps'
 * currentIndex pointer but keyed to bubble IDENTITY rather than path
 * position. There are no decoys anymore — a WRONG station color (one that
 * doesn't match the current mission's color) is what's incorrect now, see
 * confirmBubblePopColor. currentTargetIndex === targetSequence.length once
 * every mission has been popped (stage complete).
 */
export interface BubblePopStageRuntime {
  difficulty: Difficulty;
  stageNumber: StageNumber;
  bubbles: Bubble[];
  targetSequence: string[];
  currentTargetIndex: number;
  incorrectCount: number;
  responseTimesMs: number[];
  /** Epoch ms when this stage's PLAYING phase began; null until then. */
  startedAt: number | null;
  /** Epoch ms when this stage was finalized (completed or skipped). */
  completedAt: number | null;
  /** Epoch ms this stage was paused at; null when not currently paused. */
  pausedAt: number | null;
  /** Cumulative paused duration for the whole stage, excluded from stage duration. */
  totalPausedMs: number;
  /** Epoch ms the CURRENT target became active — response time is measured from here (paused time excluded via targetPausedMs). Resets every time currentTargetIndex advances. */
  targetStartedAt: number | null;
  /** Paused ms accumulated specifically since the current target became active. */
  targetPausedMs: number;
  /** Visual-only treasure/key chest progress (task section 12: never a Firebase coins/economy) — counts correct pops toward `bubbles.length`, only meaningful when this stage's plan has `features.treasure` (its `treasureMode` is PEARLS or KEYS). Always resets to 0 on restart (task section 17). */
  treasureProgress: number;
}

/** The full state of one Bubble Pop Wall session. Immutable — every action returns a new BubblePopSessionState. Mirrors the other two games' navigation model exactly (lazy per-stage generation, forward-only jump, always returning through the Ready Position between stages). */
export interface BubblePopSessionState {
  sessionId: string;
  seed: string;
  config: BubblePopSessionConfig;
  gameState: GameState;
  currentDifficulty: Difficulty;
  currentStage: BubblePopStageRuntime;
  results: BubblePopStageResult[];
  createdAt: number;
  endedAt: number | null;
  summary: BubblePopSessionSummary | null;
  workflow?: SessionWorkflowMetadata;
}

export type BubblePopActionResult =
  | { success: true; state: BubblePopSessionState }
  | { success: false; state: BubblePopSessionState; reason: string };

export interface CreateBubblePopSessionParams {
  childFirstName: string;
  difficulty: Difficulty;
  bubbleSize: BubbleSize;
  reachHeight: ReachHeight;
  reachSide: ReachSide;
  targetMode: TargetMode;
  startingStage?: StageNumber;
  seed?: string;
  now?: number;
  workflow?: SessionWorkflowMetadata;
}

/** The bubble id currently being requested, or null once every target in the stage has been popped. */
export function currentTargetId(stage: BubblePopStageRuntime): string | null {
  return stage.currentTargetIndex < stage.targetSequence.length ? stage.targetSequence[stage.currentTargetIndex] : null;
}

function stageRuntimeFromGenerated(generated: GeneratedBubbleField, difficulty: Difficulty): BubblePopStageRuntime {
  return {
    difficulty,
    stageNumber: generated.stageNumber,
    bubbles: generated.bubbles,
    targetSequence: generated.targetSequence,
    currentTargetIndex: 0,
    incorrectCount: 0,
    responseTimesMs: [],
    startedAt: null,
    completedAt: null,
    pausedAt: null,
    totalPausedMs: 0,
    targetStartedAt: null,
    targetPausedMs: 0,
    treasureProgress: 0,
  };
}

export function createBubblePopSession(params: CreateBubblePopSessionParams): BubblePopSessionState {
  const startingStage = params.startingStage ?? 1;
  const config: BubblePopSessionConfig = {
    childFirstName: params.childFirstName,
    difficulty: params.difficulty,
    bubbleSize: params.bubbleSize,
    reachHeight: params.reachHeight,
    reachSide: params.reachSide,
    targetMode: params.targetMode,
    startingStage,
  };
  const seed = params.seed ?? randomToken();

  const generated = generateBubbleField({ seed, difficulty: config.difficulty, stageNumber: startingStage, config });

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

/** Applies a WELCOME -> SETUP -> INSTRUCTIONS -> COUNTDOWN -> PLAYING style transition — reuses lib/game/stateMachine.ts's transition() directly. Entering PLAYING stamps the current target's response-timing baseline. */
export function applyBubblePopGameTransition(state: BubblePopSessionState, to: GameState, timestamp: number): BubblePopActionResult {
  if (safeElapsedMs(timestamp, state.createdAt) === null) return { success: false, state, reason: "Invalid action timestamp." };
  const result = transition(state.gameState, to);
  if (!result.success) {
    return { success: false, state, reason: result.reason };
  }

  let nextState: BubblePopSessionState = { ...state, gameState: result.state };
  if (to === GameState.PLAYING) {
    nextState = stampTargetStart(nextState, timestamp);
  }
  return { success: true, state: nextState };
}

/**
 * Same "continue same difficulty" / "step to the adjacent easier/harder
 * difficulty at the same stage number" decision as the other two games.
 *
 * THERAPIST SETUP SIMPLIFICATION (task section 53) — `presetFields` is the
 * calling controller hook's freshly-resolved preset technical fields for
 * `target.difficulty` (getBubblePopStagePreset(target.difficulty,
 * target.stageNumber).config), passed only when this is an actual
 * difficulty change. Ignored/omitted on a same-difficulty "continue" —
 * config is stage-invariant within one difficulty by design. See
 * lib/game/session.ts's advanceToStage for the reference implementation
 * this mirrors.
 */
export function advanceBubblePopStage(
  state: BubblePopSessionState,
  target: { difficulty: Difficulty; stageNumber: StageNumber },
  presetFields?: Pick<BubblePopSessionConfig, "bubbleSize" | "reachHeight" | "reachSide" | "targetMode">,
): BubblePopActionResult {
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

  return enterBubblePopStage(state, target.difficulty, target.stageNumber, !sameDifficulty ? presetFields : undefined);
}

/** Direct navigation to any other stage; only the entered attempt being left is recorded as skipped. */
export function jumpToBubblePopStage(state: BubblePopSessionState, targetStageNumber: StageNumber, timestamp: number): BubblePopActionResult {
  if (safeElapsedMs(timestamp, state.createdAt) === null) return { success: false, state, reason: "Invalid action timestamp." };
  const validFrom: readonly GameState[] = [GameState.START_ZONE, GameState.INSTRUCTIONS, GameState.COUNTDOWN, GameState.PLAYING, GameState.STAGE_COMPLETE];
  if (!validFrom.includes(state.gameState)) {
    return { success: false, state, reason: "Can only navigate stages while a stage is active or just completed." };
  }

  const currentStageNumber = state.currentStage.stageNumber;
  if (targetStageNumber === currentStageNumber) return { success: true, state };

  const alreadyFinalized = state.gameState === GameState.STAGE_COMPLETE;
  const stateWithCurrentFinalized = alreadyFinalized || state.gameState === GameState.START_ZONE ? state : finalizeCurrentBubblePopStage(state, timestamp, BubblePopStageStatus.SKIPPED);

  return enterBubblePopStage(stateWithCurrentFinalized, state.currentDifficulty, targetStageNumber);
}

export function switchBubblePopDifficulty(
  state: BubblePopSessionState,
  difficulty: Difficulty,
  timestamp: number,
  presetFields: Pick<BubblePopSessionConfig, "bubbleSize" | "reachHeight" | "reachSide" | "targetMode">,
): BubblePopActionResult {
  if (difficulty === state.currentDifficulty) return { success: true, state };
  const valid = [GameState.START_ZONE, GameState.INSTRUCTIONS, GameState.COUNTDOWN, GameState.PLAYING, GameState.STAGE_COMPLETE].includes(state.gameState);
  if (!valid) return { success: false, state, reason: "Cannot change difficulty now." };
  const finalized = state.gameState === GameState.STAGE_COMPLETE || state.gameState === GameState.START_ZONE ? state : finalizeCurrentBubblePopStage(state, timestamp, BubblePopStageStatus.SKIPPED);
  return enterBubblePopStage(finalized, difficulty, 1, presetFields);
}

/** Ends the CURRENT stage early and moves to stageNumber + 1 in the same difficulty — the therapist's "تخطي المرحلة". Rejected with no effect if already the difficulty's last (5th) stage. */
export function skipBubblePopStage(state: BubblePopSessionState, timestamp: number): BubblePopActionResult {
  const nextNumber = state.currentStage.stageNumber + 1;
  if (nextNumber > STAGES_PER_DIFFICULTY) {
    return { success: false, state, reason: "Already the last stage of this difficulty — end the session instead." };
  }
  return jumpToBubblePopStage(state, nextNumber as StageNumber, timestamp);
}

/** Shared by advanceBubblePopStage and jumpToBubblePopStage: generates the target stage and lands on START_ZONE (this game's Ready Position — see the platform's shared GameState). */
function enterBubblePopStage(
  state: BubblePopSessionState,
  difficulty: Difficulty,
  stageNumber: StageNumber,
  presetFields?: Pick<BubblePopSessionConfig, "bubbleSize" | "reachHeight" | "reachSide" | "targetMode">,
): BubblePopActionResult {
  const transitionResult = state.gameState === GameState.START_ZONE ? { success: true as const, state: GameState.START_ZONE } : transition(state.gameState, GameState.START_ZONE);
  if (!transitionResult.success) {
    return { success: false, state, reason: transitionResult.reason };
  }
  // THERAPIST SETUP SIMPLIFICATION — config.difficulty/startingStage always
  // stay the ORIGINAL setup choice (currentDifficulty is the live indicator
  // — see BubblePopSessionState's doc comment and buildStoredBubblePopSession's
  // startingDifficulty). Only the technical fields are refreshed here, from
  // the new difficulty's preset, so a mid-session "أسهل"/"أصعب" decision
  // actually feels like that difficulty instead of reusing stale values.
  const config = presetFields ? { ...state.config, ...presetFields } : state.config;
  const generated = generateBubbleField({ seed: state.seed, difficulty, stageNumber, config });
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
 * Resolves the therapist's confirmation of which STATION the child pressed
 * (task section 5/26/27/30) — the CORE gameplay action of the station-based
 * redesign. `shape` is only meaningful (and only ever checked) when the
 * current mission's `requiresShape` is true (Advanced color+shape/mixed
 * stages, task Part G) — a plain color mission ignores it entirely, so every
 * Easy/Medium call site can keep passing color alone. The CURRENT mission
 * bubble (currentTargetId(stage)) pops on a match, records response time,
 * advances the pointer, and (on stages with a treasure/key chest) nudges
 * treasureProgress forward — auto-finalizing + transitioning to
 * STAGE_COMPLETE once every mission is popped. A WRONG station is INCORRECT:
 * no bubble state changes, incorrectCount increments, the current mission
 * remains exactly as it was — task section 9's "gentle underwater boop +
 * station wobble," never a failure state, and (task Part G's "wrong sequence
 * input") never erases an already-popped earlier step of a sequence either,
 * since that step's bubble is already marked isPopped and untouched here.
 */
export function confirmBubblePopColor(state: BubblePopSessionState, color: BubbleColor, timestamp: number, shape?: BubbleShape): BubblePopActionResult {
  if (safeElapsedMs(timestamp, state.createdAt) === null) return { success: false, state, reason: "Invalid action timestamp." };
  if (state.gameState !== GameState.PLAYING) {
    return { success: false, state, reason: "A station can only be confirmed while PLAYING." };
  }

  const stage = state.currentStage;
  if (stage.pausedAt !== null) {
    return { success: false, state, reason: "Cannot confirm a station while paused." };
  }

  const targetId = currentTargetId(stage);
  if (targetId === null) {
    return { success: false, state, reason: "Every mission in this stage is already confirmed." };
  }
  const targetIndex = stage.bubbles.findIndex((b) => b.id === targetId);
  const target = stage.bubbles[targetIndex];
  if (target.isPopped) {
    return { success: true, state };
  }

  const isMatch = target.requiresShape ? target.color === color && target.shape === shape : target.color === color;
  if (!isMatch) {
    const updatedStage: BubblePopStageRuntime = { ...stage, incorrectCount: stage.incorrectCount + 1 };
    return { success: true, state: { ...state, currentStage: updatedStage } };
  }

  const responseTimeMs = safeElapsedMs(timestamp, stage.targetStartedAt ?? timestamp, stage.targetPausedMs);
  const updatedBubbles = stage.bubbles.map((b, i) => (i === targetIndex ? { ...b, isPopped: true } : b));
  const nextTargetIndex = stage.currentTargetIndex + 1;
  const plan = getBubbleStagePlan(stage.difficulty, stage.stageNumber);
  const nextTreasureProgress = plan.features.treasure ? Math.min(stage.bubbles.length, stage.treasureProgress + 1) : stage.treasureProgress;
  const updatedStage: BubblePopStageRuntime = {
    ...stage,
    bubbles: updatedBubbles,
    currentTargetIndex: nextTargetIndex,
    responseTimesMs: responseTimeMs === null ? stage.responseTimesMs : [...stage.responseTimesMs, responseTimeMs],
    targetStartedAt: timestamp,
    targetPausedMs: 0,
    treasureProgress: nextTreasureProgress,
  };

  let nextState: BubblePopSessionState = { ...state, currentStage: updatedStage };

  if (nextTargetIndex >= updatedStage.targetSequence.length) {
    nextState = finalizeCurrentBubblePopStage(nextState, timestamp, BubblePopStageStatus.COMPLETED);
    const stageCompleteResult = transition(nextState.gameState, GameState.STAGE_COMPLETE);
    if (stageCompleteResult.success) {
      nextState = { ...nextState, gameState: stageCompleteResult.state };
    }
  }

  return { success: true, state: nextState };
}

/** Pauses the current stage — the current target remains visible, confirmation disabled, timing paused (both stage-level and current-target-level). */
export function pauseBubblePopSession(state: BubblePopSessionState, timestamp: number): BubblePopActionResult {
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

export function resumeBubblePopSession(state: BubblePopSessionState, timestamp: number): BubblePopActionResult {
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
  const updatedStage: BubblePopStageRuntime = {
    ...stage,
    pausedAt: null,
    totalPausedMs: stage.totalPausedMs + pausedFor,
    targetPausedMs: stage.targetPausedMs + pausedFor,
  };
  return { success: true, state: { ...state, currentStage: updatedStage } };
}

/** Regenerates the current stage from the same (seed, difficulty, stageNumber, config) — deterministically identical field/target sequence — and resets every runtime metric. A restart is a clean retry, not a new random one. */
export function restartBubblePopStage(state: BubblePopSessionState, timestamp: number): BubblePopActionResult {
  if (safeElapsedMs(timestamp, state.createdAt) === null) return { success: false, state, reason: "Invalid action timestamp." };
  if (state.gameState !== GameState.PLAYING) {
    return { success: false, state, reason: "Can only restart while PLAYING." };
  }
  const stage = state.currentStage;
  const regenerated = generateBubbleField({
    seed: state.seed,
    difficulty: stage.difficulty,
    stageNumber: stage.stageNumber,
    config: state.config,
  });
  const freshStage: BubblePopStageRuntime = {
    ...stageRuntimeFromGenerated(regenerated, stage.difficulty),
    startedAt: timestamp,
    targetStartedAt: timestamp,
  };
  return { success: true, state: { ...state, currentStage: freshStage } };
}

/** Therapist-initiated early end — same semantics as the other two games: a stage actively announced but not yet finalized is recorded SKIPPED with its real partial progress; nothing further is added for a stage never entered or already finalized. */
export function endBubblePopSession(state: BubblePopSessionState, timestamp: number): BubblePopActionResult {
  const totalDurationMs = safeElapsedMs(timestamp, state.createdAt);
  if (totalDurationMs === null) return { success: false, state, reason: "Invalid session timestamp." };
  if (state.gameState === GameState.SESSION_COMPLETE) {
    return { success: false, state, reason: "Session already ended." };
  }

  const inProgressStates: readonly GameState[] = [GameState.INSTRUCTIONS, GameState.COUNTDOWN, GameState.PLAYING];
  const stateWithFinalStage = inProgressStates.includes(state.gameState)
    ? finalizeCurrentBubblePopStage(state, timestamp, BubblePopStageStatus.SKIPPED)
    : state;

  const summary = buildBubblePopSessionSummary({
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

function stampTargetStart(state: BubblePopSessionState, timestamp: number): BubblePopSessionState {
  const stage = state.currentStage;
  if (stage.startedAt !== null) return state;
  return { ...state, currentStage: { ...stage, startedAt: timestamp, targetStartedAt: timestamp } };
}

function finalizeCurrentBubblePopStage(state: BubblePopSessionState, timestamp: number, status: BubblePopStageStatus): BubblePopSessionState {
  const stage = state.currentStage;
  if (stage.completedAt !== null) return state;

  const openPauseMs = stage.pausedAt === null ? 0 : safeElapsedMs(timestamp, stage.pausedAt);
  const durationMs = openPauseMs === null ? null : safeElapsedMs(timestamp, stage.startedAt ?? timestamp, stage.totalPausedMs + openPauseMs);
  const result = finalizeBubblePopStageResult({
    difficulty: stage.difficulty,
    stageNumber: stage.stageNumber,
    status,
    targetsPresented: stage.targetSequence.length,
    targetsCompleted: stage.currentTargetIndex,
    incorrectCount: stage.incorrectCount,
    durationMs,
    responseTimesMs: stage.responseTimesMs,
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

import { getAdjacentDifficulty, GameState, isSequentialStageTarget, STAGES_PER_DIFFICULTY, transition } from "@/lib/game";
import type { SessionWorkflowMetadata } from "@/lib/sessions/workflowMetadata";
import { safeElapsedMs } from "@/lib/dataIntegrity/numeric";
import { generateFeedStage } from "./feedGenerator";
import { feedAnimalsObstacleRequiresJump, getFeedAnimalsPathLeg, getFeedAnimalsPathStage } from "./pathStages";
import { buildFeedAnimalsSessionSummary, finalizeFeedAnimalsStageResult } from "./scoring";
import {
  Difficulty,
  type FeedAnimalsSessionConfig,
  type FeedAnimalsSessionSummary,
  type FeedAnimalsStageResult,
  FeedAnimalsStageStatus,
  type FeedRound,
  type FoodSize,
  type ReachHeight,
  type ReachSide,
  type MovementPattern,
  type StageNumber,
} from "./types";

/**
 * Runtime state for the one currently-active stage: its generated round
 * sequence plus everything scored during play.
 *
 * SEQUENTIAL ROUNDS (task section 12/25/26): unlike Bubble Pop Wall (one
 * shared field of bubbles, targets requested one at a time from within it),
 * here `rounds` is an ORDERED list of complete round definitions (animal +
 * its own food choices) and `currentRoundIndex` is a pointer into it — only
 * `rounds[currentRoundIndex]` is ever "the active round" at any moment (see
 * currentRound() below), matching Follow the Footsteps' currentIndex
 * pointer shape but over rounds rather than single footprints. Every OTHER
 * food choice within the ACTIVE round that isn't that animal's food is a
 * legitimate "incorrect" tap if selected — see confirmFoodSelection.
 * currentRoundIndex === rounds.length once every round's animal has been
 * fed (stage complete).
 */
export interface FeedAnimalsStageRuntime {
  /**
   * SAFARI ANIMAL ADVENTURE PROTOTYPE — "rounds" is the original animal-
   * asks/child-picks-food mechanic every stage except EASY 1 still uses;
   * "path" is the new control-the-animal-along-a-route mechanic (see
   * pathStages.ts). Only `buildStageRuntime` below decides which one a
   * stage gets; every other function in this file (pause/resume/restart/
   * finalize/skip/jump) only ever touches the fields shared by both, so
   * this stays a single flat runtime shape rather than a full discriminated
   * union — deliberately, to keep the blast radius of this prototype small.
   */
  kind: "rounds" | "path";
  difficulty: Difficulty;
  stageNumber: StageNumber;
  rounds: FeedRound[];
  currentRoundIndex: number;
  /** MULTI-ANIMAL STAGES (Medium 5 / Advanced 4 / Advanced 5) — which leg of the path stage's FeedAnimalsPathStageDefinition.legs is currently active; legs are played strictly in order, one animal controlled at a time. Always 0 and unused for a "rounds" stage or a single-leg path stage. */
  legIndex: number;
  /** Path-mode progress within the ACTIVE leg, 0..(that leg's totalSteps) — see advanceFeedAnimalsMonkey. Always 0 and unused for a "rounds" stage. */
  pathProgressStep: number;
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
  /** Epoch ms the CURRENT round became active — response time is measured from here (paused time excluded via roundPausedMs). Resets every time currentRoundIndex advances. */
  roundStartedAt: number | null;
  /** Paused ms accumulated specifically since the current round became active. */
  roundPausedMs: number;
}

/** The full state of one Feed the Animals session. Immutable — every action returns a new FeedAnimalsSessionState. Mirrors the other three games' navigation model exactly (lazy per-stage generation, forward-only jump, always returning through the Ready Position between stages). */
export interface FeedAnimalsSessionState {
  sessionId: string;
  seed: string;
  config: FeedAnimalsSessionConfig;
  gameState: GameState;
  currentDifficulty: Difficulty;
  currentStage: FeedAnimalsStageRuntime;
  results: FeedAnimalsStageResult[];
  createdAt: number;
  endedAt: number | null;
  summary: FeedAnimalsSessionSummary | null;
  workflow?: SessionWorkflowMetadata;
}

export type FeedAnimalsActionResult =
  | { success: true; state: FeedAnimalsSessionState }
  | { success: false; state: FeedAnimalsSessionState; reason: string };

export interface CreateFeedAnimalsSessionParams {
  childFirstName: string;
  difficulty: Difficulty;
  foodSize: FoodSize;
  reachHeight: ReachHeight;
  reachSide: ReachSide;
  movementPattern: MovementPattern;
  startingStage?: StageNumber;
  seed?: string;
  now?: number;
  workflow?: SessionWorkflowMetadata;
}

/** The round currently being requested, or null once every round in the stage has been fed. */
export function currentRound(stage: FeedAnimalsStageRuntime): FeedRound | null {
  return stage.currentRoundIndex < stage.rounds.length ? stage.rounds[stage.currentRoundIndex] : null;
}

/** The one place that decides whether a (difficulty, stageNumber) gets the new path mechanic or the original round-based one — see FeedAnimalsStageRuntime's own doc comment. */
function buildStageRuntime(
  seed: string,
  difficulty: Difficulty,
  stageNumber: StageNumber,
  config: Pick<FeedAnimalsSessionConfig, "foodSize" | "reachHeight" | "reachSide" | "movementPattern">,
): FeedAnimalsStageRuntime {
  const shared = {
    difficulty,
    stageNumber,
    currentRoundIndex: 0,
    legIndex: 0,
    pathProgressStep: 0,
    incorrectCount: 0,
    responseTimesMs: [] as number[],
    startedAt: null,
    completedAt: null,
    pausedAt: null,
    totalPausedMs: 0,
    roundStartedAt: null,
    roundPausedMs: 0,
  };

  if (getFeedAnimalsPathStage(difficulty, stageNumber)) {
    return { ...shared, kind: "path", rounds: [] };
  }

  const generated = generateFeedStage({ seed, difficulty, stageNumber, config });
  return { ...shared, kind: "rounds", stageNumber: generated.stageNumber, rounds: generated.rounds };
}

export function createFeedAnimalsSession(params: CreateFeedAnimalsSessionParams): FeedAnimalsSessionState {
  const startingStage = params.startingStage ?? 1;
  const config: FeedAnimalsSessionConfig = {
    childFirstName: params.childFirstName,
    difficulty: params.difficulty,
    foodSize: params.foodSize,
    reachHeight: params.reachHeight,
    reachSide: params.reachSide,
    movementPattern: params.movementPattern,
    startingStage,
  };
  const seed = params.seed ?? randomToken();

  return {
    sessionId: randomToken(),
    seed,
    config,
    gameState: GameState.WELCOME,
    currentDifficulty: config.difficulty,
    currentStage: buildStageRuntime(seed, config.difficulty, startingStage, config),
    results: [],
    createdAt: params.now ?? Date.now(),
    endedAt: null,
    summary: null,
    ...(params.workflow ? { workflow: params.workflow } : {}),
  };
}

/** Applies a WELCOME -> SETUP -> INSTRUCTIONS -> COUNTDOWN -> PLAYING style transition — reuses lib/game/stateMachine.ts's transition() directly. Entering PLAYING stamps the current round's response-timing baseline. */
export function applyFeedAnimalsGameTransition(state: FeedAnimalsSessionState, to: GameState, timestamp: number): FeedAnimalsActionResult {
  if (safeElapsedMs(timestamp, state.createdAt) === null) return { success: false, state, reason: "Invalid action timestamp." };
  const result = transition(state.gameState, to);
  if (!result.success) {
    return { success: false, state, reason: result.reason };
  }

  let nextState: FeedAnimalsSessionState = { ...state, gameState: result.state };
  if (to === GameState.PLAYING) {
    nextState = stampRoundStart(nextState, timestamp);
  }
  return { success: true, state: nextState };
}

/** Same "continue same difficulty" / "step to the adjacent easier/harder difficulty at the same stage number" decision as every other game. */
export function advanceFeedAnimalsStage(
  state: FeedAnimalsSessionState,
  target: { difficulty: Difficulty; stageNumber: StageNumber },
  /**
   * THERAPIST SETUP SIMPLIFICATION (task section 53) — the calling hook's
   * freshly-resolved preset technical fields for `target.difficulty`
   * (getFeedAnimalsStagePreset(target.difficulty, target.stageNumber).config),
   * passed only when this is an actual difficulty change. Ignored/omitted on
   * a same-difficulty "continue" — config is stage-invariant within one
   * difficulty by design, so nothing needs to be re-resolved there.
   */
  presetFields?: Pick<FeedAnimalsSessionConfig, "foodSize" | "reachHeight" | "reachSide" | "movementPattern">,
): FeedAnimalsActionResult {
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

  return enterFeedAnimalsStage(state, target.difficulty, target.stageNumber, !sameDifficulty ? presetFields : undefined);
}

/** Direct navigation to any other stage; only the entered attempt being left is recorded as skipped. */
export function jumpToFeedAnimalsStage(state: FeedAnimalsSessionState, targetStageNumber: StageNumber, timestamp: number): FeedAnimalsActionResult {
  if (safeElapsedMs(timestamp, state.createdAt) === null) return { success: false, state, reason: "Invalid action timestamp." };
  const validFrom: readonly GameState[] = [GameState.START_ZONE, GameState.INSTRUCTIONS, GameState.COUNTDOWN, GameState.PLAYING, GameState.STAGE_COMPLETE];
  if (!validFrom.includes(state.gameState)) {
    return { success: false, state, reason: "Can only navigate stages while a stage is active or just completed." };
  }

  const currentStageNumber = state.currentStage.stageNumber;
  if (targetStageNumber === currentStageNumber) return { success: true, state };

  const alreadyFinalized = state.gameState === GameState.STAGE_COMPLETE;
  const stateWithCurrentFinalized = alreadyFinalized || state.gameState === GameState.START_ZONE ? state : finalizeCurrentFeedAnimalsStage(state, timestamp, FeedAnimalsStageStatus.SKIPPED);

  return enterFeedAnimalsStage(stateWithCurrentFinalized, state.currentDifficulty, targetStageNumber);
}

export function switchFeedAnimalsDifficulty(
  state: FeedAnimalsSessionState,
  difficulty: Difficulty,
  timestamp: number,
  presetFields: Pick<FeedAnimalsSessionConfig, "foodSize" | "reachHeight" | "reachSide" | "movementPattern">,
): FeedAnimalsActionResult {
  if (difficulty === state.currentDifficulty) return { success: true, state };
  const valid = [GameState.START_ZONE, GameState.INSTRUCTIONS, GameState.COUNTDOWN, GameState.PLAYING, GameState.STAGE_COMPLETE].includes(state.gameState);
  if (!valid) return { success: false, state, reason: "Cannot change difficulty now." };
  const finalized = state.gameState === GameState.STAGE_COMPLETE || state.gameState === GameState.START_ZONE ? state : finalizeCurrentFeedAnimalsStage(state, timestamp, FeedAnimalsStageStatus.SKIPPED);
  return enterFeedAnimalsStage(finalized, difficulty, 1, presetFields);
}

/** Ends the CURRENT stage early and moves to stageNumber + 1 in the same difficulty — the therapist's "تخطي المرحلة". Rejected with no effect if already the difficulty's last (5th) stage. */
export function skipFeedAnimalsStage(state: FeedAnimalsSessionState, timestamp: number): FeedAnimalsActionResult {
  const nextNumber = state.currentStage.stageNumber + 1;
  if (nextNumber > STAGES_PER_DIFFICULTY) {
    return { success: false, state, reason: "Already the last stage of this difficulty — end the session instead." };
  }
  return jumpToFeedAnimalsStage(state, nextNumber as StageNumber, timestamp);
}

/** Shared by advanceFeedAnimalsStage and jumpToFeedAnimalsStage: generates the target stage and lands on START_ZONE (this game's Ready Position — see the platform's shared GameState). */
function enterFeedAnimalsStage(
  state: FeedAnimalsSessionState,
  difficulty: Difficulty,
  stageNumber: StageNumber,
  presetFields?: Pick<FeedAnimalsSessionConfig, "foodSize" | "reachHeight" | "reachSide" | "movementPattern">,
): FeedAnimalsActionResult {
  const transitionResult = state.gameState === GameState.START_ZONE ? { success: true as const, state: GameState.START_ZONE } : transition(state.gameState, GameState.START_ZONE);
  if (!transitionResult.success) {
    return { success: false, state, reason: transitionResult.reason };
  }
  // THERAPIST SETUP SIMPLIFICATION — config.difficulty/startingStage always
  // stay the ORIGINAL setup choice (currentDifficulty is the live indicator
  // — see FeedAnimalsSessionState's doc comment and
  // buildStoredFeedAnimalsSession's startingDifficulty). Only the technical
  // fields are refreshed here, from the new difficulty's preset, so a
  // mid-session "أسهل"/"أصعب" decision actually feels like that difficulty
  // instead of reusing stale values.
  const config = presetFields ? { ...state.config, ...presetFields } : state.config;
  return {
    success: true,
    state: {
      ...state,
      config,
      gameState: transitionResult.state,
      currentDifficulty: difficulty,
      currentStage: buildStageRuntime(state.seed, difficulty, stageNumber, config),
    },
  };
}

/**
 * Resolves the therapist's confirmation of the child's reach toward
 * `foodChoiceId`, within the CURRENT active round. A round already marked
 * `fed` is a no-op (never double-scored — task section 65's double-confirm
 * QA). A choice matching the round's `correctFood` feeds the animal,
 * records response time, and advances the pointer — auto-finalizing +
 * transitioning to STAGE_COMPLETE once every round is fed. Any OTHER food
 * choice within the SAME active round is INCORRECT: no round state changes
 * besides the counter, the round remains exactly as it was — task section
 * 29's "gentle wiggle... target remains... no punishment," never a failure
 * state.
 */
export function confirmFoodSelection(state: FeedAnimalsSessionState, foodChoiceId: string, timestamp: number): FeedAnimalsActionResult {
  if (safeElapsedMs(timestamp, state.createdAt) === null) return { success: false, state, reason: "Invalid action timestamp." };
  if (state.gameState !== GameState.PLAYING) {
    return { success: false, state, reason: "A food choice can only be confirmed while PLAYING." };
  }

  const stage = state.currentStage;
  if (stage.pausedAt !== null) {
    return { success: false, state, reason: "Cannot confirm a food choice while paused." };
  }

  if (currentRound(stage) === null) {
    return { success: false, state, reason: "Every round in this stage is already fed." };
  }

  // Look up the choice by IDENTITY across every round in the stage (not
  // just the current one) — same "find by id, then check its own isPopped/
  // fed flag" idempotency shape as Bubble Pop Wall's confirmBubbleSelection.
  // This is what keeps a stale re-confirmation of a choice whose round has
  // ALREADY been fed (currentRoundIndex has since moved on) a safe no-op
  // rather than an "unknown choice" error — the double-confirm-protection
  // scenario (task section 65): liveRecordRef updates synchronously inside
  // the controller's publish() before Firebase resolves, so a second rapid
  // tap can reach this function after the first has already advanced the
  // pointer, carrying the SAME (now-stale) choice id.
  const roundIndex = stage.rounds.findIndex((r) => r.choices.some((c) => c.id === foodChoiceId));
  if (roundIndex === -1) {
    return { success: false, state, reason: `Unknown food choice: ${foodChoiceId}` };
  }
  const round = stage.rounds[roundIndex];
  if (round.fed) {
    return { success: true, state };
  }
  if (roundIndex !== stage.currentRoundIndex) {
    return { success: false, state, reason: "Food choice does not belong to the active round." };
  }

  const choice = round.choices.find((c) => c.id === foodChoiceId)!;

  if (choice.food !== round.correctFood) {
    const updatedStage: FeedAnimalsStageRuntime = { ...stage, incorrectCount: stage.incorrectCount + 1 };
    return { success: true, state: { ...state, currentStage: updatedStage } };
  }

  const responseTimeMs = safeElapsedMs(timestamp, stage.roundStartedAt ?? timestamp, stage.roundPausedMs);
  const updatedRounds = stage.rounds.map((r, i) => (i === stage.currentRoundIndex ? { ...r, fed: true } : r));
  const nextRoundIndex = stage.currentRoundIndex + 1;
  const updatedStage: FeedAnimalsStageRuntime = {
    ...stage,
    rounds: updatedRounds,
    currentRoundIndex: nextRoundIndex,
    responseTimesMs: responseTimeMs === null ? stage.responseTimesMs : [...stage.responseTimesMs, responseTimeMs],
    roundStartedAt: timestamp,
    roundPausedMs: 0,
  };

  let nextState: FeedAnimalsSessionState = { ...state, currentStage: updatedStage };

  if (nextRoundIndex >= updatedStage.rounds.length) {
    nextState = finalizeCurrentFeedAnimalsStage(nextState, timestamp, FeedAnimalsStageStatus.COMPLETED);
    const stageCompleteResult = transition(nextState.gameState, GameState.STAGE_COMPLETE);
    if (stageCompleteResult.success) {
      nextState = { ...nextState, gameState: stageCompleteResult.state };
    }
  }

  return { success: true, state: nextState };
}

/**
 * SAFARI ANIMAL ADVENTURE — the path mechanic's own core action, the direct
 * equivalent of confirmFoodSelection for a "path" stage: RIGHT advances
 * progress by one step, LEFT retreats by one step, JUMP performs that same
 * forward advance but ONLY when the very next step is a jump-requiring
 * obstacle (BRANCH/PIT/LOG — see pathStages.ts's
 * feedAnimalsObstacleRequiresJump). Always clamped into [0, leg.totalSteps]
 * — pressing past either end, pressing RIGHT into a blocked obstacle, or
 * pressing JUMP where none is needed are all safe, silent no-ops (never a
 * teleport, never a skip, never a punishment — task's explicit "do not
 * advance incorrectly" for an unnecessary jump), which is also what makes
 * rapid/double taps safe: each call only ever moves by exactly one step from
 * whatever `state` it's actually given.
 *
 * MULTI-ANIMAL STAGES — reaching the end of a leg that ISN'T the stage's
 * last leg advances legIndex and resets pathProgressStep to 0 for the next
 * animal's own route, without finalizing the stage. Only reaching the end of
 * the FINAL leg auto-finalizes the stage as COMPLETED and transitions to
 * STAGE_COMPLETE, mirroring confirmFoodSelection's own "last round" tail
 * behavior.
 */
export function advanceFeedAnimalsMonkey(state: FeedAnimalsSessionState, direction: "left" | "right" | "jump", timestamp: number): FeedAnimalsActionResult {
  if (safeElapsedMs(timestamp, state.createdAt) === null) return { success: false, state, reason: "Invalid action timestamp." };
  if (state.gameState !== GameState.PLAYING) {
    return { success: false, state, reason: "The animal can only move while PLAYING." };
  }

  const stage = state.currentStage;
  if (stage.kind !== "path") {
    return { success: false, state, reason: "This stage has no path to move along." };
  }
  if (stage.pausedAt !== null) {
    return { success: false, state, reason: "Cannot move the animal while paused." };
  }

  const pathDef = getFeedAnimalsPathStage(stage.difficulty, stage.stageNumber);
  if (!pathDef) {
    return { success: false, state, reason: "No path definition for this stage." };
  }
  const activeLeg = getFeedAnimalsPathLeg(pathDef, stage.legIndex);

  if (direction === "left") {
    const nextStep = Math.max(stage.pathProgressStep - 1, 0);
    if (nextStep === stage.pathProgressStep) return { success: true, state };
    return { success: true, state: { ...state, currentStage: { ...stage, pathProgressStep: nextStep } } };
  }

  const blockingObstacle = activeLeg.obstacles.find((o) => o.atStep === stage.pathProgressStep + 1 && feedAnimalsObstacleRequiresJump(o.kind));
  if (direction === "right" && blockingObstacle) {
    // Blocked — the child must use JUMP here instead (task's "visible cue + Mariam says اقفز!"). A harmless no-op, never a punishment.
    return { success: true, state };
  }
  if (direction === "jump" && !blockingObstacle) {
    // Wrong/unnecessary jump — a small playful hop is fine, but never advances (task's explicit "do not advance incorrectly").
    return { success: true, state };
  }

  const nextStep = Math.min(stage.pathProgressStep + 1, activeLeg.totalSteps);
  if (nextStep === stage.pathProgressStep) {
    return { success: true, state };
  }

  const reachedLegEnd = nextStep >= activeLeg.totalSteps;
  const isLastLeg = stage.legIndex >= pathDef.legs.length - 1;
  const responseTimeMs = safeElapsedMs(timestamp, stage.roundStartedAt ?? timestamp, stage.roundPausedMs);

  if (reachedLegEnd && !isLastLeg) {
    // MULTI-ANIMAL STAGES — this animal's own journey is done; the next leg's animal takes over. Not a stage completion yet.
    const updatedStage: FeedAnimalsStageRuntime = {
      ...stage,
      legIndex: stage.legIndex + 1,
      pathProgressStep: 0,
      responseTimesMs: responseTimeMs === null ? stage.responseTimesMs : [...stage.responseTimesMs, responseTimeMs],
      roundStartedAt: timestamp,
      roundPausedMs: 0,
    };
    return { success: true, state: { ...state, currentStage: updatedStage } };
  }

  const updatedStage: FeedAnimalsStageRuntime = {
    ...stage,
    pathProgressStep: nextStep,
    responseTimesMs: reachedLegEnd && responseTimeMs !== null ? [...stage.responseTimesMs, responseTimeMs] : stage.responseTimesMs,
  };

  let nextState: FeedAnimalsSessionState = { ...state, currentStage: updatedStage };

  if (reachedLegEnd && isLastLeg) {
    nextState = finalizeCurrentFeedAnimalsStage(nextState, timestamp, FeedAnimalsStageStatus.COMPLETED);
    const stageCompleteResult = transition(nextState.gameState, GameState.STAGE_COMPLETE);
    if (stageCompleteResult.success) {
      nextState = { ...nextState, gameState: stageCompleteResult.state };
    }
  }

  return { success: true, state: nextState };
}

/** Pauses the current stage — the current round remains visible, confirmation disabled, timing paused (both stage-level and current-round-level). */
export function pauseFeedAnimalsSession(state: FeedAnimalsSessionState, timestamp: number): FeedAnimalsActionResult {
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

export function resumeFeedAnimalsSession(state: FeedAnimalsSessionState, timestamp: number): FeedAnimalsActionResult {
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
  const updatedStage: FeedAnimalsStageRuntime = {
    ...stage,
    pausedAt: null,
    totalPausedMs: stage.totalPausedMs + pausedFor,
    roundPausedMs: stage.roundPausedMs + pausedFor,
  };
  return { success: true, state: { ...state, currentStage: updatedStage } };
}

/** Regenerates the current stage from the same (seed, difficulty, stageNumber, config) — deterministically identical rounds — and resets every runtime metric. A restart is a clean retry, not a new random one. */
export function restartFeedAnimalsStage(state: FeedAnimalsSessionState, timestamp: number): FeedAnimalsActionResult {
  if (safeElapsedMs(timestamp, state.createdAt) === null) return { success: false, state, reason: "Invalid action timestamp." };
  if (state.gameState !== GameState.PLAYING) {
    return { success: false, state, reason: "Can only restart while PLAYING." };
  }
  const stage = state.currentStage;
  const freshStage: FeedAnimalsStageRuntime = {
    ...buildStageRuntime(state.seed, stage.difficulty, stage.stageNumber, state.config),
    startedAt: timestamp,
    roundStartedAt: timestamp,
  };
  return { success: true, state: { ...state, currentStage: freshStage } };
}

/** Therapist-initiated early end — same semantics as every other game: a stage actively announced but not yet finalized is recorded SKIPPED with its real partial progress; nothing further is added for a stage never entered or already finalized. */
export function endFeedAnimalsSession(state: FeedAnimalsSessionState, timestamp: number): FeedAnimalsActionResult {
  const totalDurationMs = safeElapsedMs(timestamp, state.createdAt);
  if (totalDurationMs === null) return { success: false, state, reason: "Invalid session timestamp." };
  if (state.gameState === GameState.SESSION_COMPLETE) {
    return { success: false, state, reason: "Session already ended." };
  }

  const inProgressStates: readonly GameState[] = [GameState.INSTRUCTIONS, GameState.COUNTDOWN, GameState.PLAYING];
  const stateWithFinalStage = inProgressStates.includes(state.gameState)
    ? finalizeCurrentFeedAnimalsStage(state, timestamp, FeedAnimalsStageStatus.SKIPPED)
    : state;

  const summary = buildFeedAnimalsSessionSummary({
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

function stampRoundStart(state: FeedAnimalsSessionState, timestamp: number): FeedAnimalsSessionState {
  const stage = state.currentStage;
  if (stage.startedAt !== null) return state;
  return { ...state, currentStage: { ...stage, startedAt: timestamp, roundStartedAt: timestamp } };
}

function finalizeCurrentFeedAnimalsStage(state: FeedAnimalsSessionState, timestamp: number, status: FeedAnimalsStageStatus): FeedAnimalsSessionState {
  const stage = state.currentStage;
  if (stage.completedAt !== null) return state;

  const openPauseMs = stage.pausedAt === null ? 0 : safeElapsedMs(timestamp, stage.pausedAt);
  const durationMs = openPauseMs === null ? null : safeElapsedMs(timestamp, stage.startedAt ?? timestamp, stage.totalPausedMs + openPauseMs);
  // SAFARI ANIMAL ADVENTURE — a path stage has no `rounds` array (see
  // FeedAnimalsStageRuntime's doc comment); it reads as "N legs" for
  // reporting purposes (history compatibility — FeedAnimalsStageResult's
  // shape is unchanged), N being however many animals this stage's route
  // has (1 for every single-animal stage, more for Medium 5 / Advanced 4 /
  // Advanced 5). completed=every leg only when this function is called with
  // COMPLETED (advanceFeedAnimalsMonkey already guarantees that only
  // happens once the FINAL leg's progress genuinely reached its
  // destination); every SKIPPED call here is, by construction, a stage
  // abandoned mid-progress — legIndex is exactly how many earlier legs were
  // already finished (since a completed path stage transitions straight to
  // STAGE_COMPLETE and the `completedAt !== null` guard above short-
  // circuits any later finalize call for it).
  const pathDef = stage.kind === "path" ? getFeedAnimalsPathStage(stage.difficulty, stage.stageNumber) : null;
  const totalLegs = pathDef?.legs.length ?? 1;
  const roundsPresented = stage.kind === "path" ? totalLegs : stage.rounds.length;
  const roundsCompleted = stage.kind === "path" ? (status === FeedAnimalsStageStatus.COMPLETED ? totalLegs : stage.legIndex) : stage.currentRoundIndex;
  const result = finalizeFeedAnimalsStageResult({
    difficulty: stage.difficulty,
    stageNumber: stage.stageNumber,
    status,
    roundsPresented,
    roundsCompleted,
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

import { getAdjacentDifficulty, STAGES_PER_DIFFICULTY } from "./difficultyRules";
import { buildSessionSummary, finalizeStageResult } from "./scoring";
import { generateStage, type GeneratedStage } from "./stageGenerator";
import { transition } from "./stateMachine";
import {
  type Balloon,
  type BalloonColor,
  Difficulty,
  GameState,
  type PlayArea,
  type SessionConfig,
  type SessionSummary,
  StageStatus,
  type StageNumber,
  type StageResult,
  type TargetSize,
  type TargetSpacing,
} from "./types";

/** Runtime state for the one currently-active stage: its generated balloons plus everything scored during play. */
export interface StageRuntime {
  /** TASK 11: which difficulty this stage belongs to — a session's currentDifficulty can change (see advanceToStage), so this travels with the stage itself rather than being assumed from session-level state. */
  difficulty: Difficulty;
  stageNumber: StageNumber;
  targetColor: BalloonColor;
  balloons: Balloon[];
  totalTargets: number;
  correctCount: number;
  incorrectCount: number;
  reactionTimesMs: number[];
  /** Epoch ms when this stage's PLAYING phase began; null until then. Reaction times are measured from here. */
  startedAt: number | null;
  /** Epoch ms when this stage was finalized (completed or skipped). */
  completedAt: number | null;
  /** Epoch ms this stage was paused at; null when not currently paused. */
  pausedAt: number | null;
  /** Cumulative paused duration, excluded from reaction time and stage duration. */
  totalPausedMs: number;
}

/**
 * The full state of one Balloon Quest session. Immutable — every action
 * returns a new SessionState.
 *
 * TASK 11 — STAGE NAVIGATION MODEL: each difficulty (EASY/MEDIUM/ADVANCED)
 * has exactly 5 stages (15 possible total), but a session no longer
 * pre-generates any fixed set of them up front — only `currentStage` is
 * ever "real" (actually generated, with real balloons) at any moment.
 * Every OTHER stage the session ever visits is generated lazily, exactly
 * when the therapist actually moves onto it — see jumpToStage and
 * advanceToStage below. This is deliberate, not a simplification for its
 * own sake: since a session can change difficulty mid-way and can skip
 * arbitrarily far ahead, there is no fixed list of "this session's stages"
 * to pre-compute — what actually gets played depends entirely on the
 * therapist's live decisions.
 *
 * `currentDifficulty` starts equal to `config.difficulty` (the therapist's
 * setup choice) but can change via advanceToStage's "أسهل"/"أصعب" decision;
 * `config.difficulty` itself never changes — it documents how the session
 * was originally set up. `results` accumulates one StageResult per stage
 * the session has moved PAST (completed or skipped, via
 * finalizeCurrentStage/jumpToStage's placeholder entries) — the therapist
 * report and family report both group this list by `result.difficulty`
 * (see scoring.ts's difficultiesPlayed and the Task 11 report).
 *
 * THREE ways to leave the current stage, all ending at START_ZONE (never
 * straight into the next stage's INSTRUCTIONS — the child must physically
 * return to the Start Zone first, see stateMachine.ts):
 *  1. Natural completion (selectBalloon, every target popped) -> STAGE_COMPLETE,
 *     then the therapist's advanceToStage() decision (continue same
 *     difficulty, or step to the adjacent easier/harder one).
 *  2. skipStage() — therapist ends the CURRENT stage early, moves to
 *     stageNumber+1 in the same difficulty. A thin wrapper around jumpToStage.
 *  3. jumpToStage() — the stage strip's forward jump, to any later stage
 *     number in the same difficulty; any stage strictly in between is
 *     recorded as SKIPPED with no gameplay data (it was never entered).
 */
export interface SessionState {
  sessionId: string;
  seed: string;
  config: SessionConfig;
  gameState: GameState;
  /** The difficulty currentStage belongs to right now — starts as config.difficulty, can change via advanceToStage. */
  currentDifficulty: Difficulty;
  currentStage: StageRuntime;
  /** History of every stage this session has moved past (completed or skipped) — see the class doc comment. */
  results: StageResult[];
  createdAt: number;
  endedAt: number | null;
  summary: SessionSummary | null;
}

export type ActionResult =
  | { success: true; state: SessionState }
  | { success: false; state: SessionState; reason: string };

export interface CreateSessionParams {
  childFirstName: string;
  difficulty: Difficulty;
  targetSize: TargetSize;
  targetSpacing: TargetSpacing;
  playArea: PlayArea;
  /** TASK 12: which stage of `difficulty` this session actually begins at — see SessionConfig.startingStage. Defaults to 1. */
  startingStage?: StageNumber;
  /** Explicit seed for reproducible sessions (tests, debugging). Random when omitted. */
  seed?: string;
  /** Injectable clock for tests. Defaults to Date.now(). */
  now?: number;
}

function stageRuntimeFromGenerated(generated: GeneratedStage, difficulty: Difficulty): StageRuntime {
  return {
    difficulty,
    stageNumber: generated.stageNumber,
    targetColor: generated.targetColor,
    balloons: generated.balloons,
    totalTargets: generated.totalTargets,
    correctCount: 0,
    incorrectCount: 0,
    reactionTimesMs: [],
    startedAt: null,
    completedAt: null,
    pausedAt: null,
    totalPausedMs: 0,
  };
}

/**
 * Starts a brand new session: a fresh session ID, a fresh seed (unless one
 * is supplied), and the chosen starting stage of the chosen difficulty
 * generated up front — every later stage is generated lazily as the
 * therapist actually reaches it (see the class doc comment). Nothing here
 * is carried over from any previous session — see session isolation note
 * in the Task 2 report.
 *
 * TASK 12: `startingStage` (default 1) is a manual therapist choice — "this
 * child reached Medium 3 last time" — never a guess or a result of
 * anything in-session. Stages before it were never entered, so they never
 * appear in `results` (see StageResult's doc comment: SKIPPED is reserved
 * for stages the therapist actively moved past during THIS session).
 */
export function createSession(params: CreateSessionParams): SessionState {
  const startingStage = params.startingStage ?? 1;
  const config: SessionConfig = {
    childFirstName: params.childFirstName,
    difficulty: params.difficulty,
    targetSize: params.targetSize,
    targetSpacing: params.targetSpacing,
    playArea: params.playArea,
    startingStage,
  };
  const seed = params.seed ?? randomToken();

  const generated = generateStage({ seed, difficulty: config.difficulty, stageNumber: startingStage, config });

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
  };
}

/**
 * Applies a WELCOME -> SETUP -> INSTRUCTIONS -> COUNTDOWN -> PLAYING style
 * transition. Entering PLAYING stamps the current stage's startedAt, which
 * is what reaction time is measured from.
 *
 * Do not use this to leave STAGE_COMPLETE, PLAYING, COUNTDOWN, or
 * INSTRUCTIONS toward START_ZONE — those destinations depend on which
 * specific stage comes next, which only jumpToStage/advanceToStage/skipStage
 * know how to decide. This function still accepts those edges structurally
 * (the underlying transition table allows them), but callers within this
 * module always use the dedicated functions instead.
 */
export function applyGameTransition(state: SessionState, to: GameState, timestamp: number): ActionResult {
  const result = transition(state.gameState, to);
  if (!result.success) {
    return { success: false, state, reason: result.reason };
  }

  let nextState: SessionState = { ...state, gameState: result.state };
  if (to === GameState.PLAYING) {
    nextState = stampStageStart(nextState, timestamp);
  }
  return { success: true, state: nextState };
}

/**
 * The therapist's post-STAGE_COMPLETE decision: continue in the same
 * difficulty (target.stageNumber === current + 1) or step to the adjacent
 * easier/harder difficulty AT THE SAME stage number (e.g. Medium 3 ->
 * Advanced 3 — see the Task 11 report's "Difficulty progression rules"
 * section for why stage number is preserved rather than reset or randomized).
 * Any other target is rejected — this is the only sanctioned way out of
 * STAGE_COMPLETE, and it never skips anything (unlike jumpToStage), since
 * the move is always to the very next meaningful stage.
 */
export function advanceToStage(state: SessionState, target: { difficulty: Difficulty; stageNumber: StageNumber }): ActionResult {
  if (state.gameState !== GameState.STAGE_COMPLETE) {
    return { success: false, state, reason: "Can only advance from STAGE_COMPLETE." };
  }

  const current = state.currentStage;
  const sameDifficulty = target.difficulty === state.currentDifficulty;
  const isContinue = sameDifficulty && target.stageNumber === current.stageNumber + 1;
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

  return enterStage(state, target.difficulty, target.stageNumber);
}

/**
 * Forward-jump to a later stage in the SAME difficulty — the therapist
 * stage strip's action. Valid any time a stage is active or has just
 * completed (INSTRUCTIONS/COUNTDOWN/PLAYING/STAGE_COMPLETE). The current
 * stage (if not already finalized, i.e. not already STAGE_COMPLETE) is
 * finalized as SKIPPED using whatever real partial progress it has; every
 * stage strictly between it and the target — never actually entered — is
 * recorded as SKIPPED with no gameplay data at all. Never allows jumping to
 * the current stage or an earlier one — see the Task 11 report's "Do NOT
 * allow chaotic navigation" section: this is the ONE place that rule is
 * enforced.
 */
export function jumpToStage(state: SessionState, targetStageNumber: StageNumber, timestamp: number): ActionResult {
  const validFrom: readonly GameState[] = [
    GameState.INSTRUCTIONS,
    GameState.COUNTDOWN,
    GameState.PLAYING,
    GameState.STAGE_COMPLETE,
  ];
  if (!validFrom.includes(state.gameState)) {
    return { success: false, state, reason: "Can only jump to a later stage while a stage is active or just completed." };
  }

  const currentStageNumber = state.currentStage.stageNumber;
  if (targetStageNumber <= currentStageNumber) {
    return { success: false, state, reason: "Can only jump forward — never to the current stage or an earlier one." };
  }

  const alreadyFinalized = state.gameState === GameState.STAGE_COMPLETE;
  const stateWithCurrentFinalized = alreadyFinalized ? state : finalizeCurrentStage(state, timestamp, StageStatus.SKIPPED);

  const skippedPlaceholders: StageResult[] = [];
  for (let n = currentStageNumber + 1; n < targetStageNumber; n++) {
    skippedPlaceholders.push(
      finalizeStageResult({
        difficulty: state.currentDifficulty,
        stageNumber: n as StageNumber,
        status: StageStatus.SKIPPED,
        targetColor: null,
        correctCount: 0,
        incorrectCount: 0,
        totalTargets: 0,
        durationMs: null,
        reactionTimesMs: [],
      }),
    );
  }
  const stateWithPlaceholders: SessionState = {
    ...stateWithCurrentFinalized,
    results: [...stateWithCurrentFinalized.results, ...skippedPlaceholders],
  };

  return enterStage(stateWithPlaceholders, state.currentDifficulty, targetStageNumber);
}

/**
 * Ends the CURRENT stage early and moves to the next stage number in the
 * same difficulty (stageNumber + 1) — a thin, single-step wrapper around
 * jumpToStage, kept as its own named action because it's the therapist's
 * "تخطي المرحلة" button (see SessionControls.tsx), distinct from the stage
 * strip's arbitrary forward jump. Rejected with no effect if the current
 * stage is already the difficulty's last (stage 5) — there is no stage 6 to
 * move to; the therapist ends the session instead.
 */
export function skipStage(state: SessionState, timestamp: number): ActionResult {
  const nextNumber = state.currentStage.stageNumber + 1;
  if (nextNumber > STAGES_PER_DIFFICULTY) {
    return { success: false, state, reason: "Already the last stage of this difficulty — end the session instead." };
  }
  return jumpToStage(state, nextNumber as StageNumber, timestamp);
}

/** Shared by advanceToStage and jumpToStage: generates the target stage and lands on START_ZONE. */
function enterStage(state: SessionState, difficulty: Difficulty, stageNumber: StageNumber): ActionResult {
  const transitionResult = transition(state.gameState, GameState.START_ZONE);
  if (!transitionResult.success) {
    return { success: false, state, reason: transitionResult.reason };
  }
  const generated = generateStage({ seed: state.seed, difficulty, stageNumber, config: state.config });
  return {
    success: true,
    state: {
      ...state,
      gameState: transitionResult.state,
      currentDifficulty: difficulty,
      currentStage: stageRuntimeFromGenerated(generated, difficulty),
    },
  };
}

/**
 * Resolves a therapist-confirmed balloon touch. Correct: pops the balloon,
 * records reaction time, and auto-finalizes + transitions to
 * STAGE_COMPLETE once every target is popped. Incorrect: balloon stays
 * active, incorrect count increments. Already-popped: no-op, never
 * double-scored.
 */
export function selectBalloon(state: SessionState, balloonId: string, timestamp: number): ActionResult {
  if (state.gameState !== GameState.PLAYING) {
    return { success: false, state, reason: "Balloons can only be selected while PLAYING." };
  }

  const stage = state.currentStage;
  if (stage.pausedAt !== null) {
    return { success: false, state, reason: "Cannot select a balloon while paused." };
  }

  const balloonIndex = stage.balloons.findIndex((balloon) => balloon.id === balloonId);
  if (balloonIndex === -1) {
    return { success: false, state, reason: `Unknown balloon: ${balloonId}` };
  }

  const balloon = stage.balloons[balloonIndex];
  if (balloon.isPopped) {
    return { success: true, state };
  }

  if (!balloon.isTarget) {
    const updatedStage: StageRuntime = { ...stage, incorrectCount: stage.incorrectCount + 1 };
    return { success: true, state: { ...state, currentStage: updatedStage } };
  }

  const reactionTimeMs = Math.max(0, timestamp - (stage.startedAt ?? timestamp) - stage.totalPausedMs);
  const updatedBalloons = stage.balloons.map((b, i) => (i === balloonIndex ? { ...b, isPopped: true } : b));
  const updatedStage: StageRuntime = {
    ...stage,
    balloons: updatedBalloons,
    correctCount: stage.correctCount + 1,
    reactionTimesMs: [...stage.reactionTimesMs, reactionTimeMs],
  };

  let nextState: SessionState = { ...state, currentStage: updatedStage };

  if (updatedStage.correctCount >= updatedStage.totalTargets) {
    nextState = finalizeCurrentStage(nextState, timestamp, StageStatus.COMPLETED);
    const stageCompleteResult = transition(nextState.gameState, GameState.STAGE_COMPLETE);
    if (stageCompleteResult.success) {
      nextState = { ...nextState, gameState: stageCompleteResult.state };
    }
  }

  return { success: true, state: nextState };
}

/** Pauses the current stage's timer. Reaction time and stage duration exclude paused time. */
export function pauseSession(state: SessionState, timestamp: number): ActionResult {
  if (state.gameState !== GameState.PLAYING) {
    return { success: false, state, reason: "Can only pause while PLAYING." };
  }
  const stage = state.currentStage;
  if (stage.pausedAt !== null) {
    return { success: false, state, reason: "Already paused." };
  }
  return { success: true, state: { ...state, currentStage: { ...stage, pausedAt: timestamp } } };
}

export function resumeSession(state: SessionState, timestamp: number): ActionResult {
  if (state.gameState !== GameState.PLAYING) {
    return { success: false, state, reason: "Can only resume while PLAYING." };
  }
  const stage = state.currentStage;
  if (stage.pausedAt === null) {
    return { success: false, state, reason: "Not paused." };
  }
  const updatedStage: StageRuntime = {
    ...stage,
    pausedAt: null,
    totalPausedMs: stage.totalPausedMs + Math.max(0, timestamp - stage.pausedAt),
  };
  return { success: true, state: { ...state, currentStage: updatedStage } };
}

/**
 * Regenerates the current stage from the same (seed, difficulty,
 * stageNumber, config) — deterministically the same balloon layout — and
 * resets every runtime metric (popped state, counts, timers). A restart is
 * a clean retry of the same challenge, not a new random one.
 */
export function restartStage(state: SessionState, timestamp: number): ActionResult {
  if (state.gameState !== GameState.PLAYING) {
    return { success: false, state, reason: "Can only restart while PLAYING." };
  }
  const stage = state.currentStage;
  const regenerated = generateStage({
    seed: state.seed,
    difficulty: stage.difficulty,
    stageNumber: stage.stageNumber,
    config: state.config,
  });
  const freshStage: StageRuntime = { ...stageRuntimeFromGenerated(regenerated, stage.difficulty), startedAt: timestamp };
  return { success: true, state: { ...state, currentStage: freshStage } };
}

/**
 * Therapist-initiated early end, valid from any state except one that's
 * already SESSION_COMPLETE. If the current stage was actively in progress
 * (INSTRUCTIONS/COUNTDOWN/PLAYING — announced to the child but not yet
 * finalized) it's finalized as SKIPPED using its partial progress first; a
 * stage the child never even saw (WELCOME/SETUP/START_ZONE) or one already
 * finalized (STAGE_COMPLETE) adds nothing further. The SessionSummary is
 * built from however many stage results exist — this is the only action
 * that jumps straight to SESSION_COMPLETE outside the normal table.
 */
export function endSession(state: SessionState, timestamp: number): ActionResult {
  if (state.gameState === GameState.SESSION_COMPLETE) {
    return { success: false, state, reason: "Session already ended." };
  }

  const inProgressStates: readonly GameState[] = [GameState.INSTRUCTIONS, GameState.COUNTDOWN, GameState.PLAYING];
  const stateWithFinalStage = inProgressStates.includes(state.gameState)
    ? finalizeCurrentStage(state, timestamp, StageStatus.SKIPPED)
    : state;

  const summary = buildSessionSummary({
    sessionId: stateWithFinalStage.sessionId,
    childFirstName: stateWithFinalStage.config.childFirstName,
    startingDifficulty: stateWithFinalStage.config.difficulty,
    stageResults: stateWithFinalStage.results,
    totalDurationMs: timestamp - stateWithFinalStage.createdAt,
    completedAt: new Date(timestamp).toISOString(),
  });

  return {
    success: true,
    state: { ...stateWithFinalStage, gameState: GameState.SESSION_COMPLETE, endedAt: timestamp, summary },
  };
}

function stampStageStart(state: SessionState, timestamp: number): SessionState {
  if (state.currentStage.startedAt !== null) return state;
  return { ...state, currentStage: { ...state.currentStage, startedAt: timestamp } };
}

function finalizeCurrentStage(state: SessionState, timestamp: number, status: StageStatus): SessionState {
  const stage = state.currentStage;
  if (stage.completedAt !== null) return state;

  const durationMs = Math.max(0, timestamp - (stage.startedAt ?? timestamp) - stage.totalPausedMs);
  const result = finalizeStageResult({
    difficulty: stage.difficulty,
    stageNumber: stage.stageNumber,
    status,
    targetColor: stage.targetColor,
    correctCount: stage.correctCount,
    incorrectCount: stage.incorrectCount,
    totalTargets: stage.totalTargets,
    durationMs,
    reactionTimesMs: stage.reactionTimesMs,
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

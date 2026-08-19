import { transition } from "@/lib/game";
import type { SessionWorkflowMetadata } from "@/lib/sessions/workflowMetadata";
import { safeElapsedMs } from "@/lib/dataIntegrity/numeric";
import { buildSpacePilotSessionSummary } from "./scoring";
import { ADVANCED_ENCOUNTER_SEQUENCE, encounterArrivalOffsetMs, encounterSequenceFor, MEDIUM_ENCOUNTER_SEQUENCE } from "./encounters";
import {
  CollectibleStarStatus,
  Difficulty,
  EncounterOutcome,
  EncounterType,
  GameState,
  STAR_LANE_ORDER,
  StarLane,
  type CollectibleStar,
  type SpaceEncounter,
  type SpacePilotSessionConfig,
  type SpacePilotSessionSummary,
} from "./types";

/**
 * EASY's fixed, hand-tuned star sequence (task's "Create a deterministic
 * introductory sequence... tune it so the child learns one lane change at a
 * time"). Deliberately a hardcoded array, not seeded RNG — the task gives
 * this EXACT progression as its example and explicitly warns against a
 * TOP -> BOTTOM jump with insufficient time between them; every consecutive
 * pair here changes by at most one lane rank (see STAR_LANE_ORDER), so no
 * jump ever skips the middle lane.
 */
export const STAR_LANE_SEQUENCE: readonly StarLane[] = [
  StarLane.MIDDLE,
  StarLane.TOP,
  StarLane.TOP,
  StarLane.MIDDLE,
  StarLane.BOTTOM,
  StarLane.MIDDLE,
  StarLane.TOP,
  StarLane.BOTTOM,
];

export const TOTAL_STARS = STAR_LANE_SEQUENCE.length;

/** Generous pediatric pacing (task's "Do NOT make the child race"): time from PLAYING start to the first star's collection moment, and the gap between every star after that. EASY only — MEDIUM/ADVANCED use encounterArrivalOffsetMs instead. */
export const FIRST_STAR_ARRIVAL_MS = 5000;
export const STAR_INTERVAL_MS = 7000;

/** The moment (elapsed ms since `startedAt`) star `index` reaches the rocket's collection zone — EASY only. */
export function starArrivalOffsetMs(index: number): number {
  return FIRST_STAR_ARRIVAL_MS + index * STAR_INTERVAL_MS;
}

/** How often a FIRE press may resolve an asteroid — task's "short sensible fire cooldown / in-flight guard" so rapid taps can't spam projectiles or double-count a single asteroid. */
export const FIRE_COOLDOWN_MS = 450;

/** EASY's runtime — its 8 fixed stars plus everything tracked during play. Untouched by the MEDIUM/ADVANCED encounter model below (task's "Do not otherwise redesign [EASY]"). */
export interface SpacePilotStageRuntime {
  kind: "STAR_ONLY";
  stars: CollectibleStar[];
  /** Pointer to the next star not yet resolved (collected or missed) — `stars.length` once every star has passed. */
  currentStarIndex: number;
  collectedCount: number;
  rocketLane: StarLane;
  /** Epoch ms when PLAYING began; null until then — the star schedule (starArrivalOffsetMs) is measured from here. */
  startedAt: number | null;
  /** Epoch ms the level was finalized (every star resolved); null while still in progress. */
  completedAt: number | null;
  pausedAt: number | null;
  totalPausedMs: number;
}

/**
 * MEDIUM/ADVANCED's runtime — a fixed sequence of stars/asteroids/(ADVANCED
 * only) a friendly alien, resolved one at a time in the same "one object in
 * flight" convention EASY already establishes. `lastFiredAt` backs the FIRE
 * cooldown (see FIRE_COOLDOWN_MS) — the only genuinely new piece of mutable
 * state this mode needs beyond EASY's own runtime shape.
 */
export interface SpacePilotEncounterStageRuntime {
  kind: "ENCOUNTER";
  encounters: SpaceEncounter[];
  /** Pointer to the next encounter not yet resolved — `encounters.length` once every encounter has passed. */
  currentEncounterIndex: number;
  collectedStars: number;
  asteroidsCleared: number;
  asteroidsAvoided: number;
  rocketLane: StarLane;
  startedAt: number | null;
  completedAt: number | null;
  pausedAt: number | null;
  totalPausedMs: number;
  lastFiredAt: number | null;
}

export type SpacePilotAnyStageRuntime = SpacePilotStageRuntime | SpacePilotEncounterStageRuntime;

export function isStarOnlyStage(stage: SpacePilotAnyStageRuntime): stage is SpacePilotStageRuntime {
  return stage.kind === "STAR_ONLY";
}

export function isEncounterStage(stage: SpacePilotAnyStageRuntime): stage is SpacePilotEncounterStageRuntime {
  return stage.kind === "ENCOUNTER";
}

/**
 * The full state of one Space Pilot session. Immutable — every action
 * returns a new SpacePilotSessionState. `currentStage`'s shape depends on
 * `currentDifficulty`: EASY always carries a SpacePilotStageRuntime,
 * MEDIUM/ADVANCED always carry a SpacePilotEncounterStageRuntime (`kind`
 * discriminates the two at every call site that branches on it).
 */
export interface SpacePilotSessionState {
  sessionId: string;
  seed: string;
  config: SpacePilotSessionConfig;
  gameState: GameState;
  currentDifficulty: Difficulty;
  currentStage: SpacePilotAnyStageRuntime;
  createdAt: number;
  endedAt: number | null;
  summary: SpacePilotSessionSummary | null;
  workflow?: SessionWorkflowMetadata;
}

export type SpacePilotActionResult =
  | { success: true; state: SpacePilotSessionState }
  | { success: false; state: SpacePilotSessionState; reason: string };

export interface CreateSpacePilotSessionParams {
  childFirstName: string;
  /** Which of the three stages to fly — defaults to EASY (the original single-level prototype's behavior). */
  difficulty?: Difficulty;
  seed?: string;
  now?: number;
  workflow?: SessionWorkflowMetadata;
}

function freshStarOnlyStage(): SpacePilotStageRuntime {
  return {
    kind: "STAR_ONLY",
    stars: STAR_LANE_SEQUENCE.map((lane, index) => ({
      id: `star-${index}`,
      index,
      lane,
      status: CollectibleStarStatus.PENDING,
    })),
    currentStarIndex: 0,
    collectedCount: 0,
    rocketLane: StarLane.MIDDLE,
    startedAt: null,
    completedAt: null,
    pausedAt: null,
    totalPausedMs: 0,
  };
}

function freshEncounterStage(difficulty: Difficulty): SpacePilotEncounterStageRuntime {
  const sequence = encounterSequenceFor(difficulty);
  return {
    kind: "ENCOUNTER",
    encounters: sequence.map((e) => ({ ...e, id: `${difficulty.toLowerCase()}-encounter-${e.index}`, status: EncounterOutcome.PENDING })),
    currentEncounterIndex: 0,
    collectedStars: 0,
    asteroidsCleared: 0,
    asteroidsAvoided: 0,
    rocketLane: StarLane.MIDDLE,
    startedAt: null,
    completedAt: null,
    pausedAt: null,
    totalPausedMs: 0,
    lastFiredAt: null,
  };
}

function freshStageFor(difficulty: Difficulty): SpacePilotAnyStageRuntime {
  return difficulty === Difficulty.EASY ? freshStarOnlyStage() : freshEncounterStage(difficulty);
}

/** Total encounters/stars a difficulty's fixed sequence contains — used by the controller's timed chain to know when to stop. */
export function totalEncountersFor(difficulty: Difficulty): number {
  return difficulty === Difficulty.EASY ? TOTAL_STARS : encounterSequenceFor(difficulty).length;
}

export function createSpacePilotSession(params: CreateSpacePilotSessionParams): SpacePilotSessionState {
  const difficulty = params.difficulty ?? Difficulty.EASY;
  return {
    sessionId: randomToken(),
    seed: params.seed ?? randomToken(),
    config: { childFirstName: params.childFirstName },
    gameState: GameState.WELCOME,
    currentDifficulty: difficulty,
    currentStage: freshStageFor(difficulty),
    createdAt: params.now ?? Date.now(),
    endedAt: null,
    summary: null,
    ...(params.workflow ? { workflow: params.workflow } : {}),
  };
}

/** Applies a WELCOME -> SETUP -> START_ZONE -> INSTRUCTIONS -> COUNTDOWN -> PLAYING transition — reuses lib/game/stateMachine.ts's transition() directly, same table every other game shares. Entering PLAYING stamps the schedule's own t=0. */
export function applySpacePilotGameTransition(state: SpacePilotSessionState, to: GameState, timestamp: number): SpacePilotActionResult {
  if (safeElapsedMs(timestamp, state.createdAt) === null) return { success: false, state, reason: "Invalid action timestamp." };
  const result = transition(state.gameState, to);
  if (!result.success) {
    return { success: false, state, reason: result.reason };
  }
  let nextState: SpacePilotSessionState = { ...state, gameState: result.state };
  if (to === GameState.PLAYING && nextState.currentStage.startedAt === null) {
    nextState = { ...nextState, currentStage: { ...nextState.currentStage, startedAt: timestamp } };
  }
  return { success: true, state: nextState };
}

/**
 * The child's (mirrored-by-therapist) UP/DOWN press — moves the rocket one
 * lane, clamped at TOP/BOTTOM (task's "Never move beyond the three lanes" /
 * "NO RAPID INPUT BUG": a rapid string of UP presses while already at TOP
 * simply stays at TOP, never wraps or produces an out-of-range lane). Same
 * logic for every difficulty — only the runtime's `kind` differs.
 */
export function moveSpacePilotRocketLane(state: SpacePilotSessionState, direction: "UP" | "DOWN"): SpacePilotActionResult {
  if (state.gameState !== GameState.PLAYING) {
    return { success: false, state, reason: "The rocket can only move while PLAYING." };
  }
  const stage = state.currentStage;
  if (stage.pausedAt !== null) {
    return { success: false, state, reason: "Cannot move while paused." };
  }
  const currentIndex = STAR_LANE_ORDER.indexOf(stage.rocketLane);
  const nextIndex = direction === "UP" ? Math.max(0, currentIndex - 1) : Math.min(STAR_LANE_ORDER.length - 1, currentIndex + 1);
  const nextLane = STAR_LANE_ORDER[nextIndex];
  if (nextLane === stage.rocketLane) {
    return { success: true, state }; // already at the boundary lane — no-op, not an error
  }
  return { success: true, state: { ...state, currentStage: { ...stage, rocketLane: nextLane } } };
}

/**
 * Resolves star `starIndex` reaching the collection zone — EASY's CORE
 * gameplay action, called by the controller's own timed star-sequence chain
 * (see lib/control/spacepilot/useSpacePilotRealtimeControllerSession.ts)
 * rather than by any tap. COLLECTED when the rocket's current lane matches
 * the star's lane at this exact moment; otherwise MISSED — never a failure
 * state (task's "no punishment... the star can pass harmlessly"), gameplay
 * simply continues to the next star. `starIndex` must equal the stage's own
 * `currentStarIndex` — a stale/duplicate call (e.g. two controller tabs
 * racing) is rejected as a no-op success:false, never double-resolving the
 * same star.
 */
export function resolveSpacePilotStarArrival(state: SpacePilotSessionState, starIndex: number, timestamp: number): SpacePilotActionResult {
  if (safeElapsedMs(timestamp, state.createdAt) === null) return { success: false, state, reason: "Invalid action timestamp." };
  if (state.gameState !== GameState.PLAYING) {
    return { success: false, state, reason: "A star can only resolve while PLAYING." };
  }
  const stage = state.currentStage;
  if (stage.kind !== "STAR_ONLY") {
    return { success: false, state, reason: "resolveSpacePilotStarArrival only applies to EASY's star-only stage." };
  }
  if (stage.pausedAt !== null) {
    return { success: false, state, reason: "Cannot resolve a star while paused." };
  }
  if (starIndex !== stage.currentStarIndex) {
    return { success: false, state, reason: `Star ${starIndex} already resolved (current is ${stage.currentStarIndex}).` };
  }
  const star = stage.stars[starIndex];
  const collected = star.lane === stage.rocketLane;
  const updatedStars = stage.stars.map((s, i) => (i === starIndex ? { ...s, status: collected ? CollectibleStarStatus.COLLECTED : CollectibleStarStatus.MISSED } : s));
  const nextIndex = starIndex + 1;
  const updatedStage: SpacePilotStageRuntime = {
    ...stage,
    stars: updatedStars,
    currentStarIndex: nextIndex,
    collectedCount: stage.collectedCount + (collected ? 1 : 0),
  };

  let nextState: SpacePilotSessionState = { ...state, currentStage: updatedStage };

  if (nextIndex >= updatedStage.stars.length) {
    nextState = { ...nextState, currentStage: { ...updatedStage, completedAt: timestamp } };
    const stageCompleteResult = transition(nextState.gameState, GameState.STAGE_COMPLETE);
    if (stageCompleteResult.success) {
      nextState = { ...nextState, gameState: stageCompleteResult.state };
    }
  }

  return { success: true, state: nextState };
}

/**
 * Resolves encounter `encounterIndex` reaching the collection zone —
 * MEDIUM/ADVANCED's analogue of resolveSpacePilotStarArrival, called by the
 * controller's timed chain once the encounter's scheduled arrival passes
 * WITHOUT it already having been resolved early by FIRE (see
 * fireSpacePilotWeapon below). A STAR resolves by lane match exactly like
 * EASY; an ASTEROID that reaches this point without being cleared always
 * resolves AVOIDED (task's "No punishment... asteroid passes harmlessly" —
 * true whether the child changed lane or not); an ALIEN always resolves
 * PASSED. Same stale/duplicate-index guard as EASY's version.
 */
export function resolveSpacePilotEncounterArrival(state: SpacePilotSessionState, encounterIndex: number, timestamp: number): SpacePilotActionResult {
  if (safeElapsedMs(timestamp, state.createdAt) === null) return { success: false, state, reason: "Invalid action timestamp." };
  if (state.gameState !== GameState.PLAYING) {
    return { success: false, state, reason: "An encounter can only resolve while PLAYING." };
  }
  const stage = state.currentStage;
  if (stage.kind !== "ENCOUNTER") {
    return { success: false, state, reason: "resolveSpacePilotEncounterArrival only applies to MEDIUM/ADVANCED's encounter stage." };
  }
  if (stage.pausedAt !== null) {
    return { success: false, state, reason: "Cannot resolve an encounter while paused." };
  }
  if (encounterIndex !== stage.currentEncounterIndex) {
    return { success: false, state, reason: `Encounter ${encounterIndex} already resolved (current is ${stage.currentEncounterIndex}).` };
  }
  const encounter = stage.encounters[encounterIndex];
  let status: EncounterOutcome;
  let collectedDelta = 0;
  let avoidedDelta = 0;
  if (encounter.type === EncounterType.STAR) {
    const collected = encounter.lane === stage.rocketLane;
    status = collected ? EncounterOutcome.COLLECTED : EncounterOutcome.MISSED;
    collectedDelta = collected ? 1 : 0;
  } else if (encounter.type === EncounterType.ASTEROID) {
    status = EncounterOutcome.AVOIDED;
    avoidedDelta = 1;
  } else {
    status = EncounterOutcome.PASSED;
  }

  const updatedEncounters = stage.encounters.map((e, i) => (i === encounterIndex ? { ...e, status } : e));
  const nextIndex = encounterIndex + 1;
  const updatedStage: SpacePilotEncounterStageRuntime = {
    ...stage,
    encounters: updatedEncounters,
    currentEncounterIndex: nextIndex,
    collectedStars: stage.collectedStars + collectedDelta,
    asteroidsAvoided: stage.asteroidsAvoided + avoidedDelta,
  };

  let nextState: SpacePilotSessionState = { ...state, currentStage: updatedStage };

  if (nextIndex >= updatedStage.encounters.length) {
    nextState = { ...nextState, currentStage: { ...updatedStage, completedAt: timestamp } };
    const stageCompleteResult = transition(nextState.gameState, GameState.STAGE_COMPLETE);
    if (stageCompleteResult.success) {
      nextState = { ...nextState, gameState: stageCompleteResult.state };
    }
  }

  return { success: true, state: nextState };
}

/**
 * The child's (mirrored-by-therapist) FIRE press — MEDIUM/ADVANCED only.
 * Resolves the CURRENT PENDING encounter immediately, but only when it is
 * genuinely a valid target: type ASTEROID, lane matches the rocket's
 * CURRENT lane. Anything else (no pending encounter, wrong type, wrong
 * lane) is a harmless "shot into empty space" — `lastFiredAt` still
 * advances (so the cooldown always applies, task's "rapid FIRE taps must
 * not... double-count asteroid") but nothing resolves. This is the ONLY
 * way an ASTEROID becomes CLEARED — task's "Prevent... one FIRE clearing
 * multiple unrelated encounters accidentally" is automatic here since only
 * the single current pending encounter can ever be the target.
 */
export function fireSpacePilotWeapon(state: SpacePilotSessionState, timestamp: number): SpacePilotActionResult {
  if (safeElapsedMs(timestamp, state.createdAt) === null) return { success: false, state, reason: "Invalid action timestamp." };
  if (state.gameState !== GameState.PLAYING) {
    return { success: false, state, reason: "FIRE only works while PLAYING." };
  }
  const stage = state.currentStage;
  if (stage.kind !== "ENCOUNTER") {
    return { success: false, state, reason: "FIRE only exists on MEDIUM/ADVANCED." };
  }
  if (stage.pausedAt !== null) {
    return { success: false, state, reason: "Cannot fire while paused." };
  }
  if (stage.lastFiredAt !== null && timestamp - stage.lastFiredAt < FIRE_COOLDOWN_MS) {
    return { success: true, state }; // cooldown still active — silently ignored, not an error
  }

  const encounter = stage.currentEncounterIndex < stage.encounters.length ? stage.encounters[stage.currentEncounterIndex] : null;
  const hitsAsteroid = encounter !== null && encounter.type === EncounterType.ASTEROID && encounter.lane === stage.rocketLane && encounter.status === EncounterOutcome.PENDING;

  if (!hitsAsteroid) {
    return { success: true, state: { ...state, currentStage: { ...stage, lastFiredAt: timestamp } } };
  }

  const updatedEncounters = stage.encounters.map((e, i) => (i === stage.currentEncounterIndex ? { ...e, status: EncounterOutcome.CLEARED } : e));
  const nextIndex = stage.currentEncounterIndex + 1;
  const updatedStage: SpacePilotEncounterStageRuntime = {
    ...stage,
    encounters: updatedEncounters,
    currentEncounterIndex: nextIndex,
    asteroidsCleared: stage.asteroidsCleared + 1,
    lastFiredAt: timestamp,
  };

  let nextState: SpacePilotSessionState = { ...state, currentStage: updatedStage };
  if (nextIndex >= updatedStage.encounters.length) {
    nextState = { ...nextState, currentStage: { ...updatedStage, completedAt: timestamp } };
    const stageCompleteResult = transition(nextState.gameState, GameState.STAGE_COMPLETE);
    if (stageCompleteResult.success) {
      nextState = { ...nextState, gameState: stageCompleteResult.state };
    }
  }
  return { success: true, state: nextState };
}

export function pauseSpacePilotSession(state: SpacePilotSessionState, timestamp: number): SpacePilotActionResult {
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

export function resumeSpacePilotSession(state: SpacePilotSessionState, timestamp: number): SpacePilotActionResult {
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
  return { success: true, state: { ...state, currentStage: { ...stage, pausedAt: null, totalPausedMs: stage.totalPausedMs + pausedFor } } };
}

/** Regenerates the level from scratch — same fixed sequence, rocket back to MIDDLE, upgrade back to 0 (task's "Same deterministic sequence... Upgrade resets to 0"). A restart is a clean retry, never a new random one (there is nothing random to begin with). */
export function restartSpacePilotLevel(state: SpacePilotSessionState, timestamp: number): SpacePilotActionResult {
  if (safeElapsedMs(timestamp, state.createdAt) === null) return { success: false, state, reason: "Invalid action timestamp." };
  if (state.gameState !== GameState.PLAYING) {
    return { success: false, state, reason: "Can only restart while PLAYING." };
  }
  return { success: true, state: { ...state, currentStage: { ...freshStageFor(state.currentDifficulty), startedAt: timestamp } } };
}

/** Switches the live mission tier without ending the patient session. Each tier is Space Pilot's one canonical mission, so it restarts at its deterministic beginning and returns to the Start Zone. */
export function switchSpacePilotDifficulty(state: SpacePilotSessionState, difficulty: Difficulty): SpacePilotActionResult {
  if (difficulty === state.currentDifficulty) return { success: true, state };
  const valid = [GameState.START_ZONE, GameState.INSTRUCTIONS, GameState.COUNTDOWN, GameState.PLAYING].includes(state.gameState);
  if (!valid) return { success: false, state, reason: "Cannot change difficulty now." };
  return {
    success: true,
    state: {
      ...state,
      gameState: GameState.START_ZONE,
      currentDifficulty: difficulty,
      currentStage: freshStageFor(difficulty),
    },
  };
}

/** Therapist-initiated end — valid from any state except one already SESSION_COMPLETE. Builds the summary from however far the level actually got (task's honest "starsPresented" — only stars the child actually saw resolve, never all of them if ended early). */
export function endSpacePilotSession(state: SpacePilotSessionState, timestamp: number): SpacePilotActionResult {
  if (safeElapsedMs(timestamp, state.createdAt) === null) return { success: false, state, reason: "Invalid session timestamp." };
  if (state.gameState === GameState.SESSION_COMPLETE) {
    return { success: false, state, reason: "Session already ended." };
  }
  const stage = state.currentStage;
  const isEncounter = stage.kind === "ENCOUNTER";
  const openPauseMs = stage.pausedAt === null ? 0 : safeElapsedMs(timestamp, stage.pausedAt);
  const totalDurationMs = stage.startedAt === null || openPauseMs === null ? null : safeElapsedMs(timestamp, stage.startedAt, stage.totalPausedMs + openPauseMs);
  const summary = buildSpacePilotSessionSummary({
    sessionId: state.sessionId,
    childFirstName: state.config.childFirstName,
    difficulty: state.currentDifficulty,
    starsPresented: isEncounter ? stage.currentEncounterIndex : stage.currentStarIndex,
    starsCollected: isEncounter ? stage.collectedStars : stage.collectedCount,
    asteroidsCleared: isEncounter ? stage.asteroidsCleared : null,
    asteroidsAvoided: isEncounter ? stage.asteroidsAvoided : null,
    totalDurationMs,
    completedAt: new Date(timestamp).toISOString(),
  });
  return { success: true, state: { ...state, gameState: GameState.SESSION_COMPLETE, endedAt: timestamp, summary } };
}

function randomToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export { encounterArrivalOffsetMs, encounterSequenceFor, MEDIUM_ENCOUNTER_SEQUENCE, ADVANCED_ENCOUNTER_SEQUENCE };

/**
 * Space Pilot (قائد الفضاء) domain types — three difficulties, each exactly
 * one stage: EASY "رحلة النجوم" (unchanged star-only flight), MEDIUM "حزام
 * النيازك" (stars + asteroids + FIRE), ADVANCED "مهمة المجرة" (stars +
 * asteroids + a friendly alien + a portal finale). Never more than one
 * stage per difficulty — `currentStage` is a single runtime, not an array.
 *
 * MULTI-GAME PLATFORM: reuses lib/game's GameState (the WELCOME -> ... ->
 * SESSION_COMPLETE shape) and Difficulty, same convention every other
 * game's own types.ts follows. `currentDifficulty`/`currentStage` exist on
 * SpacePilotSessionState (see session.ts) both because they're genuinely
 * meaningful here now (the therapist picks EASY/MEDIUM/ADVANCED at setup)
 * and because database.rules.json's shared `liveSession.session` validator
 * requires those two keys to be present on every game's session.
 */
import { Difficulty, GameState, type StageNumber } from "@/lib/game";

export { Difficulty, GameState, type StageNumber };

/** The rocket's fixed vertical flight lane — see the task's "THREE FLIGHT LANES." */
export enum StarLane {
  TOP = "TOP",
  MIDDLE = "MIDDLE",
  BOTTOM = "BOTTOM",
}

/** Top-to-bottom order — index doubles as each lane's vertical rank, used by moveSpacePilotRocketLane's clamped up/down step. */
export const STAR_LANE_ORDER: readonly StarLane[] = [StarLane.TOP, StarLane.MIDDLE, StarLane.BOTTOM];

/** Therapist-configured settings for a session, entered on /control — a name and which of the three difficulties/stages to fly. */
export interface SpacePilotSessionConfig {
  childFirstName: string;
}

/** A collectible star's outcome, in the therapist's own neutral language — MISSED is never a failure state (task's "no punishment"), just "the child was in a different lane when it passed." */
export enum CollectibleStarStatus {
  PENDING = "PENDING",
  COLLECTED = "COLLECTED",
  MISSED = "MISSED",
}

/** One of EASY's fixed 8 collectible stars. */
export interface CollectibleStar {
  id: string;
  /** 0-indexed position in the level's fixed sequence — see session.ts's STAR_LANE_SEQUENCE. */
  index: number;
  lane: StarLane;
  status: CollectibleStarStatus;
}

/**
 * MEDIUM/ADVANCED's canonical object model (task's "Objects should have
 * type, lane, timing, id and minimal required metadata... avoid a giant
 * physics system"). A single fixed, hand-designed sequence per difficulty
 * (see encounters.ts) — never randomly generated.
 */
export enum EncounterType {
  STAR = "STAR",
  ASTEROID = "ASTEROID",
  ALIEN = "ALIEN",
}

/**
 * Every outcome an encounter can resolve to, across every type — a STAR
 * resolves to COLLECTED/MISSED, an ASTEROID to CLEARED (destroyed by FIRE)
 * or AVOIDED (passed, whether dodged by a lane change or simply left
 * alone), an ALIEN always to PASSED. None of these are failure states
 * (task's "No punishment. No lives. No game over.") — every outcome is
 * just a neutral record of what happened for the therapist's own metrics.
 */
export enum EncounterOutcome {
  PENDING = "PENDING",
  COLLECTED = "COLLECTED",
  MISSED = "MISSED",
  CLEARED = "CLEARED",
  AVOIDED = "AVOIDED",
  PASSED = "PASSED",
}

export interface SpaceEncounter {
  id: string;
  /** 0-indexed position in the difficulty's fixed sequence — see encounters.ts. */
  index: number;
  type: EncounterType;
  lane: StarLane;
  status: EncounterOutcome;
}

/** Aggregate outcome of a full session — the task's suggested minimal metrics (starsPresented/starsCollected/collectionRate/duration plus, for MEDIUM/ADVANCED, asteroidsCleared/asteroidsAvoided), never a clinical claim. */
export interface SpacePilotSessionSummary {
  sessionId: string;
  childFirstName: string;
  difficulty: Difficulty;
  starsPresented: number;
  starsCollected: number;
  /** starsCollected / starsPresented — null when nothing was presented. */
  collectionRate: number | null;
  /** How many of the stage's stars the rocket had fully upgraded through by the end — the family/therapist-facing "قائد الفضاء" payoff number. */
  finalUpgradeLevel: number;
  /** MEDIUM/ADVANCED only — how many asteroids the child destroyed with FIRE vs. simply let pass (dodged or otherwise). Both null on EASY, which has no asteroids. */
  asteroidsCleared: number | null;
  asteroidsAvoided: number | null;
  totalDurationMs: number | null;
  completedAt: string;
}

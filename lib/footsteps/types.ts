/**
 * Follow the Footsteps (اتبع الخطوات) domain types.
 *
 * MULTI-GAME PLATFORM: this game deliberately REUSES the truly generic
 * pieces of lib/game — GameState (the WELCOME -> ... -> SESSION_COMPLETE
 * shape applies to any Shumos floor activity, not just balloons), Difficulty
 * and its EASY/MEDIUM/ADVANCED tiers, StageNumber (every difficulty always
 * has exactly 5 stages, see lib/game/difficultyRules.ts's STAGES_PER_DIFFICULTY),
 * and the rng/startZone/stateMachine helpers. Nothing balloon-specific
 * (Balloon, BalloonColor, TargetSize/TargetSpacing/PlayArea, SessionConfig,
 * StageResult, SessionSummary) is reused — those are Balloon Quest's own
 * shapes and would misrepresent a stepping activity. See
 * database.rules.json's `liveSession.session` validator, which only
 * requires the generic field names both games' SessionState-shaped objects
 * share (sessionId/seed/config/gameState/currentDifficulty/currentStage/
 * createdAt) — this file's FootstepsSessionState is designed to satisfy that
 * same generic shape without any rules change for the session body itself.
 */
import { Difficulty, GameState, STAGES_PER_DIFFICULTY, type StageNumber } from "@/lib/game";

export { Difficulty, GameState, STAGES_PER_DIFFICULTY, type StageNumber };

/** Which foot a footprint represents — alternates strictly starting with LEFT (see pathGenerator.ts). Visual game guidance only, never a gait-analysis claim. */
export enum Foot {
  LEFT = "LEFT",
  RIGHT = "RIGHT",
}

/** Therapist-facing physical spacing between consecutive footprints. */
export enum StepLength {
  SHORT = "SHORT",
  MEDIUM = "MEDIUM",
  LONG = "LONG",
}

/** Therapist-facing directional shape of the generated path. */
export enum PathStyle {
  STRAIGHT = "STRAIGHT",
  LEFT_RIGHT = "LEFT_RIGHT",
  VARIED = "VARIED",
}

/** Therapist-facing lateral corridor width the path may wander within. */
export enum PathWidth {
  NARROW = "NARROW",
  MEDIUM = "MEDIUM",
  WIDE = "WIDE",
}

/** Position normalized to [0, 1] on each axis, independent of screen resolution — same convention as lib/game's NormalizedPosition. */
export interface NormalizedPosition {
  x: number;
  y: number;
}

/**
 * A single footprint placed along the generated path — ONE clear target at a
 * time (the SINGLE/PAIR two-feet-at-once mechanic was removed; every target
 * is now exactly one footprint, one confirmation).
 */
export interface Footprint {
  id: string;
  /** 0-indexed TARGET order along the path — index 0 is the first target out of the Start Zone. */
  index: number;
  foot: Foot;
  position: NormalizedPosition;
  /** Decorative rotation in degrees, deterministic from the path's own direction + seed — never affects gameplay. */
  rotationDeg: number;
}

/** ROUTE ARCHITECTURE REWRITE (ADVANCED difficulty) — replaces the old SINGLE/PAIR stance mechanic. A cosmic obstacle sitting on the route between two consecutive normal footprints; normal footprints stay walkable throughout, this is purely a playful visual/audio movement cue — see lib/footsteps/journeyPlans.ts and pathGenerator.ts's OBSTACLE PLACEMENT section. */
export enum RouteObstacleKind {
  METEOR = "METEOR",
  ROCK = "ROCK",
  COMET = "COMET",
}

/**
 * A cosmic obstacle placed on the centerline between target `afterTargetIndex`
 * and `afterTargetIndex + 1`. It becomes the "current" obstacle the moment
 * target `afterTargetIndex` is confirmed (the child is now walking toward
 * `afterTargetIndex + 1`, past the obstacle), and is considered cleared the
 * moment `afterTargetIndex + 1` is confirmed — the SAME therapist
 * confirmation that already advances the route; no separate action, no
 * sensor, no failure state. See Footsteps' `footsteps_obstacle_active`/
 * `footsteps_obstacle_cleared` display events.
 */
export interface RouteObstacle {
  id: string;
  afterTargetIndex: number;
  kind: RouteObstacleKind;
  position: NormalizedPosition;
  rotationDeg: number;
}

/**
 * JOURNEY REDESIGN — a milestone star along the route (MEDIUM/ADVANCED
 * stages), distinct from the stage's single final `destination`. Always
 * coincides with a real target's own position (`afterTargetIndex` — the
 * target `index` whose confirmation activates it), so the route always
 * physically reaches it; never placed independently. See
 * lib/footsteps/journeyPlans.ts's checkpointFractions.
 */
export interface RouteCheckpoint {
  id: string;
  afterTargetIndex: number;
  position: NormalizedPosition;
}

/** Therapist-configured settings for a session, entered on /control/follow-the-footsteps. */
export interface FootstepsSessionConfig {
  childFirstName: string;
  difficulty: Difficulty;
  stepLength: StepLength;
  pathStyle: PathStyle;
  pathWidth: PathWidth;
  /** Which stage of `difficulty` this session actually begins at — same manual therapist choice as Balloon Quest's SessionConfig.startingStage. */
  startingStage: StageNumber;
}

/** A stage's outcome, in the therapist's own neutral language — same COMPLETED/SKIPPED semantics as Balloon Quest's StageStatus (see lib/game/types.ts), never a judgment about the child. */
export enum FootstepsStageStatus {
  COMPLETED = "COMPLETED",
  SKIPPED = "SKIPPED",
}

/**
 * Outcome of a single stage. `stepsPresented`/`stepsCompleted`/`durationMs`/
 * `averageStepTimeMs` follow the same "never entered" convention Balloon
 * Quest's StageResult documents: a stage jumped OVER (never actually
 * entered) gets `durationMs: null` and `averageStepTimeMs: null` — never 0,
 * which would misleadingly read as "completed instantly."
 */
export interface FootstepsStageResult {
  difficulty: Difficulty;
  stageNumber: StageNumber;
  status: FootstepsStageStatus;
  stepsPresented: number;
  stepsCompleted: number;
  durationMs: number | null;
  /** متوسط زمن الخطوة المسجل — interaction timing (footprint presented -> therapist confirmation), paused time excluded. Never a clinical gait measurement — see lib/footsteps/session.ts's confirmCurrentStep. */
  averageStepTimeMs: number | null;
}

/** Aggregate outcome of a full session — same shape philosophy as Balloon Quest's SessionSummary. */
export interface FootstepsSessionSummary {
  sessionId: string;
  childFirstName: string;
  startingDifficulty: Difficulty;
  /** Every difficulty with at least one played stage, in canonical EASY -> MEDIUM -> ADVANCED order. */
  difficultiesPlayed: Difficulty[];
  stageResults: FootstepsStageResult[];
  totalStepsPresented: number;
  totalStepsCompleted: number;
  /** totalStepsCompleted / totalStepsPresented — null when nothing was presented. */
  completionRate: number | null;
  totalDurationMs: number;
  averageStepTimeMs: number | null;
  /** The completed stage with the highest completion rate; ties broken by the lower average step time. */
  bestStage: { difficulty: Difficulty; stageNumber: StageNumber } | null;
  completedAt: string;
}

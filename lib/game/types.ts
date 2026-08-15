/**
 * Balloon Quest domain types.
 *
 * These types describe the game's data shapes only. They intentionally have
 * no dependency on React, Firebase, audio, or animation, so the game engine
 * can be developed and tested in isolation from the UI and realtime layers.
 * See ARCHITECTURE.md for the reasoning.
 *
 * Note on Task 1 -> Task 2: a few names below (TargetSize, TargetSpacing,
 * PlayArea, Difficulty's third value) were placeholders in Task 1, written
 * before the actual game rules existed. Task 2's spec gives these exact
 * names different, concrete meanings (therapist-facing enums rather than
 * raw numbers). This file updates them to match Task 2, since keeping the
 * old numeric placeholders would silently contradict the real spec.
 */

/**
 * The explicit stages of a Balloon Quest session, in order.
 *
 * TASK 8.2 — START_ZONE: sits between SETUP and INSTRUCTIONS (before stage
 * 1) and is also STAGE_COMPLETE's "another stage remains" destination
 * (between every stage) — see stateMachine.ts. There is deliberately no
 * automatic timer or sensor-driven exit from this state: the therapist
 * visually confirms the child is standing in the projected Start Zone and
 * taps "الطفل جاهز" (see lib/control), which is the only way out. /display
 * never begins the next stage on its own.
 */
export enum GameState {
  WELCOME = "WELCOME",
  SETUP = "SETUP",
  START_ZONE = "START_ZONE",
  INSTRUCTIONS = "INSTRUCTIONS",
  COUNTDOWN = "COUNTDOWN",
  PLAYING = "PLAYING",
  STAGE_COMPLETE = "STAGE_COMPLETE",
  SESSION_COMPLETE = "SESSION_COMPLETE",
}

/** Therapist-selected difficulty for a session. */
export enum Difficulty {
  EASY = "EASY",
  MEDIUM = "MEDIUM",
  ADVANCED = "ADVANCED",
}

/**
 * 1-indexed stage number within a difficulty.
 *
 * TASK 11 — every difficulty (EASY/MEDIUM/ADVANCED) now has exactly 5
 * stages (15 possible stages total), but a single session never plays all
 * 15: it plays a subset (5 at most, fewer if the therapist changes
 * difficulty and does not replay every stage number) that stays as small as
 * whatever the therapist actually navigates through. See
 * lib/game/session.ts's class doc comment for the full navigation model.
 */
export type StageNumber = 1 | 2 | 3 | 4 | 5;

/** Therapist-facing balloon size preference. */
export enum TargetSize {
  LARGE = "LARGE",
  MEDIUM = "MEDIUM",
  SMALL = "SMALL",
}

/** Therapist-facing minimum-separation preference between balloons. */
export enum TargetSpacing {
  CLOSE = "CLOSE",
  MEDIUM = "MEDIUM",
  WIDE = "WIDE",
}

/** Therapist-facing zone of the projected floor balloons may occupy. */
export enum PlayArea {
  FULL = "FULL",
  LEFT = "LEFT",
  RIGHT = "RIGHT",
  FRONT = "FRONT",
}

/** Visual color of a balloon. */
export enum BalloonColor {
  RED = "RED",
  BLUE = "BLUE",
  GREEN = "GREEN",
  YELLOW = "YELLOW",
  PURPLE = "PURPLE",
  ORANGE = "ORANGE",
}

/** Position normalized to [0, 1] on each axis, independent of screen resolution. */
export interface NormalizedPosition {
  x: number;
  y: number;
}

/** A single balloon placed within the play area. */
export interface Balloon {
  id: string;
  color: BalloonColor;
  position: NormalizedPosition;
  /** Diameter, normalized as a fraction of the play area's shorter side. */
  size: number;
  isTarget: boolean;
  isPopped: boolean;
}

/** Therapist-configured settings for a session, entered on /control. */
export interface SessionConfig {
  childFirstName: string;
  difficulty: Difficulty;
  targetSize: TargetSize;
  targetSpacing: TargetSpacing;
  playArea: PlayArea;
  /**
   * TASK 12: the stage this session actually begins at within `difficulty`
   * — manually chosen by the therapist on the setup screen (e.g. "last time
   * this child reached Medium Stage 3"), defaulting to 1 for a first-time
   * child. Never a result of anything in-session; see
   * lib/game/session.ts's createSession, which generates this stage
   * directly as the session's first stage — earlier stage numbers were
   * never entered, so they never appear in results (not even as SKIPPED —
   * that status is reserved for stages the therapist actively moved past
   * DURING a session, see StageStatus). Prepared so a future patient-history
   * feature can pre-fill this from a child's previous session; not
   * implemented yet — manual selection only.
   */
  startingStage: StageNumber;
}

/**
 * TASK 11 — a stage's outcome, in the therapist's own neutral language:
 * COMPLETED means the child popped every target; SKIPPED means the
 * therapist moved past it (either by jumping ahead over it, or by ending it
 * early) — never a judgment about the child. See lib/game/session.ts for
 * exactly which actions produce which status, and the Task 11 report's
 * "Skip behavior" section. Never rendered as "فشل"/"لم ينجح"/"خطأ" anywhere
 * in the UI — see components/control/summary/SessionSummaryScreen.tsx and
 * components/display/scenes/SessionCompleteScene.tsx.
 */
export enum StageStatus {
  COMPLETED = "COMPLETED",
  SKIPPED = "SKIPPED",
}

/**
 * Outcome of a single stage, produced when it completes or is skipped.
 *
 * TASK 11: now carries its own `difficulty` — a session can span more than
 * one difficulty (see the difficulty-change decision on
 * StageCompleteOverlay), so `stageNumber` alone is no longer a unique
 * identity within a session; (difficulty, stageNumber) is. `accuracy` /
 * `durationMs` / `averageReactionTimeMs` are null for a stage that was
 * jumped OVER and never actually entered (no gameplay ever happened, so
 * there is nothing genuine to report — see "Do not invent clinical
 * measurements") — never 0, which would misleadingly read as "played
 * perfectly" or "took no time." A stage ended early via "تخطي المرحلة"
 * (which DID have some real partial play) still keeps its real
 * correctCount/incorrectCount/durationMs for data integrity, but the
 * therapist/family UIs never surface stats for a SKIPPED row regardless —
 * see the Task 11 report's UX decisions.
 */
export interface StageResult {
  difficulty: Difficulty;
  stageNumber: StageNumber;
  status: StageStatus;
  targetColor: BalloonColor | null;
  correctCount: number;
  incorrectCount: number;
  totalTargets: number;
  /** correctCount / (correctCount + incorrectCount); null when status is SKIPPED and the stage was never entered (nothing to divide). */
  accuracy: number | null;
  durationMs: number | null;
  /** Mean of per-selection reaction times; null when no correct selections occurred (or the stage was never entered). */
  averageReactionTimeMs: number | null;
}

/** One difficulty's progress within a session, for the family/photo report's "3 من 5" dots — see SessionCompleteScene.tsx. */
export interface DifficultyProgress {
  difficulty: Difficulty;
  completedCount: number;
  /** Always 5 — exported here (rather than hardcoded in UI) so the dot count can never drift from STAGES_PER_DIFFICULTY. */
  totalStages: number;
}

/** Aggregate outcome of a full session, produced at SESSION_COMPLETE. */
export interface SessionSummary {
  sessionId: string;
  childFirstName: string;
  /** The difficulty the session was originally set up with — a session may go on to play other difficulties too; see stageResults/difficultiesPlayed for the full picture. */
  startingDifficulty: Difficulty;
  /** Every difficulty with at least one played (completed or skipped) stage, in canonical EASY -> MEDIUM -> ADVANCED order — never more than the 3 that exist, never one with zero stages. */
  difficultiesPlayed: Difficulty[];
  stageResults: StageResult[];
  totalCorrect: number;
  totalIncorrect: number;
  /** Same formula as StageResult.accuracy, applied to session-wide totals. */
  overallAccuracy: number;
  totalDurationMs: number;
  averageReactionTimeMs: number | null;
  /** The completed stage with the highest accuracy; ties broken by lower average reaction time. Null if no stage was completed (only skips, or none played). Identified by (difficulty, stageNumber) since a session can span more than one difficulty. */
  bestStage: { difficulty: Difficulty; stageNumber: StageNumber } | null;
  completedAt: string;
}

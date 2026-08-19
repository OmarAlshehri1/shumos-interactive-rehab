/**
 * Bubble Pop Wall (فرقع الفقاعات) domain types.
 *
 * MULTI-GAME PLATFORM: reuses the truly generic pieces of lib/game — GameState
 * (the WELCOME -> ... -> SESSION_COMPLETE shape applies to any Shumos
 * activity, not just balloons), Difficulty and its EASY/MEDIUM/ADVANCED
 * tiers, StageNumber (every difficulty always has exactly 5 stages), and the
 * rng/stateMachine helpers — same convention lib/footsteps/types.ts already
 * establishes. Nothing balloon- or footstep-specific (BalloonColor, Foot,
 * PathStyle, ...) is reused — this is its own game with its own therapist
 * controls (bubble size / reach height / reach side / target type) and its
 * own correct/incorrect scoring model (unlike Follow the Footsteps' NO
 * NEGATIVE SCORING design — this game DOES track incorrect selections, same
 * philosophy as Balloon Quest, just gentler in tone — see session.ts).
 */
import { Difficulty, GameState, STAGES_PER_DIFFICULTY, type StageNumber } from "@/lib/game";

export { Difficulty, GameState, STAGES_PER_DIFFICULTY, type StageNumber };

/** Visual color of a bubble — a fresh enum, not a reuse of lib/game's BalloonColor, per the platform's "each game owns its own domain types" convention. */
export enum BubbleColor {
  RED = "RED",
  BLUE = "BLUE",
  YELLOW = "YELLOW",
  GREEN = "GREEN",
  PURPLE = "PURPLE",
  ORANGE = "ORANGE",
  /** Easy-stage-plan color (task's Easy 2-5 station set: Blue/Yellow/Pink) — not part of BUBBLE_COLOR_ORDER (the legacy Medium/Advanced field's slicing order), only ever chosen explicitly by lib/bubblepop/stagePlans.ts. */
  PINK = "PINK",
}

/** Horizontal travel direction of one moving mission bubble across the ocean (task section 5). */
export enum BubbleMoveDirection {
  RIGHT_TO_LEFT = "RIGHT_TO_LEFT",
  LEFT_TO_RIGHT = "LEFT_TO_RIGHT",
}

/** Optional shape content inside a bubble — only meaningfully varies on a mission whose `requiresShape` is true (Advanced color+shape/rich-ocean stages, see stagePlans.ts); every other mission is CIRCLE. */
export enum BubbleShape {
  CIRCLE = "CIRCLE",
  STAR = "STAR",
  HEART = "HEART",
  TRIANGLE = "TRIANGLE",
  DIAMOND = "DIAMOND",
}

/** One candidate (color, shape) pearl a color+shape station may offer — see StationToken's doc comment. */
export interface StationToken {
  color: BubbleColor;
  shape: BubbleShape;
}

/** Therapist-facing bubble diameter preference. */
export enum BubbleSize {
  LARGE = "LARGE",
  MEDIUM = "MEDIUM",
  SMALL = "SMALL",
}

/** Therapist-facing vertical band of the wall bubbles may occupy — this game's own analogue to Balloon Quest's PlayArea, but for a vertical wall projection rather than a floor. */
export enum ReachHeight {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  FULL = "FULL",
}

/** Therapist-facing horizontal band of the wall bubbles may occupy. */
export enum ReachSide {
  LEFT = "LEFT",
  RIGHT = "RIGHT",
  FULL = "FULL",
}

/** Whether a requested target is identified by color alone, or by color + shape together — see task's "shapes — optional progression." */
export enum TargetMode {
  COLOR_ONLY = "COLOR_ONLY",
  COLOR_AND_SHAPE = "COLOR_AND_SHAPE",
}

/**
 * ONE MISSION, ONE MOVING BUBBLE (Phase 1 core redesign): unlike the old
 * static "whole field visible at once, tap any bubble" model, `bubbles` is
 * now an ORDERED list of mission bubbles — exactly one is ever on screen at
 * a time (targetSequence[currentTargetIndex], see currentTargetId()), moving
 * continuously along its own fixed `lane`/`direction` until the therapist
 * confirms the matching color STATION and it pops. There are no decoys: the
 * child's challenge is remembering which color Mariam asked for and picking
 * the right station among 2-3 fixed ones, not visually hunting the wall.
 */
export interface Bubble {
  id: string;
  /** 0-indexed mission order — decorative/debugging only, never gameplay-meaningful. */
  index: number;
  color: BubbleColor;
  shape: BubbleShape;
  /** Fixed vertical lane this bubble travels along for its whole mission, normalized 0 (near the top of the ocean) to 1 (just above the station dock). */
  lane: number;
  /** Horizontal travel direction for this specific mission. */
  direction: BubbleMoveDirection;
  /** Milliseconds for one full edge-to-edge crossing at this stage's pace — the display loops the bubble across the ocean every travelMs (task section 6's "no speed failure": it re-enters, it never counts as missed) until it's popped. */
  travelMs: number;
  /** Diameter, normalized as a fraction of the wall's shorter side. */
  size: number;
  isPopped: boolean;
  /** Phase 2 — true when this specific mission must be matched on BOTH color and shape (Advanced 2/4/5's "color+shape" mission type), not just color. False for every Easy/Medium mission and for Advanced's plain color missions. */
  requiresShape: boolean;
  /**
   * Phase 2 — the per-mission candidate station set for a `requiresShape`
   * mission (4-6 (color, shape) pearls, exactly ONE of which matches this
   * bubble's own (color, shape)). Undefined/empty for a plain color mission,
   * which instead uses the stage's fixed `plan.stations` color set — see
   * StationToken's doc comment and stagePlans.ts's `stationCount`.
   */
  stationTokens: StationToken[];
}

/** Therapist-configured settings for a session, entered on /control/bubble-pop-wall. */
export interface BubblePopSessionConfig {
  childFirstName: string;
  difficulty: Difficulty;
  bubbleSize: BubbleSize;
  reachHeight: ReachHeight;
  reachSide: ReachSide;
  targetMode: TargetMode;
  /** Which stage of `difficulty` this session actually begins at — same manual therapist choice as the other two games' startingStage. */
  startingStage: StageNumber;
}

/** A stage's outcome, in the therapist's own neutral language — same COMPLETED/SKIPPED semantics as the other two games, never a judgment about the child. */
export enum BubblePopStageStatus {
  COMPLETED = "COMPLETED",
  SKIPPED = "SKIPPED",
}

/**
 * Outcome of a single stage. Tracks BOTH completion (targetsCompleted /
 * targetsPresented — Follow the Footsteps' honest "did the child get
 * through the sequence" framing) AND accuracy (correct / (correct +
 * incorrect) — Balloon Quest's "how many attempts landed on the right
 * bubble" framing): task section 38 explicitly asks for both, and they
 * genuinely measure different things here (a child can complete every
 * target eventually while still tapping several wrong bubbles along the
 * way). `durationMs`/`averageResponseTimeMs` are null for a stage jumped
 * OVER and never actually entered — never 0, which would misleadingly read
 * as "instant."
 */
export interface BubblePopStageResult {
  difficulty: Difficulty;
  stageNumber: StageNumber;
  status: BubblePopStageStatus;
  targetsPresented: number;
  targetsCompleted: number;
  incorrectCount: number;
  durationMs: number | null;
  /** متوسط زمن الاستجابة المسجل — interaction timing (target announced -> therapist confirmation), paused time excluded. Never a clinical reaction-time diagnosis — see lib/bubblepop/session.ts's confirmBubblePopColor. */
  averageResponseTimeMs: number | null;
}

/** Aggregate outcome of a full session — same shape philosophy as the other two games' SessionSummary. */
export interface BubblePopSessionSummary {
  sessionId: string;
  childFirstName: string;
  startingDifficulty: Difficulty;
  /** Every difficulty with at least one played stage, in canonical EASY -> MEDIUM -> ADVANCED order. */
  difficultiesPlayed: Difficulty[];
  stageResults: BubblePopStageResult[];
  totalTargetsPresented: number;
  totalTargetsCompleted: number;
  totalIncorrect: number;
  /** totalTargetsCompleted / totalTargetsPresented — null when nothing was presented. */
  completionRate: number | null;
  /** totalTargetsCompleted / (totalTargetsCompleted + totalIncorrect) — null when nothing was attempted. */
  accuracy: number | null;
  totalDurationMs: number;
  averageResponseTimeMs: number | null;
  /** The completed stage with the highest completion rate; ties broken by higher accuracy, then by lower average response time. */
  bestStage: { difficulty: Difficulty; stageNumber: StageNumber } | null;
  completedAt: string;
}

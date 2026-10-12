/**
 * Balloon Quest 3D — domain types. Isolated from lib/game (the original
 * Balloon Quest) on purpose: 3 difficulties x 3 stages, its own session model,
 * no React / Firebase / DOM dependencies.
 */

export type Difficulty = "EASY" | "MEDIUM" | "ADVANCED";
export const DIFFICULTIES: readonly Difficulty[] = ["EASY", "MEDIUM", "ADVANCED"];
export type StageNumber = 1 | 2 | 3;
export const STAGE_NUMBERS: readonly StageNumber[] = [1, 2, 3];
export const STAGES_PER_DIFFICULTY = 3;
export const TOTAL_STAGES = 9;

export type BalloonColor = "red" | "blue" | "green" | "yellow" | "purple" | "black" | "white";
export const BALLOON_COLORS: readonly BalloonColor[] = ["red", "blue", "green", "yellow", "purple", "black", "white"];

export type Layout = "WALL" | "FLOOR";
export type Motion = "static" | "rising";

/** Which physical or simulated sources may select balloons. */
/** "therapist": only the therapist's taps on the Control preview select balloons (no sensor needed). */
export type InputMode = "therapist" | "keyboard" | "right-hand" | "left-hand" | "both-hands" | "foot" | "handheld";
export const INPUT_MODES: readonly InputMode[] = ["therapist", "keyboard", "right-hand", "left-hand", "both-hands", "foot", "handheld"];

export type SourceId = "RIGHT_HAND" | "LEFT_HAND" | "RIGHT_FOOT" | "LEFT_FOOT" | "HANDHELD" | "KEYBOARD" | "THERAPIST";

/** Whole-session plan: play every remaining stage, or only the rest of the starting level. */
export type Scope = "all" | "level";

export interface TherapistSettings {
  /** Multiplies balloon size. Applies from the next stage start/restart. */
  sizeScale: number;
  /** Multiplies rise speed (rising levels only). Applies from the next stage start/restart. */
  speedScale: number;
  /** Added to the stage's simultaneous balloon count. Applies from the next stage start/restart. */
  countOffset: number;
  /** Number of palette colours in play, or null for the level default. Applies from the next stage start/restart. */
  colorCount: number | null;
  /** Extra contact radius as a fraction of the balloon radius. Applies immediately. */
  contactTolerance: number;
  /** Wall or floor presentation. Applies immediately. */
  layout: Layout;
  /** Forces the stationary layout everywhere (no rising/sway). Applies from the next stage start/restart. */
  reducedMotion: boolean;
  inputMode: InputMode;
  /** After a stage is completed, continue automatically after a short celebration. */
  autoAdvance: boolean;
  scope: Scope;
  /** Lets the therapist run without a Display window (preview/testing). */
  allowNoDisplay: boolean;
}

export const DEFAULT_SETTINGS: TherapistSettings = {
  sizeScale: 1,
  speedScale: 1,
  countOffset: 0,
  colorCount: null,
  contactTolerance: 0.15,
  layout: "WALL",
  reducedMotion: false,
  inputMode: "keyboard",
  autoAdvance: true,
  scope: "all",
  allowNoDisplay: false,
};

export type Lifecycle = "ready" | "playing" | "paused" | "suspended" | "stage-complete" | "completed" | "ended";
export type SuspendReason = "input-lost" | "display-unavailable" | "control-hidden" | "scheduling-gap";

/** One balloon. Positions are never stored for rising balloons: they are a pure function of the simulation clock. */
export interface Balloon {
  id: string;
  spawnIndex: number;
  color: BalloonColor;
  /** Centre x, percent of stage width. */
  x: number;
  /** Top edge of the balloon+string box, in cqh (percent of stage height). Static balloons only; rising balloons derive it from the clock. */
  topY: number;
  slot: number;
  spawnedAtMs: number;
  popping: boolean;
  poppedAtMs: number;
  /** Increments each time a wrong-colour selection lands on this balloon (drives the gentle sway cue). */
  wrongCueCount: number;
  lastWrongAtMs: number;
}

export interface ResolvedStage {
  index: number;
  difficulty: Difficulty;
  stage: StageNumber;
  motion: Motion;
  layout: Layout;
  goal: number;
  /** Balloon width, cqh. */
  sizeCqh: number;
  /** Seconds to travel from below the bottom edge to above the top edge (rising only; 0 when static). */
  riseSeconds: number;
  activeCount: number;
  palette: BalloonColor[];
}

export interface SpawnState {
  nextSpawnAtMs: number;
  lastSpawnAtMs: number;
  spawnCount: number;
  recentColors: BalloonColor[];
  lastSlot: number;
  lastX: number;
}

export interface Slot {
  x: number;
  /** Centre y of the balloon+string box, cqh. */
  y: number;
}

export interface StageRuntime {
  index: number;
  attempt: number;
  /** Seed + id prefix for this stage attempt (deterministic spawning and unique balloon ids). */
  seed: number;
  idPrefix: string;
  spec: ResolvedStage;
  target: BalloonColor;
  goalDone: number;
  /** Wrong-colour contacts. Informational only: never deducted, never fails a stage. */
  wrongCount: number;
  /** Increments with every accepted correct selection (drives "أحسنت!"). */
  correctSeq: number;
  /** Simulation time. Advances only while playing. */
  simTimeMs: number;
  /** Last fixed housekeeping step applied (multiple of HOUSEKEEPING_MS). */
  stepTimeMs: number;
  balloons: Balloon[];
  spawn: SpawnState;
  slots: Slot[];
}

export type SelectionOutcome = "correct" | "wrong";
export interface AcceptedSelection {
  /** Session-wide, strictly increasing. */
  sequence: number;
  inputEventId: string | null;
  runId: number;
  stageIndex: number;
  stageAttempt: number;
  balloonId: string;
  color: BalloonColor;
  outcome: SelectionOutcome;
  source: SourceId;
  simTimeMs: number;
}

export type StageStatus = "completed" | "skipped";
export interface StageResult {
  index: number;
  difficulty: Difficulty;
  stage: StageNumber;
  status: StageStatus;
  target: BalloonColor;
  goal: number;
  correct: number;
  wrongContacts: number;
  /** Active play time (simulation clock) — excludes pauses and holds. */
  activeMs: number;
  attempts: number;
}

export interface SessionSummary {
  sessionId: string;
  runId: number;
  reason: "completed" | "therapist-ended";
  stages: StageResult[];
  completedStages: number;
  skippedStages: number;
  totalCorrect: number;
  totalWrongContacts: number;
  activeMs: number;
  restarts: number;
}

export interface Session {
  version: 1;
  sessionId: string;
  /** Wall-clock epoch of creation: orders sessions for receivers. */
  sessionEpoch: number;
  runId: number;
  seed: number;
  revision: number;
  lifecycle: Lifecycle;
  suspendReason: SuspendReason | null;
  /** True when the hold was applied by the therapist (never auto-resumed). */
  settings: TherapistSettings;
  startIndex: number;
  endIndex: number;
  stageIndex: number;
  stage: StageRuntime | null;
  results: StageResult[];
  selectionSeq: number;
  /** Recent accepted selections (bounded) for audit and duplicate protection. */
  selections: AcceptedSelection[];
  seenInputEvents: string[];
  restarts: number;
  summary: SessionSummary | null;
}

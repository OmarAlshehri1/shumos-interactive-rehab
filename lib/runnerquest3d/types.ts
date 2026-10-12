/**
 * Runner Quest 3D (مغامرة العدّاء) — shared vocabulary. Experimental, isolated
 * module: nothing in the production games imports from here.
 */
export const DIFFICULTIES = ["easy", "medium", "advanced"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export type StageNumber = 1 | 2 | 3;

/** Lane index: -1 = left, 0 = centre, 1 = right (as seen from behind the runner). */
export type Lane = -1 | 0 | 1;
export const LANES: readonly Lane[] = [-1, 0, 1];
export const LANE_WIDTH = 2.2;

/**
 * side:    solid block in 1-2 lanes; solved by standing in a free lane.
 * hurdle:  low bar in 1-3 lanes; solved by a free lane OR a deliberate step action.
 * gate:    a glowing arch in ONE lane, the other lanes are fenced (choose the path).
 * marker:  a ground marker in one lane; bonus star only, never blocks.
 * checkpoint: full-width arch, rewards progress, never blocks.
 */
export type EncounterKind = "side" | "hurdle" | "gate" | "marker" | "checkpoint";

export interface Encounter {
  id: string;
  kind: EncounterKind;
  /** Metres from the start line. */
  z: number;
  /** side/hurdle: blocked lanes. gate/marker: [] (see `target`). */
  lanes: Lane[];
  /** gate/marker: the lane that is open / marked. */
  target: Lane | null;
}

/**
 * MANUAL  : the therapist drives the runner from touch controls (no hardware needed; the production default).
 * KEYBOARD: desktop keyboard (development / simulation aid; manual controls also stay available).
 * *_FOOT  : prepared foot-sensor modes. Manual therapist controls ALWAYS remain available as an override.
 */
export type InputSourceId = "MANUAL" | "KEYBOARD" | "RIGHT_FOOT" | "LEFT_FOOT" | "DUAL_FOOT";
export const INPUT_SOURCES: readonly InputSourceId[] = ["MANUAL", "KEYBOARD", "RIGHT_FOOT", "LEFT_FOOT", "DUAL_FOOT"];
/** Sources whose real-hardware behaviour has NOT been validated. Keyboard is a development/simulation aid. */
export const UNVALIDATED_SOURCES: readonly InputSourceId[] = ["RIGHT_FOOT", "LEFT_FOOT", "DUAL_FOOT"];

export type Level3 = "low" | "normal" | "high";

export interface TherapistSettings {
  inputSource: InputSourceId;
  /** Forward speed in metres per second. Slow by default. */
  speed: number;
  /** Movement sensitivity: scales foot-action thresholds (high = smaller movement needed). */
  sensitivity: Level3;
  /** Obstacle spacing multiplier. */
  spacing: number;
  /** When false, hurdles are stepped over automatically (no foot lift needed). */
  footLiftRequired: boolean;
  /** Action detection tolerance: wider = longer step window and gentler re-arm. */
  tolerance: Level3;
  /** Stop a few metres BEFORE an unresolved obstacle and wait. */
  pauseBeforeObstacle: boolean;
  reducedMotion: boolean;
  /** FLOOR projection only (ignored by WALL): see FloorCalibration. */
  floor: FloorCalibration;
}

/**
 * Therapist-adjustable FLOOR layout. Purely presentational + planning-free: it never changes which objectives a stage
 * contains, only how large/far apart the regions are drawn. Projected width/height are the therapist's own measured numbers;
 * they only scale the optional calibration grid (the software cannot measure a real projector).
 */
export interface FloorCalibration {
  /** Distance between regions: low = small movement range, high = wide. */
  range: Level3;
  /** Region size preset (all presets are large; targets are never tiny). */
  pad: Level3;
  /** Safe margin around the playfield, as a fraction of the projected size (0 - 0.15). */
  margin: number;
  /** Show the calibration grid + safe-area frame. */
  grid: boolean;
  highContrast: boolean;
  /** Extra directional cues (arrows, trail) for children who need more guidance. */
  guidance: boolean;
  /** Measured projected size in cm (0 = not entered). */
  widthCm: number;
  heightCm: number;
}
export const DEFAULT_FLOOR: FloorCalibration = { range: "normal", pad: "normal", margin: 0.05, grid: false, highContrast: false, guidance: true, widthCm: 0, heightCm: 0 };
export const FLOOR_MARGIN_MAX = 0.15;
export const FLOOR_CM_MAX = 2000;

/** WALL = the original lane runner. FLOOR = the top-down journey (therapist-confirmed regions, no jumping). */
export type Projection = "WALL" | "FLOOR";
export const PROJECTIONS: readonly Projection[] = ["WALL", "FLOOR"];

export const DEFAULT_SETTINGS: TherapistSettings = {
  inputSource: "MANUAL",
  speed: 2.4,
  sensitivity: "normal",
  spacing: 1,
  footLiftRequired: true,
  tolerance: "normal",
  pauseBeforeObstacle: false,
  reducedMotion: false,
  floor: DEFAULT_FLOOR,
};
export const SPEED_RANGE = { min: 1, max: 4.5 } as const;
export const SPACING_RANGE = { min: 0.8, max: 1.6 } as const;

export type Lifecycle = "ready" | "playing" | "paused" | "suspended" | "stage-complete" | "completed" | "ended";
export type SuspendReason = "input-lost" | "display-unavailable" | "control-hidden" | "scheduling-gap";

export interface StageSpec {
  index: number;
  difficulty: Difficulty;
  stage: StageNumber;
  titleAr: string;
  objectiveAr: string;
  /** Metres from start to the finish line. */
  length: number;
  /** Target metres between consecutive encounters (before the spacing multiplier). */
  baseGap: number;
  /** Encounter plan: weighted kinds and the number of obstacles. */
  count: number;
  kinds: readonly EncounterKind[];
  /** Whether the stage needs a foot lift at all. */
  usesHurdles: boolean;
  /** Environmental accent, purely visual. */
  theme: "meadow" | "garden" | "trail" | "lake" | "forest" | "sunset" | "summit" | "river" | "festival";
}

export interface ObstacleState {
  id: string;
  /** Step action accepted for this (hurdle) obstacle. */
  armed: boolean;
  /** Has been passed; `how` records the way. */
  resolved: boolean;
  how: "dodged" | "stepped" | "reached" | "assisted" | "auto" | "skipped" | "rest" | null;
}

export interface StageRuntime {
  index: number;
  spec: StageSpec;
  seed: number;
  /** Spacing multiplier the encounters were generated with (fixed for the stage). */
  spacingUsed: number;
  /** Finish line, metres. */
  length: number;
  encounters: Encounter[];
  obstacles: ObstacleState[];
  /** Metres travelled. */
  distance: number;
  speed: number;
  lane: Lane;
  /** Accepted actions, for animation triggers and duplicate protection. */
  laneSeq: number;
  stepSeq: number;
  holding: boolean;
  holdObstacleId: string | null;
  holds: number;
  stars: number;
  checkpointsPassed: number;
  assists: number;
  /** Simulation time only advances while playing. Metres-per-second integration uses it. */
  simTimeMs: number;
  startedWall: number;
  /** Hint key currently shown to the child. */
  hint: HintKey | null;
  celebrateSeq: number;
  /** FLOOR projection only. The WALL fields above stay inert (encounters = [], speed = 0). */
  floor?: FloorRuntime;
}

/** Objective kinds of the FLOOR journey. No kind needs speed, a jump or balance: every one is confirmed by the therapist. */
export type FloorObjectiveKind = "region" | "step" | "rest";
export interface FloorObjective {
  id: string;
  kind: FloorObjectiveKind;
  /** region: the lit region (-1 left, 0 centre/neutral, 1 right). step/rest: null. */
  target: Lane | null;
  /** direction: one lit region; choose: the lit region among visible alternatives; neutral: return to centre. */
  variant: "direction" | "choose" | "neutral" | "step" | "rest";
}
export interface FloorRuntime {
  objectives: FloorObjective[];
  /** Index of the current (first unresolved) objective; equals objectives.length when the stage is finished. */
  current: number;
  /** Region the child was last confirmed in (display only). */
  region: Lane;
  regionSeq: number;
  /** Bumped by "repeat": the Display replays the cue. */
  cueSeq: number;
  completed: number;
  skipped: number;
  assisted: number;
}

export type HintKey = "move-left" | "move-right" | "step" | "choose-path" | "go" | null;

export interface StageResult {
  index: number;
  difficulty: Difficulty;
  stage: StageNumber;
  status: "completed" | "skipped";
  stars: number;
  holds: number;
  assists: number;
  /** Simulation time the stage was actually playing (pauses and holds by suspension excluded). */
  activeMs: number;
  obstaclesResolved: number;
  obstaclesTotal: number;
  distance: number;
  /** Projection the stage was played in. FLOOR: obstacles* = objectives completed / total. */
  projection: Projection;
  /** FLOOR only: objectives the therapist skipped (0 for WALL). */
  objectivesSkipped: number;
}

export interface SessionSummary {
  reason: "completed" | "therapist-ended";
  completedStages: number;
  skippedStages: number;
  totalStars: number;
  totalHolds: number;
  totalAssists: number;
  projection: Projection;
  totalObjectivesSkipped: number;
  /** Sum of the stages' active play time. */
  activeMs: number;
  stages: StageResult[];
}

export interface Session {
  sessionId: string;
  sessionEpoch: number;
  runId: number;
  /** Chosen before the session starts (ready, no results); fixed for the run. */
  projection: Projection;
  /** Increments on every state change the Display must see. */
  revision: number;
  seed: number;
  settings: TherapistSettings;
  lifecycle: Lifecycle;
  suspendReason: SuspendReason | null;
  /** First/last stage index (0..8) of the planned run. */
  startIndex: number;
  endIndex: number;
  stageIndex: number;
  stage: StageRuntime | null;
  results: StageResult[];
  summary: SessionSummary | null;
  /** Ids of recently accepted input events (duplicate protection). */
  recentInputIds: string[];
}

/**
 * WALL: lane = move one lane, step = lift the foot over a hurdle.
 * FLOOR: lane = confirm the left/right region, region = confirm a region (0 = back to centre), step = confirm the small foot movement / continue.
 */
export type RunnerAction = { kind: "lane"; dir: -1 | 1 } | { kind: "step" } | { kind: "region"; region: Lane };

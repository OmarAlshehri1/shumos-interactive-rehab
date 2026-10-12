import type { StoredHarvestSession } from '@/lib/harvestvalley3d/history';
import type { StoredBloomSession } from '@/lib/bloomingworld3d/history';
import type { StoredFireSession } from '@/lib/firerescue3d/history';
import type { StoredPearlSession } from '@/lib/pearlvoyage3d/history';
import type { StoredMirrorSession } from '@/lib/mirrorquest3d/history';
import type { StoredHexSession } from '@/lib/safehexarena3d/history';
import type { StoredTurnGoSession } from '@/lib/turngo3d/history';
import type { StoredFootsteps3Session } from '@/lib/footsteps3d/history';
import type { StoredColorChase3Session } from '@/lib/colorchase3d/history';
import type { StoredSpacePilotRingSession, StoredSpacePilotNineSession } from '@/lib/spacepilot3d/history';
import type { Difficulty, StageNumber, StageStatus } from "@/lib/game";
import type { GameId } from "@/lib/games/registry";
import type { StoredBuildQuestSession } from "@/lib/buildquest3d/history";
import type { StoredSessionWorkflowFields } from "./workflowMetadata";

/**
 * SESSION HISTORY TASK — the permanent, per-patient record of one completed
 * Balloon Quest (or future game) session. Deliberately a TRIMMED-DOWN
 * reflection of the canonical `SessionSummary`/`StageResult` (see
 * lib/game/types.ts) — every number here is copied from those, never
 * recomputed with a new formula (see the task's "DO NOT independently
 * invent new scoring formulas"). Lives at `/sessions/{patientId}/{sessionId}`
 * — see database.rules.json — deliberately separate from the live,
 * transient `/liveSession` (lib/realtime/types.ts).
 *
 * Deliberately does NOT carry the patient's firstName/patientNumber — that
 * identity already lives at `/patients/{patientId}` (see the task's "DO NOT
 * STORE DUPLICATED CHILD IDENTITY").
 */
export interface StoredStageResult {
  /** Present only on Balloon Quest 3D records (three stages per difficulty). Absent = the original five-stage game. See lib/sessions/balloonQuestVersion.ts. */
  engine?: "bq3";
  difficulty: Difficulty;
  stageNumber: StageNumber;
  status: StageStatus;
  correct: number | null;
  incorrect: number | null;
  accuracy: number | null;
  durationMs: number | null;
  averageReactionTimeMs: number | null;
}

export interface StoredSession extends StoredSessionWorkflowFields {
  sessionId: string;
  patientId: string;
  /** Narrowed to the specific literal (not the broad GameId union) so `session.gameId === "follow-the-footsteps"` genuinely discriminates AnyStoredSession — see that type's doc comment. */
  gameId: Extract<GameId, "balloon-quest">;
  startedAt: number | null;
  completedAt: number | null;
  createdByUid: string;

  startingDifficulty: Difficulty;
  startingStage: StageNumber;
  /** The difficulty/stage of the LAST stage the session actually reached (from the last entry of `stageResults`) — see lib/sessions/buildStoredSession.ts. Falls back to startingDifficulty/startingStage when no stage was ever entered. */
  endingDifficulty: Difficulty;
  endingStage: StageNumber;

  completedStageCount: number | null;
  skippedStageCount: number | null;
  totalCorrect: number | null;
  totalIncorrect: number | null;
  /** Session-wide accuracy — same formula as StoredStageResult.accuracy, applied to totals (see lib/game/scoring.ts's calculateAccuracy). */
  accuracy: number | null;
  durationMs: number | null;
  averageReactionTimeMs: number | null;
  bestStage: { difficulty: Difficulty; stageNumber: StageNumber } | null;

  stageResults: StoredStageResult[];
}

/**
 * MULTI-GAME HISTORY — Follow the Footsteps' own permanent per-patient
 * record, at the SAME `/sessions/{patientId}/{sessionId}` path as
 * StoredSession above (see database.rules.json — a node is validated
 * differently depending on its own `gameId`, never a separate tree).
 * Deliberately a SIBLING type, not a reshaping of StoredSession: the task's
 * "prefer a clean discriminated structure... do NOT broadly rewrite working
 * history... maintain backward compatibility with existing Balloon Quest
 * records" — StoredSession above is untouched, field-for-field, so every
 * record a real clinic has already saved keeps reading back exactly as it
 * always did. Shares the common session-metadata field NAMES with
 * StoredSession (sessionId/patientId/gameId/startedAt/completedAt/
 * createdByUid/startingDifficulty/startingStage/endingDifficulty/
 * endingStage/completedStageCount/skippedStageCount/durationMs/bestStage —
 * every one of these concepts genuinely transfers 1:1 to a stepping
 * activity) and replaces only the balloon-specific scoring fields
 * (totalCorrect/totalIncorrect/accuracy/averageReactionTimeMs) with this
 * game's own honest metrics — see FOOTSTEPS metrics: no "دقة"/accuracy
 * language, since there is no incorrect/failure scoring in this game (NO
 * NEGATIVE SCORING).
 */
export interface StoredFootstepsStageResult {
  difficulty: Difficulty;
  stageNumber: StageNumber;
  status: StageStatus;
  stepsPresented: number | null;
  stepsCompleted: number | null;
  durationMs: number | null;
  averageStepTimeMs: number | null;
}

export interface StoredFootstepsSession extends StoredSessionWorkflowFields {
  sessionId: string;
  patientId: string;
  gameId: Extract<GameId, "follow-the-footsteps">;
  startedAt: number | null;
  completedAt: number | null;
  createdByUid: string;

  startingDifficulty: Difficulty;
  startingStage: StageNumber;
  endingDifficulty: Difficulty;
  endingStage: StageNumber;

  completedStageCount: number | null;
  skippedStageCount: number | null;
  totalStepsPresented: number | null;
  totalStepsCompleted: number | null;
  /** totalStepsCompleted / totalStepsPresented — see lib/footsteps/scoring.ts's calculateCompletionRate. Never called "دقة"/accuracy. */
  completionRate: number | null;
  durationMs: number | null;
  averageStepTimeMs: number | null;
  bestStage: { difficulty: Difficulty; stageNumber: StageNumber } | null;

  stageResults: StoredFootstepsStageResult[];
}

/**
 * MULTI-GAME HISTORY — Bubble Pop Wall's own permanent per-patient record,
 * at the SAME `/sessions/{patientId}/{sessionId}` path as the other two
 * games. A SIBLING type again, not a reshaping of either existing one —
 * StoredSession/StoredFootstepsSession stay untouched, field-for-field.
 * Shares the common session-metadata field names (sessionId/patientId/
 * gameId/startedAt/completedAt/createdByUid/startingDifficulty/
 * startingStage/endingDifficulty/endingStage/completedStageCount/
 * skippedStageCount/durationMs/bestStage) and replaces the balloon-specific
 * scoring fields with this game's own honest metrics: BOTH completion
 * (targetsCompleted/targetsPresented, Follow the Footsteps' framing) AND
 * accuracy (correct/(correct+incorrect), Balloon Quest's framing) — this
 * game genuinely has both concepts, see lib/bubblepop/types.ts's
 * BubblePopSessionSummary doc comment.
 */
export interface StoredBubblePopStageResult {
  engine?: "dome3";
  difficulty: Difficulty;
  stageNumber: StageNumber;
  status: StageStatus;
  targetsPresented: number | null;
  targetsCompleted: number | null;
  incorrectCount: number | null;
  durationMs: number | null;
  averageResponseTimeMs: number | null;
}

export interface StoredBubblePopSession extends StoredSessionWorkflowFields {
  resultVersion?: 2;
  engine?: "dome3";
  objectivesCompleted?: number;
  assistedObjectives?: number;
  repeatedObjectives?: number;
  sessionCompleted?: boolean;
  sessionId: string;
  patientId: string;
  gameId: Extract<GameId, "bubble-pop-wall">;
  startedAt: number | null;
  completedAt: number | null;
  createdByUid: string;

  startingDifficulty: Difficulty;
  startingStage: StageNumber;
  endingDifficulty: Difficulty;
  endingStage: StageNumber;

  completedStageCount: number | null;
  skippedStageCount: number | null;
  totalTargetsPresented: number | null;
  totalTargetsCompleted: number | null;
  totalIncorrect: number | null;
  /** totalTargetsCompleted / totalTargetsPresented — see lib/bubblepop/scoring.ts's calculateCompletionRate. */
  completionRate: number | null;
  /** totalTargetsCompleted / (totalTargetsCompleted + totalIncorrect) — see lib/bubblepop/scoring.ts's calculateAccuracy. Activity interaction accuracy, never a clinical measurement. */
  accuracy: number | null;
  durationMs: number | null;
  averageResponseTimeMs: number | null;
  bestStage: { difficulty: Difficulty; stageNumber: StageNumber } | null;

  stageResults: StoredBubblePopStageResult[];
}

/**
 * MULTI-GAME HISTORY — Feed the Animals' own permanent per-patient record,
 * at the SAME `/sessions/{patientId}/{sessionId}` path as the other three
 * games. A SIBLING type again, not a reshaping of any existing one — every
 * other StoredSession variant stays untouched, field-for-field. Shares the
 * common session-metadata field names (sessionId/patientId/gameId/
 * startedAt/completedAt/createdByUid/startingDifficulty/startingStage/
 * endingDifficulty/endingStage/completedStageCount/skippedStageCount/
 * durationMs/bestStage) and replaces the game-specific scoring fields with
 * this game's own honest metrics: BOTH completion (roundsCompleted /
 * roundsPresented — "how many animals got fed") AND accuracy (correct /
 * (correct + incorrect)). Retained solely for historical records.
 */
export interface StoredFeedAnimalsStageResult {
  difficulty: Difficulty;
  stageNumber: StageNumber;
  status: StageStatus;
  roundsPresented: number | null;
  roundsCompleted: number | null;
  incorrectCount: number | null;
  durationMs: number | null;
  averageResponseTimeMs: number | null;
}

export interface StoredFeedAnimalsSession extends StoredSessionWorkflowFields {
  sessionId: string;
  patientId: string;
  /** Retired game: readable history only, never a launchable GameId. */
  gameId: "feed-the-animals";
  startedAt: number | null;
  completedAt: number | null;
  createdByUid: string;

  startingDifficulty: Difficulty;
  startingStage: StageNumber;
  endingDifficulty: Difficulty;
  endingStage: StageNumber;

  completedStageCount: number | null;
  skippedStageCount: number | null;
  totalRoundsPresented: number | null;
  /** "ساعدت N حيوان" — every completed round is one animal successfully fed. */
  totalRoundsCompleted: number | null;
  totalIncorrect: number | null;
  /** totalRoundsCompleted / totalRoundsPresented. */
  completionRate: number | null;
  /** totalRoundsCompleted / (totalRoundsCompleted + totalIncorrect). Activity interaction accuracy, never a clinical measurement. */
  accuracy: number | null;
  durationMs: number | null;
  averageResponseTimeMs: number | null;
  bestStage: { difficulty: Difficulty; stageNumber: StageNumber } | null;

  stageResults: StoredFeedAnimalsStageResult[];
}

/**
 * MULTI-GAME HISTORY — Space Pilot's own permanent per-patient record, at
 * the SAME `/sessions/{patientId}/{sessionId}` path as the other four
 * games. A SIBLING type again, not a reshaping of any existing one. Unlike
 * every other game, Space Pilot has no real difficulty/stage progression
 * (single fixed EASY Stage 1 level — see lib/spacepilot/session.ts's doc
 * comment), so `startingDifficulty`/`startingStage`/`endingDifficulty`/
 * `endingStage` are always EASY/1 and `stageResults` is never written —
 * still present as required generic history-metadata fields (see
 * database.rules.json), just constant, so this record shape stays
 * consistent with every generic history-reading surface. Its own honest
 * metrics are starsPresented/starsCollected/collectionRate (the task's
 * suggested minimal set) plus finalUpgradeLevel — the rocket-transformation
 * payoff number, never a clinical measurement.
 */
export interface StoredSpacePilotSession extends StoredSessionWorkflowFields {
  sessionId: string;
  patientId: string;
  gameId: Extract<GameId, "space-pilot">;
  startedAt: number | null;
  completedAt: number | null;
  createdByUid: string;

  startingDifficulty: Difficulty;
  startingStage: StageNumber;
  endingDifficulty: Difficulty;
  endingStage: StageNumber;

  completedStageCount: number | null;
  skippedStageCount: number | null;
  totalStarsPresented: number | null;
  totalStarsCollected: number | null;
  /** totalStarsCollected / totalStarsPresented — see lib/spacepilot/scoring.ts's calculateSpacePilotCollectionRate. */
  collectionRate: number | null;
  /** How many of the stage's stars the rocket had upgraded through by session end — the "قائد الفضاء" transformation payoff, never a clinical measurement. */
  finalUpgradeLevel: number | null;
  /** MEDIUM/ADVANCED only — null on EASY, which has no asteroids. */
  asteroidsCleared: number | null;
  asteroidsAvoided: number | null;
  durationMs: number | null;
  bestStage: { difficulty: Difficulty; stageNumber: StageNumber } | null;
}

export interface StoredColorChaseStageResult {
  difficulty: Difficulty;
  stageNumber: StageNumber;
  status: StageStatus;
  targetsPresented: number | null;
  correctCount: number | null;
  incorrectCount: number | null;
  dangerPressCount: number | null;
  accuracy: number | null;
  durationMs: number | null;
  averageResponseTimeMs: number | null;
}

/** Permanent, compact Color Chase metrics. Values are copied from the canonical summary. */
export interface StoredColorChaseSession extends StoredSessionWorkflowFields {
  sessionId: string;
  patientId: string;
  gameId: Extract<GameId, "color-chase">;
  startedAt: number | null;
  completedAt: number | null;
  createdByUid: string;
  startingDifficulty: Difficulty;
  startingStage: StageNumber;
  endingDifficulty: Difficulty;
  endingStage: StageNumber;
  completedStageCount: number | null;
  skippedStageCount: number | null;
  totalTargetsPresented: number | null;
  totalCorrect: number | null;
  totalIncorrect: number | null;
  totalDangerPresses: number | null;
  accuracy: number | null;
  durationMs: number | null;
  averageResponseTimeMs: number | null;
  bestStage: { difficulty: Difficulty; stageNumber: StageNumber } | null;
  stageResults: StoredColorChaseStageResult[];
}

/**
 * RUNNER QUEST 3D — its own permanent per-patient record, at the SAME `/sessions/{patientId}/{sessionId}`
 * path, validated by its own `gameId` branch (see database.rules.json). A SIBLING type: no other game's record
 * is touched or reinterpreted. `resultVersion` makes the result schema versioned. No accuracy is stored or
 * derived: the game has no wrong answers, collisions or failure; `totalHolds` counts obstacles at which the
 * runner waited for the child (informational only, never a penalty).
 */
export const RUNNER_QUEST_RESULT_VERSION = 2;
/**
 * Version history: 1 = WALL-only runner (no projection fields). 2 = adds `projection` and `objectivesSkipped` on every stage row.
 * A row without `projection` is a version-1 WALL row and is never reinterpreted. For FLOOR rows `obstaclesTotal/Resolved` count
 * objectives (completed, assisted included; skipped excluded) and `holds` is always 0. The projection is stored per row (the
 * history rules allow extra row fields for this game but no new top-level ones), so it is derived for the session from its rows.
 */
export interface StoredRunnerQuestStageResult {
  /** Always "rq3": marks the Runner Quest result schema on every stage row. */
  engine: "rq3";
  difficulty: Difficulty;
  stageNumber: StageNumber;
  status: StageStatus;
  stars: number | null;
  holds: number | null;
  assists: number | null;
  obstaclesResolved: number | null;
  obstaclesTotal: number | null;
  durationMs: number | null;
  /** Version 2+. Absent on version-1 rows (always WALL). */
  projection?: "WALL" | "FLOOR";
  /** Version 2+ FLOOR rows: objectives the therapist skipped. */
  objectivesSkipped?: number | null;
}

export interface StoredRunnerQuestSession extends StoredSessionWorkflowFields {
  sessionId: string;
  patientId: string;
  gameId: Extract<GameId, "runner-quest-3d">;
  resultVersion: number;
  startedAt: number | null;
  completedAt: number | null;
  createdByUid: string;
  startingDifficulty: Difficulty;
  startingStage: StageNumber;
  endingDifficulty: Difficulty;
  endingStage: StageNumber;
  completedStageCount: number | null;
  skippedStageCount: number | null;
  totalStars: number | null;
  totalHolds: number | null;
  totalAssists: number | null;
  totalObstaclesPresented: number | null;
  totalObstaclesResolved: number | null;
  /** MANUAL / KEYBOARD / RIGHT_FOOT / LEFT_FOOT / DUAL_FOOT at the end of the session (informational). */
  inputSource: string | null;
  durationMs: number | null;
  bestStage: { difficulty: Difficulty; stageNumber: StageNumber } | null;
  stageResults: StoredRunnerQuestStageResult[];
}

/**
 * MULTI-GAME HISTORY — the union every generic history-reading surface
 * (sessionHistoryRepository.ts, PatientSessionHistorySection and its
 * children) actually works with; narrow on `gameId` to reach a specific
 * game's own richer fields. See resumeSuggestion.ts's StoredSessionLike for
 * the minimal common shape that needs no narrowing at all.
 */
export type AnyStoredSession =
  | StoredHarvestSession
  | StoredBloomSession
  | StoredFireSession
  | StoredPearlSession
  | StoredSession
  | StoredFootstepsSession
  | StoredBubblePopSession
  | StoredFeedAnimalsSession
  | StoredSpacePilotSession
  | StoredSpacePilotRingSession
  | StoredSpacePilotNineSession
  | StoredColorChaseSession
  | StoredRunnerQuestSession
  | StoredBuildQuestSession
  | StoredMirrorSession
  | StoredHexSession
  | StoredTurnGoSession
  | StoredFootsteps3Session
  | StoredColorChase3Session;

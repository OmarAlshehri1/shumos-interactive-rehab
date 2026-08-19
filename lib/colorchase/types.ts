import { Difficulty, GameState, STAGES_PER_DIFFICULTY, type StageNumber } from "@/lib/game";
import type { SessionWorkflowMetadata } from "@/lib/sessions/workflowMetadata";

export { Difficulty, GameState, STAGES_PER_DIFFICULTY, type StageNumber };

export const PAD_IDS = ["PAD_1", "PAD_2", "PAD_3", "PAD_4", "PAD_5", "PAD_6", "PAD_7", "PAD_8", "PAD_9"] as const;
export type PadId = (typeof PAD_IDS)[number];

export enum ChaseColor {
  BLUE = "BLUE",
  YELLOW = "YELLOW",
  RED = "RED",
  GREEN = "GREEN",
  PINK = "PINK",
  PURPLE = "PURPLE",
}

export const CHASE_COLOR_LABELS_AR: Record<ChaseColor, string> = {
  [ChaseColor.BLUE]: "الأزرق",
  [ChaseColor.YELLOW]: "الأصفر",
  [ChaseColor.RED]: "الأحمر",
  [ChaseColor.GREEN]: "الأخضر",
  [ChaseColor.PINK]: "الوردي",
  [ChaseColor.PURPLE]: "البنفسجي",
};

export interface ColorChaseDistractor {
  padId: PadId;
  color: ChaseColor;
}

/** One immutable physical-floor decision. Exactly one pad is correct. */
export interface ColorChaseStepPlan {
  targetColor: ChaseColor;
  correctPadId: PadId;
  distractors: readonly ColorChaseDistractor[];
}

export interface ColorChaseStagePlan {
  difficulty: Difficulty;
  stageNumber: StageNumber;
  titleAr: string;
  instructionAr: string;
  steps: readonly ColorChaseStepPlan[];
  /** Established before movement and fixed for the entire stage. */
  dangerPadIds: readonly PadId[];
}

export interface ColorChaseSessionConfig {
  childFirstName: string;
  difficulty: Difficulty;
  startingStage: StageNumber;
}

export enum ColorChaseStageStatus {
  COMPLETED = "COMPLETED",
  SKIPPED = "SKIPPED",
}

export interface ColorChaseStageRuntime {
  difficulty: Difficulty;
  stageNumber: StageNumber;
  plan: ColorChaseStagePlan;
  currentStepIndex: number;
  correctCount: number;
  incorrectCount: number;
  dangerPressCount: number;
  responseTimesMs: number[];
  startedAt: number | null;
  completedAt: number | null;
  pausedAt: number | null;
  totalPausedMs: number;
  stepStartedAt: number | null;
  stepPausedMs: number;
  /** Persistent idempotency boundary for controller, keyboard, or future sensor events. */
  processedInputIds: string[];
  lastAcceptedInput: { padId: PadId; timestamp: number } | null;
}

export interface ColorChaseStageResult {
  difficulty: Difficulty;
  stageNumber: StageNumber;
  status: ColorChaseStageStatus;
  targetsPresented: number;
  correctCount: number;
  incorrectCount: number;
  dangerPressCount: number;
  accuracy: number | null;
  durationMs: number | null;
  averageResponseTimeMs: number | null;
}

export interface ColorChaseSessionSummary {
  sessionId: string;
  childFirstName: string;
  startingDifficulty: Difficulty;
  difficultiesPlayed: Difficulty[];
  stageResults: ColorChaseStageResult[];
  totalTargetsPresented: number;
  totalCorrect: number;
  totalIncorrect: number;
  totalDangerPresses: number;
  accuracy: number | null;
  totalDurationMs: number;
  averageResponseTimeMs: number | null;
  bestStage: { difficulty: Difficulty; stageNumber: StageNumber } | null;
  completedAt: string;
}

export interface ColorChaseSessionState {
  sessionId: string;
  seed: string;
  config: ColorChaseSessionConfig;
  gameState: GameState;
  currentDifficulty: Difficulty;
  currentStage: ColorChaseStageRuntime;
  results: ColorChaseStageResult[];
  createdAt: number;
  endedAt: number | null;
  summary: ColorChaseSessionSummary | null;
  workflow?: SessionWorkflowMetadata;
}

export interface ConfirmPadInput {
  padId: PadId;
  /** Stable per physical activation; duplicate delivery is a no-op. */
  inputId: string;
  timestamp: number;
}

export type ColorChasePadOutcome = "correct" | "incorrect" | "danger" | "duplicate";
export type ColorChaseActionResult =
  | { success: true; state: ColorChaseSessionState; outcome?: ColorChasePadOutcome }
  | { success: false; state: ColorChaseSessionState; reason: string };

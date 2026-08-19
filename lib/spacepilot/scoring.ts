import type { Difficulty } from "@/lib/game";
import type { SpacePilotSessionSummary } from "./types";
import { requireFiniteCount, requireNonNegativeFiniteNumber, safeRatio } from "@/lib/dataIntegrity/numeric";

export interface BuildSpacePilotSessionSummaryParams {
  sessionId: string;
  childFirstName: string;
  difficulty: Difficulty;
  starsPresented: number;
  starsCollected: number;
  asteroidsCleared: number | null;
  asteroidsAvoided: number | null;
  totalDurationMs: number | null;
  completedAt: string;
}

/** Same one-formula convention as other games; null means no stars were presented. */
export function calculateSpacePilotCollectionRate(starsCollected: number, starsPresented: number): number | null {
  return safeRatio(starsCollected, starsPresented);
}

export function buildSpacePilotSessionSummary(params: BuildSpacePilotSessionSummaryParams): SpacePilotSessionSummary {
  const starsPresented = requireFiniteCount(params.starsPresented, "starsPresented");
  const starsCollected = requireFiniteCount(params.starsCollected, "starsCollected");
  return {
    sessionId: params.sessionId,
    childFirstName: params.childFirstName,
    difficulty: params.difficulty,
    starsPresented,
    starsCollected,
    collectionRate: calculateSpacePilotCollectionRate(starsCollected, starsPresented),
    finalUpgradeLevel: starsCollected,
    asteroidsCleared: params.asteroidsCleared === null ? null : requireFiniteCount(params.asteroidsCleared, "asteroidsCleared"),
    asteroidsAvoided: params.asteroidsAvoided === null ? null : requireFiniteCount(params.asteroidsAvoided, "asteroidsAvoided"),
    totalDurationMs: params.totalDurationMs === null ? null : requireNonNegativeFiniteNumber(params.totalDurationMs, "totalDurationMs"),
    completedAt: params.completedAt,
  };
}

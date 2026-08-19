import { GameState } from "./types";

export interface ColorChaseVoiceEventGate {
  /** True only for the first claim of this semantic event in one mounted scene. */
  claim(key: string): boolean;
}

export function createColorChaseVoiceEventGate(): ColorChaseVoiceEventGate {
  const claimed = new Set<string>();
  return {
    claim(key) {
      if (claimed.has(key)) return false;
      claimed.add(key);
      return true;
    },
  };
}

export function colorChaseTargetVoiceKey(params: {
  difficulty: string;
  stageNumber: number;
  stageStartedAt: number | null;
  stepIndex: number;
}): string {
  return `target:${params.difficulty}:${params.stageNumber}:${params.stageStartedAt ?? "pending"}:${params.stepIndex}`;
}

/** Instruction and countdown scenes own their speech; only PLAYING may announce an active pad target. */
export function colorChasePhaseOwnsTargetVoice(gameState: GameState): boolean {
  return gameState === GameState.PLAYING;
}

export function emitColorChaseTargetOnce(params: {
  gate: ColorChaseVoiceEventGate;
  difficulty: string;
  stageNumber: number;
  stageStartedAt: number | null;
  stepIndex: number;
  emit: () => void;
}): boolean {
  const { gate, emit, ...identity } = params;
  if (!gate.claim(colorChaseTargetVoiceKey(identity))) return false;
  emit();
  return true;
}

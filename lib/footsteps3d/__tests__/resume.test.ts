import { describe, expect, it } from 'vitest';
import { suggestResumePoint } from '@/lib/sessions/resumeSuggestion';
import { Difficulty, StageStatus } from '@/lib/game';

const session = (engine: 'fp3' | undefined, difficulty: Difficulty, stageNumber: 1 | 2 | 3 | 4 | 5) => ({
  startingDifficulty: difficulty,
  startingStage: 1 as const,
  stageResults: [{ status: StageStatus.COMPLETED, difficulty, stageNumber, ...(engine ? { engine } : {}) }],
});

describe('resume suggestion for the nine-stage game', () => {
  it('the 3D game has three stages per level: after stage 3 the suggestion moves to the next level, never a stage 4', () => {
    expect(suggestResumePoint(session('fp3', Difficulty.EASY, 3))).toMatchObject({ difficulty: Difficulty.MEDIUM, startingStage: 1, reason: 'next-difficulty' });
    expect(suggestResumePoint(session('fp3', Difficulty.EASY, 2))).toMatchObject({ difficulty: Difficulty.EASY, startingStage: 3, reason: 'next-stage' });
    expect(suggestResumePoint(session('fp3', Difficulty.ADVANCED, 3)).reason).toBe('repeat-final-stage');
  });
  it('original five-stage records are interpreted exactly as before', () => {
    expect(suggestResumePoint(session(undefined, Difficulty.EASY, 3))).toMatchObject({ difficulty: Difficulty.EASY, startingStage: 4, reason: 'next-stage' });
    expect(suggestResumePoint(session(undefined, Difficulty.EASY, 5))).toMatchObject({ difficulty: Difficulty.MEDIUM, startingStage: 1, reason: 'next-difficulty' });
  });
});

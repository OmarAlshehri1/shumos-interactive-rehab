import { Difficulty } from '@/lib/game';
import type { PatternKind } from './world';

/** 3 levels x 3 stages. Every stage is a short sequence of large stepping stones. */
export interface StageDef {
  index: number;
  level: 1 | 2 | 3;
  stage: 1 | 2 | 3;
  pattern: PatternKind;
  steps: number;
  /** Optional rest pauses are offered after these (0-based) steps are completed. */
  rests: readonly number[];
  /** Memory stage: stones come in pairs; each pair is shown first, then stepped in order. */
  pairs: boolean;
  /** Foot cues alternate right and left. */
  alternating: boolean;
}

const def = (index: number, level: 1 | 2 | 3, stage: 1 | 2 | 3, pattern: PatternKind, steps: number, extra: Partial<Pick<StageDef, 'rests' | 'pairs' | 'alternating'>> = {}): StageDef => ({
  index, level, stage, pattern, steps, rests: [], pairs: false, alternating: false, ...extra,
});

export const STAGES: readonly StageDef[] = [
  def(0, 1, 1, 'hops', 4), //                      L1S1: one large target at a time, short distances
  def(1, 1, 2, 'straight', 5), //                  L1S2: a simple straight sequence
  def(2, 1, 3, 'zigzag', 5), //                    L1S3: gentle left / right changes
  def(3, 2, 1, 'alternate', 6, { alternating: true }), // L2S1: alternating right and left foot cues
  def(4, 2, 2, 'curve', 6), //                     L2S2: a gentle curved path
  def(5, 2, 3, 'straight', 7, { rests: [2, 4] }), // L2S3: a short sequence with optional rest pauses
  def(6, 3, 1, 'varied', 7), //                    L3S1: a slightly longer path with varied directions
  def(7, 3, 2, 'memory', 6, { pairs: true }), //   L3S2: a two-step memory sequence
  def(8, 3, 3, 'combined', 8), //                 L3S3: straight, curve and zigzag combined
];
export const TOTAL_STEPS = STAGES.reduce((a, s) => a + s.steps, 0);

export const LEVEL_DIFFICULTY = [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.ADVANCED] as const;
export const difficultyOf = (stageIndex: number): Difficulty => LEVEL_DIFFICULTY[Math.floor(stageIndex / 3)];

/** Visual world of each level: sunny garden, riverside forest, magical twilight forest. */
export const WORLD_NAMES = ['حديقة مشمسة سحرية', 'غابة على ضفة النهر', 'غابة الشفق السحرية'] as const;
export const worldOf = (stageIndex: number): 0 | 1 | 2 => Math.floor(stageIndex / 3) as 0 | 1 | 2;

import { StageStatus, type Difficulty, type StageNumber } from '@/lib/game';
import type { StoredSessionWorkflowFields } from '@/lib/sessions/workflowMetadata';
import { summary, type State } from './engine';
import { GAME_ID } from './live';
import { STAGES, difficultyOf } from './stages';

export const HISTORY_ENGINE = 'fp3-forest' as const;
export const HISTORY_VERSION = 2 as const;

/**
 * Nine-stage Follow the Footsteps record. It lives at the same history path and carries the original game's field names
 * (so the existing history screens read it), but is distinguishable from the original five-stage records by
 * `resultVersion: 2` and `engine: "fp3-forest"`. Original records have neither and are never reinterpreted.
 * Counts only (therapist-confirmed steps): no sensor count, no gait or balance score.
 */
export interface StoredFootsteps3Session extends StoredSessionWorkflowFields {
  gameId: typeof GAME_ID;
  resultVersion: typeof HISTORY_VERSION;
  engine: typeof HISTORY_ENGINE;
  sessionId: string;
  patientId: string;
  createdByUid: string;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  startingDifficulty: Difficulty;
  startingStage: StageNumber;
  endingDifficulty: Difficulty;
  endingStage: StageNumber;
  completedStageCount: number;
  skippedStageCount: number;
  totalStepsPresented: number;
  totalStepsCompleted: number;
  completionRate: number;
  averageStepTimeMs: null;
  totalAssists: number;
  inputSource: string;
  bestStage: { difficulty: Difficulty; stageNumber: StageNumber } | null;
  stageResults: {
    engine: 'fp3';
    difficulty: Difficulty;
    stageNumber: StageNumber;
    status: StageStatus;
    stepsPresented: number;
    stepsCompleted: number;
    assists: number;
    durationMs: null;
    averageStepTimeMs: null;
  }[];
}

const stageNo = (i: number) => ((i % 3) + 1) as StageNumber;

export function buildHistory(s: State, patientId: string, uid: string): StoredFootsteps3Session {
  if (s.status !== 'ended' || !s.endedAt || !patientId || !uid) throw new Error('Ended bound session required');
  const rows = STAGES.flatMap((def, index) => {
    const ev = s.events.filter((e) => e.stage === index);
    if (!ev.length && !s.completed.includes(index) && !s.skipped.includes(index)) return [];
    return [{
      engine: 'fp3' as const,
      difficulty: difficultyOf(index),
      stageNumber: stageNo(index),
      status: s.completed.includes(index) ? StageStatus.COMPLETED : StageStatus.SKIPPED,
      stepsPresented: def.steps,
      stepsCompleted: ev.filter((e) => e.kind !== 'skipped').length,
      assists: ev.filter((e) => e.kind === 'assisted').length,
      durationMs: null,
      averageStepTimeMs: null,
    }];
  });
  const best = rows.filter((r) => r.status === StageStatus.COMPLETED).at(-1);
  const presented = rows.reduce((a, r) => a + r.stepsPresented, 0);
  const sum = summary(s);
  return {
    gameId: GAME_ID,
    resultVersion: HISTORY_VERSION,
    engine: HISTORY_ENGINE,
    sessionId: `${s.sessionId}-r${s.run}`,
    patientId,
    createdByUid: uid,
    startedAt: s.startedAt || s.endedAt,
    completedAt: s.endedAt,
    durationMs: s.startedAt ? Math.max(0, s.endedAt - s.startedAt) : 0,
    startingDifficulty: rows[0]?.difficulty ?? difficultyOf(s.stage),
    startingStage: rows[0]?.stageNumber ?? stageNo(s.stage),
    endingDifficulty: difficultyOf(Math.min(s.stage, 8)),
    endingStage: stageNo(Math.min(s.stage, 8)),
    completedStageCount: s.completed.length,
    skippedStageCount: rows.filter((r) => r.status === StageStatus.SKIPPED).length,
    totalStepsPresented: presented,
    totalStepsCompleted: sum.completed,
    completionRate: presented > 0 ? sum.completed / presented : 0,
    averageStepTimeMs: null,
    totalAssists: sum.assisted,
    inputSource: s.config.inputSource === 'simulated' ? 'SIMULATED' : 'MANUAL',
    bestStage: best ? { difficulty: best.difficulty, stageNumber: best.stageNumber } : null,
    stageResults: rows,
  };
}

export function hasActivity(s: State): boolean {
  return s.events.length > 0 || s.completed.length > 0 || s.skipped.length > 0;
}

/** True for a record written by the 3D game (and only that): original records have neither marker. */
export function isFootsteps3History(raw: unknown): boolean {
  const r = raw as { resultVersion?: unknown; engine?: unknown } | null;
  return !!r && r.resultVersion === HISTORY_VERSION && r.engine === HISTORY_ENGINE;
}

export function reviveFootsteps3History(raw: unknown): StoredFootsteps3Session | null {
  const r = raw as StoredFootsteps3Session;
  if (!r || r.gameId !== GAME_ID || !isFootsteps3History(r) || !r.sessionId || !r.patientId || !r.createdByUid) return null;
  const counts = [r.startedAt, r.completedAt, r.durationMs, r.completedStageCount, r.skippedStageCount, r.totalStepsPresented, r.totalStepsCompleted, r.totalAssists];
  if (!counts.every((v) => Number.isFinite(v) && v >= 0) || r.completedAt < r.startedAt) return null;
  if (r.totalStepsPresented > 100 || r.totalStepsCompleted > r.totalStepsPresented || r.totalAssists > r.totalStepsCompleted) return null;
  if (r.completedStageCount > 9 || r.skippedStageCount > 9) return null;
  const rows: StoredFootsteps3Session['stageResults'] = Array.isArray(r.stageResults) ? r.stageResults : Object.values(r.stageResults ?? {});
  if (rows.length > 9 || rows.some((p) => p.engine !== 'fp3' || !Number.isInteger(p.stepsPresented) || p.stepsPresented < 1 || p.stepsPresented > 10 || !Number.isInteger(p.stepsCompleted) || p.stepsCompleted < 0 || p.stepsCompleted > p.stepsPresented || !Number.isInteger(p.assists) || p.assists < 0 || p.assists > p.stepsCompleted)) return null;
  return {
    ...r,
    averageStepTimeMs: null,
    completionRate: r.totalStepsPresented > 0 ? r.totalStepsCompleted / r.totalStepsPresented : 0,
    inputSource: typeof r.inputSource === 'string' ? r.inputSource : 'MANUAL',
    bestStage: r.bestStage ?? null,
    stageResults: rows.map((p) => ({ ...p, durationMs: null, averageStepTimeMs: null })),
  };
}

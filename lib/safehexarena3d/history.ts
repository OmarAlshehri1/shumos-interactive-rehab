import { StageStatus, type StageNumber } from '@/lib/game';
import type { StoredSessionWorkflowFields } from '@/lib/sessions/workflowMetadata';
import { summary, type State } from './engine';
import { GAME_ID } from './live';
import { difficultyOf, STAGES } from './stages';

type Diff = ReturnType<typeof difficultyOf>;

/**
 * Versioned Safe Hex Arena result. Metrics are therapist-confirmed counts only: no sensor count, no balance score.
 * `totalSafeTransitions` = therapist-confirmed safe positions; `totalAssists` = transitions the therapist assisted.
 */
export interface StoredHexSession extends StoredSessionWorkflowFields {
  gameId: typeof GAME_ID;
  resultVersion: 1;
  sessionId: string;
  patientId: string;
  createdByUid: string;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  startingDifficulty: Diff;
  startingStage: StageNumber;
  endingDifficulty: Diff;
  endingStage: StageNumber;
  completedStageCount: number;
  skippedStageCount: number;
  totalRoundsPresented: number;
  totalRoundsCompleted: number;
  totalSafeTransitions: number;
  totalAssists: number;
  inputSource: string;
  bestStage: { difficulty: Diff; stageNumber: StageNumber } | null;
  stageResults: {
    engine: 'hex3';
    difficulty: Diff;
    stageNumber: StageNumber;
    status: StageStatus;
    rounds: number;
    /** Tile count of the layout played (6/9/12/16/20). Absent in records saved before the layout presets. */
    tiles?: number;
    roundsCompleted: number;
    assists: number;
    durationMs: null;
  }[];
}

export function buildHistory(s: State, patientId: string, uid: string): StoredHexSession {
  if (s.status !== 'ended' || !s.endedAt || !patientId || !uid) throw new Error('Ended bound session required');
  const stageNo = (i: number) => ((i % 3) + 1) as StageNumber;
  const rows = STAGES.flatMap((def, index) => {
    const ev = s.events.filter((e) => e.stage === index);
    if (!ev.length && !s.completed.includes(index) && !s.skipped.includes(index)) return [];
    return [{
      engine: 'hex3' as const,
      difficulty: difficultyOf(index),
      stageNumber: stageNo(index),
      status: s.completed.includes(index) ? StageStatus.COMPLETED : StageStatus.SKIPPED,
      rounds: def.rounds,
      tiles: ev.find((e) => e.tiles)?.tiles ?? def.tiles,
      roundsCompleted: ev.filter((e) => e.kind !== 'skipped').length,
      assists: ev.filter((e) => e.kind === 'assisted').length,
      durationMs: null,
    }];
  });
  const best = rows.filter((r) => r.status === StageStatus.COMPLETED).at(-1);
  const sum = summary(s);
  return {
    gameId: GAME_ID,
    resultVersion: 1,
    sessionId: `${s.sessionId}-r${s.run}`,
    patientId,
    createdByUid: uid,
    startedAt: s.startedAt || s.endedAt,
    completedAt: s.endedAt,
    durationMs: s.startedAt ? Math.max(0, s.endedAt - s.startedAt) : 0,
    startingDifficulty: rows[0]?.difficulty ?? difficultyOf(s.stage),
    startingStage: rows[0]?.stageNumber ?? stageNo(s.stage),
    endingDifficulty: difficultyOf(s.stage),
    endingStage: stageNo(s.stage),
    completedStageCount: s.completed.length,
    skippedStageCount: rows.filter((r) => r.status === StageStatus.SKIPPED).length,
    totalRoundsPresented: sum.presented,
    totalRoundsCompleted: sum.completed,
    totalSafeTransitions: sum.confirmed,
    totalAssists: sum.assisted,
    inputSource: s.config.inputSource === 'simulated' ? 'SIMULATED' : 'MANUAL',
    bestStage: best ? { difficulty: best.difficulty, stageNumber: best.stageNumber } : null,
    stageResults: rows,
  };
}

export function hasActivity(s: State): boolean {
  return s.events.length > 0 || s.completed.length > 0 || s.skipped.length > 0;
}

export function reviveHexHistory(raw: unknown): StoredHexSession | null {
  const r = raw as StoredHexSession;
  if (!r || r.gameId !== GAME_ID || r.resultVersion !== 1 || !r.sessionId || !r.patientId || !r.createdByUid) return null;
  const counts = [r.startedAt, r.completedAt, r.durationMs, r.completedStageCount, r.skippedStageCount, r.totalRoundsPresented, r.totalRoundsCompleted, r.totalSafeTransitions, r.totalAssists];
  if (!counts.every((v) => Number.isFinite(v) && v >= 0) || r.completedAt < r.startedAt) return null;
  if (r.totalRoundsPresented > 60 || r.totalRoundsCompleted > r.totalRoundsPresented || r.totalSafeTransitions + r.totalAssists !== r.totalRoundsCompleted) return null;
  if (r.completedStageCount > 9 || r.skippedStageCount > 9) return null;
  const rows: StoredHexSession['stageResults'] = Array.isArray(r.stageResults) ? r.stageResults : Object.values(r.stageResults ?? {});
  if (rows.length > 9 || rows.some((p) => p.engine !== 'hex3' || !Number.isInteger(p.rounds) || p.rounds < 1 || p.rounds > 6 || !Number.isInteger(p.roundsCompleted) || p.roundsCompleted < 0 || p.roundsCompleted > p.rounds || !Number.isInteger(p.assists) || p.assists < 0 || p.assists > p.roundsCompleted)) return null;
  if (rows.some((p) => p.tiles !== undefined && ![6, 9, 12, 16, 20].includes(p.tiles))) return null;
  return { ...r, inputSource: typeof r.inputSource === 'string' ? r.inputSource : 'MANUAL', bestStage: r.bestStage ?? null, stageResults: rows.map((p) => ({ ...p, durationMs: null })) };
}

import { StageStatus, type Difficulty, type StageNumber } from '@/lib/game';
import type { StoredSessionWorkflowFields } from '@/lib/sessions/workflowMetadata';
import { summary, type State } from './engine';
import { GAME_ID } from './live';
import { STAGES, difficultyOf, stepsOf } from './stages';

export const HISTORY_ENGINE = 'cc3-garden' as const;
export const HISTORY_VERSION = 2 as const;

export interface StoredColorChase3StageResult {
  engine: 'cc3';
  difficulty: Difficulty;
  stageNumber: StageNumber;
  status: StageStatus;
  objectivesPresented: number;
  objectivesCompleted: number;
  assists: number;
  durationMs: null;
}

/**
 * Nine-stage Color Chase record. It lives at the same history path as the original five-stage records but is
 * distinguishable by `resultVersion: 2` and `engine: "cc3-garden"`. The original accuracy / danger-press fields are
 * deliberately null here: this game never scores a wrong choice, and original records are never reinterpreted.
 * Counts only (therapist-confirmed objectives).
 */
export interface StoredColorChase3Session extends StoredSessionWorkflowFields {
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
  totalTargetsPresented: number;
  totalCorrect: null;
  totalIncorrect: null;
  totalDangerPresses: null;
  accuracy: null;
  averageResponseTimeMs: null;
  objectivesCompleted: number;
  assistedObjectives: number;
  repeatedObjectives: number;
  sessionCompleted: boolean;
  inputSource: string;
  bestStage: { difficulty: Difficulty; stageNumber: StageNumber } | null;
  stageResults: StoredColorChase3StageResult[];
}

const stageNo = (i: number) => ((i % 3) + 1) as StageNumber;

export function buildHistory(s: State, patientId: string, uid: string): StoredColorChase3Session {
  if (s.status !== 'ended' || !s.endedAt || !patientId || !uid) throw new Error('Ended bound session required');
  const rows: StoredColorChase3StageResult[] = STAGES.flatMap((def, index) => {
    const ev = s.events.filter((e) => e.stage === index);
    if (!ev.length && !s.completed.includes(index) && !s.skipped.includes(index)) return [];
    return [{
      engine: 'cc3' as const,
      difficulty: difficultyOf(index),
      stageNumber: stageNo(index),
      status: s.completed.includes(index) ? StageStatus.COMPLETED : StageStatus.SKIPPED,
      objectivesPresented: stepsOf(def),
      objectivesCompleted: ev.filter((e) => e.kind !== 'skipped').length,
      assists: ev.filter((e) => e.kind === 'assisted').length,
      durationMs: null,
    }];
  });
  const best = rows.filter((r) => r.status === StageStatus.COMPLETED).at(-1);
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
    startingDifficulty: difficultyOf(s.startStage),
    startingStage: stageNo(s.startStage),
    endingDifficulty: difficultyOf(Math.min(s.stage, 8)),
    endingStage: stageNo(Math.min(s.stage, 8)),
    completedStageCount: s.completed.length,
    skippedStageCount: rows.filter((r) => r.status === StageStatus.SKIPPED).length,
    totalTargetsPresented: rows.reduce((a, r) => a + r.objectivesPresented, 0),
    totalCorrect: null,
    totalIncorrect: null,
    totalDangerPresses: null,
    accuracy: null,
    averageResponseTimeMs: null,
    objectivesCompleted: sum.completed,
    assistedObjectives: sum.assisted,
    repeatedObjectives: s.repeats,
    sessionCompleted: sum.sessionCompleted,
    inputSource: s.config.inputSource === 'simulated' ? 'SIMULATED' : 'MANUAL',
    bestStage: best ? { difficulty: best.difficulty, stageNumber: best.stageNumber } : null,
    stageResults: rows,
  };
}

export function hasActivity(s: State): boolean {
  return s.events.length > 0 || s.completed.length > 0 || s.skipped.length > 0;
}

/** True for a record written by the 3D game (and only that): original records have neither marker. */
export function isColorChase3History(raw: unknown): raw is StoredColorChase3Session {
  const r = raw as { resultVersion?: unknown; engine?: unknown } | null;
  return !!r && r.resultVersion === HISTORY_VERSION && r.engine === HISTORY_ENGINE;
}

export function reviveColorChase3History(raw: unknown): StoredColorChase3Session | null {
  const r = raw as StoredColorChase3Session;
  if (!r || r.gameId !== GAME_ID || !isColorChase3History(r) || !r.sessionId || !r.patientId || !r.createdByUid) return null;
  const counts = [r.startedAt, r.completedAt, r.durationMs, r.completedStageCount, r.skippedStageCount, r.totalTargetsPresented, r.objectivesCompleted, r.assistedObjectives, r.repeatedObjectives];
  if (!counts.every((v) => Number.isFinite(v) && v >= 0) || r.completedAt < r.startedAt) return null;
  if (r.totalTargetsPresented > 100 || r.objectivesCompleted > r.totalTargetsPresented || r.assistedObjectives > r.objectivesCompleted || typeof r.sessionCompleted !== 'boolean') return null;
  if (r.completedStageCount > 9 || r.skippedStageCount > 9) return null;
  const rows: StoredColorChase3Session['stageResults'] = Array.isArray(r.stageResults) ? r.stageResults : Object.values(r.stageResults ?? {});
  if (rows.length > 9 || rows.some((p) => p.engine !== 'cc3' || ![1, 2, 3].includes(p.stageNumber) || !Number.isInteger(p.objectivesPresented) || p.objectivesPresented < 1 || p.objectivesPresented > 10 || !Number.isInteger(p.objectivesCompleted) || p.objectivesCompleted < 0 || p.objectivesCompleted > p.objectivesPresented || !Number.isInteger(p.assists) || p.assists < 0 || p.assists > p.objectivesCompleted)) return null;
  return {
    ...r,
    totalCorrect: null,
    totalIncorrect: null,
    totalDangerPresses: null,
    accuracy: null,
    averageResponseTimeMs: null,
    inputSource: typeof r.inputSource === 'string' ? r.inputSource : 'MANUAL',
    bestStage: r.bestStage ?? null,
    stageResults: rows.map((p) => ({ ...p, durationMs: null })),
  };
}

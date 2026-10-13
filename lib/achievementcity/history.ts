import { Difficulty } from '@/lib/game';
import type { StoredSessionWorkflowFields } from '@/lib/sessions/workflowMetadata';
import { allRows, hasActivity, summary, type State } from './engine';
import { GAME_ID } from './live';

/**
 * Versioned Achievement City result. Every number is a COUNT of what the therapist confirmed (or marked skipped /
 * undid). There is no score, no accuracy, no speed and no clinical rating. A building animation is never an
 * achievement; levels before the starting level are a visual baseline and never appear in these rows.
 */
export interface StoredAchievementCitySession extends StoredSessionWorkflowFields {
  gameId: typeof GAME_ID;
  resultVersion: 1;
  engine: 'ac3';
  sessionId: string;
  patientId: string;
  createdByUid: string;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  /** Real ms the city was running (excludes pauses and waiting before Start). */
  activeTimeMs: number;
  exerciseTitle: string;
  startingLevel: 1 | 2 | 3;
  endingLevel: 1 | 2 | 3;
  /**
   * Compatibility mirrors for shared patient analytics / visit summaries that read stage-style fields. Achievement City
   * has NO stages: these are the level (1..3) re-expressed as the shared difficulty band and `levelsCompleted`.
   */
  startingDifficulty: Difficulty;
  endingDifficulty: Difficulty;
  startingStage: 1 | 2 | 3;
  endingStage: 1 | 2 | 3;
  completedStageCount: number;
  skippedStageCount: 0;
  /** Total of the target achievements of every level reached in this run. */
  targetAchievements: number;
  confirmedAchievements: number;
  assistedAchievements: number;
  skippedAchievements: number;
  undoCount: number;
  levelsCompleted: number;
  completion: 'COMPLETED' | 'PARTIAL';
  therapistNotes: string;
  settings: { inputSource: 'MANUAL' | 'GAMEPAD'; controllerConfirmations: number };
  levelResults: {
    engine: 'ac3';
    level: 1 | 2 | 3;
    target: number;
    confirmed: number;
    assisted: number;
    skipped: number;
    undos: number;
    status: 'COMPLETED' | 'PARTIAL';
    activeMs: number;
  }[];
}

const BAND: readonly Difficulty[] = [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.ADVANCED];

export function buildHistory(s: State, patientId: string, uid: string): StoredAchievementCitySession {
  if (s.status !== 'ended' || !s.endedAt || !patientId || !uid) throw new Error('Ended bound session required');
  const sum = summary(s);
  const rows = allRows(s).map((r) => ({
    engine: 'ac3' as const,
    level: (r.level + 1) as 1 | 2 | 3,
    target: r.target,
    confirmed: r.confirmed,
    assisted: r.assisted,
    skipped: r.skipped,
    undos: r.undos,
    status: r.completed ? ('COMPLETED' as const) : ('PARTIAL' as const),
    activeMs: r.activeMs,
  }));
  const first = rows[0], last = rows[rows.length - 1];
  const lastLevel = (last?.level ?? s.level + 1) as 1 | 2 | 3;
  return {
    gameId: GAME_ID,
    resultVersion: 1,
    engine: 'ac3',
    sessionId: `${s.sessionId}-r${s.run}`,
    patientId,
    createdByUid: uid,
    startedAt: s.startedAt || s.endedAt,
    completedAt: s.endedAt,
    durationMs: s.startedAt ? Math.max(0, s.endedAt - s.startedAt) : 0,
    activeTimeMs: Math.round(sum.activeMs),
    exerciseTitle: s.exercise.trim().slice(0, 60),
    startingLevel: (first?.level ?? s.startLevel + 1) as 1 | 2 | 3,
    endingLevel: lastLevel,
    startingDifficulty: BAND[(first?.level ?? s.startLevel + 1) - 1],
    endingDifficulty: BAND[lastLevel - 1],
    startingStage: (first?.level ?? s.startLevel + 1) as 1 | 2 | 3,
    endingStage: lastLevel,
    completedStageCount: sum.levelsCompleted,
    skippedStageCount: 0,
    targetAchievements: sum.target,
    confirmedAchievements: sum.confirmed,
    assistedAchievements: sum.assisted,
    skippedAchievements: sum.skipped,
    undoCount: sum.undos,
    levelsCompleted: sum.levelsCompleted,
    completion: rows.length > 0 && rows.every((r) => r.status === 'COMPLETED') && last?.level === 3 ? 'COMPLETED' : 'PARTIAL',
    therapistNotes: s.notes.trim().slice(0, 300),
    settings: { inputSource: s.config.inputSource === 'gamepad' ? 'GAMEPAD' : 'MANUAL', controllerConfirmations: s.viaPad },
    levelResults: rows,
  };
}

export const hasHistoryActivity = (s: State) => hasActivity(s);

export function reviveAchievementCityHistory(raw: unknown): StoredAchievementCitySession | null {
  const r = raw as StoredAchievementCitySession;
  if (!r || r.gameId !== GAME_ID || r.resultVersion !== 1 || r.engine !== 'ac3' || !r.sessionId || !r.patientId || !r.createdByUid) return null;
  const counts = [r.startedAt, r.completedAt, r.durationMs, r.activeTimeMs, r.targetAchievements, r.confirmedAchievements, r.assistedAchievements, r.skippedAchievements, r.undoCount, r.levelsCompleted];
  if (!counts.every((v) => Number.isFinite(v) && v >= 0) || r.completedAt < r.startedAt) return null;
  if (![1, 2, 3].includes(r.startingLevel) || ![1, 2, 3].includes(r.endingLevel) || r.startingLevel > r.endingLevel) return null;
  if (r.confirmedAchievements + r.assistedAchievements > r.targetAchievements || r.targetAchievements > 90 || r.levelsCompleted > 3) return null;
  if (r.completion !== 'COMPLETED' && r.completion !== 'PARTIAL') return null;
  if (!r.settings || typeof r.settings !== 'object') return null;
  const rows: StoredAchievementCitySession['levelResults'] = Array.isArray(r.levelResults) ? r.levelResults : Object.values(r.levelResults ?? {});
  if (rows.length > 3 || rows.some((p) => p.engine !== 'ac3' || ![1, 2, 3].includes(p.level) || !Number.isInteger(p.target) || p.target < 3 || p.target > 30 || p.confirmed + p.assisted > p.target || (p.status !== 'COMPLETED' && p.status !== 'PARTIAL'))) return null;
  return { ...r, therapistNotes: typeof r.therapistNotes === 'string' ? r.therapistNotes : '', exerciseTitle: typeof r.exerciseTitle === 'string' ? r.exerciseTitle : '', levelResults: rows };
}

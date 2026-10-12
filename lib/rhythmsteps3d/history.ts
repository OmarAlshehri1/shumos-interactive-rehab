import { StageStatus, type Difficulty } from '@/lib/game';
import type { StoredSessionWorkflowFields } from '@/lib/sessions/workflowMetadata';
import { activeLanes, speedOf, SPEED_PROFILES, type Config } from './config';
import { KIND_ORDER, summary, type State } from './engine';
import { GAME_ID } from './live';
import { difficultyOf } from './stages';

type StageNo = 1 | 2 | 3 | 4 | 5;

/**
 * Versioned Rhythm Steps result. Every number is a therapist-confirmed or automatically-recorded COUNT of gameplay events.
 * There is no score, no accuracy, no reaction time and no clinical rating: the shared multi-game therapy visit is a
 * separate platform feature. `missedEvents` are targets nobody confirmed (never a failure).
 */
export interface StoredRhythmSession extends StoredSessionWorkflowFields {
  gameId: typeof GAME_ID;
  resultVersion: 1;
  engine: 'rs3';
  sessionId: string;
  patientId: string;
  createdByUid: string;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  /** Real ms the stream was running (excludes pauses and waiting before Start). */
  activeTimeMs: number;
  startingDifficulty: Difficulty;
  startingStage: StageNo;
  endingDifficulty: Difficulty;
  endingStage: StageNo;
  completedStageCount: number;
  skippedStageCount: number;
  /** 'continuous' | 'assisted' | 'mixed' */
  flowMode: 'continuous' | 'assisted' | 'mixed';
  speedProfile: string;
  totalTargetEvents: number;
  confirmedEvents: number;
  assistedEvents: number;
  skippedEvents: number;
  missedEvents: number;
  singleFootExercises: number;
  twoFootExercises: number;
  holdExercises: number;
  repetitions: number;
  /** Therapist settings in force at the end of the session. */
  settings: {
    speed: number;
    spacing: number;
    lanes: number;
    limbs: Config['limbs'];
    stanceWidth: 1 | 2;
    holdMs: number;
    jumping: boolean;
    sided: boolean;
    inputSource: string;
  };
  stageResults: {
    engine: 'rs3';
    difficulty: Difficulty;
    stageNumber: StageNo;
    stageIndex: number;
    status: StageStatus;
    total: number;
    confirmed: number;
    assisted: number;
    skipped: number;
    missed: number;
    reps: number;
    activeMs: number;
    durationMs: null;
  }[];
}

export function buildHistory(s: State, patientId: string, uid: string): StoredRhythmSession {
  if (s.status !== 'ended' || !s.endedAt || !patientId || !uid) throw new Error('Ended bound session required');
  const sum = summary(s);
  const rows = s.stats.flatMap((st, index) => {
    if (!st.total && !s.completed.includes(index) && !s.skipped.includes(index)) return [];
    return [{
      engine: 'rs3' as const,
      difficulty: difficultyOf(index),
      stageNumber: ((index % 3) + 1) as StageNo,
      stageIndex: index,
      status: s.completed.includes(index) ? StageStatus.COMPLETED : StageStatus.SKIPPED,
      total: st.total, confirmed: st.confirmed, assisted: st.assisted, skipped: st.skipped, missed: st.missed, reps: st.reps, activeMs: Math.round(st.activeMs),
      durationMs: null,
    }];
  });
  const flows = s.stats.reduce((m, st) => m | st.flows, 0);
  const lastPlayed = rows.at(-1);
  return {
    gameId: GAME_ID,
    resultVersion: 1,
    engine: 'rs3',
    sessionId: `${s.sessionId}-r${s.run}`,
    patientId,
    createdByUid: uid,
    startedAt: s.startedAt || s.endedAt,
    completedAt: s.endedAt,
    durationMs: s.startedAt ? Math.max(0, s.endedAt - s.startedAt) : 0,
    activeTimeMs: Math.round(sum.activeMs),
    startingDifficulty: rows[0]?.difficulty ?? difficultyOf(s.stage),
    startingStage: rows[0]?.stageNumber ?? (((s.stage % 3) + 1) as StageNo),
    endingDifficulty: lastPlayed?.difficulty ?? difficultyOf(s.stage),
    endingStage: lastPlayed?.stageNumber ?? (((s.stage % 3) + 1) as StageNo),
    completedStageCount: s.completed.length,
    skippedStageCount: s.skipped.filter((i) => !s.completed.includes(i)).length,
    flowMode: flows === 3 ? 'mixed' : flows === 2 ? 'assisted' : s.config.flow,
    speedProfile: s.config.speedProfile,
    totalTargetEvents: sum.presented,
    confirmedEvents: sum.confirmed,
    assistedEvents: sum.assisted,
    skippedEvents: sum.skipped,
    missedEvents: sum.missed,
    singleFootExercises: sum.singleFoot,
    twoFootExercises: sum.twoFoot,
    holdExercises: sum.hold,
    repetitions: sum.reps,
    settings: {
      speed: Math.round(speedOf(s.config) * 100) / 100,
      spacing: s.config.spacing,
      lanes: activeLanes(s.config).length,
      limbs: s.config.limbs,
      stanceWidth: s.config.stanceWidth,
      holdMs: s.config.holdMs,
      jumping: s.config.jumping,
      sided: s.config.sided,
      inputSource: s.config.inputSource === 'simulated' ? 'SIMULATED' : 'MANUAL',
    },
    stageResults: rows,
  };
}

export const hasHistoryActivity = (s: State) => s.stats.some((st) => st.total > 0) || s.completed.length > 0 || s.skipped.length > 0;

const SPEED_KEYS = Object.keys(SPEED_PROFILES);

export function reviveRhythmHistory(raw: unknown): StoredRhythmSession | null {
  const r = raw as StoredRhythmSession;
  if (!r || r.gameId !== GAME_ID || r.resultVersion !== 1 || r.engine !== 'rs3' || !r.sessionId || !r.patientId || !r.createdByUid) return null;
  const counts = [r.startedAt, r.completedAt, r.durationMs, r.activeTimeMs, r.completedStageCount, r.skippedStageCount, r.totalTargetEvents, r.confirmedEvents, r.assistedEvents, r.skippedEvents, r.missedEvents, r.singleFootExercises, r.twoFootExercises, r.holdExercises, r.repetitions];
  if (!counts.every((v) => Number.isFinite(v) && v >= 0) || r.completedAt < r.startedAt) return null;
  if (r.confirmedEvents + r.assistedEvents + r.skippedEvents + r.missedEvents !== r.totalTargetEvents || r.totalTargetEvents > 300) return null;
  if (r.singleFootExercises + r.twoFootExercises + r.holdExercises !== r.totalTargetEvents) return null;
  if (r.completedStageCount > 9 || r.skippedStageCount > 9 || r.completedStageCount + r.skippedStageCount > 9) return null;
  if (!['continuous', 'assisted', 'mixed'].includes(r.flowMode) || !SPEED_KEYS.includes(r.speedProfile)) return null;
  const rows: StoredRhythmSession['stageResults'] = Array.isArray(r.stageResults) ? r.stageResults : Object.values(r.stageResults ?? {});
  if (rows.length > 9 || rows.some((p) => p.engine !== 'rs3' || !Number.isInteger(p.total) || p.total < 0 || p.confirmed + p.assisted + p.skipped + p.missed !== p.total)) return null;
  if (!r.settings || typeof r.settings !== 'object') return null;
  return { ...r, stageResults: rows.map((p) => ({ ...p, durationMs: null })) };
}

export { KIND_ORDER };

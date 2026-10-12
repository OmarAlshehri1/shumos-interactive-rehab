import { StageStatus, type Difficulty } from '@/lib/game';
import type { StoredSessionWorkflowFields } from '@/lib/sessions/workflowMetadata';
import { COURSE_IDS } from './courses';
import { summarize, type State } from './engine';
import { GAME_ID } from './live';
import { difficultyOf } from './stages';

type StageNo = 1 | 2 | 3;

/**
 * Versioned Turn & Go result. Every number is a therapist-confirmed COUNT of what happened. The game's stars are
 * game feedback only: there is no score, no accuracy, no speed and no clinical rating. Deviations and cone touches are
 * what the therapist reported (never detected); a repeat or a skipped star is never a failure.
 */
export interface StoredTurnGoSession extends StoredSessionWorkflowFields {
  gameId: typeof GAME_ID;
  resultVersion: 1;
  engine: 'tg3';
  sessionId: string;
  patientId: string;
  createdByUid: string;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  /** Real ms the course was running (excludes pauses and waiting before Start). */
  activeTimeMs: number;
  startingDifficulty: Difficulty;
  startingStage: StageNo;
  endingDifficulty: Difficulty;
  endingStage: StageNo;
  completedStageCount: number;
  skippedStageCount: number;
  totalCheckpoints: number;
  confirmedCheckpoints: number;
  assistedCheckpoints: number;
  skippedCheckpoints: number;
  unfinishedCheckpoints: number;
  stopsPresented: number;
  stopHoldsCompleted: number;
  stopHoldsAssisted: number;
  routeDeviations: number;
  coneTouches: number;
  repeats: number;
  routeEvents: number;
  settings: {
    layout: string;
    coneCount: number;
    customLayout: boolean;
    stopMs: number;
    stopsEnabled: boolean;
    eventsEnabled: boolean;
    rotation: number;
    mirrored: boolean;
    inputSource: string;
  };
  stageResults: {
    engine: 'tg3';
    difficulty: Difficulty;
    stageNumber: StageNo;
    stageIndex: number;
    status: StageStatus;
    course: string;
    coneCount: number;
    customLayout: boolean;
    total: number;
    confirmed: number;
    assisted: number;
    skipped: number;
    unfinished: number;
    stops: number;
    holds: number;
    deviations: number;
    coneTouches: number;
    repeats: number;
    events: number;
    activeMs: number;
    durationMs: null;
  }[];
}

export function buildHistory(s: State, patientId: string, uid: string): StoredTurnGoSession {
  if (s.status !== 'ended' || !s.endedAt || !patientId || !uid) throw new Error('Ended bound session required');
  const sum = summarize(s.stats);
  const rows = s.stats.flatMap((st, index) => {
    if (!st.res.length && !s.completed.includes(index) && !s.skipped.includes(index)) return [];
    const count = (o: string) => st.res.filter((r) => r === o).length;
    return [{
      engine: 'tg3' as const,
      difficulty: difficultyOf(index),
      stageNumber: ((index % 3) + 1) as StageNo,
      stageIndex: index,
      status: s.completed.includes(index) ? StageStatus.COMPLETED : StageStatus.SKIPPED,
      course: st.course || 'straight',
      coneCount: st.cones,
      customLayout: st.custom,
      total: st.res.length,
      confirmed: count('confirmed'), assisted: count('assisted'), skipped: count('skipped'), unfinished: count('pending'),
      stops: st.stops, holds: st.holds, deviations: st.deviations, coneTouches: st.coneTouches, repeats: st.repeats, events: st.events,
      activeMs: Math.round(st.activeMs),
      durationMs: null,
    }];
  });
  const lastPlayed = rows.at(-1);
  const layoutNames = [...new Set(rows.map((r) => r.course))];
  return {
    gameId: GAME_ID,
    resultVersion: 1,
    engine: 'tg3',
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
    totalCheckpoints: sum.presented,
    confirmedCheckpoints: sum.confirmed,
    assistedCheckpoints: sum.assisted,
    skippedCheckpoints: sum.skipped,
    unfinishedCheckpoints: sum.pending,
    stopsPresented: sum.stops,
    stopHoldsCompleted: sum.holds,
    stopHoldsAssisted: sum.holdsAssisted,
    routeDeviations: sum.deviations,
    coneTouches: sum.coneTouches,
    repeats: sum.repeats,
    routeEvents: sum.events,
    settings: {
      layout: layoutNames.length === 1 ? layoutNames[0] : 'mixed',
      coneCount: Math.max(0, ...rows.map((r) => r.coneCount)),
      customLayout: rows.some((r) => r.customLayout),
      stopMs: s.config.stopMs,
      stopsEnabled: s.config.stops,
      eventsEnabled: s.config.events,
      rotation: (s.config.rot + s.config.proj.rot) % 360,
      mirrored: s.config.mirror,
      inputSource: s.config.inputSource === 'simulated' ? 'SIMULATED' : 'MANUAL',
    },
    stageResults: rows,
  };
}

export const hasHistoryActivity = (s: State) => s.stats.some((st) => st.res.some((r) => r !== 'pending')) || s.completed.length > 0 || s.skipped.length > 0;

export function reviveTurnGoHistory(raw: unknown): StoredTurnGoSession | null {
  const r = raw as StoredTurnGoSession;
  if (!r || r.gameId !== GAME_ID || r.resultVersion !== 1 || r.engine !== 'tg3' || !r.sessionId || !r.patientId || !r.createdByUid) return null;
  const counts = [r.startedAt, r.completedAt, r.durationMs, r.activeTimeMs, r.completedStageCount, r.skippedStageCount, r.totalCheckpoints, r.confirmedCheckpoints, r.assistedCheckpoints, r.skippedCheckpoints, r.unfinishedCheckpoints, r.stopsPresented, r.stopHoldsCompleted, r.stopHoldsAssisted, r.routeDeviations, r.coneTouches, r.repeats, r.routeEvents];
  if (!counts.every((v) => Number.isFinite(v) && v >= 0) || r.completedAt < r.startedAt) return null;
  if (r.confirmedCheckpoints + r.assistedCheckpoints + r.skippedCheckpoints + r.unfinishedCheckpoints !== r.totalCheckpoints || r.totalCheckpoints > 180) return null;
  if (r.completedStageCount > 9 || r.skippedStageCount > 9 || r.completedStageCount + r.skippedStageCount > 9) return null;
  if (r.stopHoldsCompleted > r.stopsPresented + 9 * 20 || r.stopHoldsAssisted > r.stopHoldsCompleted) return null;
  const rows: StoredTurnGoSession['stageResults'] = Array.isArray(r.stageResults) ? r.stageResults : Object.values(r.stageResults ?? {});
  const okCourse = (c: unknown) => typeof c === 'string' && (COURSE_IDS as readonly string[]).includes(c);
  if (rows.length > 9 || rows.some((p) => p.engine !== 'tg3' || !okCourse(p.course) || !Number.isInteger(p.total) || p.total < 0 || p.confirmed + p.assisted + p.skipped + p.unfinished !== p.total)) return null;
  if (!r.settings || typeof r.settings !== 'object') return null;
  return { ...r, stageResults: rows.map((p) => ({ ...p, durationMs: null })) };
}

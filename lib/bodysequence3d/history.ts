import { StageStatus, type Difficulty } from '@/lib/game';
import type { StoredSessionWorkflowFields } from '@/lib/sessions/workflowMetadata';
import { summarize, type State } from './engine';
import { GAME_ID } from './live';
import type { Mode } from './sequence';
import { MODES } from './sequence';
import { difficultyOf, STAGES } from './stages';

type StageNo = 1 | 2 | 3;

/**
 * Versioned Body Sequence result. Every number is a therapist-confirmed COUNT of what happened. There is no score,
 * no accuracy, no speed and no clinical rating. Incorrect attempts are what the therapist marked (never detected);
 * a repeat, a replay or a skipped movement is never a failure.
 */
export interface StoredBodySequenceSession extends StoredSessionWorkflowFields {
  gameId: typeof GAME_ID;
  resultVersion: 1;
  engine: 'bs3';
  sessionId: string;
  patientId: string;
  createdByUid: string;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  /** Real ms the stage was running (excludes pauses and waiting before Start). */
  activeTimeMs: number;
  startingDifficulty: Difficulty;
  startingStage: StageNo;
  endingDifficulty: Difficulty;
  endingStage: StageNo;
  completedStageCount: number;
  skippedStageCount: number;
  totalMovements: number;
  confirmedMovements: number;
  assistedMovements: number;
  skippedMovements: number;
  unfinishedMovements: number;
  /** Therapist-recorded attempts: confirmed + assisted + incorrect. */
  movementAttempts: number;
  incorrectAttempts: number;
  repeats: number;
  replays: number;
  holdsCompleted: number;
  holdsAssisted: number;
  sequencesCompleted: number;
  sequencesPresented: number;
  settings: {
    maxLanes: 2 | 3;
    feet: string;
    holdsEnabled: boolean;
    holdMs: number;
    hints: boolean;
    spacing: number;
    rotation: number;
    mirrored: boolean;
    inputSource: string;
  };
  stageResults: {
    engine: 'bs3';
    difficulty: Difficulty;
    stageNumber: StageNo;
    stageIndex: number;
    status: StageStatus;
    lanes: 2 | 3;
    modes: Mode[];
    sequences: number;
    sequencesCompleted: number;
    total: number;
    confirmed: number;
    assisted: number;
    skipped: number;
    unfinished: number;
    incorrect: number;
    repeats: number;
    replays: number;
    holds: number;
    activeMs: number;
    durationMs: null;
  }[];
}

export function buildHistory(s: State, patientId: string, uid: string): StoredBodySequenceSession {
  if (s.status !== 'ended' || !s.endedAt || !patientId || !uid) throw new Error('Ended bound session required');
  const sum = summarize(s.stats);
  const rows = s.stats.flatMap((st, index) => {
    if (!st.res.length && !s.completed.includes(index) && !s.skipped.includes(index)) return [];
    const flat = st.res.flat();
    const count = (o: string) => flat.filter((r) => r === o).length;
    const def = STAGES[index];
    return [{
      engine: 'bs3' as const,
      difficulty: difficultyOf(index),
      stageNumber: ((index % 3) + 1) as StageNo,
      stageIndex: index,
      status: s.completed.includes(index) ? StageStatus.COMPLETED : StageStatus.SKIPPED,
      lanes: def.lanes,
      modes: [...new Set(def.rounds.map((r) => r.mode))],
      sequences: st.res.length,
      sequencesCompleted: st.res.filter((rr) => rr.every((o) => o !== 'pending')).length,
      total: flat.length,
      confirmed: count('confirmed'), assisted: count('assisted'), skipped: count('skipped'), unfinished: count('pending'),
      incorrect: st.incorrect, repeats: st.repeats, replays: st.replays, holds: st.holds,
      activeMs: Math.round(st.activeMs),
      durationMs: null,
    }];
  });
  const lastPlayed = rows.at(-1);
  return {
    gameId: GAME_ID,
    resultVersion: 1,
    engine: 'bs3',
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
    totalMovements: sum.presented,
    confirmedMovements: sum.confirmed,
    assistedMovements: sum.assisted,
    skippedMovements: sum.skipped,
    unfinishedMovements: sum.pending,
    movementAttempts: sum.attempts,
    incorrectAttempts: sum.incorrect,
    repeats: sum.repeats,
    replays: sum.replays,
    holdsCompleted: sum.holds,
    holdsAssisted: sum.holdsAssisted,
    sequencesCompleted: sum.sequences,
    sequencesPresented: rows.reduce((n, r) => n + r.sequences, 0),
    settings: {
      maxLanes: rows.some((r) => r.lanes === 3) ? 3 : 2,
      feet: s.config.feet,
      holdsEnabled: s.config.holds,
      holdMs: s.config.holdMs,
      hints: s.config.hints,
      spacing: s.config.spacing,
      rotation: (s.config.rot + s.config.proj.rot) % 360,
      mirrored: s.config.mirror,
      inputSource: s.config.inputSource === 'simulated' ? 'SIMULATED' : 'MANUAL',
    },
    stageResults: rows,
  };
}

export const hasHistoryActivity = (s: State) => s.stats.some((st) => st.res.some((rr) => rr.some((r) => r !== 'pending'))) || s.completed.length > 0 || s.skipped.length > 0;

export function reviveBodySequenceHistory(raw: unknown): StoredBodySequenceSession | null {
  const r = raw as StoredBodySequenceSession;
  if (!r || r.gameId !== GAME_ID || r.resultVersion !== 1 || r.engine !== 'bs3' || !r.sessionId || !r.patientId || !r.createdByUid) return null;
  const counts = [r.startedAt, r.completedAt, r.durationMs, r.activeTimeMs, r.completedStageCount, r.skippedStageCount, r.totalMovements, r.confirmedMovements, r.assistedMovements, r.skippedMovements, r.unfinishedMovements, r.movementAttempts, r.incorrectAttempts, r.repeats, r.replays, r.holdsCompleted, r.holdsAssisted, r.sequencesCompleted, r.sequencesPresented];
  if (!counts.every((v) => Number.isFinite(v) && v >= 0) || r.completedAt < r.startedAt) return null;
  if (r.confirmedMovements + r.assistedMovements + r.skippedMovements + r.unfinishedMovements !== r.totalMovements || r.totalMovements > 180) return null;
  if (r.movementAttempts !== r.confirmedMovements + r.assistedMovements + r.incorrectAttempts) return null;
  if (r.completedStageCount > 9 || r.skippedStageCount > 9 || r.completedStageCount + r.skippedStageCount > 9) return null;
  if (r.holdsAssisted > r.holdsCompleted || r.sequencesCompleted > r.sequencesPresented || r.sequencesPresented > 45) return null;
  if (!r.settings || typeof r.settings !== 'object' || ![2, 3].includes(r.settings.maxLanes)) return null;
  const rows: StoredBodySequenceSession['stageResults'] = Array.isArray(r.stageResults) ? r.stageResults : Object.values(r.stageResults ?? {});
  const modesOf = (m: unknown): Mode[] => (Array.isArray(m) ? m : Object.values((m ?? {}) as Record<string, Mode>));
  const okModes = (m: Mode[]) => m.length > 0 && m.every((x) => (MODES as readonly string[]).includes(x));
  if (rows.length > 9 || rows.some((p) => p.engine !== 'bs3' || ![2, 3].includes(p.lanes) || (p.stageIndex < 3 && p.lanes !== 2) || !okModes(modesOf(p.modes)) || !Number.isInteger(p.total) || p.total < 0 || p.confirmed + p.assisted + p.skipped + p.unfinished !== p.total)) return null;
  return { ...r, stageResults: rows.map((p) => ({ ...p, modes: modesOf(p.modes), durationMs: null })) };
}

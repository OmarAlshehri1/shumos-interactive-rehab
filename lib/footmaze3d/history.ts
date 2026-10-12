import { StageStatus, type Difficulty } from '@/lib/game';
import type { StoredSessionWorkflowFields } from '@/lib/sessions/workflowMetadata';
import { MAZE_IDS } from './mazes';
import { summarize, type State } from './engine';
import { GAME_ID } from './live';
import { difficultyOf } from './stages';

type StageNo = 1 | 2 | 3;

/**
 * Versioned Foot Maze result. Every number is a therapist-confirmed COUNT of what happened. Stars are game feedback
 * only: no score, no accuracy, no speed, no clinical rating. A detour, a repeat or a skipped star is never a failure.
 */
export interface StoredFootMazeSession extends StoredSessionWorkflowFields {
  gameId: typeof GAME_ID;
  resultVersion: 1;
  engine: 'fm3';
  sessionId: string;
  patientId: string;
  createdByUid: string;
  startedAt: number;
  completedAt: number;
  durationMs: number;
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
  assistedMoves: number;
  routeChoices: number;
  routeChoicesCorrect: number;
  routeDetours: number;
  deadEnds: number;
  guardWaitsPresented: number;
  guardWaitsCompleted: number;
  guardWaitsReleasedEarly: number;
  routeEvents: number;
  hintsUsed: number;
  repeats: number;
  settings: {
    layout: string;
    simplified: boolean;
    guardsEnabled: boolean;
    eventsEnabled: boolean;
    guardMs: number;
    stance: boolean;
    rotation: number;
    mirrored: boolean;
    inputSource: string;
  };
  stageResults: {
    engine: 'fm3';
    difficulty: Difficulty;
    stageNumber: StageNo;
    stageIndex: number;
    status: StageStatus;
    maze: string;
    simplified: boolean;
    total: number;
    confirmed: number;
    assisted: number;
    skipped: number;
    unfinished: number;
    moves: number;
    assistedMoves: number;
    choices: number;
    correct: number;
    detours: number;
    deadEnds: number;
    waits: number;
    waitsDone: number;
    releases: number;
    events: number;
    hints: number;
    repeats: number;
    activeMs: number;
    durationMs: null;
  }[];
}

export function buildHistory(s: State, patientId: string, uid: string): StoredFootMazeSession {
  if (s.status !== 'ended' || !s.endedAt || !patientId || !uid) throw new Error('Ended bound session required');
  const sum = summarize(s.stats);
  const rows = s.stats.flatMap((st, index) => {
    if (!st.res.length && !s.completed.includes(index) && !s.skipped.includes(index)) return [];
    const count = (o: string) => st.res.filter((r) => r === o).length;
    return [{
      engine: 'fm3' as const,
      difficulty: difficultyOf(index),
      stageNumber: ((index % 3) + 1) as StageNo,
      stageIndex: index,
      status: s.completed.includes(index) ? StageStatus.COMPLETED : StageStatus.SKIPPED,
      maze: st.maze || 'garden',
      simplified: st.simple,
      total: st.res.length,
      confirmed: count('confirmed'), assisted: count('assisted'), skipped: count('skipped'), unfinished: count('pending'),
      moves: st.moves, assistedMoves: st.assistedMoves, choices: st.choices, correct: st.correct, detours: st.detours, deadEnds: st.deadEnds,
      waits: st.waits, waitsDone: st.waitsDone, releases: st.releases, events: st.events, hints: st.hints, repeats: st.repeats,
      activeMs: Math.round(st.activeMs),
      durationMs: null,
    }];
  });
  const lastPlayed = rows.at(-1);
  const simpleRows = rows.filter((r) => r.simplified).length;
  return {
    gameId: GAME_ID,
    resultVersion: 1,
    engine: 'fm3',
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
    assistedMoves: sum.assistedMoves,
    routeChoices: sum.choices,
    routeChoicesCorrect: sum.correct,
    routeDetours: sum.detours,
    deadEnds: sum.deadEnds,
    guardWaitsPresented: sum.waits,
    guardWaitsCompleted: sum.waitsDone,
    guardWaitsReleasedEarly: sum.releases,
    routeEvents: sum.events,
    hintsUsed: sum.hints,
    repeats: sum.repeats,
    settings: {
      layout: simpleRows === 0 ? 'full' : simpleRows === rows.length ? 'simple' : 'mixed',
      simplified: simpleRows > 0,
      guardsEnabled: s.config.guards,
      eventsEnabled: s.config.events,
      guardMs: s.config.guardMs,
      stance: s.config.stance,
      rotation: (s.config.rot + s.config.proj.rot) % 360,
      mirrored: s.config.mirror,
      inputSource: s.config.inputSource === 'simulated' ? 'SIMULATED' : 'MANUAL',
    },
    stageResults: rows,
  };
}

export const hasHistoryActivity = (s: State) => s.stats.some((st) => st.moves > 0 || st.res.some((r) => r !== 'pending')) || s.completed.length > 0 || s.skipped.length > 0;

export function reviveFootMazeHistory(raw: unknown): StoredFootMazeSession | null {
  const r = raw as StoredFootMazeSession;
  if (!r || r.gameId !== GAME_ID || r.resultVersion !== 1 || r.engine !== 'fm3' || !r.sessionId || !r.patientId || !r.createdByUid) return null;
  const counts = [r.startedAt, r.completedAt, r.durationMs, r.activeTimeMs, r.completedStageCount, r.skippedStageCount, r.totalCheckpoints, r.confirmedCheckpoints, r.assistedCheckpoints, r.skippedCheckpoints, r.unfinishedCheckpoints, r.assistedMoves, r.routeChoices, r.routeChoicesCorrect, r.routeDetours, r.deadEnds, r.guardWaitsPresented, r.guardWaitsCompleted, r.guardWaitsReleasedEarly, r.routeEvents, r.hintsUsed, r.repeats];
  if (!counts.every((v) => Number.isFinite(v) && v >= 0) || r.completedAt < r.startedAt) return null;
  if (r.confirmedCheckpoints + r.assistedCheckpoints + r.skippedCheckpoints + r.unfinishedCheckpoints !== r.totalCheckpoints || r.totalCheckpoints > 108) return null;
  if (r.completedStageCount > 9 || r.skippedStageCount > 9 || r.completedStageCount + r.skippedStageCount > 9) return null;
  if (r.routeChoicesCorrect + r.routeDetours !== r.routeChoices || r.guardWaitsReleasedEarly > r.guardWaitsPresented + 9) return null;
  const rows: StoredFootMazeSession['stageResults'] = Array.isArray(r.stageResults) ? r.stageResults : Object.values(r.stageResults ?? {});
  const okMaze = (c: unknown) => typeof c === 'string' && (MAZE_IDS as readonly string[]).includes(c);
  if (rows.length > 9 || rows.some((p) => p.engine !== 'fm3' || !okMaze(p.maze) || !Number.isInteger(p.total) || p.total < 0 || p.confirmed + p.assisted + p.skipped + p.unfinished !== p.total)) return null;
  if (!r.settings || typeof r.settings !== 'object') return null;
  return { ...r, stageResults: rows.map((p) => ({ ...p, durationMs: null })) };
}

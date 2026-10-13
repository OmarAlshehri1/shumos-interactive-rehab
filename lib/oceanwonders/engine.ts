import { DEFAULT_CONFIG, sanitizeConfig, type Config } from './config';
import { levelDef, levelProgress, type LevelIndex } from './milestones';

/**
 * Ocean Wonders: pure reducer. The therapist CONFIRMS that the child did a real exercise; nothing here measures,
 * scores or judges movement. One confirmation = one count = one piece of the ocean. All numbers are counts of what the
 * therapist confirmed. Level 2 and 3 are not "harder": they are the same activity continuing the same ocean.
 */
export const TARGET_MIN = 3;
export const TARGET_MAX = 30;
export const TARGET_DEFAULT = 10;
/** A second confirm/assist closer than this to the previous accepted one is an accidental double press and is ignored. */
export const DEBOUNCE_MS = 300;
export const UNDO_DEBOUNCE_MS = 300;
export const LOG_MAX = TARGET_MAX;

export type Status = 'ready' | 'running' | 'paused' | 'level-complete' | 'ended';
export type EventKind = 'confirm' | 'assist' | 'undo' | 'skip' | 'level';

export interface LevelRow {
  level: LevelIndex;
  target: number;
  confirmed: number;
  assisted: number;
  skipped: number;
  undos: number;
  completed: boolean;
  activeMs: number;
}

export interface State {
  sessionId: string;
  seed: number;
  run: number;
  status: Status;
  level: LevelIndex;
  /** Level selected when this run started. Earlier levels are drawn completed but are NOT recorded achievements. */
  startLevel: LevelIndex;
  target: number;
  exercise: string;
  notes: string;
  config: Config;
  confirmed: number;
  assisted: number;
  skipped: number;
  undos: number;
  /** Open confirmations of the current level, oldest first: 'c' confirmed, 'a' assisted. Undo pops the last one. */
  log: string;
  levels: LevelRow[];
  /** Counts every accepted change of progress. The Display animates on increases, never on reload. */
  seq: number;
  evt: { n: number; kind: EventKind } | null;
  lastAt: number;
  lastUndoAt: number;
  /** Debounced presses that were ignored (never recorded in history). */
  ignored: number;
  /** Confirmations that came from the therapist-held controller (still only the therapist's confirmation). */
  viaPad: number;
  clock: number;
  lastTick: number;
  levelClock0: number;
  startedAt: number;
  endedAt: number;
  safety: boolean;
}

export type Command =
  | { type: 'selectLevel'; level: number }
  | { type: 'setTarget'; target: number }
  | { type: 'setExercise'; exercise: string }
  | { type: 'setNotes'; notes: string }
  | { type: 'configure'; config: Partial<Config> }
  | { type: 'start'; at: number }
  | { type: 'confirm'; assisted?: boolean; at: number; viaPad?: boolean }
  | { type: 'skip'; at: number }
  | { type: 'undo'; at: number }
  | { type: 'pause'; at?: number }
  | { type: 'safety' }
  | { type: 'resume'; at: number }
  | { type: 'continue'; at: number }
  | { type: 'end'; at: number }
  | { type: 'restart' }
  | { type: 'tick'; at: number };

export const clampTarget = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(TARGET_MIN, Math.min(TARGET_MAX, Math.round(v))) : TARGET_DEFAULT);
const clampLevel = (v: unknown): LevelIndex => (v === 1 ? 1 : v === 2 ? 2 : 0);
const cleanText = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max) : '');

export function createState(sessionId: string, seed = 1): State {
  return {
    sessionId,
    seed: Math.abs(Math.trunc(seed)) % 2147483647,
    run: 0,
    status: 'ready',
    level: 0,
    startLevel: 0,
    target: TARGET_DEFAULT,
    exercise: '',
    notes: '',
    config: DEFAULT_CONFIG,
    confirmed: 0,
    assisted: 0,
    skipped: 0,
    undos: 0,
    log: '',
    levels: [],
    seq: 0,
    evt: null,
    lastAt: 0,
    lastUndoAt: 0,
    ignored: 0,
    viaPad: 0,
    clock: 0,
    lastTick: 0,
    levelClock0: 0,
    startedAt: 0,
    endedAt: 0,
    safety: false,
  };
}

export const done = (s: State) => s.confirmed + s.assisted;
export const isFinalLevel = (s: State) => s.level === 2;
export const canConfirm = (s: State) => s.status === 'running' && done(s) < s.target;
export const canUndo = (s: State) => (s.status === 'running' || s.status === 'level-complete') && s.log.length > 0;
export const hasActivity = (s: State) => s.levels.length > 0 || done(s) > 0 || s.skipped > 0 || s.undos > 0;

/** Milestone progress of the open level. */
export function levelProgressOf(s: State) {
  return levelProgress(s.level, done(s), s.target);
}

function row(s: State, completed: boolean): LevelRow {
  return {
    level: s.level,
    target: s.target,
    confirmed: s.confirmed,
    assisted: s.assisted,
    skipped: s.skipped,
    undos: s.undos,
    completed,
    activeMs: Math.max(0, Math.round(s.clock - s.levelClock0)),
  };
}
const levelHasActivity = (s: State) => done(s) > 0 || s.skipped > 0 || s.undos > 0;
const evt = (s: State, kind: EventKind) => ({ seq: s.seq + 1, evt: { n: s.seq + 1, kind } });

/** All rows to record: closed levels plus the open one when it had any activity. */
export function allRows(s: State): LevelRow[] {
  if (s.status === 'ended') return s.levels; // the open level was closed into `levels` by `end`
  return levelHasActivity(s) || s.status === 'level-complete' ? [...s.levels, row(s, s.status === 'level-complete')] : s.levels;
}

export function summary(s: State) {
  const rows = allRows(s);
  const sum = (k: 'confirmed' | 'assisted' | 'skipped' | 'undos' | 'target' | 'activeMs') => rows.reduce((n, r) => n + r[k], 0);
  const confirmed = sum('confirmed');
  const assisted = sum('assisted');
  return {
    confirmed,
    assisted,
    achievements: confirmed + assisted,
    skipped: sum('skipped'),
    undos: sum('undos'),
    target: sum('target'),
    levelsCompleted: rows.filter((r) => r.completed).length,
    activeMs: sum('activeMs'),
  };
}

export function reduce(s: State, c: Command): State {
  switch (c.type) {
    case 'selectLevel':
      return s.status === 'ready' ? { ...s, level: clampLevel(c.level), startLevel: clampLevel(c.level) } : s;
    case 'setTarget':
      return s.status === 'ready' ? { ...s, target: clampTarget(c.target) } : s;
    case 'setExercise':
      return s.status === 'ended' ? s : { ...s, exercise: cleanText(c.exercise, 60) };
    case 'setNotes':
      return { ...s, notes: cleanText(c.notes, 300) };
    case 'configure':
      return { ...s, config: sanitizeConfig({ ...s.config, ...c.config, proj: { ...s.config.proj, ...(c.config.proj ?? {}) } }, s.config) };
    case 'start':
      if (s.status !== 'ready') return s;
      return { ...s, status: 'running', startedAt: c.at, startLevel: s.level, lastTick: c.at, safety: false, ...evt(s, 'level') };
    case 'confirm': {
      if (s.status !== 'running' || done(s) >= s.target) return s;
      if (s.lastAt > 0 && c.at - s.lastAt < DEBOUNCE_MS && c.at >= s.lastAt) return { ...s, ignored: Math.min(100000, s.ignored + 1) };
      const assisted = c.assisted === true;
      const next: State = {
        ...s,
        confirmed: s.confirmed + (assisted ? 0 : 1),
        assisted: s.assisted + (assisted ? 1 : 0),
        log: (s.log + (assisted ? 'a' : 'c')).slice(-LOG_MAX),
        lastAt: c.at,
        viaPad: s.viaPad + (c.viaPad ? 1 : 0),
        ...evt(s, assisted ? 'assist' : 'confirm'),
      };
      return done(next) >= next.target ? { ...next, status: 'level-complete' } : next;
    }
    case 'skip':
      if (s.status !== 'running') return s;
      return { ...s, skipped: s.skipped + 1, ...evt(s, 'skip') };
    case 'undo': {
      if (!canUndo(s)) return s;
      if (s.lastUndoAt > 0 && c.at - s.lastUndoAt < UNDO_DEBOUNCE_MS && c.at >= s.lastUndoAt) return { ...s, ignored: Math.min(100000, s.ignored + 1) };
      const last = s.log[s.log.length - 1];
      return {
        ...s,
        status: 'running',
        confirmed: s.confirmed - (last === 'c' ? 1 : 0),
        assisted: s.assisted - (last === 'a' ? 1 : 0),
        log: s.log.slice(0, -1),
        undos: s.undos + 1,
        lastUndoAt: c.at,
        lastTick: c.at,
        ...evt(s, 'undo'),
      };
    }
    case 'pause':
      return s.status === 'running' ? { ...s, status: 'paused' } : s;
    case 'safety':
      return s.status === 'running' ? { ...s, status: 'paused', safety: true } : s;
    case 'resume':
      return s.status === 'paused' ? { ...s, status: 'running', safety: false, lastTick: c.at } : s;
    case 'continue': {
      if (s.status !== 'level-complete' || s.level >= 2) return s;
      const closed = row(s, true);
      return {
        ...s,
        status: 'running',
        level: (s.level + 1) as LevelIndex,
        levels: [...s.levels, closed],
        confirmed: 0,
        assisted: 0,
        skipped: 0,
        undos: 0,
        log: '',
        lastAt: 0,
        lastUndoAt: 0,
        levelClock0: s.clock,
        lastTick: c.at,
        ...evt(s, 'level'),
      };
    }
    case 'end': {
      if (s.status === 'ended' || s.status === 'ready') return s;
      return { ...s, status: 'ended', endedAt: c.at, safety: false, levels: levelHasActivity(s) || s.status === 'level-complete' ? [...s.levels, row(s, s.status === 'level-complete')] : s.levels, ...evt(s, 'level') };
    }
    case 'restart':
      return {
        ...createState(s.sessionId, s.seed),
        run: s.run + 1,
        config: s.config,
        level: s.startLevel,
        startLevel: s.startLevel,
        target: s.target,
        exercise: s.exercise,
        seq: s.seq + 1,
      };
    case 'tick': {
      if (s.status !== 'running') return s;
      const dt = Math.max(0, Math.min(1000, c.at - s.lastTick));
      return { ...s, clock: s.clock + dt, lastTick: c.at };
    }
  }
}

/** Convenience for views: current level definition. */
export const currentLevel = (s: State) => levelDef(s.level);

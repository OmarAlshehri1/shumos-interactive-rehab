import { Difficulty, GameState } from '@/lib/game';
import type { LiveControlMeta } from '@/lib/liveGame/ownership';
import { FOOT_ROLES } from '@/lib/safehexarena3d/sensorInput';
import { DEFAULT_CONFIG, sanitizeConfig } from './config';
import { MAX_STARS, MAX_TRAIL, type State } from './engine';
import { difficultyOf, STAGES } from './stages';
import { MAZE_IDS } from './mazes';

export const GAME_ID = 'foot-maze-3d' as const;

/** The record Control publishes into the shared `/liveSession`. Read-only for the Display. */
export interface FootMazeLiveSession {
  engine: 'fm3';
  engineVersion: 1;
  sessionId: string;
  seed: number;
  createdAt: number;
  gameState: GameState;
  currentDifficulty: Difficulty;
  currentStage: { stageNumber: 1 | 2 | 3; stageIndex: number };
  config: { childFirstName: string };
  fm3: LiveControlMeta & { payload: string };
}

/** The Display needs the whole state; it never needs the real-time tick clock or the sensor "pending" banner flag. */
export function encode(s: State): string {
  return JSON.stringify({ ...s, lastTick: 0, sensor: { ...s.sensor, pending: false } });
}

export function makeLive(s: State, ownerId: string, childName: string, stamp: Partial<LiveControlMeta> = {}): FootMazeLiveSession {
  return {
    engine: 'fm3',
    engineVersion: 1,
    sessionId: s.sessionId,
    seed: s.seed % 2147483647,
    createdAt: s.startedAt || 0,
    gameState:
      s.status === 'ended' ? GameState.SESSION_COMPLETE
        : s.status === 'stage-complete' ? GameState.STAGE_COMPLETE
          : s.status === 'ready' ? GameState.START_ZONE
            : GameState.PLAYING,
    currentDifficulty: difficultyOf(s.stage),
    currentStage: { stageNumber: ((s.stage % 3) + 1) as 1 | 2 | 3, stageIndex: s.stage },
    config: { childFirstName: childName.trim().slice(0, 30) || 'صديقي' },
    fm3: {
      ...(stamp.controlTabId ? { controlTabId: stamp.controlTabId } : {}),
      ...(stamp.heartbeatAt !== undefined ? { heartbeatAt: stamp.heartbeatAt } : {}),
      ...(stamp.takeoverFrom ? { takeoverFrom: stamp.takeoverFrom } : {}),
      ownerId,
      payload: encode(s),
    },
  };
}

const nat = (v: unknown, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max;
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const STATUSES = ['ready', 'running', 'paused', 'stage-complete', 'ended'];
const OUTCOMES = ['pending', 'confirmed', 'assisted', 'skipped'];
const KINDS = ['guard', 'swarm', 'gate', 'bridge', 'switch'];
const CUES = ['detour', 'dead', 'repeat', 'back', 'good'];
const ID = /^[A-Za-z0-9]{1,4}$/;

/** Structural validation of a decoded state: garbage never reaches the renderer or the recovery path. */
export function validState(raw: unknown): raw is State {
  if (!raw || typeof raw !== 'object') return false;
  const s = raw as State;
  if (typeof s.sessionId !== 'string' || !s.sessionId.length || s.sessionId.length > 99) return false;
  if (!nat(s.seed, 2147483647) || !nat(s.run, 100000) || !nat(s.stage, 8) || !STATUSES.includes(s.status)) return false;
  if (![s.clock, s.lastTick, s.startedAt, s.endedAt, s.goAt].every((v) => num(v) && v >= 0) || typeof s.safety !== 'boolean') return false;
  if (!s.config || JSON.stringify(sanitizeConfig(s.config, DEFAULT_CONFIG)) !== JSON.stringify(s.config)) return false;
  if (!Array.isArray(s.stats) || s.stats.length !== 9 || !Array.isArray(s.completed) || s.completed.length > 9 || !s.completed.every((i) => nat(i, 8))) return false;
  if (!Array.isArray(s.skipped) || s.skipped.length > 9 || !s.skipped.every((i) => nat(i, 8)) || !nat(s.starSeq, 1e7)) return false;
  for (const t of s.stats) {
    if (!t || !Array.isArray(t.res) || t.res.length > MAX_STARS || !t.res.every((r) => OUTCOMES.includes(r))) return false;
    if (![t.moves, t.assistedMoves, t.choices, t.correct, t.detours, t.deadEnds, t.waits, t.waitsDone, t.releases, t.events, t.hints, t.repeats].every((v) => nat(v, 1000)) || !nat(t.activeMs, 1e9)) return false;
    if (t.assistedMoves > t.moves || t.correct + t.detours > t.choices || t.waitsDone > t.waits + 1 || typeof t.simple !== 'boolean') return false;
    if (!(t.maze === '' || (MAZE_IDS as readonly string[]).includes(t.maze))) return false;
  }
  if (!Array.isArray(s.trail) || s.trail.length > MAX_TRAIL || !s.trail.every((n) => typeof n === 'string' && ID.test(n))) return false;
  if (s.heading !== null && !(typeof s.heading === 'string' && ID.test(s.heading))) return false;
  if (!Array.isArray(s.fired) || s.fired.length > 8 || !s.fired.every((n) => typeof n === 'string' && ID.test(n))) return false;
  if (s.act !== null && !(s.act && KINDS.includes(s.act.kind) && typeof s.act.id === 'string' && ID.test(s.act.id) && typeof s.act.at === 'string' && ID.test(s.act.at) && num(s.act.t0) && num(s.act.leaveAt) && nat(s.act.holdMs, 30000) && s.act.leaveAt >= s.act.t0 && typeof s.act.early === 'boolean')) return false;
  if (!num(s.contAt) || !num(s.hintUntil)) return false;
  if (s.cue !== null && !(s.cue && CUES.includes(s.cue.kind) && nat(s.cue.n, 1e6))) return false;
  if (!s.sensor || !FOOT_ROLES.every((r) => ['none', 'ok', 'lost'].includes(s.sensor.link?.[r]) && nat(s.sensor.lastSeq?.[r])) || !nat(s.sensor.movements) || typeof s.sensor.pending !== 'boolean') return false;
  return s.stage < STAGES.length;
}

export function decode(raw: unknown): State | null {
  try {
    const r = raw as FootMazeLiveSession;
    if (r?.engine !== 'fm3' || r.engineVersion !== 1 || typeof r.fm3?.payload !== 'string' || r.fm3.payload.length > 32768) return null;
    const s = JSON.parse(r.fm3.payload);
    return validState(s) && s.sessionId === r.sessionId ? s : null;
  } catch {
    return null;
  }
}

export function reviveFootMazeLive(raw: unknown): FootMazeLiveSession | null {
  const r = raw as FootMazeLiveSession;
  if (!decode(raw) || typeof r.fm3.ownerId !== 'string' || !r.fm3.ownerId) return null;
  if (typeof r.config?.childFirstName !== 'string' || r.config.childFirstName.length > 30 || !Number.isFinite(r.createdAt)) return null;
  return r;
}

/** State a reloaded Control adopts: never resumes by itself, and shows nothing as running. */
export function recoveredState(raw: FootMazeLiveSession): State | null {
  const s = decode(raw);
  if (!s) return null;
  const paused = s.status === 'running';
  return { ...s, status: paused ? 'paused' : s.status, safety: paused ? true : s.safety, lastTick: 0, sensor: { ...s.sensor, pending: false } };
}

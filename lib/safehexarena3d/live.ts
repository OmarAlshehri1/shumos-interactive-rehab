import { Difficulty, GameState } from '@/lib/game';
import type { LiveControlMeta } from '@/lib/liveGame/ownership';
import { layoutOf, sanitizeConfig, type State } from './engine';
import { checkWarning, difficultyOf, STAGES } from './stages';
import { FOOT_ROLES } from './sensorInput';
import { TILE_COUNTS } from './geometry';

export const GAME_ID = 'safe-hex-arena-3d' as const;

/** The record Control publishes into the shared `/liveSession`. Read-only for the Display. */
export interface HexLiveSession {
  engine: 'hex3';
  engineVersion: 1;
  sessionId: string;
  seed: number;
  createdAt: number;
  gameState: GameState;
  currentDifficulty: Difficulty;
  currentStage: { stageNumber: 1 | 2 | 3; stageIndex: number };
  config: { childFirstName: string };
  hex3: LiveControlMeta & { payload: string };
}

/** The Display never needs the sensor block or the full event list, only what it draws. Keep the payload small. */
export function encode(s: State): string {
  return JSON.stringify({ ...s, lastTick: 0 });
}

export function makeLive(s: State, ownerId: string, childName: string, stamp: Partial<LiveControlMeta> = {}): HexLiveSession {
  return {
    engine: 'hex3',
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
    hex3: {
      ...(stamp.controlTabId ? { controlTabId: stamp.controlTabId } : {}),
      ...(stamp.heartbeatAt !== undefined ? { heartbeatAt: stamp.heartbeatAt } : {}),
      ...(stamp.takeoverFrom ? { takeoverFrom: stamp.takeoverFrom } : {}),
      ownerId,
      payload: encode(s),
    },
  };
}

const nat = (v: unknown, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max;
const STATUSES = ['ready', 'running', 'paused', 'stage-complete', 'ended'];
const PHASES = ['prep', 'warning', 'inactive', 'restoring'];

/** Structural validation of a decoded state: garbage never reaches the renderer or the recovery path. */
export function validState(raw: unknown): raw is State {
  if (!raw || typeof raw !== 'object') return false;
  const s = raw as State;
  if (typeof s.sessionId !== 'string' || !s.sessionId.length || s.sessionId.length > 99) return false;
  if (!nat(s.seed, 4294967295) || !nat(s.run, 100000) || !nat(s.stage, 8) || !STATUSES.includes(s.status) || !PHASES.includes(s.phase)) return false;
  const def = STAGES[s.stage];
  if (!nat(s.round, def.rounds - 1)) return false;
  if (![s.elapsed, s.lastTick, s.startedAt, s.endedAt].every((v) => Number.isFinite(v) && v >= 0)) return false;
  if (typeof s.safety !== 'boolean') return false;
  if (!s.config || JSON.stringify(sanitizeConfig(s.config)) !== JSON.stringify(s.config)) return false;
  const layout = layoutOf(s);
  if (s.childTile !== null && !nat(s.childTile, layout.tiles - 1)) return false;
  if (!Array.isArray(s.warn) || s.warn.length > def.maxWarn || (s.warn.length > 0 && !checkWarning(layout, s.warn).ok)) return false;
  if ((s.phase === 'prep') !== (s.warn.length === 0) && s.status !== 'ended' && s.status !== 'ready') return false;
  if (!Array.isArray(s.events) || s.events.length > 60 || !Array.isArray(s.completed) || s.completed.length > 9 || !Array.isArray(s.skipped) || s.skipped.length > 9) return false;
  if (new Set(s.events.map((e) => e.key)).size !== s.events.length) return false;
  for (const e of s.events) {
    if (!e || !nat(e.stage, 8) || !nat(e.round, STAGES[e.stage].rounds - 1) || e.key !== `${s.run}:${e.stage}:${e.round}`) return false;
    if (!['confirmed', 'assisted', 'skipped'].includes(e.kind) || (e.kind === 'skipped') !== (e.tile === null)) return false;
    if (!TILE_COUNTS.includes(e.tiles as never) || (e.tile !== null && !nat(e.tile, e.tiles - 1))) return false;
  }
  if (!s.completed.every((i) => nat(i, 8)) || !s.skipped.every((i) => nat(i, 8))) return false;
  if (!s.sensor || !FOOT_ROLES.every((r) => ['none', 'ok', 'lost'].includes(s.sensor.link?.[r]) && nat(s.sensor.lastSeq?.[r])) || !nat(s.sensor.movements) || typeof s.sensor.pending !== 'boolean') return false;
  return true;
}

export function decode(raw: unknown): State | null {
  try {
    const r = raw as HexLiveSession;
    if (r?.engine !== 'hex3' || r.engineVersion !== 1 || typeof r.hex3?.payload !== 'string' || r.hex3.payload.length > 32768) return null;
    const s = JSON.parse(r.hex3.payload);
    return validState(s) && s.sessionId === r.sessionId ? s : null;
  } catch {
    return null;
  }
}

export function reviveHexLive(raw: unknown): HexLiveSession | null {
  const r = raw as HexLiveSession;
  if (!decode(raw) || typeof r.hex3.ownerId !== 'string' || !r.hex3.ownerId) return null;
  if (typeof r.config?.childFirstName !== 'string' || r.config.childFirstName.length > 30 || !Number.isFinite(r.createdAt)) return null;
  return r;
}

/** State a reloaded Control adopts: never resumes by itself, and shows nothing as running. */
export function recoveredState(raw: HexLiveSession): State | null {
  const s = decode(raw);
  if (!s) return null;
  const paused = s.status === 'running';
  return { ...s, status: paused ? 'paused' : s.status, safety: paused ? true : s.safety, lastTick: 0, sensor: { ...s.sensor, pending: false } };
}

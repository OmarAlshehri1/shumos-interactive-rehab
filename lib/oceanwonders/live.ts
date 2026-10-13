import { Difficulty, GameState } from '@/lib/game';
import type { LiveControlMeta } from '@/lib/liveGame/ownership';
import { DEFAULT_CONFIG, sanitizeConfig } from './config';
import { LOG_MAX, TARGET_MAX, TARGET_MIN, type State } from './engine';

export const GAME_ID = 'ocean-wonders-3d' as const;

/** The record Control publishes into the shared `/liveSession`. Read-only for the Display. */
export interface OceanWondersLiveSession {
  engine: 'ow3';
  engineVersion: 1;
  sessionId: string;
  seed: number;
  createdAt: number;
  gameState: GameState;
  currentDifficulty: Difficulty;
  /** Level 1..3 only; Ocean Wonders has no stages. `stageIndex` mirrors the level so shared consumers stay valid. */
  currentStage: { stageNumber: 1 | 2 | 3; stageIndex: number };
  config: { childFirstName: string };
  ow3: LiveControlMeta & { payload: string };
}

const DIFFICULTY: readonly Difficulty[] = [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.ADVANCED];

/** The Display needs the whole state except the real-time tick clock. */
export function encode(s: State): string {
  return JSON.stringify({ ...s, lastTick: 0 });
}

export function makeLive(s: State, ownerId: string, childName: string, stamp: Partial<LiveControlMeta> = {}): OceanWondersLiveSession {
  return {
    engine: 'ow3',
    engineVersion: 1,
    sessionId: s.sessionId,
    seed: s.seed % 2147483647,
    createdAt: s.startedAt || 0,
    gameState: s.status === 'ended' ? GameState.SESSION_COMPLETE : s.status === 'level-complete' ? GameState.STAGE_COMPLETE : s.status === 'ready' ? GameState.START_ZONE : GameState.PLAYING,
    currentDifficulty: DIFFICULTY[s.level],
    currentStage: { stageNumber: (s.level + 1) as 1 | 2 | 3, stageIndex: s.level },
    config: { childFirstName: childName.trim().slice(0, 30) || 'صديقي' },
    ow3: {
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
const STATUSES = ['ready', 'running', 'paused', 'level-complete', 'ended'];
const KINDS = ['confirm', 'assist', 'undo', 'skip', 'level'];

/** Structural validation of a decoded state: garbage never reaches the renderer or the recovery path. */
export function validState(raw: unknown): raw is State {
  if (!raw || typeof raw !== 'object') return false;
  const s = raw as State;
  if (typeof s.sessionId !== 'string' || !s.sessionId.length || s.sessionId.length > 99) return false;
  if (!nat(s.seed, 2147483647) || !nat(s.run, 100000) || !STATUSES.includes(s.status)) return false;
  if (![0, 1, 2].includes(s.level) || ![0, 1, 2].includes(s.startLevel) || s.startLevel > s.level) return false;
  if (!nat(s.target, TARGET_MAX) || s.target < TARGET_MIN) return false;
  if (typeof s.exercise !== 'string' || s.exercise.length > 60 || typeof s.notes !== 'string' || s.notes.length > 300 || typeof s.safety !== 'boolean') return false;
  if (!s.config || JSON.stringify(sanitizeConfig(s.config, DEFAULT_CONFIG)) !== JSON.stringify(s.config)) return false;
  if (![s.confirmed, s.assisted, s.skipped, s.undos].every((v) => nat(v, 1000)) || s.confirmed + s.assisted > s.target) return false;
  if (typeof s.log !== 'string' || s.log.length > LOG_MAX || !/^[ca]*$/.test(s.log) || s.log.length > s.confirmed + s.assisted) return false;
  if (!nat(s.seq, 1e7) || !nat(s.ignored, 100000) || !nat(s.viaPad, 100000)) return false;
  if (![s.lastAt, s.lastUndoAt, s.clock, s.lastTick, s.levelClock0, s.startedAt, s.endedAt].every((v) => num(v) && v >= 0)) return false;
  if (s.evt !== null && !(s.evt && KINDS.includes(s.evt.kind) && nat(s.evt.n, 1e7))) return false;
  if (s.status === 'level-complete' && s.confirmed + s.assisted !== s.target) return false;
  if (s.status === 'running' && s.confirmed + s.assisted >= s.target) return false;
  if (!Array.isArray(s.levels) || s.levels.length > 3) return false;
  for (const r of s.levels) {
    if (!r || ![0, 1, 2].includes(r.level) || !nat(r.target, TARGET_MAX) || r.target < TARGET_MIN) return false;
    if (![r.confirmed, r.assisted, r.skipped, r.undos].every((v) => nat(v, 1000)) || r.confirmed + r.assisted > r.target || typeof r.completed !== 'boolean' || !nat(r.activeMs, 1e9)) return false;
    if (r.completed && r.confirmed + r.assisted !== r.target) return false;
  }
  return true;
}

export function decode(raw: unknown): State | null {
  try {
    const r = raw as OceanWondersLiveSession;
    if (r?.engine !== 'ow3' || r.engineVersion !== 1 || typeof r.ow3?.payload !== 'string' || r.ow3.payload.length > 8192) return null;
    const s = JSON.parse(r.ow3.payload);
    return validState(s) && s.sessionId === r.sessionId ? s : null;
  } catch {
    return null;
  }
}

export function reviveOceanWondersLive(raw: unknown): OceanWondersLiveSession | null {
  const r = raw as OceanWondersLiveSession;
  if (!decode(raw) || typeof r.ow3.ownerId !== 'string' || !r.ow3.ownerId) return null;
  if (typeof r.config?.childFirstName !== 'string' || r.config.childFirstName.length > 30 || !Number.isFinite(r.createdAt)) return null;
  return r;
}

/** State a reloaded Control adopts: never resumes by itself, and shows nothing as running. Progress is kept exactly. */
export function recoveredState(raw: OceanWondersLiveSession): State | null {
  const s = decode(raw);
  if (!s) return null;
  const paused = s.status === 'running';
  return { ...s, status: paused ? 'paused' : s.status, safety: paused ? true : s.safety, lastTick: 0 };
}

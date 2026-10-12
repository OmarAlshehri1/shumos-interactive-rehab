import { Difficulty, GameState } from '@/lib/game';
import type { LiveControlMeta } from '@/lib/liveGame/ownership';
import { FOOT_ROLES } from '@/lib/safehexarena3d/sensorInput';
import { pathIsSafe, sanitizeConfig, type State } from './engine';
import { STAGES, difficultyOf } from './stages';

export const GAME_ID = 'follow-the-footsteps' as const;
export const ENGINE = 'fp3' as const;

/** The record Control publishes into the shared `/liveSession` (same game id as the original game, tagged `engine: "fp3"`). */
export interface FootstepsLiveSession {
  engine: typeof ENGINE;
  engineVersion: 1;
  sessionId: string;
  seed: number;
  createdAt: number;
  gameState: GameState;
  currentDifficulty: Difficulty;
  currentStage: { stageNumber: 1 | 2 | 3; stageIndex: number };
  config: { childFirstName: string };
  fp3: LiveControlMeta & { payload: string };
}

/** The original game's records are never tagged; the 3D engine's always are. This is what routes a session to its Display. */
export function isFp3Live(raw: unknown): raw is FootstepsLiveSession {
  return !!raw && typeof raw === 'object' && (raw as { engine?: unknown }).engine === ENGINE;
}

export function encode(s: State): string {
  return JSON.stringify({ ...s, lastTick: 0 });
}

export function makeLive(s: State, ownerId: string, childName: string, stamp: Partial<LiveControlMeta> = {}): FootstepsLiveSession {
  return {
    engine: ENGINE,
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
    fp3: {
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

/** Structural validation of a decoded state: garbage never reaches the renderer or the recovery path. */
export function validState(raw: unknown): raw is State {
  if (!raw || typeof raw !== 'object') return false;
  const s = raw as State;
  if (typeof s.sessionId !== 'string' || !s.sessionId.length || s.sessionId.length > 99) return false;
  if (!nat(s.seed, 4294967295) || !nat(s.run, 100000) || !nat(s.stage, 8) || !STATUSES.includes(s.status) || !['preview', 'step'].includes(s.phase)) return false;
  const def = STAGES[s.stage];
  if (!nat(s.step, def.steps) || !nat(s.cue, 1_000_000)) return false;
  if (![s.elapsed, s.lastTick, s.startedAt, s.endedAt].every((v) => Number.isFinite(v) && v >= 0)) return false;
  if (typeof s.safety !== 'boolean' || typeof s.rest !== 'boolean') return false;
  if (!s.config || JSON.stringify(sanitizeConfig(s.config)) !== JSON.stringify(s.config)) return false;
  if (!Array.isArray(s.events) || s.events.length > 60 || !Array.isArray(s.completed) || s.completed.length > 9 || !Array.isArray(s.skipped) || s.skipped.length > 9) return false;
  if (new Set(s.events.map((e) => e.key)).size !== s.events.length) return false;
  for (const e of s.events) {
    if (!e || !nat(e.stage, 8) || !nat(e.step, STAGES[e.stage].steps - 1) || e.key !== `${s.run}:${e.stage}:${e.step}`) return false;
    if (!['confirmed', 'assisted', 'skipped'].includes(e.kind)) return false;
  }
  if (!s.completed.every((i) => nat(i, 8)) || !s.skipped.every((i) => nat(i, 8))) return false;
  if (!s.sensor || !FOOT_ROLES.every((r) => ['none', 'ok', 'lost'].includes(s.sensor.link?.[r]) && nat(s.sensor.lastSeq?.[r])) || !nat(s.sensor.movements) || typeof s.sensor.pending !== 'boolean') return false;
  // the stage's path must be a safe one for this config, so a hostile payload can never place a stone off the floor
  return pathIsSafe(s);
}

export function decode(raw: unknown): State | null {
  try {
    const r = raw as FootstepsLiveSession;
    if (!isFp3Live(r) || r.engineVersion !== 1 || typeof r.fp3?.payload !== 'string' || r.fp3.payload.length > 32768) return null;
    const s = JSON.parse(r.fp3.payload);
    return validState(s) && s.sessionId === r.sessionId ? s : null;
  } catch {
    return null;
  }
}

export function reviveFootstepsLive(raw: unknown): FootstepsLiveSession | null {
  const r = raw as FootstepsLiveSession;
  if (!decode(raw) || typeof r.fp3.ownerId !== 'string' || !r.fp3.ownerId) return null;
  if (typeof r.config?.childFirstName !== 'string' || r.config.childFirstName.length > 30 || !Number.isFinite(r.createdAt)) return null;
  return r;
}

/** State a reloaded Control adopts: never resumes by itself. */
export function recoveredState(raw: FootstepsLiveSession): State | null {
  const s = decode(raw);
  if (!s) return null;
  const paused = s.status === 'running';
  return { ...s, status: paused ? 'paused' : s.status, safety: paused ? true : s.safety, lastTick: 0, sensor: { ...s.sensor, pending: false } };
}

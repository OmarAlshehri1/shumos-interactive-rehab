import { Difficulty, GameState } from '@/lib/game';
import type { LiveControlMeta } from '@/lib/liveGame/ownership';
import { DEFAULT_CONFIG, sanitizeConfig } from './config';
import { KIND_ORDER, type State } from './engine';
import { difficultyOf, STAGES } from './stages';
import { FOOT_ROLES } from '@/lib/safehexarena3d/sensorInput';

export const GAME_ID = 'rhythm-steps-3d' as const;

/** The record Control publishes into the shared `/liveSession`. Read-only for the Display. */
export interface RhythmLiveSession {
  engine: 'rs3';
  engineVersion: 1;
  sessionId: string;
  seed: number;
  createdAt: number;
  gameState: GameState;
  currentDifficulty: Difficulty;
  currentStage: { stageNumber: 1 | 2 | 3; stageIndex: number };
  config: { childFirstName: string };
  rs3: LiveControlMeta & { payload: string };
}

/** The Display needs the whole stage stream and the config, but never the sensor block or the real-time tick clock. */
export function encode(s: State): string {
  return JSON.stringify({ ...s, lastTick: 0, sensor: { ...s.sensor, pending: false } });
}

export function makeLive(s: State, ownerId: string, childName: string, stamp: Partial<LiveControlMeta> = {}): RhythmLiveSession {
  return {
    engine: 'rs3',
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
    rs3: {
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
const OUTCOMES = ['pending', 'confirmed', 'assisted', 'skipped', 'missed'];
const FEET = ['L', 'R', 'ANY', 'BOTH'];
const ROLES = ['move', 'stay', 'hold', 'jump'];

/** Structural validation of a decoded state: garbage never reaches the renderer or the recovery path. */
export function validState(raw: unknown): raw is State {
  if (!raw || typeof raw !== 'object') return false;
  const s = raw as State;
  if (typeof s.sessionId !== 'string' || !s.sessionId.length || s.sessionId.length > 99) return false;
  if (!nat(s.seed, 2147483647) || !nat(s.run, 100000) || !nat(s.stage, 8) || !STATUSES.includes(s.status)) return false;
  if (![s.clock, s.lastTick, s.startedAt, s.endedAt].every((v) => num(v) && v >= 0) || typeof s.safety !== 'boolean' || typeof s.spawnOn !== 'boolean' || !num(s.doneAt)) return false;
  if (!s.config || JSON.stringify(sanitizeConfig(s.config, DEFAULT_CONFIG)) !== JSON.stringify(s.config)) return false;
  if (!Array.isArray(s.steps) || s.steps.length > 40 || !Array.isArray(s.stats) || s.stats.length !== 9) return false;
  if (!Array.isArray(s.completed) || s.completed.length > 9 || !Array.isArray(s.skipped) || s.skipped.length > 9 || !s.completed.every((i) => nat(i, 8)) || !s.skipped.every((i) => nat(i, 8))) return false;
  const ids = new Set<string>();
  for (const st of s.steps) {
    if (!st || typeof st.id !== 'string' || ids.has(st.id) || st.id !== `${s.run}:${s.stage}:${st.i}:${st.rep}`) return false;
    ids.add(st.id);
    if (!nat(st.i, 40) || !nat(st.rep, 40) || !KIND_ORDER.includes(st.kind) || !OUTCOMES.includes(st.out) || !num(st.arrival) || st.arrival < 0 || st.arrival > 1e7 || !num(st.holdAt) || !num(st.at) || !nat(st.gapB, 60) || !nat(st.holdMs, 10000)) return false;
    if (!Array.isArray(st.targets) || st.targets.length < 1 || st.targets.length > 2) return false;
    if (!st.targets.every((t) => t && nat(t.lane, 3) && FEET.includes(t.foot) && ROLES.includes(t.role))) return false;
    if (st.seq !== null && !(Array.isArray(st.seq) && st.seq.length === 3 && st.seq.every((v) => nat(v, 99)))) return false;
    if (st.kind === 'hold' ? st.holdMs < 1000 : st.holdMs !== 0) return false;
  }
  for (const t of s.stats) {
    if (!t || !nat(t.total, 200) || !nat(t.confirmed, 200) || !nat(t.assisted, 200) || !nat(t.skipped, 200) || !nat(t.missed, 200) || !nat(t.reps, 200) || !nat(t.activeMs, 1e9) || !nat(t.flows, 3)) return false;
    if (t.confirmed + t.assisted + t.skipped + t.missed !== t.total || !Array.isArray(t.k) || t.k.length !== KIND_ORDER.length || !t.k.every((v) => nat(v, 200)) || t.k.reduce((a, b) => a + b, 0) !== t.total) return false;
  }
  if (!s.sensor || !FOOT_ROLES.every((r) => ['none', 'ok', 'lost'].includes(s.sensor.link?.[r]) && nat(s.sensor.lastSeq?.[r])) || !nat(s.sensor.movements) || typeof s.sensor.pending !== 'boolean') return false;
  return s.stage < STAGES.length;
}

export function decode(raw: unknown): State | null {
  try {
    const r = raw as RhythmLiveSession;
    if (r?.engine !== 'rs3' || r.engineVersion !== 1 || typeof r.rs3?.payload !== 'string' || r.rs3.payload.length > 32768) return null;
    const s = JSON.parse(r.rs3.payload);
    return validState(s) && s.sessionId === r.sessionId ? s : null;
  } catch {
    return null;
  }
}

export function reviveRhythmLive(raw: unknown): RhythmLiveSession | null {
  const r = raw as RhythmLiveSession;
  if (!decode(raw) || typeof r.rs3.ownerId !== 'string' || !r.rs3.ownerId) return null;
  if (typeof r.config?.childFirstName !== 'string' || r.config.childFirstName.length > 30 || !Number.isFinite(r.createdAt)) return null;
  return r;
}

/** State a reloaded Control adopts: never resumes by itself, and shows nothing as running. */
export function recoveredState(raw: RhythmLiveSession): State | null {
  const s = decode(raw);
  if (!s) return null;
  const paused = s.status === 'running';
  return { ...s, status: paused ? 'paused' : s.status, safety: paused ? true : s.safety, lastTick: 0, sensor: { ...s.sensor, pending: false } };
}

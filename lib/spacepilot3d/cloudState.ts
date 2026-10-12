/**
 * Space Pilot 3D on the shared platform live-session record (`/liveSession`, game id `space-pilot`, `engine: "sp3"`).
 *
 * The Control owns the authoritative flight simulation; a bounded JSON checkpoint (state + the presentation frame the
 * Display draws + mission clock, never a scene, patient identity or raw sensor stream) is published in `sp3.payload`
 * next to the generic fields every consumer of `liveSession.session` reads. Ownership, lease, presence, revision
 * ordering and history use the platform mechanisms (lib/liveGame, lib/realtime/sessionRepository.ts).
 *
 * Two small paths stay outside the shared record and are documented exceptions (see spacePilotRepository.ts):
 *  - Display -> Control acknowledgements (the Display proves it is visible and has rendered before flight may start);
 *  - the remote RIGHT_HAND relay (a sensor laptop that is not the therapist's iPad).
 * Both are re-anchored to this live record in the Firebase rules, so they remain server-validated.
 */
import { SPACE_STAGES } from './curriculum';
import { Difficulty, GameState } from '@/lib/game';
import type { LiveControlMeta } from '@/lib/liveGame/ownership';
import { isPresentationFrame, isSessionState, type ExperimentalSessionState, type PresentationFrame } from './sessionContract';
import { SessionAuthority } from './sessionAuthority';

export const SPACE_PILOT_ROOT = 'spacePilot3d'; // only `presence` (Display acks) and `sensor` (remote hand) remain below it
export const SP3_ENGINE_TAG = 'sp3' as const;
export const SP3_ENGINE_VERSION = 1 as const;
export const CLOUD_LINK_MS = 3000;
export const CLOUD_SNAPSHOT_MS = 100;
const PAYLOAD_MAX = 32768;
export const roomValid = (id: unknown): id is string => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id);

export interface SpacePilotLiveBlock extends LiveControlMeta {
  /** The authority token of the publishing Control mount: Display acknowledgements and relay samples are bound to it. */
  ownerToken: string;
  /** Ownership generation: increases each time a window adopts the session. */
  epoch: number;
  run: number;
  status: ExperimentalSessionState['lifecycle'];
  startedAt: number;
  endedAt: number;
  payload: string;
}

/** What `liveSession.session` holds for Space Pilot 3D. Field names match what the generic consumers read. */
export interface SpacePilotLiveSession {
  engine: typeof SP3_ENGINE_TAG;
  engineVersion: typeof SP3_ENGINE_VERSION;
  sessionId: string;
  seed: number;
  createdAt: number;
  gameState: GameState;
  currentDifficulty: Difficulty;
  currentStage: { stageNumber: 1 | 2 | 3; stageIndex: number };
  config: { childFirstName: string };
  sp3: SpacePilotLiveBlock;
}
export const isSpacePilotLive = (raw: unknown): boolean => !!raw && typeof raw === 'object' && (raw as { engine?: unknown }).engine === SP3_ENGINE_TAG;

export interface CloudCheckpoint { state: ExperimentalSessionState; frame: PresentationFrame; missionSeconds: number }
export interface LiveTimes { createdAt: number; startedAt: number; endedAt: number; epoch: number }

const difficultyOf = (d: ExperimentalSessionState['difficulty']): Difficulty => (d === 'LOW' ? Difficulty.EASY : d === 'HIGH' ? Difficulty.ADVANCED : Difficulty.MEDIUM);
export function legacyGameState(l: ExperimentalSessionState['lifecycle']): GameState {
  switch (l) {
    case 'ready': return GameState.START_ZONE;
    case 'mission-complete': return GameState.STAGE_COMPLETE;
    case 'completed':
    case 'ended': return GameState.SESSION_COMPLETE;
    default: return GameState.PLAYING;
  }
}
export const sanitizeChildName = (name: string): string => name.trim().slice(0, 30);

/** Bounded gameplay data, never a Three.js scene, patient identity or raw sensor stream. */
export function checkpointPayload(authority: SessionAuthority, now: number): string {
  const state = authority.snapshot(), frame = authority.frame(now);
  if (state.inputMode !== 'sensor') frame.rawPointer = null; // Filtered game coordinates only; never WT901 samples.
  const payload = JSON.stringify({ state, frame, missionSeconds: authority.simulation.missionSeconds });
  if (payload.length > PAYLOAD_MAX) throw new Error('Space Pilot snapshot exceeds bound');
  return payload;
}

export function spacePilotLiveSession(authority: SessionAuthority, now: number, childName: string, ownerUid: string, times: LiveTimes, stamp: Pick<LiveControlMeta, 'controlTabId' | 'heartbeatAt' | 'takeoverFrom'>): SpacePilotLiveSession {
  const state = authority.snapshot();
  return {
    engine: SP3_ENGINE_TAG,
    engineVersion: SP3_ENGINE_VERSION,
    sessionId: authority.roomId,
    seed: 0,
    createdAt: times.createdAt,
    gameState: legacyGameState(state.lifecycle),
    currentDifficulty: difficultyOf(state.difficulty),
    currentStage: { stageNumber: state.curriculumId?SPACE_STAGES[state.mission-1].stage:Math.min(3, Math.max(1, state.mission)) as 1 | 2 | 3, stageIndex: Math.max(0, state.mission - 1) },
    config: { childFirstName: sanitizeChildName(childName) || 'الطفل' },
    sp3: {
      ownerId: ownerUid,
      ...(stamp.controlTabId ? { controlTabId: stamp.controlTabId } : {}),
      ...(typeof stamp.heartbeatAt === 'number' ? { heartbeatAt: stamp.heartbeatAt } : {}),
      ...(stamp.takeoverFrom ? { takeoverFrom: stamp.takeoverFrom } : {}),
      ownerToken: authority.ownerId, epoch: times.epoch, run: state.runId, status: state.lifecycle,
      startedAt: times.startedAt, endedAt: times.endedAt, payload: checkpointPayload(authority, now),
    },
  };
}

/** Decodes and fully validates the checkpoint of a stored block; null for anything inconsistent. */
export function decodeCheckpoint(session: Pick<SpacePilotLiveSession, 'sessionId' | 'sp3'>): CloudCheckpoint | null {
  try {
    const b = session.sp3;
    if (!roomValid(session.sessionId) || !roomValid(b.ownerToken) || !b.ownerId || !Number.isSafeInteger(b.epoch) || b.epoch < 1 || !Number.isSafeInteger(b.run) || b.run < 1 ||
      ![b.startedAt, b.endedAt].every(Number.isFinite) || typeof b.payload !== 'string' || b.payload.length === 0 || b.payload.length > PAYLOAD_MAX) return null;
    const c: CloudCheckpoint = JSON.parse(b.payload), s = c.state, f = c.frame;
    if (!isSessionState(s) || !isPresentationFrame(f) || !Number.isFinite(c.missionSeconds) || c.missionSeconds < 0 ||
      s.roomId !== session.sessionId || s.sessionId !== session.sessionId || s.ownerId !== b.ownerToken ||
      f.ownerId !== s.ownerId || f.sessionId !== s.sessionId || f.runId !== s.runId || f.revision !== s.revision || f.inputEpoch !== s.inputEpoch ||
      f.elapsedSeconds !== s.elapsedSeconds || s.runId !== b.run || s.lifecycle !== b.status) return null;
    return c;
  } catch { return null; }
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
/**
 * Realtime Database drops nulls and empty arrays, so the record is repaired where needed and then checked. The
 * checkpoint itself is a JSON string and is untouched. A malformed record fails safely to "no session".
 */
export function reviveSpacePilotLive(raw: unknown): SpacePilotLiveSession | null {
  if (!isRecord(raw) || raw.engine !== SP3_ENGINE_TAG || raw.engineVersion !== SP3_ENGINE_VERSION || !isRecord(raw.sp3) || !isRecord(raw.config) || !isRecord(raw.currentStage)) return null;
  const b = raw.sp3;
  if (typeof raw.sessionId !== 'string' || !Number.isFinite(raw.createdAt) || typeof raw.config.childFirstName !== 'string') return null;
  if (typeof b.ownerId !== 'string' || typeof b.ownerToken !== 'string' || typeof b.payload !== 'string' || typeof b.status !== 'string' ||
    !Number.isSafeInteger(b.epoch) || !Number.isSafeInteger(b.run) || !Number.isFinite(b.startedAt) || !Number.isFinite(b.endedAt)) return null;
  const status = b.status as ExperimentalSessionState['lifecycle'];
  const c0 = (() => { try { return (JSON.parse(b.payload) as CloudCheckpoint).state; } catch { return null; } })();
  if (!c0 || !isSessionState(c0)) return null;
  const session: SpacePilotLiveSession = {
    engine: SP3_ENGINE_TAG, engineVersion: SP3_ENGINE_VERSION, sessionId: raw.sessionId, seed: typeof raw.seed === 'number' ? raw.seed : 0,
    createdAt: raw.createdAt as number, gameState: legacyGameState(status), currentDifficulty: difficultyOf(c0.difficulty),
    currentStage: { stageNumber: c0.curriculumId?SPACE_STAGES[c0.mission-1].stage:Math.min(3, Math.max(1, c0.mission)) as 1 | 2 | 3, stageIndex: Math.max(0, c0.mission - 1) },
    config: { childFirstName: raw.config.childFirstName },
    sp3: {
      ownerId: b.ownerId, ownerToken: b.ownerToken, epoch: b.epoch as number, run: b.run as number, status,
      ...(typeof b.controlTabId === 'string' ? { controlTabId: b.controlTabId } : {}),
      ...(typeof b.heartbeatAt === 'number' ? { heartbeatAt: b.heartbeatAt } : {}),
      ...(typeof b.takeoverFrom === 'string' ? { takeoverFrom: b.takeoverFrom } : {}),
      startedAt: b.startedAt as number, endedAt: b.endedAt as number, payload: b.payload,
    },
  };
  return decodeCheckpoint(session) ? session : null;
}

/** Recover accepted progress under a new ownership epoch with a new authority token, stopped for pickup. */
export function recoverAuthority(session: SpacePilotLiveSession, token: string): SessionAuthority {
  const c = decodeCheckpoint(session);
  if (!c) throw new Error('Invalid Space Pilot checkpoint');
  const a = new SessionAuthority(session.sessionId, token, session.sessionId, c.state.difficulty, CLOUD_LINK_MS,c.state.curriculumId);
  a.restore(c.state, c.frame, c.missionSeconds);
  return a;
}

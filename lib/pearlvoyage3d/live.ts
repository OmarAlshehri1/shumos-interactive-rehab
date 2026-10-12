import { GameState } from '@/lib/game';
import type { LiveControlMeta } from '@/lib/liveGame/ownership';
import { DEFAULT_CONFIG, sanitizeConfig, USED_KEYS, type State } from './engine';
import { GAME_ID } from './registration';
import { STAGES, difficultyOf, stageNumberOf } from './stages';

export { GAME_ID };
/**
 * Pearl Voyage 3D rides on the shared `/liveSession` record under the engine key `pv3`, exactly like the other
 * shared-platform 3D games: the generic session fields keep the Display's waiting/recovery code working and the
 * whole deterministic State travels as one bounded JSON payload that the Display decodes read-only.
 */
export interface PearlLiveSession {
    engine: 'pv3';
    engineVersion: 1;
    sessionId: string;
    seed: number;
    createdAt: number;
    gameState: GameState;
    currentDifficulty: ReturnType<typeof difficultyOf>;
    currentStage: { stageNumber: 1 | 2 | 3; stageIndex: number };
    config: { childFirstName: string };
    pv3: LiveControlMeta & { payload: string };
}
/** wire form: timers that only feed the local clock are zeroed so an idle boat does not generate writes */
export const encode = (s: State) => JSON.stringify({ ...s, lastTick: 0, inputAt: 0 });
export function makeLive(s: State, uid: string, name: string, stamp: Partial<LiveControlMeta> = {}): PearlLiveSession {
    return {
        engine: 'pv3', engineVersion: 1, sessionId: s.sessionId, seed: 1, createdAt: s.startedAt || s.endedAt || 1,
        gameState: s.status === 'ended' ? GameState.SESSION_COMPLETE : s.status === 'stage-complete' ? GameState.STAGE_COMPLETE : s.status === 'ready' ? GameState.START_ZONE : GameState.PLAYING,
        currentDifficulty: difficultyOf(s.stage), currentStage: { stageNumber: stageNumberOf(s.stage), stageIndex: s.stage }, config: { childFirstName: name.trim().slice(0, 30) || 'صديقي' },
        pv3: { ...(stamp.controlTabId ? { controlTabId: stamp.controlTabId } : {}), ...(stamp.heartbeatAt !== undefined ? { heartbeatAt: stamp.heartbeatAt } : {}), ...(stamp.takeoverFrom ? { takeoverFrom: stamp.takeoverFrom } : {}), ownerId: uid, payload: JSON.stringify({ ...s, lastTick: 0 }) },
    };
}
const nat = (n: unknown, max = Number.MAX_SAFE_INTEGER): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= max;
const range = (n: unknown, lo: number, hi: number): n is number => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;
/** strict structural validation: anything malformed yields null (the Display shows its waiting world), never a guess */
export function validState(raw: unknown): raw is State {
    try {
        const s = raw as State;
        if (!s || typeof s !== 'object' || typeof s.sessionId !== 'string' || !s.sessionId.length || s.sessionId.length > 80) return false;
        if (!nat(s.run, 100000) || !nat(s.stage, STAGES.length - 1) || !nat(s.startingStage, STAGES.length - 1) || !['ready', 'running', 'paused', 'stage-complete', 'ended'].includes(s.status) || !['sailing', 'encounter', 'celebrate'].includes(s.phase)) return false;
        const def = STAGES[s.stage];
        if (!nat(s.marker, def.markers.length - 1)) return false;
        if (![s.x, s.y].every(v => range(v, -1000, 1000)) || !range(s.heading, -Math.PI * 1.01, Math.PI * 1.01) || !range(s.speed, 0, 8) || !range(s.steering, -1.01, 1.01) || !range(s.hold, 0, 1)) return false;
        if (typeof s.holding !== 'boolean' || ![s.pulseAt, s.encounterMs, s.celebrateMs].every(v => range(v, 0, Number.MAX_SAFE_INTEGER))) return false;
        if (!s.config || JSON.stringify(sanitizeConfig(s.config)) !== JSON.stringify(s.config)) return false;
        if (!s.input || !range(s.input.steering, -1, 1) || !range(s.input.throttle, 0, 1) || !range(s.input.brake, 0, 1) || typeof s.input.hold !== 'boolean') return false;
        if (![s.startedAt, s.endedAt, s.elapsed, s.lastTick, s.inputAt].every(v => range(v, 0, Number.MAX_SAFE_INTEGER)) || !nat(s.repeats, 1e6) || ![s.safety, s.assisted, s.inputLost].every(v => typeof v === 'boolean')) return false;
        if (!Array.isArray(s.used) || s.used.length > USED_KEYS.length || new Set(s.used).size !== s.used.length || !s.used.every(u => (USED_KEYS as readonly string[]).includes(u))) return false;
        if (!Array.isArray(s.events) || s.events.length > 29 || new Set(s.events.map(e => e.key)).size !== s.events.length) return false;
        for (const e of s.events) {
            if (!nat(e.stage, STAGES.length - 1) || !nat(e.marker, STAGES[e.stage].markers.length - 1) || e.key !== `${e.stage}:${e.marker}` || e.species !== STAGES[e.stage].markers[e.marker].species || !['assisted', 'independent', 'skipped'].includes(e.outcome)) return false;
        }
        if (![s.completed, s.skipped].every(a => Array.isArray(a) && a.length <= STAGES.length && a.every(v => nat(v, STAGES.length - 1)) && new Set(a).size === a.length) || s.completed.some(i => s.skipped.includes(i))) return false;
        for (const i of s.completed) if (STAGES[i].markers.some((_, j) => !s.events.some(e => e.stage === i && e.marker === j && e.outcome !== 'skipped'))) return false;
        for (const i of s.skipped) if (STAGES[i].markers.some((_, j) => !s.events.some(e => e.stage === i && e.marker === j)) || !s.events.some(e => e.stage === i && e.outcome === 'skipped')) return false;
        if (s.status === 'ended' && (!s.endedAt || s.endedAt < s.startedAt)) return false;
        return true;
    }
    catch {
        return false;
    }
}
export function decode(raw: unknown): State | null {
    try {
        const r = raw as PearlLiveSession;
        if (r?.engine !== 'pv3' || r.engineVersion !== 1 || typeof r.pv3?.payload !== 'string' || r.pv3.payload.length > 32768) return null;
        const s = JSON.parse(r.pv3.payload);
        return validState(s) && s.sessionId === r.sessionId ? s : null;
    }
    catch {
        return null;
    }
}
export function revivePearlLive(raw: unknown): PearlLiveSession | null {
    const r = raw as PearlLiveSession;
    const s = decode(r);
    if (!s) return null;
    const ok = typeof r.pv3.ownerId === 'string' && r.pv3.ownerId.length > 0 && typeof r.pv3.controlTabId === 'string' && r.pv3.controlTabId.length > 0 && range(r.pv3.heartbeatAt, 0, Number.MAX_SAFE_INTEGER)
        && typeof r.config?.childFirstName === 'string' && r.config.childFirstName.length > 0 && r.config.childFirstName.length <= 30 && r.currentStage?.stageIndex === s.stage && r.currentDifficulty === difficultyOf(s.stage) && range(r.createdAt, 0, Number.MAX_SAFE_INTEGER);
    return ok ? r : null;
}
/** reload recovery: never resume movement by itself, never resume a hardware session without fresh input */
export function recoveredState(r: PearlLiveSession): State | null {
    const s = decode(r);
    return s ? { ...s, status: s.status === 'running' ? 'paused' : s.status, safety: s.status === 'running' || s.safety, lastTick: 0, speed: 0, holding: false, input: { steering: 0, throttle: 0, brake: 0, hold: false }, inputAt: 0 } : null;
}
export { DEFAULT_CONFIG };

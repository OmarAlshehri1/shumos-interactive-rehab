import { GameState } from '@/lib/game';
import type { LiveControlMeta } from '@/lib/liveGame/ownership';
import { sanitizeConfig, type State } from './engine';
import { STAGES, difficultyOf } from './stages';
export const GAME_ID = 'fire-rescue-3d' as const;
export interface FireLiveSession {
    engine: 'fr3';
    engineVersion: 1;
    sessionId: string;
    seed: number;
    createdAt: number;
    gameState: GameState;
    currentDifficulty: ReturnType<typeof difficultyOf>;
    currentStage: {
        stageNumber: 1 | 2 | 3;
        stageIndex: number;
    };
    config: {
        childFirstName: string;
    };
    fr3: LiveControlMeta & {
        payload: string;
    };
}
export const encode = (s: State) => JSON.stringify({ ...s, lastTick: 0, inputAt: 0 });
export function makeLive(s: State, uid: string, name: string, stamp: Partial<LiveControlMeta> = {}): FireLiveSession {
    return { engine: 'fr3', engineVersion: 1, sessionId: s.sessionId, seed: 1, createdAt: s.startedAt, gameState: s.status === 'ended' ? GameState.SESSION_COMPLETE : s.status === 'stage-complete' ? GameState.STAGE_COMPLETE : s.status === 'ready' ? GameState.START_ZONE : GameState.PLAYING, currentDifficulty: difficultyOf(s.stage), currentStage: { stageNumber: (s.stage % 3 + 1) as 1 | 2 | 3, stageIndex: s.stage }, config: { childFirstName: name.trim().slice(0, 30) || 'صديقي' }, fr3: { ...(stamp.controlTabId ? { controlTabId: stamp.controlTabId } : {}), ...(stamp.heartbeatAt !== undefined ? { heartbeatAt: stamp.heartbeatAt } : {}), ...(stamp.takeoverFrom ? { takeoverFrom: stamp.takeoverFrom } : {}), ownerId: uid, payload: JSON.stringify({ ...s, lastTick: 0 }) } };
}
const nat = (n: unknown, max = Number.MAX_SAFE_INTEGER): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= max;
const range = (n: unknown, lo: number, hi: number): n is number => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;
export function validState(raw: unknown): raw is State {
    try {
        const s = raw as State;
        if (!s || typeof s !== 'object' || typeof s.sessionId !== 'string' || !s.sessionId.length || s.sessionId.length > 80)
            return false;
        if (!nat(s.run, 100000) || !nat(s.stage, 8) || !nat(s.startingStage, 8) || !['ready', 'running', 'paused', 'stage-complete', 'ended'].includes(s.status) || !['driving', 'firefighting'].includes(s.phase))
            return false;
        const d = STAGES[s.stage];
        if (!nat(s.stop, d.stops.length - 1) || !range(s.distance, 0, d.stops[s.stop]) || !range(s.lateral, -4.3, 4.3) || !range(s.heading, -0.7, 0.7) || !range(s.speed, 0, 7) || !range(s.steering, -1, 1) || !range(s.aim?.x, -1, 1) || !range(s.aim?.y, -1, 1))
            return false;
        if (!Array.isArray(s.fires) || s.fires.length !== d.targets[s.stop] || !s.fires.every(v => range(v, 0, 1)))
            return false;
        if (!s.config || JSON.stringify(sanitizeConfig(s.config)) !== JSON.stringify(s.config))
            return false;
        if (!s.input || !['steering', 'aimX', 'aimY'].every(k => range(s.input[k as 'steering'], -1, 1)) || !range(s.input.throttle, 0, 1) || !range(s.input.brake, 0, 1) || typeof s.input.water !== 'boolean')
            return false;
        if (![s.startedAt, s.endedAt, s.elapsed, s.lastTick, s.inputAt].every(v => range(v, 0, Number.MAX_SAFE_INTEGER)) || !nat(s.repeats, 1e6) || ![s.safety, s.assisted, s.inputLost].every(v => typeof v === 'boolean'))
            return false;
        if (!Array.isArray(s.events) || s.events.length > 45 || new Set(s.events.map(e => e.key)).size !== s.events.length)
            return false;
        for (const e of s.events) {
            if (!nat(e.stage, 8) || !nat(e.stop, STAGES[e.stage].stops.length - 1) || !['drive', 'fire'].includes(e.kind) || !nat(e.target, e.kind === 'drive' ? 0 : STAGES[e.stage].targets[e.stop] - 1) || e.key !== `${e.stage}:${e.stop}:${e.kind}:${e.target}` || !['assisted', 'independent', 'skipped'].includes(e.outcome))
                return false;
        }
        if (![s.completed, s.skipped].every(a => Array.isArray(a) && a.length <= 9 && a.every(v => nat(v, 8)) && new Set(a).size === a.length) || s.completed.some(i => s.skipped.includes(i)))
            return false;
        for (const i of s.completed) {
            const def = STAGES[i];
            if (def.stops.some((_, j) => !s.events.some(e => e.stage === i && e.stop === j && e.kind === 'drive' && e.outcome !== 'skipped') || Array.from({ length: def.targets[j] }, (_, k) => k).some(k => !s.events.some(e => e.stage === i && e.stop === j && e.kind === 'fire' && e.target === k && e.outcome !== 'skipped'))))
                return false;
        }
        if (s.status === 'ended' && (!s.endedAt || s.endedAt < s.startedAt))
            return false;
        return true;
    }
    catch {
        return false;
    }
}
export function decode(raw: unknown): State | null { try {
    const r = raw as FireLiveSession;
    if (r?.engine !== 'fr3' || r.engineVersion !== 1 || typeof r.fr3?.payload !== 'string' || r.fr3.payload.length > 32768)
        return null;
    const s = JSON.parse(r.fr3.payload);
    return validState(s) && s.sessionId === r.sessionId ? s : null;
}
catch {
    return null;
} }
export function reviveFireLive(raw: unknown): FireLiveSession | null { const r = raw as FireLiveSession; return decode(r) && typeof r.fr3.ownerId === 'string' && r.fr3.ownerId.length > 0 && typeof r.fr3.controlTabId === 'string' && r.fr3.controlTabId.length > 0 && range(r.fr3.heartbeatAt, 0, Number.MAX_SAFE_INTEGER) && typeof r.config?.childFirstName === 'string' && r.config.childFirstName.length > 0 && r.config.childFirstName.length <= 30 && r.currentStage?.stageIndex === decode(r)!.stage && r.currentDifficulty === difficultyOf(decode(r)!.stage) && range(r.createdAt, 0, Number.MAX_SAFE_INTEGER) ? r : null; }
export function recoveredState(r: FireLiveSession): State | null { const s = decode(r); return s ? { ...s, status: s.status === 'running' ? 'paused' : s.status, safety: s.status === 'running' || s.safety, lastTick: 0, speed: 0, input: { steering: 0, throttle: 0, brake: 0, aimX: 0, aimY: 0, water: false }, inputAt: 0 } : null; }

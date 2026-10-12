import { describe, expect, it } from 'vitest';
import { createState, reduce, summary, type State } from '../engine';
import { decode, makeLive, recoveredState, revivePearlLive, validState } from '../live';
import { buildHistory, revivePearlHistory } from '../history';
import { DEFAULT_MAPPING, STANDARD_GAMEPAD_MAPPING, axisValue, emptyAxis, sampleGamepad, sanitizeMapping } from '../input';
import { PEARL_VOYAGE_REGISTRATION } from '../registration';
import { STAGES } from '../stages';

const stamp = { controlTabId: 'tab-1', heartbeatAt: 5000 };
const playing = (stage = 4) => { let s = reduce(createState('sess-1'), { type: 'stage', stage }); s = reduce(s, { type: 'start', at: 1000 }); return s; };
const ended = (mutate?: (s: State) => State) => {
    let s = reduce(createState('sess-h'), { type: 'config', patch: { autoDrive: true, autoHold: true, holdSeconds: 1 } });
    s = reduce(s, { type: 'start', at: 1000 });
    let at = 1000;
    while (s.status === 'running') { at += 50; s = reduce(s, { type: 'tick', at }); }
    s = reduce(s, { type: 'next', at: at + 10 });
    s = reduce(s, { type: 'stage', stage: 1 });
    s = reduce(s, { type: 'start', at: at + 20 });
    s = reduce(s, { type: 'skipStage' });
    s = reduce(s, { type: 'end', at: at + 40 });
    return mutate ? mutate(s) : s;
};

describe('registration', () => {
    it('registers exactly one canonical wall game', () => {
        expect(PEARL_VOYAGE_REGISTRATION).toMatchObject({ id: 'pearl-voyage-3d', nameAr: 'قارب اللؤلؤ', nameEn: 'Pearl Voyage 3D', surfaceType: 'WALL', route: '/control/pearl-voyage-3d', sensorCompatible: false });
    });
});
describe('shared live session codec', () => {
    it('round-trips a running state through the shared record shape', () => {
        const s = playing();
        const live = makeLive(s, 'uid-1', 'ليلى', stamp);
        expect(live).toMatchObject({ engine: 'pv3', engineVersion: 1, sessionId: 'sess-1', currentStage: { stageIndex: 4, stageNumber: 2 }, currentDifficulty: 'MEDIUM' });
        expect(Object.keys(live).sort()).toEqual(['config', 'createdAt', 'currentDifficulty', 'currentStage', 'engine', 'engineVersion', 'gameState', 'pv3', 'seed', 'sessionId'].sort());
        expect(decode(live)).toEqual({ ...s, lastTick: 0 });
        expect(revivePearlLive(live)).toBe(live);
        expect(live.pv3.payload.length).toBeLessThan(4000);
    });
    it('rejects malformed, oversized, mismatched or tampered records instead of guessing', () => {
        const live = makeLive(playing(), 'uid-1', 'ليلى', stamp);
        const payload = JSON.parse(live.pv3.payload);
        const bad = (patch: Record<string, unknown>) => ({ ...live, pv3: { ...live.pv3, payload: JSON.stringify({ ...payload, ...patch }) } });
        for (const patch of [{ stage: 9 }, { marker: 7 }, { hold: 1.5 }, { x: 'a' }, { speed: -1 }, { phase: 'fighting' }, { status: 'won' }, { used: ['wheel', 'wheel'] }, { config: { ...payload.config, speedCap: 99 } }, { events: [{ key: '4:0', stage: 4, marker: 0, species: 'dolphin', outcome: 'independent' }] }, { completed: [4] }, { skipped: [4] }]) {
            expect(revivePearlLive(bad(patch)), JSON.stringify(patch)).toBeNull();
        }
        expect(revivePearlLive({ ...live, engine: 'fr3' })).toBeNull();
        expect(revivePearlLive({ ...live, engineVersion: 2 })).toBeNull();
        expect(revivePearlLive({ ...live, sessionId: 'other' })).toBeNull();
        expect(revivePearlLive({ ...live, pv3: { ...live.pv3, payload: 'x'.repeat(40000) } })).toBeNull();
        expect(revivePearlLive({ ...live, pv3: { ...live.pv3, payload: '{not json' } })).toBeNull();
        expect(revivePearlLive({ ...live, currentStage: { stageNumber: 1, stageIndex: 0 } })).toBeNull();
        expect(revivePearlLive({ ...live, config: { childFirstName: '' } })).toBeNull();
        expect(revivePearlLive(null)).toBeNull();
        expect(validState(null)).toBe(false);
    });
    it('keeps the payload small even for the largest possible session', () => {
        let s = reduce(createState('big'), { type: 'start', at: 1000 });
        for (let i = 0; i < 9; i++) { s = reduce(s, { type: 'skipStage' }); if (i < 8) s = reduce(s, { type: 'next', at: 1100 }); }
        expect(JSON.stringify(s).length).toBeLessThan(8000);
        expect(revivePearlLive(makeLive(s, 'u', 'x', stamp))).not.toBeNull();
    });
    it('recovers a reloaded session paused and still: never resumes movement or hardware by itself', () => {
        let s = playing(0);
        s = reduce(s, { type: 'input', patch: { throttle: 1 }, source: 'manual', at: 1100 });
        s = reduce(s, { type: 'tick', at: 1150 });
        const live = makeLive(s, 'u', 'x', stamp);
        const r = recoveredState(live)!;
        expect(r.status).toBe('paused');
        expect(r.safety).toBe(true);
        expect(r.speed).toBe(0);
        expect(r.input).toEqual({ steering: 0, throttle: 0, brake: 0, hold: false });
        expect(r.events).toEqual(s.events);
        expect(recoveredState({ ...live, engine: 'x' } as never)).toBeNull();
    });
});
describe('versioned history', () => {
    it('builds a factual, validated history record with no clinical metrics', () => {
        const s = ended();
        const h = buildHistory(s, 'patient-1', 'uid-1');
        expect(h).toMatchObject({ gameId: 'pearl-voyage-3d', resultVersion: 1, engine: 'pv3', patientId: 'patient-1', createdByUid: 'uid-1', completedStageCount: 1, skippedStageCount: 1, fishDiscovered: 1, skippedEncounters: 2, sessionCompleted: false, participationMode: 'MANUAL' });
        expect(h.assistedEncounters + h.independentEncounters).toBe(h.fishDiscovered);
        expect(h.stageResults.map(r => r.status)).toEqual(['COMPLETED', 'SKIPPED']);
        expect('accuracy' in h).toBe(false);
        expect(revivePearlHistory(JSON.parse(JSON.stringify(h)))).toEqual(h);
        expect(summary(s).fish).toBe(h.fishDiscovered);
    });
    it('only builds from an ended, patient-bound session', () => {
        expect(() => buildHistory(playing(), 'p', 'u')).toThrow();
        expect(() => buildHistory(ended(), '', 'u')).toThrow();
    });
    it('rejects inconsistent or forged history on read', () => {
        const h = buildHistory(ended(), 'p', 'u');
        for (const patch of [{ fishDiscovered: 5 }, { sessionCompleted: true }, { resultVersion: 2 }, { engine: 'fr3' }, { participationMode: 'HAND' }, { completedStageCount: 10 }, { startingStage: 4 }, { assistedEncounters: 99 }, { stageResults: [{ ...h.stageResults[0], stageIndex: 9 }] }, { stageResults: [h.stageResults[0], h.stageResults[0]] }, { completedAt: h.startedAt - 1 }]) {
            expect(revivePearlHistory({ ...h, ...patch }), JSON.stringify(patch)).toBeNull();
        }
        expect(revivePearlHistory(null)).toBeNull();
        expect(revivePearlHistory({ ...h, gameId: 'fire-rescue-3d' })).toBeNull();
    });
    it('accepts Firebase array-as-object stage results', () => {
        const h = buildHistory(ended(), 'p', 'u');
        const asObject = { ...h, stageResults: Object.fromEntries(h.stageResults.map((r, i) => [String(i), r])) };
        expect(revivePearlHistory(asObject)?.stageResults).toHaveLength(2);
    });
    it('records mixed participation when the therapist switches control source mid-session', () => {
        const s = ended(x => ({ ...x, used: ['manual', 'wheel'] }));
        expect(buildHistory(s, 'p', 'u').participationMode).toBe('MIXED');
    });
});
describe('wheel, pedal and gamepad adapters', () => {
    const wheelMap = () => ({ ...DEFAULT_MAPPING, steering: { ...emptyAxis(), index: 0, min: -0.9, max: 0.9, center: 0.05, deadZone: 0.1 }, throttle: { ...emptyAxis(), index: 1, rest: 1, pressed: -1 }, brake: { ...emptyAxis(), index: 2, rest: -1, pressed: 1 }, holdButton: 3 });
    const pad = (axes: number[], buttons: number[] = [], connected = true) => ({ axes, buttons: buttons.map(v => ({ value: v })) as GamepadButton[], connected }) as Pick<Gamepad, 'axes' | 'buttons' | 'connected'>;
    it('applies centre, dead zone, sensitivity range and inversion', () => {
        const a = wheelMap().steering;
        expect(axisValue([0.05], a)).toBe(0);
        expect(axisValue([0.9], a)).toBeCloseTo(1, 5);
        expect(axisValue([-0.9], a)).toBeCloseTo(-1, 5);
        expect(axisValue([0.4], { ...a, inverted: true })).toBeLessThan(0);
        expect(axisValue([0.4], { ...a, index: -1 })).toBe(0);
    });
    it('maps pedals including inverted rest/pressed ranges and clamps out-of-range samples', () => {
        const m = wheelMap();
        expect(axisValue([0, 1], m.throttle, true)).toBe(0);
        expect(axisValue([0, -1], m.throttle, true)).toBe(1);
        expect(axisValue([0, 0], m.throttle, true)).toBeCloseTo(0.5, 5);
        expect(axisValue([0, 5], m.throttle, true)).toBe(0);
    });
    it('samples only the axes the chosen control needs and treats unplugged or missing devices as lost', () => {
        const m = wheelMap();
        expect(sampleGamepad(pad([0.9, -1, -1, 0]), m, 'wheel')).toMatchObject({ steering: 1, throttle: 0 });
        expect(sampleGamepad(pad([0.9, -1, 1, 0]), m, 'pedal')).toMatchObject({ steering: 0, throttle: 1, brake: 1 });
        expect(sampleGamepad(pad([0.9, -1, 1, 0], [0, 0, 0, 1]), m, 'wheel-pedal')).toMatchObject({ steering: 1, throttle: 1, brake: 1, hold: true });
        expect(sampleGamepad(pad([0.2]), m, 'wheel-pedal')).toBeNull();
        expect(sampleGamepad(pad([0.2], [], false), m, 'wheel')).toBeNull();
        expect(sampleGamepad(null, m, 'wheel')).toBeNull();
        expect(sampleGamepad(pad([0]), DEFAULT_MAPPING, 'wheel')).not.toBeNull();
    });
    it('standard gamepad preset is a valid mapping; invalid mappings are refused', () => {
        expect(sanitizeMapping(STANDARD_GAMEPAD_MAPPING)).not.toBeNull();
        expect(sanitizeMapping({ ...wheelMap(), steering: { ...wheelMap().steering, min: 1, max: 0 } })).toBeNull();
        expect(sanitizeMapping({ ...wheelMap(), freshMs: 5 })).toBeNull();
        expect(sanitizeMapping({ ...wheelMap(), deviceIndex: 99 })).toBeNull();
        expect(sanitizeMapping('x')).toBeNull();
        expect(sanitizeMapping({ ...wheelMap(), throttle: { ...emptyAxis(), index: 1, rest: 0.5, pressed: 0.5 } })).toBeNull();
    });
});
describe('stage data consistency', () => {
    it('every encounter fits in one session payload and history bounds', () => {
        expect(STAGES.reduce((a, s) => a + s.markers.length, 0)).toBe(29);
    });
});

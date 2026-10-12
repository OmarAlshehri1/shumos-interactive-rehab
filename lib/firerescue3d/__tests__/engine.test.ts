import { describe, expect, it } from 'vitest';
import { createState, reduce, summary, type State } from '../engine';
import { STAGES, targetAim } from '../stages';
import { makeLive, decode, recoveredState, validState } from '../live';
import { buildHistory, reviveFireHistory } from '../history';
import { assertFirebaseSafeValue } from '@/lib/dataIntegrity/numeric';
import { DEFAULT_MAPPING, axisValue, sampleGamepad, sanitizeMapping } from '../input';
function tick(s: State, ms = 50) { return reduce(s, { type: 'tick', at: s.lastTick + ms }); }
function runStage(index: number) { let s = reduce(createState('test'), { type: 'stage', stage: index }); s = reduce(s, { type: 'config', patch: { autoDrive: true, autoWater: true, aimAssist: 1 } }); s = reduce(s, { type: 'start', at: 1000 }); for (let i = 0; i < 10000 && s.status === 'running'; i++)
    s = tick(s); return s; }
describe('Fire Rescue — actual deterministic objectives', () => {
    it('has exactly three levels and three stages, with all stops and gradual fires playable', () => { expect(STAGES).toHaveLength(9); for (let i = 0; i < 9; i++) {
        expect(STAGES[i].level).toBe(Math.floor(i / 3) + 1);
        const s = runStage(i);
        expect(s.status, STAGES[i].nameEn).toBe('stage-complete');
        expect(s.completed).toEqual([i]);
        expect(summary(s).driving).toBe(STAGES[i].stops.length);
        expect(summary(s).fires).toBe(STAGES[i].targets.reduce((a, b) => a + b, 0));
        expect(validState(s)).toBe(true);
    } });
    it('manual steering changes the path and brakes reduce speed', () => { let s = reduce(createState('manual'), { type: 'config', patch: { mode: 'manual', steeringAssist: 0 } }); s = reduce(s, { type: 'start', at: 1000 }); for (let i = 0; i < 30; i++) {
        s = reduce(s, { type: 'input', patch: { throttle: 1, steering: 0.4 }, source: 'manual', at: s.lastTick });
        s = tick(s);
    } expect(s.distance).toBeGreaterThan(1); expect(s.lateral).toBeGreaterThan(0.1); const speed = s.speed; s = reduce(s, { type: 'input', patch: { throttle: 0, brake: 1 }, source: 'manual', at: s.lastTick }); for (let i = 0; i < 5; i++)
        s = tick(s); expect(s.speed).toBeLessThan(speed); expect(s.assisted).toBe(true); });
    it('a missed water stream has no effect, and aimed water takes multiple ticks', () => { let s = reduce(createState('water'), { type: 'config', patch: { aimAssist: 0 } }); s = reduce(s, { type: 'start', at: 1000 }); s = reduce(s, { type: 'skipObjective' }); s = { ...s, aim: { x: 1, y: -1 } }; s = reduce(s, { type: 'input', patch: { water: true }, source: 'manual', at: s.lastTick }); for (let i = 0; i < 5; i++)
        s = tick(s); expect(s.fires).toEqual([1]); s = { ...s, aim: targetAim(0, 1) }; s = reduce(s, { type: 'input', patch: { water: true }, source: 'manual', at: s.lastTick }); s = tick(s); expect(s.fires[0]).toBeLessThan(1); expect(s.fires[0]).toBeGreaterThan(0.9); expect(s.status).toBe('running'); });
    it('pause freezes state; stop disables movement even with automatic assistance; resume is explicit', () => { let s = reduce(createState('pause'), { type: 'config', patch: { autoDrive: true } }); s = reduce(s, { type: 'start', at: 1000 }); s = tick(s); s = reduce(s, { type: 'stop' }); expect(s.status).toBe('paused'); expect(tick(s)).toBe(s); s = reduce(s, { type: 'resume', at: 2000 }); expect(tick(s).distance).toBeGreaterThan(s.distance); });
    it('clamps road boundaries and safely stops without crashes', () => { let s = reduce(createState('edge'), { type: 'config', patch: { mode: 'manual', steeringAssist: 0 } }); s = reduce(s, { type: 'start', at: 1000 }); for (let i = 0; i < 1200 && s.status === 'running'; i++) {
        s = reduce(s, { type: 'input', patch: { throttle: 1, steering: 1 }, source: 'manual', at: s.lastTick });
        s = tick(s);
    } expect(Math.abs(s.lateral)).toBeLessThanOrEqual(4.3); expect(s.speed).toBeLessThan(0.2); expect(s.status).toBe('paused'); s = reduce(s, { type: 'reset' }); expect(s.lateral).toBe(0); expect(s.assisted).toBe(true); });
    it('skips are not completions and restart/repeat do not inflate counts', () => { let s = runStage(0); s = reduce(s, { type: 'restart' }); expect(s.events).toEqual([]); expect(s.completed).toEqual([]); s = reduce(s, { type: 'start', at: 5000 }); s = reduce(s, { type: 'skipObjective' }); s = reduce(s, { type: 'skipObjective' }); expect(s.skipped).toEqual([0]); expect(s.completed).toEqual([]); expect(summary(s).skipped).toBe(2); s = reduce(s, { type: 'restart' }); s = reduce(s, { type: 'start', at: 6000 }); s = reduce(s, { type: 'skipObjective' }); s = reduce(s, { type: 'repeat' }); expect(s.fires).toEqual([1]); expect(summary(s).skipped).toBe(1); });
    it('selected sources cannot conflict; manual override wins and lost sources pause', () => { let s = reduce(createState('source'), { type: 'config', patch: { source: 'wheel' } }); s = reduce(s, { type: 'start', at: 1000 }); expect(reduce(s, { type: 'input', patch: { throttle: 1 }, source: 'gamepad', at: 1000 })).toBe(s); s = reduce(s, { type: 'input', patch: { throttle: 1 }, source: 'manual', at: 1000 }); expect(s.config.source).toBe('manual'); s = reduce(s, { type: 'config', patch: { source: 'wheel' } }); expect(tick(s).status).toBe('paused'); });
    it('hidden-tab time gaps pause rather than jump the vehicle', () => { let s = reduce(createState('gap'), { type: 'start', at: 1000 }); s = reduce(s, { type: 'tick', at: 10000 }); expect(s.status).toBe('paused'); expect(s.distance).toBe(0); });
});
describe('Fire Rescue serialization, history and devices', () => {
    it('round trips and reloads to a safe pause, rejecting invalid payloads', () => { let s = reduce(createState('wire'), { type: 'start', at: 1000 }); const r = makeLive(s, 'staff', 'ليلى', { controlTabId: 'tab', heartbeatAt: 1000 }); expect(decode(r)?.sessionId).toBe(s.sessionId); expect(recoveredState(r)?.status).toBe('paused'); for (const field of ['fires', 'aim', 'events', 'completed']) {
        const bad = { ...s, [field]: null };
        expect(decode({ ...r, fr3: { ...r.fr3, payload: JSON.stringify(bad) } })).toBeNull();
    } s = { ...s, lateral: 100 }; expect(validState(s)).toBe(false); });
    it('omits undefined publisher fields and supports partial ended history', () => { const s = createState('partial'); expect(() => assertFirebaseSafeValue(makeLive(s, 'uid', 'طفل', { controlTabId: 'tab', heartbeatAt: 1000, takeoverFrom: undefined }))).not.toThrow(); let n = reduce(s, { type: 'start', at: 1000 }); n = reduce(n, { type: 'skipObjective' }); n = reduce(n, { type: 'end', at: 2000 }); const h = buildHistory(n, 'p', 'u'); expect(h.stageResults[0].status).toBe('PARTIAL'); expect(reviveFireHistory(h)).not.toBeNull(); });
    it('rejects fraudulent completed stages and nonfinite config', () => { const s = createState('bad'); expect(validState({ ...s, completed: [0] })).toBe(false); expect(validState({ ...s, config: { ...s.config, speedCap: 100 } })).toBe(false); });
    it('builds versioned history without clinical metrics or skip inflation', () => { let s = createState('history'); s = reduce(s, { type: 'config', patch: { autoDrive: true, autoWater: true, aimAssist: 1 } }); for (let i = 0; i < 9; i++) {
        s = reduce(s, { type: 'start', at: 1000 + s.elapsed });
        for (let j = 0; j < 10000 && s.status === 'running'; j++)
            s = tick(s);
        if (i < 8)
            s = reduce(s, { type: 'next', at: s.lastTick });
    } s = reduce(s, { type: 'end', at: 1000 + s.elapsed }); const h = buildHistory(s, 'patient', 'staff'); expect(h.completedStageCount).toBe(9); expect(h.sessionCompleted).toBe(true); expect(h.drivingObjectives).toBe(12); expect(h.fireTargetsExtinguished).toBe(18); expect(h.assistedObjectives).toBe(30); expect(h.independentObjectives).toBe(0); expect(reviveFireHistory(h)).not.toBeNull(); expect(reviveFireHistory({ ...h, assistedObjectives: 31 })).toBeNull(); expect(h).not.toHaveProperty('accuracy'); });
    it('calibrates separate and combined pedal ranges without hardcoded indices', () => { const a = { ...DEFAULT_MAPPING.steering, index: 3, rest: 1, pressed: -1 }; expect(axisValue([0, 0, 0, 1], a, true)).toBe(0); expect(axisValue([0, 0, 0, -1], a, true)).toBe(1); expect(axisValue([0, 0, 0, 0.05], a)).toBe(0); expect(sampleGamepad(null, DEFAULT_MAPPING)).toBeNull(); expect(sanitizeMapping({ ...DEFAULT_MAPPING, steering: { ...a, center: 1 } })).toBeNull(); });
});

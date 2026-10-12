import { STAGES, roadHeading, targetAim } from './stages';
export type Source = 'manual' | 'gamepad' | 'wheel' | 'hand';
export type Mode = 'manual' | 'assisted' | 'auto-throttle' | 'therapist-throttle' | 'steering-only' | 'pedal-only';
export interface Config {
    mode: Mode;
    source: Source;
    autoDrive: boolean;
    autoWater: boolean;
    steeringAssist: number;
    aimAssist: number;
    sensitivity: number;
    steeringRange: number;
    deadZone: number;
    pedalThreshold: number;
    aimSensitivity: number;
    speedCap: number;
    therapistThrottle: number;
    reducedMotion: boolean;
    highContrast: boolean;
    quality: 'high' | 'low';
    sound: boolean;
    volume: number;
}
export const DEFAULT_CONFIG: Config = { mode: 'assisted', source: 'manual', autoDrive: false, autoWater: false, steeringAssist: 0.8, aimAssist: 0.5, sensitivity: 1, steeringRange: 1, deadZone: 0.1, pedalThreshold: 0.1, aimSensitivity: 1, speedCap: 4, therapistThrottle: 0, reducedMotion: false, highContrast: false, quality: 'high', sound: false, volume: 0.35 };
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const number = (v: unknown, lo: number, hi: number, fallback: number) => typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : fallback;
export function sanitizeConfig(c: Partial<Config>): Config {
    const d = DEFAULT_CONFIG;
    return { mode: ['manual', 'assisted', 'auto-throttle', 'therapist-throttle', 'steering-only', 'pedal-only'].includes(c.mode ?? '') ? c.mode! : d.mode, source: ['manual', 'gamepad', 'wheel', 'hand'].includes(c.source ?? '') ? c.source! : d.source,
        autoDrive: typeof c.autoDrive === 'boolean' ? c.autoDrive : d.autoDrive, autoWater: typeof c.autoWater === 'boolean' ? c.autoWater : d.autoWater,
        steeringAssist: number(c.steeringAssist, 0, 1, d.steeringAssist), aimAssist: number(c.aimAssist, 0, 1, d.aimAssist), sensitivity: number(c.sensitivity, 0.2, 3, d.sensitivity), steeringRange: number(c.steeringRange, 0.1, 1, d.steeringRange), deadZone: number(c.deadZone, 0, 0.8, d.deadZone), pedalThreshold: number(c.pedalThreshold, 0, 0.8, d.pedalThreshold), aimSensitivity: number(c.aimSensitivity, 0.2, 3, d.aimSensitivity), speedCap: number(c.speedCap, 1, 7, d.speedCap), therapistThrottle: number(c.therapistThrottle, 0, 1, d.therapistThrottle), reducedMotion: typeof c.reducedMotion === 'boolean' ? c.reducedMotion : d.reducedMotion, highContrast: typeof c.highContrast === 'boolean' ? c.highContrast : d.highContrast, quality: c.quality === 'low' ? 'low' : 'high', sound: typeof c.sound === 'boolean' ? c.sound : d.sound, volume: number(c.volume, 0, 1, d.volume) };
}
export interface Input {
    steering: number;
    throttle: number;
    brake: number;
    aimX: number;
    aimY: number;
    water: boolean;
}
export const NEUTRAL: Input = { steering: 0, throttle: 0, brake: 0, aimX: 0, aimY: 0, water: false };
export interface Objective {
    key: string;
    stage: number;
    stop: number;
    kind: 'drive' | 'fire';
    target: number;
    outcome: 'assisted' | 'independent' | 'skipped';
}
export interface State {
    sessionId: string;
    run: number;
    stage: number;
    startingStage: number;
    status: 'ready' | 'running' | 'paused' | 'stage-complete' | 'ended';
    phase: 'driving' | 'firefighting';
    stop: number;
    distance: number;
    lateral: number;
    heading: number;
    speed: number;
    steering: number;
    aim: {
        x: number;
        y: number;
    };
    fires: number[];
    input: Input;
    config: Config;
    events: Objective[];
    completed: number[];
    skipped: number[];
    assisted: boolean;
    startedAt: number;
    endedAt: number;
    elapsed: number;
    lastTick: number;
    safety: boolean;
    inputAt: number;
    inputLost: boolean;
    repeats: number;
}
export function createState(sessionId: string): State { return { sessionId, run: 0, stage: 0, startingStage: 0, status: 'ready', phase: 'driving', stop: 0, distance: 0, lateral: 0, heading: 0, speed: 0, steering: 0, aim: { x: 0, y: 0 }, fires: [1], input: { ...NEUTRAL }, config: { ...DEFAULT_CONFIG }, events: [], completed: [], skipped: [], assisted: false, startedAt: 0, endedAt: 0, elapsed: 0, lastTick: 0, safety: false, inputAt: 0, inputLost: false, repeats: 0 }; }
export type Command = {
    type: 'start' | 'resume' | 'end' | 'next';
    at: number;
} | {
    type: 'tick';
    at: number;
} | {
    type: 'pause' | 'safety' | 'stop' | 'reset' | 'restart' | 'skipObjective' | 'skipStage' | 'repeat' | 'assist';
} | {
    type: 'stage';
    stage: number;
} | {
    type: 'new';
    sessionId: string;
} | {
    type: 'config';
    patch: Partial<Config>;
} | {
    type: 'input';
    patch: Partial<Input>;
    source: Source;
    at: number;
};
function prepare(s: State, stage: number): State { return { ...s, stage, status: 'ready', phase: 'driving', stop: 0, distance: 0, lateral: 0, heading: 0, speed: 0, steering: 0, aim: { x: 0, y: 0 }, fires: Array(STAGES[stage].targets[0]).fill(1), input: { ...NEUTRAL }, assisted: false, lastTick: 0, safety: false, inputLost: false }; }
function record(s: State, kind: Objective['kind'], target: number, skipped = false): State {
    const key = `${s.stage}:${s.stop}:${kind}:${target}`;
    const ev: Objective = { key, stage: s.stage, stop: s.stop, kind, target, outcome: skipped ? 'skipped' : s.assisted ? 'assisted' : 'independent' };
    return { ...s, events: [...s.events.filter(e => e.key !== key), ev] };
}
function finishStop(s: State): State {
    const d = STAGES[s.stage];
    if (s.stop + 1 < d.stops.length)
        return { ...s, phase: 'driving', stop: s.stop + 1, fires: Array(d.targets[s.stop + 1]).fill(1), input: { ...NEUTRAL }, aim: { x: 0, y: 0 }, assisted: false };
    const skip = s.events.some(e => e.stage === s.stage && e.outcome === 'skipped');
    return { ...s, status: 'stage-complete', speed: 0, input: { ...NEUTRAL }, completed: skip ? s.completed : [...new Set([...s.completed, s.stage])], skipped: skip ? [...new Set([...s.skipped, s.stage])] : s.skipped };
}
function enterFire(s: State): State { return { ...s, phase: 'firefighting', speed: 0, lateral: 0, heading: 0, input: { ...NEUTRAL }, aim: { x: 0, y: 0 }, assisted: false }; }
export function reduce(s: State, c: Command): State {
    if (c.type === 'new' && s.status === 'ended')
        return { ...createState(c.sessionId), config: { ...s.config, source: 'manual', autoDrive: false, autoWater: false, therapistThrottle: 0 } };
    if (c.type === 'config')
        return { ...s, config: sanitizeConfig({ ...s.config, ...c.patch }), input: { ...NEUTRAL }, inputAt: 0 };
    if (c.type === 'end')
        return s.status === 'ended' ? s : { ...s, status: 'ended', endedAt: c.at, speed: 0, input: { ...NEUTRAL }, lastTick: 0 };
    if (s.status === 'ended')
        return s;
    if (c.type === 'stage' && Number.isInteger(c.stage) && c.stage >= 0 && c.stage < 9 && s.status !== 'running')
        return prepare({ ...s, startingStage: s.startedAt ? s.startingStage : c.stage, events: s.events.filter(e => e.stage !== c.stage), completed: s.completed.filter(i => i !== c.stage), skipped: s.skipped.filter(i => i !== c.stage) }, c.stage);
    if (c.type === 'restart')
        return prepare({ ...s, events: s.events.filter(e => e.stage !== s.stage), completed: s.completed.filter(i => i !== s.stage), skipped: s.skipped.filter(i => i !== s.stage), repeats: s.repeats + 1 }, s.stage);
    if (c.type === 'next' && s.status === 'stage-complete')
        return s.stage === 8 ? reduce(s, { type: 'end', at: c.at }) : prepare(s, s.stage + 1);
    if (c.type === 'start' && s.status === 'ready' || c.type === 'resume' && s.status === 'paused')
        return { ...s, status: 'running', startedAt: s.startedAt || c.at, lastTick: c.at, safety: false, inputLost: false, input: { ...NEUTRAL }, inputAt: c.at };
    if (c.type === 'pause' || c.type === 'safety')
        return s.status === 'running' ? { ...s, status: 'paused', speed: 0, input: { ...NEUTRAL }, safety: c.type === 'safety', lastTick: 0 } : s;
    if (c.type === 'stop')
        return { ...s, status: s.status === 'running' ? 'paused' : s.status, speed: 0, input: { ...NEUTRAL }, lastTick: 0 };
    if (c.type === 'reset')
        return { ...s, lateral: 0, heading: 0, speed: 0, input: { ...NEUTRAL }, assisted: true, safety: false };
    if (c.type === 'assist')
        return { ...s, assisted: true, config: { ...s.config, autoDrive: s.phase === 'driving' ? true : s.config.autoDrive, steeringAssist: 1, aimAssist: 1, autoWater: s.phase === 'firefighting' ? true : s.config.autoWater } };
    if (c.type === 'repeat' && (s.status === 'running' || s.status === 'paused')) {
        const filtered = s.events.filter(e => !(e.stage === s.stage && e.stop === s.stop && (s.phase === 'driving' || e.kind === 'fire')));
        return { ...s, events: filtered, distance: s.phase === 'driving' ? (s.stop === 0 ? 0 : STAGES[s.stage].stops[s.stop - 1]) : s.distance, fires: Array(STAGES[s.stage].targets[s.stop]).fill(1), speed: 0, input: { ...NEUTRAL }, aim: { x: 0, y: 0 }, assisted: false, repeats: s.repeats + 1 };
    }
    if (c.type === 'skipStage') {
        let n = s;
        const def = STAGES[s.stage];
        for (let j = 0; j < def.stops.length; j++) {
            n = { ...n, stop: j };
            if (!n.events.some(e => e.stage === s.stage && e.stop === j && e.kind === 'drive'))
                n = record(n, 'drive', 0, true);
            for (let k = 0; k < def.targets[j]; k++)
                if (!n.events.some(e => e.stage === s.stage && e.stop === j && e.kind === 'fire' && e.target === k))
                    n = record(n, 'fire', k, true);
        }
        return { ...n, stop: s.stop, status: 'stage-complete', speed: 0, input: { ...NEUTRAL }, completed: s.completed.filter(i => i !== s.stage), skipped: [...new Set([...s.skipped, s.stage])] };
    }
    if (c.type === 'skipObjective' && (s.status === 'running' || s.status === 'paused')) {
        if (s.phase === 'driving')
            return enterFire(record({ ...s, distance: STAGES[s.stage].stops[s.stop] }, 'drive', 0, true));
        const target = s.fires.findIndex(v => v > 0);
        if (target < 0)
            return s;
        const next = record({ ...s, fires: s.fires.map((v, i) => i === target ? 0 : v) }, 'fire', target, true);
        return next.fires.every(v => v === 0) ? finishStop(next) : next;
    }
    if (c.type === 'input' && s.status === 'running') {
        if (c.source !== 'manual' && c.source !== s.config.source)
            return s;
        const p = c.patch;
        return { ...s, input: { steering: number(p.steering, -1, 1, s.input.steering), throttle: number(p.throttle, 0, 1, s.input.throttle), brake: number(p.brake, 0, 1, s.input.brake), aimX: number(p.aimX, -1, 1, s.input.aimX), aimY: number(p.aimY, -1, 1, s.input.aimY), water: typeof p.water === 'boolean' ? p.water : s.input.water }, config: c.source === 'manual' ? { ...s.config, source: 'manual' } : s.config, assisted: s.assisted || c.source === 'manual', inputAt: c.at };
    }
    if (c.type !== 'tick' || s.status !== 'running' || !Number.isFinite(c.at) || c.at <= s.lastTick)
        return s;
    const dt = Math.min(0.1, (c.at - s.lastTick) / 1000);
    if (c.at - s.lastTick > 1500)
        return { ...reduce(s, { type: 'safety' }), inputLost: true };
    if (s.config.source !== 'manual' && c.at - s.inputAt > 500)
        return { ...reduce(s, { type: 'safety' }), inputLost: true };
    let n = { ...s, lastTick: c.at, elapsed: s.elapsed + dt * 1000 };
    const cfg = s.config, inp = s.input;
    // Therapist holds expire if pointer-up is lost. Automated assistance remains explicitly configured.
    const fresh = c.at - s.inputAt < 400;
    const safeInput = fresh ? inp : NEUTRAL;
    if (!fresh)
        n = { ...n, input: { ...NEUTRAL } };
    if (s.phase === 'driving') {
        const dead = Math.abs(safeInput.steering) < cfg.deadZone ? 0 : safeInput.steering;
        const steering = cfg.mode === 'pedal-only' ? 0 : clamp(dead * cfg.sensitivity / cfg.steeringRange, -1, 1);
        const assist = cfg.autoDrive || cfg.mode === 'pedal-only' ? 1 : cfg.mode === 'manual' ? 0 : cfg.steeringAssist;
        const auto = cfg.autoDrive || cfg.mode === 'auto-throttle' || cfg.mode === 'steering-only';
        const throttle = auto ? 0.6 : cfg.mode === 'therapist-throttle' ? cfg.therapistThrottle : cfg.mode === 'pedal-only' ? (safeInput.throttle > 0 && safeInput.throttle >= cfg.pedalThreshold ? 0.65 : 0) : safeInput.throttle >= cfg.pedalThreshold ? safeInput.throttle : 0;
        const remaining = STAGES[s.stage].stops[s.stop] - s.distance;
        const speedLimit = Math.min(cfg.speedCap, STAGES[s.stage].speed, Math.max(0.6, remaining * 0.9));
        const off = Math.abs(s.lateral) > 3.4;
        let speed = clamp(s.speed + (throttle * 2.5 - safeInput.brake * 7 - 0.65) * dt, 0, speedLimit);
        if (off)
            speed = Math.max(0, speed - 4 * dt);
        const curvature = roadHeading(s.stage, s.distance + speed * dt) - roadHeading(s.stage, s.distance);
        const desired = -s.lateral * 0.12;
        const heading = clamp(s.heading + (steering * (0.65 / (1 + speed * 0.15)) + (desired - s.heading) * assist * 2) * (speed / (speed + 1)) * dt - curvature, -0.7, 0.7);
        const lateral = clamp(s.lateral + Math.sin(heading) * speed * dt, -4.3, 4.3);
        const distance = Math.min(STAGES[s.stage].stops[s.stop], s.distance + Math.cos(heading) * speed * dt);
        n = { ...n, speed, steering, lateral, heading, distance, assisted: s.assisted || assist > 0 || auto || cfg.mode === 'therapist-throttle' };
        if (Math.abs(lateral) >= 4.2 && speed < 0.2)
            return { ...reduce(n, { type: 'safety' }), safety: true };
        if (remaining < 0.3 || distance >= STAGES[s.stage].stops[s.stop] - 0.25)
            return enterFire(record({ ...n, distance: STAGES[s.stage].stops[s.stop] }, 'drive', 0));
        return n;
    }
    const target = s.fires.findIndex(v => v > 0);
    if (target < 0)
        return finishStop(n);
    const t = targetAim(target, s.fires.length);
    const aim = { x: clamp(s.aim.x + safeInput.aimX * cfg.aimSensitivity * dt * 0.7, -1, 1), y: clamp(s.aim.y + safeInput.aimY * cfg.aimSensitivity * dt * 0.7, -1, 1) };
    if (cfg.aimAssist > 0 && Math.hypot(aim.x - t.x, aim.y - t.y) < 0.25 + cfg.aimAssist * 1.1) {
        aim.x += (t.x - aim.x) * cfg.aimAssist * dt * 2;
        aim.y += (t.y - aim.y) * cfg.aimAssist * dt * 2;
    }
    n = { ...n, aim, assisted: s.assisted || cfg.autoWater || cfg.aimAssist > 0 };
    if (!(cfg.autoWater || safeInput.water))
        return n;
    const hit = s.fires.findIndex((v, i) => v > 0 && (!STAGES[s.stage].sequential || i === target) && Math.hypot(aim.x - targetAim(i, s.fires.length).x, aim.y - t.y) < 0.27);
    if (hit < 0)
        return n;
    const fires = s.fires.map((v, i) => i === hit ? Math.max(0, v - dt * 0.25) : v);
    n = { ...n, fires };
    if (fires[hit] === 0)
        n = record(n, 'fire', hit);
    return fires.every(v => v === 0) ? finishStop(n) : n;
}
export function summary(s: State) { const done = s.events.filter(e => e.outcome !== 'skipped'); return { driving: done.filter(e => e.kind === 'drive').length, fires: done.filter(e => e.kind === 'fire').length, assisted: done.filter(e => e.outcome === 'assisted').length, independent: done.filter(e => e.outcome === 'independent').length, skipped: s.events.filter(e => e.outcome === 'skipped').length, sessionCompleted: s.completed.length === 9 }; }

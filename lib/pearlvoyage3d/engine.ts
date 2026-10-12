import { ISLAND_MARGIN, STAGES, WORLD_BOUND, WORLD_CENTER_Y, type SpeciesId } from './stages';

/**
 * Pearl Voyage 3D deterministic engine. Pure reducer: no clocks, no randomness, no DOM.
 * Boat physics, marker arrival, the hold-and-release encounter and the collection all live here;
 * the renderer only draws `State` and the control hook only feeds it commands and ticks.
 *
 * Safety contract: there is no timer failure, no penalty, no crash and no sinking. Islands and the world
 * edge only steer the boat gently away. Accumulated hold progress is never lost.
 */
export type Control = 'manual' | 'wheel' | 'pedal' | 'wheel-pedal';
export type Mode = 'combined' | 'steering-only' | 'pedal-only';
export type HoldMode = 'manual' | 'steering' | 'pedal' | 'tap';
export type HoldDirection = 'left' | 'right' | 'any';
export type Quality = 'high' | 'medium' | 'low';
export type Source = 'manual' | 'wheel' | 'gamepad';

export interface Config {
    control: Control;
    mode: Mode;
    autoDrive: boolean;
    steeringAssist: number;
    sensitivity: number;
    steeringRange: number;
    deadZone: number;
    pedalThreshold: number;
    speedCap: number;
    markerRadius: number;
    holdSeconds: number;
    holdThreshold: number;
    holdMode: HoldMode;
    holdDirection: HoldDirection;
    tapCount: number;
    autoHold: boolean;
    reducedMotion: boolean;
    highContrast: boolean;
    quality: Quality;
    sound: boolean;
    music: boolean;
    voice: boolean;
    volume: number;
}
export const DEFAULT_CONFIG: Config = {
    control: 'manual', mode: 'combined', autoDrive: false, steeringAssist: 0.6, sensitivity: 1, steeringRange: 1, deadZone: 0.08, pedalThreshold: 0.15, speedCap: 4,
    markerRadius: 8, holdSeconds: 3, holdThreshold: 0.35, holdMode: 'manual', holdDirection: 'any', tapCount: 4, autoHold: false,
    reducedMotion: false, highContrast: false, quality: 'high', sound: false, music: true, voice: false, volume: 0.4,
};
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown, lo: number, hi: number, fallback: number) => typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : fallback;
const bool = (v: unknown, fallback: boolean) => typeof v === 'boolean' ? v : fallback;
const pick = <T extends string>(v: unknown, options: readonly T[], fallback: T): T => options.includes(v as T) ? v as T : fallback;
export function sanitizeConfig(c: Partial<Config>): Config {
    const d = DEFAULT_CONFIG;
    return {
        control: pick(c.control, ['manual', 'wheel', 'pedal', 'wheel-pedal'], d.control), mode: pick(c.mode, ['combined', 'steering-only', 'pedal-only'], d.mode), autoDrive: bool(c.autoDrive, d.autoDrive),
        steeringAssist: num(c.steeringAssist, 0, 1, d.steeringAssist), sensitivity: num(c.sensitivity, 0.2, 3, d.sensitivity), steeringRange: num(c.steeringRange, 0.1, 1, d.steeringRange), deadZone: num(c.deadZone, 0, 0.8, d.deadZone),
        pedalThreshold: num(c.pedalThreshold, 0, 0.8, d.pedalThreshold), speedCap: num(c.speedCap, 1, 6, d.speedCap), markerRadius: num(c.markerRadius, 5, 14, d.markerRadius), holdSeconds: num(c.holdSeconds, 1, 10, d.holdSeconds),
        holdThreshold: num(c.holdThreshold, 0.1, 0.9, d.holdThreshold), holdMode: pick(c.holdMode, ['manual', 'steering', 'pedal', 'tap'], d.holdMode), holdDirection: pick(c.holdDirection, ['left', 'right', 'any'], d.holdDirection),
        tapCount: Math.round(num(c.tapCount, 2, 8, d.tapCount)), autoHold: bool(c.autoHold, d.autoHold), reducedMotion: bool(c.reducedMotion, d.reducedMotion), highContrast: bool(c.highContrast, d.highContrast),
        quality: pick(c.quality, ['high', 'medium', 'low'], d.quality), sound: bool(c.sound, d.sound), music: bool(c.music, d.music), voice: bool(c.voice, d.voice), volume: num(c.volume, 0, 1, d.volume),
    };
}
export interface Input {
    steering: number;
    throttle: number;
    brake: number;
    hold: boolean;
}
export const NEUTRAL: Input = { steering: 0, throttle: 0, brake: 0, hold: false };
export interface Encounter {
    key: string;
    stage: number;
    marker: number;
    species: SpeciesId;
    outcome: 'assisted' | 'independent' | 'skipped';
}
export type Phase = 'sailing' | 'encounter' | 'celebrate';
export type Status = 'ready' | 'running' | 'paused' | 'stage-complete' | 'ended';
export const USED_KEYS = ['manual', 'wheel', 'pedal', 'wheel-pedal'] as const;
export interface State {
    sessionId: string;
    run: number;
    stage: number;
    startingStage: number;
    status: Status;
    phase: Phase;
    marker: number;
    x: number;
    y: number;
    heading: number;
    speed: number;
    steering: number;
    hold: number;
    holding: boolean;
    pulseAt: number;
    encounterMs: number;
    celebrateMs: number;
    input: Input;
    config: Config;
    events: Encounter[];
    completed: number[];
    skipped: number[];
    used: Control[];
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
/** fish appear this long after arrival, giving the ocean time to glow before the hold can begin */
export const ENCOUNTER_INTRO_MS = 1800;
export const CELEBRATE_MS = 2800;
export const STANDOFF = 5.5;
export const TAP_GAP_MS = 350;
const FRESH_MS = 400;

const origin = (stage: number) => ({ x: STAGES[stage].start.x, y: STAGES[stage].start.y, heading: STAGES[stage].start.heading });
export function createState(sessionId: string): State {
    const o = origin(0);
    return {
        sessionId, run: 0, stage: 0, startingStage: 0, status: 'ready', phase: 'sailing', marker: 0, x: o.x, y: o.y, heading: o.heading, speed: 0, steering: 0, hold: 0, holding: false, pulseAt: 0, encounterMs: 0, celebrateMs: 0,
        input: { ...NEUTRAL }, config: { ...DEFAULT_CONFIG }, events: [], completed: [], skipped: [], used: [], assisted: false, startedAt: 0, endedAt: 0, elapsed: 0, lastTick: 0, safety: false, inputAt: 0, inputLost: false, repeats: 0,
    };
}
export type Command = { type: 'start' | 'resume' | 'end' | 'next'; at: number } | { type: 'tick'; at: number }
    | { type: 'pause' | 'safety' | 'stop' | 'reset' | 'restart' | 'skipObjective' | 'skipStage' | 'repeat' | 'assist' }
    | { type: 'stage'; stage: number } | { type: 'marker'; index: number } | { type: 'new'; sessionId: string }
    | { type: 'config'; patch: Partial<Config> } | { type: 'input'; patch: Partial<Input>; source: Source; at: number };

export const wrapPi = (a: number) => { let v = a; while (v > Math.PI) v -= Math.PI * 2; while (v < -Math.PI) v += Math.PI * 2; return v; };
export const currentMarker = (s: Pick<State, 'stage' | 'marker'>) => STAGES[s.stage].markers[s.marker];
export const bearingTo = (s: Pick<State, 'x' | 'y'>, t: { x: number; y: number }) => Math.atan2(t.x - s.x, t.y - s.y);
export const distanceTo = (s: Pick<State, 'x' | 'y'>, t: { x: number; y: number }) => Math.hypot(t.x - s.x, t.y - s.y);
const encounterKey = (stage: number, marker: number) => `${stage}:${marker}`;
const eventOf = (s: State, stage: number, marker: number) => s.events.find(e => e.key === encounterKey(stage, marker));
const withoutEvent = (events: Encounter[], stage: number, marker: number) => events.filter(e => e.key !== encounterKey(stage, marker));

/** the position the boat eases to while a fish encounter plays: a short stand-off in front of the marker */
export function standoffPoint(from: { x: number; y: number }, marker: { x: number; y: number }) {
    const d = Math.hypot(from.x - marker.x, from.y - marker.y) || 1;
    return { x: marker.x + (from.x - marker.x) / d * STANDOFF, y: marker.y + (from.y - marker.y) / d * STANDOFF };
}
function recordEvent(s: State, outcome: Encounter['outcome']): State {
    const def = currentMarker(s);
    const key = encounterKey(s.stage, s.marker);
    const ev: Encounter = { key, stage: s.stage, marker: s.marker, species: def.species, outcome };
    return { ...s, events: [...s.events.filter(e => e.key !== key), ev] };
}
function prepare(s: State, stage: number): State {
    const o = origin(stage);
    return { ...s, stage, status: 'ready', phase: 'sailing', marker: 0, x: o.x, y: o.y, heading: o.heading, speed: 0, steering: 0, hold: 0, holding: false, pulseAt: 0, encounterMs: 0, celebrateMs: 0, input: { ...NEUTRAL }, assisted: false, lastTick: 0, safety: false, inputLost: false };
}
function resolved(s: State, stage: number) { return STAGES[stage].markers.every((_, i) => !!eventOf(s, stage, i)); }
/** moves on after an encounter was collected or skipped: next unresolved marker, or the stage summary */
function advance(s: State): State {
    const markers = STAGES[s.stage].markers;
    const next = markers.findIndex((_, i) => i > s.marker && !eventOf(s, s.stage, i));
    const any = next >= 0 ? next : markers.findIndex((_, i) => !eventOf(s, s.stage, i));
    if (any < 0) {
        const skip = s.events.some(e => e.stage === s.stage && e.outcome === 'skipped');
        return { ...s, status: 'stage-complete', phase: 'sailing', speed: 0, hold: 0, holding: false, input: { ...NEUTRAL }, celebrateMs: 0, encounterMs: 0, completed: skip ? s.completed.filter(i => i !== s.stage) : [...new Set([...s.completed, s.stage])], skipped: skip ? [...new Set([...s.skipped, s.stage])] : s.skipped.filter(i => i !== s.stage) };
    }
    return { ...s, marker: any, phase: 'sailing', hold: 0, holding: false, pulseAt: 0, encounterMs: 0, celebrateMs: 0, assisted: false, input: { ...NEUTRAL } };
}
const markUsed = (s: State): State => s.used.includes(s.config.control) ? s : { ...s, used: [...s.used, s.config.control] };

/** the activation signal for the hold interaction; the therapist's manual hold button always counts */
export function holdActive(cfg: Config, inp: Input): boolean {
    if (inp.hold) return true;
    if (cfg.holdMode === 'pedal') return inp.throttle >= Math.max(0.05, cfg.holdThreshold);
    if (cfg.holdMode === 'steering') {
        const a = inp.steering / cfg.steeringRange;
        const dir = cfg.holdDirection;
        return dir === 'left' ? a <= -cfg.holdThreshold : dir === 'right' ? a >= cfg.holdThreshold : Math.abs(a) >= cfg.holdThreshold;
    }
    if (cfg.holdMode === 'tap') return inp.throttle >= Math.max(0.05, cfg.holdThreshold) || Math.abs(inp.steering / cfg.steeringRange) >= cfg.holdThreshold;
    return false;
}

export function reduce(s: State, c: Command): State {
    if (c.type === 'new' && s.status === 'ended') return { ...createState(c.sessionId), config: { ...s.config, control: 'manual', autoDrive: false, autoHold: false } };
    if (c.type === 'config') { const next = { ...s, config: sanitizeConfig({ ...s.config, ...c.patch }), holding: false, input: { ...NEUTRAL }, inputAt: 0 }; return s.status === 'running' ? markUsed(next) : next; }
    if (c.type === 'end') return s.status === 'ended' ? s : { ...s, status: 'ended', endedAt: c.at, speed: 0, holding: false, input: { ...NEUTRAL }, lastTick: 0 };
    if (s.status === 'ended') return s;
    if (c.type === 'stage' && Number.isInteger(c.stage) && c.stage >= 0 && c.stage < STAGES.length && s.status !== 'running') {
        const dropped = { ...s, startingStage: s.startedAt ? s.startingStage : c.stage, events: s.events.filter(e => e.stage !== c.stage), completed: s.completed.filter(i => i !== c.stage), skipped: s.skipped.filter(i => i !== c.stage) };
        return prepare(dropped, c.stage);
    }
    if (c.type === 'restart') return prepare({ ...s, events: s.events.filter(e => e.stage !== s.stage), completed: s.completed.filter(i => i !== s.stage), skipped: s.skipped.filter(i => i !== s.stage), repeats: s.repeats + 1 }, s.stage);
    if (c.type === 'next' && s.status === 'stage-complete') return s.stage === STAGES.length - 1 ? reduce(s, { type: 'end', at: c.at }) : prepare(s, s.stage + 1);
    if (c.type === 'start' && s.status === 'ready' || c.type === 'resume' && s.status === 'paused') return markUsed({ ...s, status: 'running', startedAt: s.startedAt || c.at, lastTick: c.at, safety: false, inputLost: false, input: { ...NEUTRAL }, inputAt: c.at });
    if (c.type === 'pause' || c.type === 'safety') return s.status === 'running' ? { ...s, status: 'paused', speed: 0, holding: false, input: { ...NEUTRAL }, safety: c.type === 'safety', lastTick: 0 } : s;
    if (c.type === 'stop') return { ...s, status: s.status === 'running' ? 'paused' : s.status, speed: 0, holding: false, input: { ...NEUTRAL }, lastTick: 0 };
    if (s.status === 'stage-complete' && c.type !== 'input' && c.type !== 'tick') return s;
    if (c.type === 'reset') {
        const target = currentMarker(s);
        const prev = s.marker > 0 ? STAGES[s.stage].markers[s.marker - 1] : STAGES[s.stage].start;
        const pos = s.phase === 'sailing' ? { x: prev.x, y: prev.y } : standoffPoint({ x: prev.x, y: prev.y }, target);
        return { ...s, x: pos.x, y: pos.y, heading: bearingTo(pos, target), speed: 0, steering: 0, holding: false, input: { ...NEUTRAL }, assisted: true, safety: false };
    }
    if (c.type === 'assist') return { ...s, assisted: true, config: { ...s.config, autoDrive: s.phase === 'sailing' ? true : s.config.autoDrive, steeringAssist: 1, autoHold: s.phase === 'encounter' ? true : s.config.autoHold } };
    if (c.type === 'marker' && Number.isInteger(c.index) && c.index >= 0 && c.index < STAGES[s.stage].markers.length && s.status !== 'stage-complete') {
        return { ...s, marker: c.index, phase: 'sailing', hold: 0, holding: false, pulseAt: 0, encounterMs: 0, celebrateMs: 0, speed: 0, input: { ...NEUTRAL }, assisted: false, events: withoutEvent(s.events, s.stage, c.index), completed: s.completed.filter(i => i !== s.stage), skipped: s.skipped.filter(i => i !== s.stage) };
    }
    if (c.type === 'repeat' && (s.status === 'running' || s.status === 'paused')) {
        const prev = s.marker > 0 ? STAGES[s.stage].markers[s.marker - 1] : STAGES[s.stage].start;
        const target = currentMarker(s);
        return { ...s, events: withoutEvent(s.events, s.stage, s.marker), phase: 'sailing', x: prev.x, y: prev.y, heading: bearingTo(prev, target), speed: 0, hold: 0, holding: false, pulseAt: 0, encounterMs: 0, celebrateMs: 0, input: { ...NEUTRAL }, assisted: false, repeats: s.repeats + 1 };
    }
    if (c.type === 'skipStage') {
        let n = s;
        STAGES[s.stage].markers.forEach((_, i) => { if (!eventOf(n, s.stage, i)) n = recordEvent({ ...n, marker: i }, 'skipped'); });
        return { ...n, marker: s.marker, status: 'stage-complete', phase: 'sailing', speed: 0, hold: 0, holding: false, input: { ...NEUTRAL }, completed: s.completed.filter(i => i !== s.stage), skipped: [...new Set([...s.skipped, s.stage])] };
    }
    if (c.type === 'skipObjective' && (s.status === 'running' || s.status === 'paused')) {
        if (s.phase === 'celebrate') return advance(s);
        return advance(recordEvent(s, 'skipped'));
    }
    if (c.type === 'input' && s.status === 'running') {
        // hardware samples are only accepted while a hardware control is selected; the therapist's manual input always wins
        if (c.source !== 'manual' && s.config.control === 'manual') return s;
        const p = c.patch;
        const manual = c.source === 'manual';
        return markUsed({ ...s, input: { steering: num(p.steering, -1, 1, s.input.steering), throttle: num(p.throttle, 0, 1, s.input.throttle), brake: num(p.brake, 0, 1, s.input.brake), hold: typeof p.hold === 'boolean' ? p.hold : s.input.hold }, config: manual && s.config.control !== 'manual' ? { ...s.config, control: 'manual' } : s.config, assisted: s.assisted || manual, inputAt: c.at });
    }
    if (c.type !== 'tick' || s.status !== 'running' || !Number.isFinite(c.at) || c.at <= s.lastTick) return s;
    if (c.at - s.lastTick > 1500) return { ...reduce(s, { type: 'safety' }), inputLost: true };
    if (s.config.control !== 'manual' && c.at - s.inputAt > 500) return { ...reduce(s, { type: 'safety' }), inputLost: true };
    const dt = Math.min(0.1, (c.at - s.lastTick) / 1000);
    let n: State = { ...s, lastTick: c.at, elapsed: s.elapsed + dt * 1000 };
    const cfg = s.config;
    // therapist holds expire if the pointer-up event is lost; hardware inputs are refreshed every tick
    const fresh = cfg.control !== 'manual' || c.at - s.inputAt < FRESH_MS;
    const inp = fresh ? s.input : NEUTRAL;
    if (!fresh && (s.input.steering || s.input.throttle || s.input.brake || s.input.hold)) n = { ...n, input: { ...NEUTRAL } };
    const target = currentMarker(s);
    if (s.phase === 'celebrate') {
        const celebrateMs = s.celebrateMs + dt * 1000;
        const glide = { ...n, celebrateMs, speed: Math.max(0, s.speed - 2 * dt) };
        return celebrateMs >= CELEBRATE_MS ? advance(glide) : glide;
    }
    if (s.phase === 'encounter') {
        const stand = standoffPoint({ x: s.x, y: s.y }, target);
        const ease = 1 - Math.exp(-1.6 * dt);
        const x = s.x + (stand.x - s.x) * ease, y = s.y + (stand.y - s.y) * ease;
        const heading = wrapPi(s.heading + wrapPi(bearingTo({ x, y }, target) - s.heading) * (1 - Math.exp(-1.8 * dt)));
        const encounterMs = s.encounterMs + dt * 1000;
        n = { ...n, x, y, heading, speed: Math.max(0, s.speed - 2.4 * dt), steering: s.steering * 0.9, encounterMs };
        if (encounterMs < ENCOUNTER_INTRO_MS) return n;
        const active = holdActive(cfg, inp);
        const seconds = Math.max(0.5, cfg.holdSeconds * target.hold);
        let hold = s.hold;
        let pulseAt = s.pulseAt;
        if (cfg.autoHold) hold += dt / seconds;
        else if (cfg.holdMode === 'tap') {
            // each activation edge adds a fixed step; holding down or mashing never adds more than one step per TAP_GAP_MS
            if (active && !s.holding && c.at - s.pulseAt >= TAP_GAP_MS) {
                hold += 1 / cfg.tapCount;
                pulseAt = c.at;
            }
        }
        else if (active) hold += dt / seconds;
        hold = clamp(hold, 0, 1);
        n = { ...n, hold, holding: active, pulseAt, assisted: s.assisted || cfg.autoHold };
        if (hold >= 0.9999) return { ...recordEvent({ ...n, hold: 1 }, n.assisted ? 'assisted' : 'independent'), phase: 'celebrate', celebrateMs: 0, holding: false, input: { ...NEUTRAL } };
        return n;
    }
    // sailing
    const auto = cfg.autoDrive;
    const steerRaw = Math.abs(inp.steering) < cfg.deadZone ? 0 : inp.steering;
    const steerInput = cfg.mode === 'pedal-only' || auto ? 0 : clamp(steerRaw * cfg.sensitivity / cfg.steeringRange, -1, 1);
    const assist = auto || cfg.mode === 'pedal-only' ? 1 : cfg.steeringAssist;
    const autoThrottle = auto || cfg.mode === 'steering-only';
    const pedal = inp.throttle >= cfg.pedalThreshold ? inp.throttle : 0;
    const throttle = autoThrottle ? 0.75 : cfg.mode === 'pedal-only' ? (pedal > 0 ? Math.max(0.5, pedal) : 0) : pedal;
    const dist = distanceTo(s, target);
    const approach = Math.max(0.9, (dist - cfg.markerRadius * 0.4) * 0.55);
    const limit = Math.min(cfg.speedCap, STAGES[s.stage].speed, approach);
    const capped = clamp(s.speed + (throttle * 1.9 - inp.brake * 5 - 0.5) * dt, 0, limit);
    const diff = wrapPi(bearingTo(s, target) - s.heading);
    const steerWeight = assist * (1 - Math.abs(steerInput) * 0.75);
    const turnRate = steerInput * 0.85 / (1 + capped * 0.12) + clamp(diff * 1.6, -0.9, 0.9) * steerWeight;
    const authority = 0.3 + 0.7 * Math.min(1, capped / 1.2);
    let heading = wrapPi(s.heading + turnRate * authority * dt);
    let x = s.x + Math.sin(heading) * capped * dt;
    let y = s.y + Math.cos(heading) * capped * dt;
    let slow = 1;
    for (const isl of STAGES[s.stage].islands) {
        const d = Math.hypot(x - isl.x, y - isl.y);
        const keep = isl.r + ISLAND_MARGIN;
        if (d < keep) {
            const nx = (x - isl.x) / (d || 1), ny = (y - isl.y) / (d || 1);
            x = isl.x + nx * keep;
            y = isl.y + ny * keep;
            // slide along the shore: head along the tangent that leads toward the marker, never stop dead
            const side = -ny * (target.x - x) + nx * (target.y - y) >= 0 ? 1 : -1;
            heading = wrapPi(heading + clamp(wrapPi(Math.atan2(-ny * side, nx * side) - heading), -0.5, 0.5) * 0.35);
            slow = 0.7;
        }
    }
    const fromCentre = Math.hypot(x, y - WORLD_CENTER_Y);
    if (fromCentre > WORLD_BOUND) {
        heading = wrapPi(heading + clamp(wrapPi(Math.atan2(-x, WORLD_CENTER_Y - y) - heading), -0.5, 0.5) * 0.4);
        x -= x / fromCentre * 0.5;
        y -= (y - WORLD_CENTER_Y) / fromCentre * 0.5;
    }
    const assistedNow = s.assisted || assist > 0 || auto || autoThrottle || cfg.mode === 'pedal-only';
    n = { ...n, x, y, heading, speed: capped * slow, steering: s.steering + (steerInput - s.steering) * (1 - Math.exp(-4 * dt)), assisted: assistedNow };
    if (distanceTo(n, target) <= cfg.markerRadius) return { ...n, phase: 'encounter', encounterMs: 0, hold: 0, holding: false, pulseAt: 0, speed: Math.min(n.speed, 1.2), input: { ...NEUTRAL } };
    return n;
}
export function summary(s: State) {
    const done = s.events.filter(e => e.outcome !== 'skipped');
    return { fish: done.length, assisted: done.filter(e => e.outcome === 'assisted').length, independent: done.filter(e => e.outcome === 'independent').length, skipped: s.events.filter(e => e.outcome === 'skipped').length, sessionCompleted: s.completed.length === STAGES.length };
}
export const collection = (s: Pick<State, 'events'>) => s.events.filter(e => e.outcome !== 'skipped');
export const stageResolved = (s: State, stage: number) => resolved(s, stage);
export function participationMode(s: Pick<State, 'used'>): 'MANUAL' | 'WHEEL' | 'PEDAL' | 'WHEEL_PEDAL' | 'MIXED' {
    if (s.used.length === 1) return s.used[0] === 'manual' ? 'MANUAL' : s.used[0] === 'wheel' ? 'WHEEL' : s.used[0] === 'pedal' ? 'PEDAL' : 'WHEEL_PEDAL';
    return 'MIXED';
}

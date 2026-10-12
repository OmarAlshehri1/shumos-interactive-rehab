import { describe, expect, it } from 'vitest';
import { CELEBRATE_MS, ENCOUNTER_INTRO_MS, TAP_GAP_MS, bearingTo, collection, createState, currentMarker, distanceTo, participationMode, reduce, sanitizeConfig, summary, type Command, type Config, type Input, type State } from '../engine';
import { ISLAND_MARGIN, STAGES, SPECIES, SPECIES_ORDER, difficultyOf, totalMarkers } from '../stages';

const T0 = 1_000_000;
function run(s: State, ms: number, at: { t: number }, inputs?: (s: State) => Partial<Input> | null, source: 'manual' | 'wheel' = 'manual', step = 50): State {
    let n = s;
    for (let spent = 0; spent < ms; spent += step) {
        at.t += step;
        const patch = inputs?.(n);
        if (patch) n = reduce(n, { type: 'input', patch, source, at: at.t });
        n = reduce(n, { type: 'tick', at: at.t });
    }
    return n;
}
const begin = (cfg: Partial<Config> = {}, stage = 0) => {
    let s = createState('s-1');
    s = reduce(s, { type: 'config', patch: cfg });
    s = reduce(s, { type: 'stage', stage });
    const at = { t: T0 };
    s = reduce(s, { type: 'start', at: at.t });
    return { s, at };
};

describe('stage data', () => {
    it('defines exactly three levels of three stages with the specified encounter counts', () => {
        expect(STAGES).toHaveLength(9);
        expect(STAGES.map(s => s.markers.length)).toEqual([1, 2, 3, 3, 3, 4, 4, 4, 5]);
        expect(STAGES.map(s => s.level)).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3]);
        expect(STAGES.map(s => s.env)).toEqual(['pearl-beach', 'pearl-beach', 'pearl-beach', 'coral-bay', 'coral-bay', 'coral-bay', 'golden-archipelago', 'golden-archipelago', 'golden-archipelago']);
        expect(totalMarkers()).toBe(29);
        expect([0, 3, 6].map(difficultyOf)).toEqual(['EASY', 'MEDIUM', 'ADVANCED']);
    });
    it('keeps every marker in open water, away from islands', () => {
        for (const st of STAGES) for (const m of st.markers) for (const isl of st.islands) expect(Math.hypot(m.x - isl.x, m.y - isl.y), `${st.nameEn}`).toBeGreaterThan(isl.r + ISLAND_MARGIN + 9);
    });
    it('keeps every straight leg (start to marker, marker to marker) clear of islands', () => {
        const dist = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))); return Math.hypot(px - ax - t * dx, py - ay - t * dy); };
        for (const st of STAGES) {
            const pts = [st.start, ...st.markers];
            for (let i = 1; i < pts.length; i++) for (const isl of st.islands) expect(dist(isl.x, isl.y, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y), `${st.nameEn} leg ${i}`).toBeGreaterThan(isl.r + ISLAND_MARGIN + 3);
        }
    });
    it('uses only known, distinct-named species', () => {
        expect(new Set(Object.values(SPECIES).map(v => v.nameAr)).size).toBe(SPECIES_ORDER.length);
        for (const st of STAGES) for (const m of st.markers) expect(SPECIES[m.species]).toBeTruthy();
    });
});

describe('boat movement', () => {
    it('responds to manual throttle and steering, not a canned animation', () => {
        const { s: start, at } = begin({ steeringAssist: 0 });
        const straight = run(start, 3000, at, () => ({ throttle: 1 }));
        expect(straight.speed).toBeGreaterThan(1);
        expect(straight.y).toBeGreaterThan(2);
        expect(Math.abs(straight.x)).toBeLessThan(0.5);
        const right = run(straight, 2500, at, () => ({ throttle: 1, steering: 1 }));
        expect(right.heading).toBeGreaterThan(0.3);
        const left = run(right, 4000, at, () => ({ throttle: 1, steering: -1 }));
        expect(left.heading).toBeLessThan(right.heading);
    });
    it('brakes to a gentle stop and never moves backwards', () => {
        const { s: start, at } = begin({ steeringAssist: 0 });
        const moving = run(start, 2500, at, () => ({ throttle: 1 }));
        const y = moving.y;
        const stopped = run(moving, 3000, at, () => ({ brake: 1 }));
        expect(stopped.speed).toBe(0);
        expect(stopped.y).toBeGreaterThanOrEqual(y);
    });
    it('assisted steering turns the boat toward the marker without any steering input', () => {
        const { s: start, at } = begin({ steeringAssist: 1 }, 1);
        const turned = run({ ...start, heading: 1.2 }, 3000, at, () => ({ throttle: 1 }));
        const target = currentMarker(turned);
        const error = Math.abs(bearingTo(turned, target) - turned.heading);
        expect(error).toBeLessThan(0.5);
    });
    it('treats pedal-only mode as pedal-controlled speed with automatic steering', () => {
        const { s: start, at } = begin({ mode: 'pedal-only', control: 'pedal' });
        const idle = run(start, 2000, at, () => ({ throttle: 0 }), 'wheel');
        expect(idle.speed).toBe(0);
        const driven = run(idle, 3000, at, () => ({ throttle: 0.8, steering: -1 }), 'wheel');
        expect(driven.speed).toBeGreaterThan(0.5);
        expect(driven.heading).toBeGreaterThan(-0.2);
    });
    it('steering-only mode throttles automatically', () => {
        const { s: start, at } = begin({ mode: 'steering-only', control: 'wheel' });
        const moving = run(start, 3000, at, () => ({ steering: 0 }), 'wheel');
        expect(moving.speed).toBeGreaterThan(1);
    });
    it('never enters an island or leaves the world: islands only steer the boat away', () => {
        const { s: start, at } = begin({ steeringAssist: 0, speedCap: 6 }, 0);
        const isl = STAGES[0].islands[0];
        let s: State = { ...start, x: isl.x + isl.r + 20, y: isl.y, heading: -Math.PI / 2 };
        for (let i = 0; i < 400; i++) {
            at.t += 50;
            s = reduce(reduce(s, { type: 'input', patch: { throttle: 1, steering: 0 }, source: 'manual', at: at.t }), { type: 'tick', at: at.t });
            for (const o of STAGES[0].islands) expect(Math.hypot(s.x - o.x, s.y - o.y)).toBeGreaterThanOrEqual(o.r + ISLAND_MARGIN - 0.01);
            expect(s.status).toBe('running');
        }
    });
    it('rejects hardware samples while the therapist has manual control, and manual always overrides hardware', () => {
        const { s: start, at } = begin({ control: 'manual' });
        const ignored = reduce(start, { type: 'input', patch: { throttle: 1 }, source: 'wheel', at: at.t + 10 });
        expect(ignored.input.throttle).toBe(0);
        const hw = begin({ control: 'wheel' });
        const taken = reduce(hw.s, { type: 'input', patch: { throttle: 1 }, source: 'manual', at: hw.at.t + 10 });
        expect(taken.config.control).toBe('manual');
        expect(taken.input.throttle).toBe(1);
    });
    it('pauses safely when hardware input goes stale, and when ticks are lost', () => {
        const { s: start, at } = begin({ control: 'wheel' });
        const live = run(start, 400, at, () => ({ throttle: 1 }), 'wheel');
        const stale = reduce(live, { type: 'tick', at: at.t + 800 });
        expect(stale.status).toBe('paused');
        expect(stale.inputLost).toBe(true);
        expect(stale.speed).toBe(0);
        const lost = reduce(begin().s, { type: 'tick', at: T0 + 5000 });
        expect(lost.status).toBe('paused');
    });
});

describe('discovery and hold-and-release', () => {
    const arrive = (cfg: Partial<Config> = {}, stage = 0) => {
        const { s, at } = begin({ autoDrive: true, ...cfg }, stage);
        let n = s;
        for (let i = 0; i < 2000 && n.phase === 'sailing'; i++) {
            at.t += 50;
            if (n.config.control !== 'manual') n = reduce(n, { type: 'input', patch: { steering: 0, throttle: 0 }, source: 'wheel', at: at.t });
            n = reduce(n, { type: 'tick', at: at.t });
        }
        return { n, at };
    };
    it('auto-navigation reaches the marker, stops gently, and starts the encounter', () => {
        const { n } = arrive();
        expect(n.phase).toBe('encounter');
        expect(distanceTo(n, currentMarker(n))).toBeLessThanOrEqual(n.config.markerRadius);
        expect(n.speed).toBeLessThan(1.3);
    });
    it('does not accept hold progress until the fish has appeared', () => {
        const { n, at } = arrive({ autoDrive: false });
        const early = run(n, ENCOUNTER_INTRO_MS - 200, at, () => ({ hold: true }));
        expect(early.hold).toBe(0);
    });
    it('fills the progress ring gradually and completes at the configured hold time', () => {
        const { n, at } = arrive({ holdSeconds: 2 });
        const intro = run(n, ENCOUNTER_INTRO_MS + 100, at);
        const half = run(intro, 900, at, () => ({ hold: true }));
        expect(half.hold).toBeGreaterThan(0.3);
        expect(half.hold).toBeLessThan(0.7);
        const done = run(half, 1400, at, () => ({ hold: true }));
        expect(done.phase).toBe('celebrate');
        expect(done.events).toHaveLength(1);
        expect(done.events[0].outcome).toBe('assisted');
    });
    it('never loses accumulated progress when the hold is released, and has no time-based failure', () => {
        const { n, at } = arrive({ holdSeconds: 4 });
        const intro = run(n, ENCOUNTER_INTRO_MS + 100, at);
        const some = run(intro, 1000, at, () => ({ hold: true }));
        const released = run(reduce(some, { type: 'input', patch: { hold: false }, source: 'manual', at: at.t }), 60_000, at);
        expect(released.hold).toBeCloseTo(some.hold, 5);
        expect(released.phase).toBe('encounter');
        expect(released.status).toBe('running');
        expect(released.events).toHaveLength(0);
    });
    it('supports steering-direction and pedal holds with a threshold, but ignores the wrong direction', () => {
        const right = arrive({ control: 'wheel', autoDrive: true, holdMode: 'steering', holdDirection: 'right', holdThreshold: 0.4, holdSeconds: 2 });
        let s = run(right.n, ENCOUNTER_INTRO_MS + 100, right.at, () => ({ steering: 0 }), 'wheel');
        s = run(s, 1500, right.at, () => ({ steering: -0.9 }), 'wheel');
        expect(s.hold).toBe(0);
        s = run(s, 1000, right.at, () => ({ steering: 0.9 }), 'wheel');
        expect(s.hold).toBeGreaterThan(0.3);
        const pedal = arrive({ control: 'pedal', autoDrive: true, holdMode: 'pedal', holdThreshold: 0.3, holdSeconds: 2 });
        let p = run(pedal.n, ENCOUNTER_INTRO_MS + 100, pedal.at, () => ({ throttle: 0.1 }), 'wheel');
        p = run(p, 1000, pedal.at, () => ({ throttle: 0.1 }), 'wheel');
        expect(p.hold).toBe(0);
        p = run(p, 1000, pedal.at, () => ({ throttle: 0.6 }), 'wheel');
        expect(p.hold).toBeGreaterThan(0.3);
    });
    it('rate-limits tap activations so button mashing cannot complete an encounter', () => {
        const { n, at } = arrive({ holdMode: 'tap', tapCount: 4 });
        let s = run(n, ENCOUNTER_INTRO_MS + 100, at);
        let on = false;
        s = run(s, 1000, at, () => { on = !on; return { hold: on }; }, 'manual', 25);
        const pulses = Math.floor(1000 / TAP_GAP_MS) + 1;
        expect(s.hold).toBeLessThanOrEqual(pulses / 4 + 1e-9);
        expect(s.phase).toBe('encounter');
        s = run(s, 600, at, () => ({ hold: false }));
        const before = s.hold;
        s = run(s, 500, at, () => ({ hold: true }));
        s = run(s, 500, at, () => ({ hold: true }));
        expect(s.hold - before).toBeLessThanOrEqual(0.25 + 1e-9);
    });
    it('auto-hold completes the encounter and is recorded as assisted', () => {
        const { n, at } = arrive({ autoHold: true, holdSeconds: 1 });
        const done = run(n, ENCOUNTER_INTRO_MS + 1500, at);
        expect(done.phase).toBe('celebrate');
        expect(done.events[0].outcome).toBe('assisted');
    });
    it('celebrates calmly then offers the next marker; the collection grows', () => {
        const { n, at } = arrive({ autoHold: true, holdSeconds: 1 }, 1);
        const celebrating = run(n, ENCOUNTER_INTRO_MS + 1500, at);
        expect(celebrating.phase).toBe('celebrate');
        const next = run(celebrating, CELEBRATE_MS + 200, at);
        expect(next.phase).toBe('sailing');
        expect(next.marker).toBe(1);
        expect(collection(next)).toHaveLength(1);
    });
    it('repeat re-opens the current encounter; skip records it as skipped, not collected', () => {
        const { n, at } = arrive({ autoHold: true, holdSeconds: 1 }, 1);
        const celebrating = run(n, ENCOUNTER_INTRO_MS + 1500, at);
        const repeated = reduce(celebrating, { type: 'repeat' });
        expect(repeated.events).toHaveLength(0);
        expect(repeated.phase).toBe('sailing');
        expect(repeated.repeats).toBe(1);
        const skipped = reduce(repeated, { type: 'skipObjective' });
        expect(skipped.events[0].outcome).toBe('skipped');
        expect(summary(skipped).fish).toBe(0);
        expect(summary(skipped).skipped).toBe(1);
        expect(skipped.marker).toBe(1);
    });
    it('encounter selection jumps to a chosen marker and clears its previous result', () => {
        const { s } = begin({}, 5);
        const picked = reduce(s, { type: 'marker', index: 2 });
        expect(picked.marker).toBe(2);
        expect(picked.phase).toBe('sailing');
        expect(reduce(s, { type: 'marker', index: 9 }).marker).toBe(0);
    });
});

describe('sessions, stages and history inputs', () => {
    function finishStage(s: State, at: { t: number }) {
        let n = s;
        for (let i = 0; i < 40000 && n.status === 'running'; i++) { at.t += 50; n = reduce(n, { type: 'tick', at: at.t }); }
        return n;
    }
    it('completes all nine stages with auto-navigation and auto-hold', () => {
        const { s: s0, at } = begin({ autoDrive: true, autoHold: true, holdSeconds: 1 });
        let s = s0;
        for (let stage = 0; stage < 9; stage++) {
            expect(s.stage).toBe(stage);
            s = finishStage(s, at);
            expect(s.status).toBe('stage-complete');
            expect(s.completed).toContain(stage);
            at.t += 50;
            s = reduce(s, { type: 'next', at: at.t });
            if (stage < 8) { at.t += 50; s = reduce(s, { type: 'start', at: at.t }); }
        }
        expect(s.status).toBe('ended');
        expect(s.completed).toHaveLength(9);
        expect(summary(s)).toMatchObject({ fish: 29, sessionCompleted: true, skipped: 0 });
        expect(collection(s)).toHaveLength(29);
    });
    it('skip stage marks every unresolved encounter skipped and the stage skipped', () => {
        const { s } = begin({}, 8);
        const skipped = reduce(s, { type: 'skipStage' });
        expect(skipped.status).toBe('stage-complete');
        expect(skipped.skipped).toEqual([8]);
        expect(skipped.completed).toEqual([]);
        expect(skipped.events).toHaveLength(5);
        expect(skipped.events.every(e => e.outcome === 'skipped')).toBe(true);
    });
    it('restart clears only the current stage and counts the repeat', () => {
        const { s: s0, at } = begin({ autoDrive: true, autoHold: true, holdSeconds: 1 });
        let s = s0;
        s = finishStage(s, at);
        s = reduce(s, { type: 'next', at: at.t + 10 });
        expect(s.events).toHaveLength(1);
        const restarted = reduce(s, { type: 'restart' });
        expect(restarted.stage).toBe(1);
        expect(restarted.events).toHaveLength(1);
        expect(restarted.repeats).toBe(1);
    });
    it('pause freezes simulation and resume continues; end is final', () => {
        const { s, at } = begin({ autoDrive: true });
        const moved = run(s, 1500, at);
        const paused = reduce(moved, { type: 'pause' });
        expect(reduce(paused, { type: 'tick', at: at.t + 50 })).toBe(paused);
        const resumed = reduce(paused, { type: 'resume', at: at.t + 100 });
        expect(resumed.status).toBe('running');
        const ended = reduce(resumed, { type: 'end', at: at.t + 200 });
        expect(ended.status).toBe('ended');
        expect(reduce(ended, { type: 'start', at: at.t + 300 })).toBe(ended);
        const fresh = reduce(ended, { type: 'new', sessionId: 'next' });
        expect(fresh.status).toBe('ready');
        expect(fresh.config.autoDrive).toBe(false);
    });
    it('records which participation modes were used', () => {
        const { s } = begin({ control: 'wheel' });
        expect(participationMode(s)).toBe('WHEEL');
        const mixed = reduce(reduce(s, { type: 'config', patch: { control: 'pedal' } }), { type: 'config', patch: { control: 'manual' } });
        expect(participationMode(mixed)).toBe('MIXED');
        expect(participationMode(begin().s)).toBe('MANUAL');
    });
    it('sanitises hostile configuration', () => {
        const bad = sanitizeConfig({ speedCap: 1e9, markerRadius: -4, holdSeconds: NaN, control: 'x' as never, tapCount: 99.7, quality: 'ultra' as never });
        expect(bad.speedCap).toBe(6);
        expect(bad.markerRadius).toBe(5);
        expect(bad.holdSeconds).toBe(3);
        expect(bad.control).toBe('manual');
        expect(bad.tapCount).toBe(8);
        expect(bad.quality).toBe('high');
    });
    it('is deterministic for identical command streams', () => {
        const play = () => {
            const { s: s0, at } = begin({ autoDrive: true, autoHold: true, holdSeconds: 2 }, 2);
            let s = s0;
            const cmds: Command[] = [];
            for (let i = 0; i < 600; i++) { at.t += 50; cmds.push({ type: 'tick', at: at.t }); }
            for (const c of cmds) s = reduce(s, c);
            return JSON.stringify(s);
        };
        expect(play()).toBe(play());
    });
});

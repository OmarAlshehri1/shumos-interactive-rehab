/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, LANE_SETS, sanitizeConfig, speedOf, type Config, type LaneSet } from '../config';
import { BEAT_MS, STAGES, genItems } from '../stages';
import { createState, currentStep, planStage, reduce, summary, travelMs, SETTLE_MS, type Command, type State } from '../engine';
import { decode, makeLive, recoveredState, reviveRhythmLive, validState } from '../live';
import { buildHistory, reviveRhythmHistory } from '../history';

const run = (s: State, cmds: Command[]) => cmds.reduce(reduce, s);
/** Advances real time in 50 ms ticks. */
function advance(s: State, fromMs: number, ms: number): [State, number] {
  let t = fromMs;
  for (let e = 0; e < ms; e += 50) {
    t += 50;
    s = reduce(s, { type: 'tick', at: t });
  }
  return [s, t];
}
const started = (sid = 'sess-1', cfg: Partial<Config> = {}) => run(createState(sid), [{ type: 'configure', config: cfg }, { type: 'start', at: 1000 }]);

describe('config', () => {
  it('sanitises every field and is idempotent', () => {
    const bad = sanitizeConfig({ spacing: 99, holdMs: -5, laneSet: 'x' as LaneSet, volume: NaN, floorWidthCm: 3, perspective: 500 });
    expect(bad.spacing).toBe(2);
    expect(bad.holdMs).toBe(1000);
    expect(bad.laneSet).toBe('4');
    expect(bad.volume).toBe(DEFAULT_CONFIG.volume);
    expect(bad.floorWidthCm).toBe(0);
    expect(bad.perspective).toBe(100);
    expect(sanitizeConfig(bad)).toEqual(bad);
    expect(JSON.stringify(sanitizeConfig(DEFAULT_CONFIG))).toBe(JSON.stringify(DEFAULT_CONFIG));
  });
  it('maps speed profiles and never exceeds the custom limits', () => {
    expect(speedOf({ speedProfile: 'gentle', customSpeed: 1 })).toBeLessThan(speedOf({ speedProfile: 'active', customSpeed: 1 }));
    expect(sanitizeConfig({ customSpeed: 9 }).customSpeed).toBe(1.4);
  });
  it('a three-lane-or-more layout is needed for the wide stance', () => {
    expect(sanitizeConfig({ laneSet: '2C', stanceWidth: 2 }).stanceWidth).toBe(1);
    expect(sanitizeConfig({ laneSet: '4', stanceWidth: 2 }).stanceWidth).toBe(2);
  });
});

describe('stage streams', () => {
  const laneSets = Object.keys(LANE_SETS) as LaneSet[];
  const limbsList = ['both', 'left', 'right'] as const;
  it('has nine stages in three levels', () => {
    expect(STAGES).toHaveLength(9);
    expect(STAGES.map((s) => s.level)).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3]);
    expect(STAGES.map((s) => s.stage)).toEqual([1, 2, 3, 1, 2, 3, 1, 2, 3]);
  });
  it('is deterministic for the same seed and different across seeds', () => {
    for (let i = 0; i < 9; i++) expect(genItems(i, 42, DEFAULT_CONFIG)).toEqual(genItems(i, 42, DEFAULT_CONFIG));
    expect(JSON.stringify(genItems(1, 1, DEFAULT_CONFIG))).not.toBe(JSON.stringify(genItems(1, 2, DEFAULT_CONFIG)));
  });
  it('every stage in every safe configuration is playable and never asks for an unsafe stance', () => {
    for (const laneSet of laneSets)
      for (const limbs of limbsList)
        for (const stanceWidth of [1, 2] as const)
          for (const jumping of [false, true])
            for (let stage = 0; stage < 9; stage++) {
              const cfg = sanitizeConfig({ laneSet, limbs, stanceWidth, jumping, sided: stage % 2 === 0 });
              const lanes = LANE_SETS[laneSet].lanes as readonly number[];
              const items = genItems(stage, 7 + stage, cfg);
              expect(items.length).toBe(STAGES[stage].count);
              for (const it of items) {
                expect(it.gapB).toBeGreaterThanOrEqual(2);
                for (const t of it.targets) expect(lanes).toContain(t.lane);
                if (it.targets.length === 2) {
                  const [a, b] = it.targets;
                  // left foot is always left of the right foot, never crossed, and never wider than the allowed stance
                  expect([a.foot, b.foot].sort()).toEqual(['L', 'R']);
                  const l = a.foot === 'L' ? a : b;
                  const r = a.foot === 'L' ? b : a;
                  const gap = lanes.indexOf(r.lane) - lanes.indexOf(l.lane);
                  expect(gap).toBeGreaterThanOrEqual(1);
                  expect(gap).toBeLessThanOrEqual(cfg.stanceWidth);
                }
                if (limbs !== 'both') {
                  expect(it.targets).toHaveLength(1);
                  expect(it.targets[0].foot).toBe(limbs === 'left' ? 'L' : 'R');
                  expect(['single', 'hold']).toContain(it.kind);
                }
                if (it.kind === 'jump') expect(cfg.jumping).toBe(true);
              }
            }
  });
  it('stages 1-3 use a single foot or both together, stage 4 uses two-foot pairs, stage 7 includes holds', () => {
    const kinds = (i: number, cfg = DEFAULT_CONFIG) => new Set(genItems(i, 3, cfg).map((x) => x.kind));
    for (const i of [0, 1]) expect([...kinds(i)]).toEqual(['single']);
    expect(kinds(3)).toEqual(new Set(['dual']));
    expect(kinds(4)).toEqual(new Set(['split']));
    expect(kinds(6).has('hold')).toBe(true);
    expect(kinds(8).size).toBeGreaterThanOrEqual(4);
    expect(kinds(5).has('dual')).toBe(true);
  });
  it('first-light repeats a colour in runs and stage 6 repeats whole patterns', () => {
    const a = genItems(0, 5, DEFAULT_CONFIG).map((x) => x.targets[0].lane);
    expect(a[0]).toBe(a[1]);
    expect(a[1]).toBe(a[2]);
    expect(a[2]).not.toBe(a[3]);
    const p = genItems(5, 5, DEFAULT_CONFIG);
    const sig = (g: number) => JSON.stringify(p.filter((x) => x.seq?.[0] === g).map((x) => x.targets));
    expect(sig(0)).toBe(sig(1));
  });
  it('switched-off movement types become single-foot steps and holds can be disabled', () => {
    const noDual = sanitizeConfig({ allow: { ...DEFAULT_CONFIG.allow, dual: false } });
    expect(genItems(3, 1, noDual).every((x) => x.kind === 'single')).toBe(true);
    const noHold = sanitizeConfig({ allow: { ...DEFAULT_CONFIG.allow, hold: false } });
    expect(genItems(6, 1, noHold).some((x) => x.kind === 'hold')).toBe(false);
  });
  it('arrivals sit on the beat grid and a hold leaves room before the next target', () => {
    for (let i = 0; i < 9; i++) {
      const steps = planStage(i, 11, 1, DEFAULT_CONFIG);
      expect(steps[0].arrival).toBeGreaterThanOrEqual(travelMs(i));
      steps.forEach((st, j) => {
        expect(st.arrival % BEAT_MS).toBe(0);
        if (j > 0) expect(st.arrival).toBeGreaterThan(steps[j - 1].arrival);
        if (j > 0 && steps[j - 1].kind === 'hold') expect(st.arrival - steps[j - 1].arrival).toBeGreaterThanOrEqual(steps[j - 1].holdMs + DEFAULT_CONFIG.graceMs);
      });
    }
  });
  it('spacing widens the gaps without changing the pattern', () => {
    const tight = genItems(1, 9, sanitizeConfig({ spacing: 1 }));
    const wide = genItems(1, 9, sanitizeConfig({ spacing: 2 }));
    expect(wide.map((x) => x.targets)).toEqual(tight.map((x) => x.targets));
    expect(wide.reduce((a, x) => a + x.gapB, 0)).toBeGreaterThan(tight.reduce((a, x) => a + x.gapB, 0));
  });
});

describe('gameplay clock', () => {
  it('only advances while running; pause freezes and resume does not jump', () => {
    let [s, t] = advance(started(), 1000, 2000);
    const c1 = s.clock;
    expect(c1).toBeGreaterThan(0);
    s = reduce(s, { type: 'pause' });
    [s] = advance(s, t, 10000);
    expect(s.clock).toBe(c1);
    t += 10000;
    s = reduce(s, { type: 'resume', at: t });
    s = reduce(s, { type: 'tick', at: t + 50 });
    expect(s.clock - c1).toBeLessThan(60);
    expect(s.clock).toBeGreaterThan(c1);
  });
  it('a stalled tab cannot fast-forward the stream', () => {
    const s = reduce(started(), { type: 'tick', at: 1000 + 60000 });
    expect(s.clock).toBeLessThanOrEqual(250 * speedOf(s.config) + 1);
  });
  it('a speed change alters the rate only: arrivals are untouched and position stays a function of the clock', () => {
    const [s0, t] = advance(started(), 1000, 1000);
    let s = s0;
    const arrivals = s.steps.map((x) => x.arrival);
    const before = s.clock;
    s = reduce(s, { type: 'configure', config: { speedProfile: 'active' } });
    expect(s.steps.map((x) => x.arrival)).toEqual(arrivals);
    expect(s.clock).toBe(before);
    const [s2] = advance(s, t, 1000);
    expect(s2.clock - before).toBeCloseTo(1000 * speedOf(s.config), -1);
    const [slow] = advance(reduce(s, { type: 'configure', config: { speedProfile: 'gentle' } }), t, 1000);
    expect(slow.clock - before).toBeLessThan(s2.clock - before);
  });
  it('the first target appears on the beat grid after the lead-in and travels toward the line', () => {
    const s = started();
    expect(currentStep(s)).toBeNull();
    const [s2] = advance(s, 1000, (s.steps[0].arrival - travelMs(0)) / speedOf(s.config) + 200);
    expect(currentStep(s2)?.id).toBe(s2.steps[0].id);
  });
});

describe('continuous and assisted flow', () => {
  it('continuous: an unconfirmed target is recorded as unconfirmed, with no failure', () => {
    const [s] = advance(started('c1', { flow: 'continuous', graceMs: 1500 }), 1000, 60000);
    expect(s.steps[0].out).toBe('missed');
    expect(s.status === 'running' || s.status === 'stage-complete').toBe(true);
    const sum = summary(s);
    expect(sum.missed).toBeGreaterThan(0);
    expect(sum.confirmed).toBe(0);
    expect(JSON.stringify(s)).not.toMatch(/fail/i);
  });
  it('assisted: the stream waits at the line until the therapist acts', () => {
    let s = started('a1', { flow: 'assisted' });
    let t = 1000;
    [s, t] = advance(s, t, 60000);
    const first = s.steps[0];
    expect(first.out).toBe('pending');
    expect(s.clock).toBe(first.arrival);
    expect(s.steps[1].out).toBe('pending');
    const frozen = s.clock;
    [s, t] = advance(s, t, 5000);
    expect(s.clock).toBe(frozen);
    s = reduce(s, { type: 'confirm', id: first.id, assisted: false });
    [s, t] = advance(s, t, 800);
    expect(s.clock).toBeGreaterThan(frozen);
    expect(s.steps[0].out).toBe('confirmed');
  });
  it('assisted skip moves the stream on', () => {
    const [s0, t] = advance(started('a2', { flow: 'assisted' }), 1000, 60000);
    let s = s0;
    s = reduce(s, { type: 'skip', id: s.steps[0].id });
    expect(s.steps[0].out).toBe('skipped');
    [s] = advance(s, t, 20000);
    expect(s.steps[1].arrival).toBeLessThanOrEqual(s.clock);
  });
});

describe('manual confirmation', () => {
  it('confirms once: a repeated or stale confirmation is ignored (reload / double tap)', () => {
    const [s] = advance(started('m1', { flow: 'assisted' }), 1000, 60000);
    const id = s.steps[0].id;
    const a = reduce(s, { type: 'confirm', id, assisted: false });
    const b = reduce(a, { type: 'confirm', id, assisted: true });
    expect(b).toBe(a);
    expect(summary(a).confirmed).toBe(1);
    expect(summary(b).assisted).toBe(0);
    expect(reduce(s, { type: 'confirm', id: 'nope', assisted: false })).toBe(s);
  });
  it('a target that has not appeared yet cannot be confirmed', () => {
    const s = started('m2');
    expect(reduce(s, { type: 'confirm', id: s.steps[0].id, assisted: false })).toBe(s);
  });
  it('assisted confirmation is counted separately', () => {
    let [s] = advance(started('m3', { flow: 'assisted' }), 1000, 60000);
    s = reduce(s, { type: 'confirm', id: s.steps[0].id, assisted: true });
    expect(summary(s)).toMatchObject({ assisted: 1, confirmed: 0 });
  });
  it('a sensor movement hint never confirms or starts anything', () => {
    let [s] = advance(started('m4', { flow: 'assisted', inputMode: 'RIGHT_FOOT', inputSource: 'simulated' }), 1000, 60000);
    const before = JSON.stringify(s.steps);
    s = reduce(s, { type: 'sensor', role: 'RIGHT_FOOT', event: 'onset', seq: 1, at: 5 });
    expect(s.sensor.pending).toBe(true);
    expect(JSON.stringify(s.steps)).toBe(before);
    expect(summary(s).presented).toBe(0);
    expect(reduce(s, { type: 'sensor', role: 'RIGHT_FOOT', event: 'onset', seq: 1, at: 6 })).toBe(s);
  });
});

describe('hold exercises', () => {
  function toHold(cfg: Partial<Config> = {}) {
    let s = run(createState('h1'), [{ type: 'stage', stage: 6 }, { type: 'configure', config: { flow: 'assisted', holdMs: 2000, ...cfg } }, { type: 'start', at: 1000 }]);
    let t = 1000;
    [s, t] = advance(s, t, 60000);
    return { s, t };
  }
  it('does not start by itself and cannot be confirmed before the therapist starts it', () => {
    const { s } = toHold();
    const hold = s.steps.find((x) => x.kind === 'hold')!;
    expect(s.steps[0].id).toBe(hold.id);
    expect(hold.holdAt).toBe(-1);
    expect(reduce(s, { type: 'confirm', id: hold.id, assisted: false })).toBe(s);
  });
  it('runs for the configured time on the gameplay clock, then completes as confirmed', () => {
    let { s, t } = toHold({ holdMs: 3000 });
    const id = s.steps[0].id;
    s = reduce(s, { type: 'startHold', id });
    expect(s.steps[0].holdAt).toBe(s.clock);
    [s, t] = advance(s, t, 2000 / speedOf(s.config));
    expect(s.steps[0].out).toBe('pending');
    [s, t] = advance(s, t, 3000);
    expect(s.steps[0].out).toBe('confirmed');
  });
  it('pause freezes hold progress', () => {
    let { s, t } = toHold({ holdMs: 3000 });
    s = reduce(s, { type: 'startHold', id: s.steps[0].id });
    [s, t] = advance(s, t, 1000);
    s = reduce(s, { type: 'pause' });
    const progress = s.clock - s.steps[0].holdAt;
    [s, t] = advance(s, t, 20000);
    expect(s.clock - s.steps[0].holdAt).toBe(progress);
    expect(s.steps[0].out).toBe('pending');
  });
  it('the therapist can cancel (returns to waiting), complete manually, or skip', () => {
    let { s } = toHold();
    const id = s.steps[0].id;
    s = reduce(s, { type: 'startHold', id });
    s = reduce(s, { type: 'cancelHold', id });
    expect(s.steps[0].holdAt).toBe(-1);
    expect(s.steps[0].out).toBe('pending');
    const manual = reduce(s, { type: 'completeHold', id, assisted: true });
    expect(manual.steps[0].out).toBe('assisted');
    expect(reduce(s, { type: 'skip', id }).steps[0].out).toBe('skipped');
  });
  it('a hold in continuous flow is not missed once started', () => {
    let s = run(createState('h2'), [{ type: 'stage', stage: 6 }, { type: 'configure', config: { flow: 'continuous', holdMs: 8000, graceMs: 1500 } }, { type: 'start', at: 1000 }]);
    let t = 1000;
    const first = s.steps[0];
    [s, t] = advance(s, t, (first.arrival - travelMs(6)) / speedOf(s.config) + 4000);
    s = reduce(s, { type: 'startHold', id: first.id });
    [s, t] = advance(s, t, 3000);
    expect(s.steps[0].out).toBe('pending');
  });
});

describe('therapist controls', () => {
  it('repeat queues the last resolved exercise again, behind what is already on its way', () => {
    let [s] = advance(started('r1', { flow: 'assisted' }), 1000, 60000);
    const first = s.steps[0];
    s = reduce(s, { type: 'confirm', id: first.id, assisted: false });
    const n = s.steps.length;
    s = reduce(s, { type: 'repeat' });
    expect(s.steps).toHaveLength(n + 1);
    const clone = s.steps.find((x) => x.rep === 1)!;
    expect(clone.i).toBe(first.i);
    expect(clone.id).not.toBe(first.id);
    expect(clone.out).toBe('pending');
    expect(clone.arrival).toBeGreaterThan(s.clock);
    expect(clone.arrival % BEAT_MS).toBe(0);
    for (let j = 1; j < s.steps.length; j++) expect(s.steps[j].arrival).toBeGreaterThan(s.steps[j - 1].arrival);
    expect(summary(s).reps).toBe(1);
  });
  it('stopping the stream keeps visible targets moving but delays new ones, and resuming re-snaps to the beat grid', () => {
    let [s, t] = advance(started('sp1'), 1000, 8000);
    s = reduce(s, { type: 'spawn', on: false });
    const hidden = s.steps.filter((x) => x.out === 'pending' && x.arrival - travelMs(0) > s.clock).map((x) => x.arrival);
    [s, t] = advance(s, t, 3000);
    const later = s.steps.filter((x) => x.out === 'pending' && x.arrival - travelMs(0) > s.clock).map((x) => x.arrival);
    expect(later[0]).toBeGreaterThan(hidden[0]);
    s = reduce(s, { type: 'spawn', on: true });
    for (const x of s.steps.filter((y) => y.out === 'pending' && y.arrival - travelMs(0) > s.clock)) expect(x.arrival % BEAT_MS).toBe(0);
  });
  it('changing limbs or lanes mid-stage re-plans only targets that are not yet visible', () => {
    let [s] = advance(started('cf1'), 1000, 7000);
    const visible = s.steps.filter((x) => x.arrival - travelMs(0) <= s.clock).map((x) => JSON.stringify(x));
    s = reduce(s, { type: 'configure', config: { laneSet: '2C', limbs: 'left' } });
    expect(s.steps.filter((x) => x.arrival - travelMs(0) <= s.clock).map((x) => JSON.stringify(x))).toEqual(visible);
    for (const st of s.steps.filter((x) => x.arrival - travelMs(0) > s.clock)) {
      expect([1, 2]).toContain(st.targets[0].lane);
      expect(st.targets[0].foot).toBe('L');
    }
    for (let j = 1; j < s.steps.length; j++) expect(s.steps[j].arrival).toBeGreaterThan(s.steps[j - 1].arrival);
  });
  it('safety stop pauses and needs an explicit resume; end finishes safely', () => {
    let [s] = advance(started('sf1'), 1000, 500);
    s = reduce(s, { type: 'safety' });
    expect(s).toMatchObject({ status: 'paused', safety: true });
    s = reduce(s, { type: 'resume', at: 99999 });
    expect(s).toMatchObject({ status: 'running', safety: false });
    s = reduce(s, { type: 'end', at: 100000 });
    expect(s.status).toBe('ended');
    expect(reduce(s, { type: 'start', at: 1 })).toBe(s);
  });
  it('restart begins a new run with a new run number but the same therapist settings', () => {
    let s = started('rs1', { speedProfile: 'gentle', limbs: 'right' });
    s = reduce(s, { type: 'restart' });
    expect(s).toMatchObject({ run: 2, status: 'ready', stage: 0 });
    expect(s.config.speedProfile).toBe('gentle');
    expect(s.steps[0].id.startsWith('2:0:')).toBe(true);
  });
});

describe('all nine stages are playable end to end', () => {
  it('confirms every target of every stage in assisted flow and completes the session', () => {
    let s = createState('full');
    s = reduce(s, { type: 'configure', config: { flow: 'assisted', holdMs: 1000 } });
    let t = 1000;
    for (let stage = 0; stage < 9; stage++) {
      expect(s.stage).toBe(stage);
      s = reduce(s, { type: 'start', at: t });
      let guard = 0;
      while (s.status === 'running' && guard++ < 4000) {
        t += 50;
        s = reduce(s, { type: 'tick', at: t });
        const cur = currentStep(s);
        if (cur && cur.kind === 'hold' && cur.holdAt < 0) s = reduce(s, { type: 'startHold', id: cur.id });
        else if (cur && cur.kind !== 'hold') s = reduce(s, { type: 'confirm', id: cur.id, assisted: false });
      }
      expect(s.status).toBe('stage-complete');
      expect(s.stats[stage].total).toBeGreaterThanOrEqual(STAGES[stage].count);
      s = reduce(s, { type: 'next', at: t });
    }
    expect(s.status).toBe('ended');
    expect(s.completed).toHaveLength(9);
    const sum = summary(s);
    expect(sum.presented).toBe(sum.confirmed + sum.assisted + sum.skipped + sum.missed);
    expect(sum.missed).toBe(0);
    expect(sum.hold).toBeGreaterThan(0);
    expect(sum.twoFoot).toBeGreaterThan(0);
    expect(sum.singleFoot).toBeGreaterThan(0);
  });
  it('a stage is completed only after a settle period, and a played stage cannot be selected again', () => {
    let [s, t] = advance(started('st1', { flow: 'assisted' }), 1000, 100);
    for (let g = 0; g < 4000 && s.status === 'running'; g++) {
      t += 50;
      s = reduce(s, { type: 'tick', at: t });
      const cur = currentStep(s);
      if (cur) s = reduce(s, { type: 'confirm', id: cur.id, assisted: false });
      if (s.doneAt >= 0 && s.status === 'running') expect(s.clock - s.doneAt).toBeLessThan(SETTLE_MS + 200);
    }
    expect(s.status).toBe('stage-complete');
    expect(reduce(s, { type: 'stage', stage: 0 })).toBe(s);
    expect(reduce(s, { type: 'stage', stage: 5 }).stage).toBe(5);
  });
  it('the stage menu can pick any unplayed stage before starting', () => {
    for (let i = 0; i < 9; i++) expect(reduce(createState('x'), { type: 'stage', stage: i }).steps.length).toBe(STAGES[i].count);
  });
});

describe('shared record round trip, recovery and history', () => {
  function playedState() {
    let [s] = advance(started('rec', { flow: 'assisted' }), 1000, 60000);
    s = reduce(s, { type: 'confirm', id: s.steps[0].id, assisted: false });
    s = reduce(s, { type: 'skip', id: s.steps[1].id });
    return s;
  }
  it('encodes into a small, valid shared record', () => {
    const s = playedState();
    const live = makeLive(s, 'uid-1', 'ليلى', { controlTabId: 'tab', heartbeatAt: 5 });
    expect(live.rs3.payload.length).toBeLessThan(12000);
    expect(live.engine).toBe('rs3');
    expect(reviveRhythmLive(live)).not.toBeNull();
    const d = decode(live)!;
    expect(d.steps).toEqual(s.steps);
    expect(d.config).toEqual(s.config);
  });
  it('rejects tampered payloads', () => {
    const s = playedState();
    const live = makeLive(s, 'uid-1', '', {});
    for (const mutate of [
      (x: Record<string, any>) => (x.stage = 12),
      (x: Record<string, any>) => (x.steps[0].targets[0].lane = 9),
      (x: Record<string, any>) => (x.config.volume = 900),
      (x: Record<string, any>) => (x.stats[0].total = 99),
      (x: Record<string, any>) => (x.steps[1].id = x.steps[0].id),
    ]) {
      const p = JSON.parse(live.rs3.payload);
      mutate(p);
      expect(reviveRhythmLive({ ...live, rs3: { ...live.rs3, payload: JSON.stringify(p) } })).toBeNull();
    }
    expect(validState(null)).toBe(false);
    expect(reviveRhythmLive({ ...live, rs3: { ...live.rs3, payload: 'x'.repeat(40000) } })).toBeNull();
  });
  it('recovery pauses a running session, never resumes it, and cannot re-confirm a confirmed target', () => {
    const s = playedState();
    const rec = recoveredState(makeLive(s, 'u', '', {}))!;
    expect(rec.status).toBe('paused');
    expect(rec.safety).toBe(true);
    const again = reduce(rec, { type: 'confirm', id: s.steps[0].id, assisted: false });
    expect(again).toBe(rec);
    expect(summary(rec).confirmed).toBe(1);
  });
  it('builds a valid history record once ended, with counts that add up', () => {
    let s = playedState();
    s = reduce(s, { type: 'end', at: 200000 });
    const h = buildHistory(s, 'p1', 'u1');
    expect(h.gameId).toBe('rhythm-steps-3d');
    expect(h.sessionId).toBe('rec-r1');
    expect(h.confirmedEvents + h.assistedEvents + h.skippedEvents + h.missedEvents).toBe(h.totalTargetEvents);
    expect(h.singleFootExercises + h.twoFootExercises + h.holdExercises).toBe(h.totalTargetEvents);
    expect(h.flowMode).toBe('assisted');
    expect(Object.keys(h)).not.toContain('score');
    expect(Object.keys(h)).not.toContain('accuracy');
    expect(reviveRhythmHistory(JSON.parse(JSON.stringify(h)))).not.toBeNull();
    expect(reviveRhythmHistory({ ...h, confirmedEvents: h.confirmedEvents + 5 })).toBeNull();
    expect(() => buildHistory(playedState(), 'p1', 'u1')).toThrow();
  });
});

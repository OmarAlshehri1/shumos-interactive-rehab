import { describe, expect, it } from 'vitest';
import { ASPECTS, DEFAULT_CONFIG, LIMITS, PRESETS, createState, layoutFor, objectiveStates, reduce, restoration, sanitizeConfig, stepCount, stepsFor, summary, targetOf, zonesFor, zonesOf, type Aspect, type Command, type Config, type State } from '../engine';
import { assignment, checkLayout, physicalEstimate } from '../layout';
import { STAGES, TOTAL_OBJECTIVES, flatSteps, foldColor, stepsOf, zoneColors } from '../stages';
import { COLOR_IDS, COLORS } from '../colors';
import { decode, makeLive, recoveredState, reviveColorChaseLive, validState } from '../live';
import { buildHistory, hasActivity, reviveColorChase3History } from '../history';

const run = (s: State, ...cmds: Command[]) => cmds.reduce(reduce, s);
const started = (cfg: Partial<Config> = {}) => run(createState('cc-test', cfg), { type: 'start', at: 1000 });
const correct = (s: State): Command => ({ type: 'select', stage: s.stage, step: s.step, color: targetOf(s)!.color });

describe('stage plan', () => {
  it('is exactly 3 levels x 3 stages with short sequences', () => {
    expect(STAGES).toHaveLength(9);
    STAGES.forEach((d, i) => {
      expect(d.index).toBe(i);
      expect(d.level).toBe(Math.floor(i / 3) + 1);
      expect(stepsOf(d)).toBeGreaterThanOrEqual(3);
      expect(stepsOf(d)).toBeLessThanOrEqual(8);
      d.rounds.forEach((r) => r.forEach((c) => expect(d.colors).toContain(c)));
    });
    expect(TOTAL_OBJECTIVES).toBe(STAGES.reduce((a, d) => a + stepsOf(d), 0));
  });
  it('matches the brief: zone counts, sequences, shuffling', () => {
    expect(STAGES.map((d) => d.colors.length)).toEqual([2, 3, 3, 4, 4, 5, 5, 5, 5]);
    expect(STAGES[4].rounds.every((r) => r.length === 2)).toBe(true); // L2S2 two colors in sequence
    expect(STAGES[7].rounds.every((r) => r.length === 2)).toBe(true); // L3S2 two-step sequence
    expect(STAGES[6].shuffle).toBe(true); // L3S1 positions change
    expect(STAGES.filter((d) => d.shuffle).map((d) => d.index)).toEqual([6, 8]);
    expect(new Set(STAGES[8].rounds.flat()).size).toBe(5); // L3S3 restores every color
  });
  it('folds colors onto fewer visible zones so a stage stays completable', () => {
    for (const d of STAGES) for (let cap = 2; cap <= 5; cap++) {
      const z = zoneColors(d, cap);
      expect(z.length).toBe(Math.min(cap, d.colors.length));
      for (const st of flatSteps(d, cap)) expect(z).toContain(st.color);
      for (const c of d.colors) expect(z).toContain(foldColor(d, cap, c));
    }
  });
});

describe('layout safety', () => {
  const aspects = Object.keys(ASPECTS) as Aspect[];
  it('every stage, aspect and slider extreme keeps zones inside the safe area, apart, and within a comfortable reach', () => {
    for (const stage of STAGES) for (const aspect of aspects) for (const zoneScale of [70, 100, 140]) for (const spacing of [60, 100]) for (const reach of [50, 100]) for (const margin of [0, 4, 15]) for (const maxColors of [2, 3, 4, 5]) {
      const cfg = sanitizeConfig({ ...DEFAULT_CONFIG, aspect, zoneScale, spacing, reach, margin, maxColors });
      const l = layoutFor(stage.index, cfg);
      expect(checkLayout(l), `${stage.index} ${aspect} ${zoneScale}/${spacing}/${reach}/${margin}/${maxColors}`).toEqual([]);
      expect(l.slots).toHaveLength(Math.min(maxColors, stage.colors.length));
    }
  });
  it('zones are large (at least 36 cm across on a 180 cm tall floor at default settings)', () => {
    for (const stage of STAGES) {
      const est = physicalEstimate(layoutFor(stage.index, DEFAULT_CONFIG), 320, 180)!;
      expect(est.zoneDiameterCm).toBeGreaterThan(36);
      expect(est.minGapCm).toBeGreaterThan(2);
    }
  });
  it('the large preset enlarges zones and the compact preset reduces the spread', () => {
    const base = layoutFor(5, sanitizeConfig({ ...DEFAULT_CONFIG }));
    const large = layoutFor(5, sanitizeConfig({ ...DEFAULT_CONFIG, ...PRESETS.large }));
    const compact = layoutFor(5, sanitizeConfig({ ...DEFAULT_CONFIG, ...PRESETS.compact }));
    expect(checkLayout(large)).toEqual([]);
    expect(checkLayout(compact)).toEqual([]);
    expect(compact.maxDistance).toBeLessThan(base.maxDistance);
    expect(layoutFor(0, sanitizeConfig({ ...DEFAULT_CONFIG, zoneScale: 140 })).radius).toBeGreaterThan(layoutFor(0, sanitizeConfig({ ...DEFAULT_CONFIG, zoneScale: 70 })).radius);
  });
  it('is deterministic and the same on Control and Display', () => {
    expect(layoutFor(6, DEFAULT_CONFIG)).toEqual(layoutFor(6, { ...DEFAULT_CONFIG }));
    expect(zonesFor(6, 7, DEFAULT_CONFIG, 3)).toEqual(zonesFor(6, 7, { ...DEFAULT_CONFIG }, 3));
  });
  it('shuffles only between rounds: the same round always has the same arrangement, and rounds differ', () => {
    const colors = zoneColors(STAGES[6], 5);
    for (let seed = 1; seed < 60; seed++) {
      for (let round = 0; round < 6; round++) {
        expect(assignment(6, seed, round, colors, true)).toEqual(assignment(6, seed, round, colors, true));
        expect([...assignment(6, seed, round + 1, colors, true)].sort()).toEqual([...colors].sort());
        if (round > 0) expect(assignment(6, seed, round + 1, colors, true)).not.toEqual(assignment(6, seed, round, colors, true));
      }
    }
    expect(assignment(0, 9, 3, zoneColors(STAGES[0], 5), false)).toEqual(zoneColors(STAGES[0], 5));
  });
  it('zones never move during an objective: positions are the same across the whole stage, only colors trade places', () => {
    let s = run(createState('cc-move'), { type: 'stage', stage: 6 }, { type: 'start', at: 1 });
    const slots = layoutFor(6, s.config).slots;
    const seen: string[] = [];
    while (s.status === 'running') {
      expect(layoutFor(s.stage, s.config).slots).toEqual(slots);
      seen.push(zonesOf(s).map((z) => z.color).join());
      s = reduce(s, correct(s));
    }
    expect(new Set(seen).size).toBeGreaterThan(1);
  });
});

describe('manual play of all nine stages (no sensor)', () => {
  it('completes every stage by selecting the actual target zone', () => {
    let s = started();
    for (let stage = 0; stage < 9; stage++) {
      expect(s.stage).toBe(stage);
      if (stage > 0) s = reduce(s, { type: 'start', at: 2000 + stage });
      expect(s.status).toBe('running');
      const total = stepCount(s);
      for (let i = 0; i < total; i++) {
        expect(s.step).toBe(i);
        const target = targetOf(s)!;
        const zone = zonesOf(s).find((z) => z.color === target.color);
        expect(zone, 'the target color has a zone on the floor').toBeDefined();
        s = reduce(s, { type: 'select', stage: s.stage, step: s.step, color: zone!.color });
      }
      expect(s.status).toBe('stage-complete');
      expect(s.completed).toContain(stage);
      s = reduce(s, { type: 'next', at: 3000 + stage });
    }
    expect(s.status).toBe('ended');
    const sum = summary(s);
    expect(sum.completed).toBe(TOTAL_OBJECTIVES);
    expect(sum.confirmed).toBe(TOTAL_OBJECTIVES);
    expect(sum.sessionCompleted).toBe(true);
  });
  it('a different zone is never a failure: nothing resolves, nothing is scored, the target only pulses again', () => {
    let s = started();
    const wrong = COLOR_IDS.find((c) => c !== targetOf(s)!.color)!;
    const before = s;
    s = reduce(s, { type: 'select', stage: 0, step: 0, color: wrong });
    expect(s.step).toBe(0);
    expect(s.events).toEqual(before.events);
    expect(s.nudge).toBe(1);
    expect(summary(s).completed).toBe(0);
  });
  it('rejects stale, duplicate and malformed selections', () => {
    let s = started();
    const c0 = correct(s);
    s = reduce(s, c0);
    expect(s.events).toHaveLength(1);
    expect(reduce(s, c0)).toBe(s); // duplicate of an answered objective
    expect(reduce(s, { type: 'select', stage: 0, step: 3, color: 'red' })).toBe(s); // wrong step
    expect(reduce(s, { type: 'select', stage: 1, step: 1, color: 'red' })).toBe(s); // wrong stage
    expect(reduce(s, { type: 'select', stage: 0, step: 1, color: 'pink' as never })).toBe(s);
    expect(reduce(createState('x'), { type: 'select', stage: 0, step: 0, color: 'red' }).events).toHaveLength(0); // not started
  });
  it('assist, repeat, skip, pause/resume, restart and stage selection behave', () => {
    let s = started();
    s = reduce(s, { type: 'repeat' });
    expect(s.repeats).toBe(1);
    expect(s.step).toBe(0);
    s = reduce(s, { type: 'assist', stage: 0, step: 0 });
    expect(s.events[0].kind).toBe('assisted');
    s = reduce(s, { type: 'skip', stage: 0, step: 1 });
    expect(s.events[1].kind).toBe('skipped');
    s = run(s, { type: 'pause' });
    expect(s.status).toBe('paused');
    s = reduce(s, { type: 'resume', at: 5 });
    expect(s.status).toBe('running');
    s = run(s, correct(s), correct(reduce(s, correct(s))));
    expect(s.status).toBe('stage-complete');
    expect(s.skipped).toContain(0); // a stage with a skipped objective is not "completed"
    expect(s.completed).not.toContain(0);
    s = reduce(s, { type: 'stage', stage: 4 });
    expect(s.stage).toBe(4);
    expect(s.status).toBe('ready');
    expect(reduce(s, { type: 'stage', stage: 0 })).toBe(s); // already attempted
    const again = reduce(s, { type: 'restart' });
    expect(again.run).toBe(1);
    expect(again.events).toEqual([]);
    expect(again.stage).toBe(0);
  });
  it('skip stage and end session work from any live state and the session can end early', () => {
    let s = started();
    s = reduce(s, { type: 'skipStage' });
    expect(s.status).toBe('stage-complete');
    expect(s.skipped).toContain(0);
    s = reduce(s, { type: 'end', at: 9000 });
    expect(s.status).toBe('ended');
    expect(reduce(s, { type: 'start', at: 1 })).toBe(s);
    expect(summary(s).sessionCompleted).toBe(false);
  });
  it('has no timer-based failure: nothing in the engine reacts to the passage of time', () => {
    const s = started();
    expect(Object.keys(s)).not.toContain('elapsed');
    expect(reduce(s, { type: 'pause' }).events).toEqual([]);
  });
  it('zone layout settings are locked while an objective runs and editable when paused', () => {
    let s = started();
    s = reduce(s, { type: 'configure', config: { zoneScale: 130, symbols: false } });
    expect(s.config.zoneScale).toBe(100); // locked
    expect(s.config.symbols).toBe(false); // non-layout settings apply at once
    s = reduce(reduce(s, { type: 'pause' }), { type: 'configure', config: { zoneScale: 130, maxColors: 3 } });
    expect(s.config.zoneScale).toBe(130);
    expect(s.config.maxColors).toBe(3);
  });
  it('clamps hostile config values', () => {
    const c = sanitizeConfig({ ...DEFAULT_CONFIG, zoneScale: 9999, spacing: -4, reach: NaN, margin: 99, maxColors: 99, floorWidthCm: 5, floorHeightCm: 100000 });
    expect(c.zoneScale).toBe(LIMITS.zoneScale[1]);
    expect(c.spacing).toBe(LIMITS.spacing[0]);
    expect(c.maxColors).toBe(5);
    expect(c.floorWidthCm).toBe(0);
    expect(c.calibrationConfirmed).toBe(false);
  });
});

describe('garden restoration', () => {
  it('starts fully desaturated and each completed objective restores its own color', () => {
    let s = started();
    s = reduce(s, { type: 'stage', stage: 1 } as Command);
    s = run(createState('r'), { type: 'stage', stage: 1 }, { type: 'start', at: 1 });
    expect(Object.values(restoration(s).colors).every((v) => v === 0)).toBe(true);
    const first = targetOf(s)!.color;
    s = reduce(s, correct(s));
    const r = restoration(s);
    expect(r.colors[first]).toBeGreaterThan(0);
    const untouched = COLOR_IDS.filter((c) => !stepsFor(s).some((st) => st.color === c));
    for (const c of untouched) expect(r.colors[c]).toBeLessThan(0.6);
    expect(r.overall).toBeGreaterThan(0);
  });
  it('a skipped objective does not restore, an assisted one does, and a clean stage restores everything', () => {
    let s = run(createState('r2'), { type: 'stage', stage: 2 }, { type: 'start', at: 1 });
    const c0 = targetOf(s)!.color;
    s = reduce(s, { type: 'skip', stage: 2, step: 0 });
    expect(restoration(s).colors[c0]).toBe(0);
    let t = run(createState('r3'), { type: 'stage', stage: 2 }, { type: 'start', at: 1 });
    t = reduce(t, { type: 'assist', stage: 2, step: 0 });
    expect(restoration(t).colors[targetOf(t)!.color === c0 ? c0 : stepsFor(t)[0].color]).toBe(1);
    while (t.status === 'running') t = reduce(t, correct(t));
    expect(t.status).toBe('stage-complete');
    for (const c of COLOR_IDS) expect(restoration(t).colors[c]).toBe(1);
  });
  it('is rebuilt identically from the shared record after a reload', () => {
    let s = run(createState('reload'), { type: 'stage', stage: 5 }, { type: 'start', at: 1 });
    s = run(s, correct(s), correct(reduce(s, correct(s))));
    const live = makeLive(s, 'uid', 'ليلى', { controlTabId: 't', heartbeatAt: 1 });
    const back = decode(JSON.parse(JSON.stringify(live)))!;
    expect(restoration(back)).toEqual(restoration(s));
    expect(objectiveStates(back)).toEqual(objectiveStates(s));
  });
});

describe('shared record', () => {
  it('round-trips, validates strictly and rejects tampering', () => {
    const s = run(started(), { type: 'repeat' }, correct(started()));
    const live = makeLive(s, 'owner', ' ليلى ', { controlTabId: 'tab', heartbeatAt: 5 });
    expect(live.engine).toBe('cc3');
    expect(live.config.childFirstName).toBe('ليلى');
    expect(reviveColorChaseLive(live)).not.toBeNull();
    expect(decode(live)).toEqual(s);
    expect(validState({ ...s, stage: 12 })).toBe(false);
    expect(validState({ ...s, step: 99 })).toBe(false);
    expect(validState({ ...s, events: [{ key: 'bad', stage: 0, step: 0, kind: 'confirmed' }] })).toBe(false);
    expect(validState({ ...s, config: { ...s.config, zoneScale: 500 } })).toBe(false);
    expect(decode({ ...live, cc3: { ...live.cc3, payload: 'not json' } })).toBeNull();
    expect(decode({ ...live, engine: undefined })).toBeNull();
    expect(decode({ ...live, sessionId: 'other' })).toBeNull();
  });
  it('a reloaded Control adopts the state paused behind a safety hold, never running by itself', () => {
    const s = run(started(), correct(started()));
    const back = recoveredState(makeLive(s, 'o', 'x', { controlTabId: 't', heartbeatAt: 1 }))!;
    expect(back.status).toBe('paused');
    expect(back.safety).toBe(true);
    expect(back.events).toEqual(s.events);
  });
});

describe('sensor preparation', () => {
  const onset = (s: State, role: 'RIGHT_FOOT' | 'LEFT_FOOT', seq: number): State => reduce(s, { type: 'sensor', role, event: 'onset', seq, at: 1 });
  it('ignores sensors in manual mode, and a movement hint never selects a zone', () => {
    const s = started();
    expect(onset(s, 'RIGHT_FOOT', 1)).toBe(s);
    let sim = reduce(started(), { type: 'configure', config: { inputMode: 'RIGHT_FOOT', inputSource: 'simulated' } });
    sim = onset(sim, 'RIGHT_FOOT', 1);
    expect(sim.sensor.pending).toBe(true);
    expect(sim.sensor.movements).toBe(1);
    expect(sim.step).toBe(0);
    expect(sim.events).toEqual([]);
  });
  it('isolates roles, suppresses duplicates and survives a disconnect with manual play intact', () => {
    let sim = reduce(started(), { type: 'configure', config: { inputMode: 'RIGHT_FOOT', inputSource: 'simulated' } });
    expect(onset(sim, 'LEFT_FOOT', 1)).toBe(sim); // role isolation
    sim = onset(sim, 'RIGHT_FOOT', 5);
    expect(onset(sim, 'RIGHT_FOOT', 5)).toBe(sim); // duplicate
    expect(onset(sim, 'RIGHT_FOOT', 4)).toBe(sim); // stale
    sim = reduce(sim, { type: 'sensor', role: 'RIGHT_FOOT', event: 'lost', seq: 6, at: 2 });
    expect(sim.sensor.link.RIGHT_FOOT).toBe('lost');
    sim = reduce(sim, correct(sim));
    expect(sim.events).toHaveLength(1); // manual fallback works
    expect(sim.sensor.pending).toBe(false); // a confirmed selection clears the pending hint
  });
});

describe('history', () => {
  const finish = (mode: 'all' | 'early') => {
    let s = started();
    s = reduce(s, { type: 'repeat' });
    s = reduce(s, { type: 'assist', stage: 0, step: 0 });
    if (mode === 'early') return reduce(s, { type: 'end', at: 9000 });
    for (let guard = 0; guard < 80 && s.status !== 'ended'; guard++) {
      if (s.status === 'running') s = reduce(s, correct(s));
      else if (s.status === 'stage-complete') s = reduce(s, { type: 'next', at: 9000 });
      else if (s.status === 'ready') s = reduce(s, { type: 'start', at: 2000 });
    }
    return s;
  };
  it('writes a versioned record that never claims accuracy', () => {
    const h = buildHistory(finish('all'), 'pid', 'uid');
    expect(h.resultVersion).toBe(2);
    expect(h.engine).toBe('cc3-garden');
    expect(h.gameId).toBe('color-chase');
    expect(h.accuracy).toBeNull();
    expect(h.totalCorrect).toBeNull();
    expect(h.totalIncorrect).toBeNull();
    expect(h.totalDangerPresses).toBeNull();
    expect(h.objectivesCompleted).toBe(TOTAL_OBJECTIVES);
    expect(h.assistedObjectives).toBe(1);
    expect(h.repeatedObjectives).toBe(1);
    expect(h.completedStageCount).toBe(9);
    expect(h.sessionCompleted).toBe(true);
    expect(h.stageResults).toHaveLength(9);
    expect(h.sessionId.endsWith('-r0')).toBe(true);
    expect(reviveColorChase3History(JSON.parse(JSON.stringify(h)))).toEqual(h);
  });
  it('an early end is recorded as such, and an unbound or unfinished session cannot be saved', () => {
    const early = finish('early');
    expect(hasActivity(early)).toBe(true);
    expect(buildHistory(early, 'p', 'u').sessionCompleted).toBe(false);
    expect(() => buildHistory(started(), 'p', 'u')).toThrow();
    expect(() => buildHistory(early, '', 'u')).toThrow();
    expect(hasActivity(createState('empty'))).toBe(false);
  });
  it('rejects tampered records and legacy-shaped records', () => {
    const h = buildHistory(finish('all'), 'pid', 'uid');
    expect(reviveColorChase3History({ ...h, objectivesCompleted: 999 })).toBeNull();
    expect(reviveColorChase3History({ ...h, assistedObjectives: 999 })).toBeNull();
    expect(reviveColorChase3History({ ...h, engine: undefined })).toBeNull();
    expect(reviveColorChase3History({ gameId: 'color-chase', sessionId: 'a', patientId: 'p', createdByUid: 'u', totalTargetsPresented: 4 })).toBeNull();
  });
  it('color definitions are distinct in hue and shape', () => {
    expect(new Set(COLOR_IDS.map((c) => COLORS[c].symbol)).size).toBe(5);
    expect(new Set(COLOR_IDS.map((c) => COLORS[c].hex)).size).toBe(5);
  });
});

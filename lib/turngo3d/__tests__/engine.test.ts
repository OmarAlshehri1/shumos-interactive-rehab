import { describe, expect, it } from 'vitest';
import { activeCp, canConfirm, COUNTDOWN_MS, createState, reduce, schedule, stat, summary, type Command, type State } from '../engine';
import { decode, makeLive, recoveredState, reviveTurnGoLive, validState } from '../live';
import { buildHistory, hasHistoryActivity, reviveTurnGoHistory } from '../history';
import { guideOf } from '../captions';
import { STAGES } from '../stages';

const run = (s: State, ...cs: Command[]) => cs.reduce(reduce, s);
const advance = (s: State, ms: number): State => { let t = s.lastTick; let n = s; const end = t + ms; while (t < end) { t = Math.min(end, t + 50); n = reduce(n, { type: 'tick', at: t }); } return n; };
const started = (stage = 0, cfg: Partial<State['config']> = {}): State => {
  let s = createState('s-1', 7);
  s = run(s, { type: 'selectStage', stage }, { type: 'configure', config: cfg }, { type: 'start', at: 1000 });
  return advance(s, COUNTDOWN_MS + 50);
};
const confirmAll = (s: State, guard = 80): State => {
  let n = s;
  while (n.status === 'running' && guard-- > 0) {
    if (n.wait) { n = reduce(n, { type: 'continue' }); continue; }
    if (n.hold) { n = advance(n, n.hold.ms + 60); continue; }
    n = reduce(n, { type: 'confirm', assisted: false });
  }
  return n;
};

describe('Turn & Go engine', () => {
  it('opens confirmations only after the countdown, and only for the active star', () => {
    let s = run(createState('s', 1), { type: 'start', at: 0 });
    expect(s.status).toBe('running');
    expect(canConfirm(s)).toBe(false);
    expect(reduce(s, { type: 'confirm', assisted: false })).toBe(s);
    s = advance(s, COUNTDOWN_MS + 10);
    expect(canConfirm(s)).toBe(true);
    expect(guideOf(s).phase).toBe('go');
  });

  it('collects stars one at a time and never awards the same star twice', () => {
    let s = started(0);
    expect(activeCp(s)).toBe(0);
    s = run(s, { type: 'confirm', assisted: false });
    expect(stat(s).res).toEqual(['confirmed', 'pending']);
    const before = s.starSeq;
    // a second identical command resolves the NEXT star, never the first again
    s = run(s, { type: 'confirm', assisted: true });
    expect(stat(s).res).toEqual(['confirmed', 'assisted']);
    expect(s.starSeq).toBe(before + 1);
    expect(s.status).toBe('stage-complete');
    expect(run(s, { type: 'confirm', assisted: false })).toBe(s);
  });

  it('skip resolves a star without awarding it; the finish may be skipped too', () => {
    let s = started(0);
    s = run(s, { type: 'skip' });
    expect(stat(s).res).toEqual(['skipped', 'pending']);
    s = run(s, { type: 'skip' });
    expect(s.status).toBe('stage-complete');
    expect(summary(s)).toMatchObject({ confirmed: 0, assisted: 0, skipped: 2 });
  });

  it('a stop star starts a timed hold, completes by the running clock, and freezes while paused', () => {
    let s = started(5, { events: false });
    // advance to the first stop
    const stopIdx = schedule(s).kinds.indexOf('stop');
    while (activeCp(s) < stopIdx) s = run(s, { type: 'confirm', assisted: false });
    s = run(s, { type: 'confirm', assisted: false });
    expect(s.hold).toMatchObject({ cp: stopIdx, ms: 3000 });
    expect(guideOf(s).phase).toBe('hold');
    expect(canConfirm(s)).toBe(false);
    s = advance(s, 1200);
    s = run(s, { type: 'pause' });
    const paused = s.clock;
    s = run(s, { type: 'tick', at: s.lastTick + 5000 });
    expect(s.clock).toBe(paused);
    s = run(s, { type: 'resume', at: 99999 });
    s = advance(s, 2000);
    expect(s.hold).toBeNull();
    expect(stat(s).res[stopIdx]).toBe('confirmed');
    expect(stat(s).holds).toBe(1);
  });

  it('therapist can end a hold early as assisted, and cancel it by repeating', () => {
    let s = started(5, { events: false });
    const stopIdx = schedule(s).kinds.indexOf('stop');
    while (activeCp(s) < stopIdx) s = run(s, { type: 'confirm', assisted: false });
    s = run(s, { type: 'confirm', assisted: false }, { type: 'repeat', prev: false });
    expect(s.hold).toBeNull();
    expect(stat(s).res[stopIdx]).toBe('pending');
    s = run(s, { type: 'confirm', assisted: false }, { type: 'completeHold', assisted: true });
    expect(stat(s).res[stopIdx]).toBe('assisted');
    expect(stat(s).holdsAssisted).toBe(1);
  });

  it('dynamic events start only right after a confirmed star, pause the walk, and can be disabled', () => {
    let s = started(4); // Festival Park: switch after the 2nd star
    s = run(s, { type: 'confirm', assisted: false });
    expect(s.wait).toBeNull();
    s = run(s, { type: 'confirm', assisted: false });
    expect(s.wait?.kind).toBe('switch');
    expect(s.route['2']).toBe(1);
    expect(canConfirm(s)).toBe(false);
    expect(guideOf(s).phase).toBe('wait');
    const routeBefore = s.route;
    s = advance(s, s.config.eventMs + 100);
    expect(s.wait).toBeNull();
    expect(s.route).toEqual(routeBefore);
    // disabled => no wait and no route change at all
    let off = started(4, { events: false });
    off = run(off, { type: 'confirm', assisted: false }, { type: 'confirm', assisted: false });
    expect(off.wait).toBeNull();
    expect(off.route).toEqual({});
  });

  it('an event never replays after a repeat, and "back" re-opens the previous star without double counting', () => {
    let s = started(4);
    s = run(s, { type: 'confirm', assisted: false }, { type: 'confirm', assisted: false });
    s = run(s, { type: 'continue' }, { type: 'repeat', prev: true });
    expect(stat(s).res.slice(0, 3)).toEqual(['confirmed', 'pending', 'pending']);
    s = run(s, { type: 'confirm', assisted: false });
    expect(s.wait).toBeNull();
    expect(summary(s).confirmed).toBe(2);
    expect(stat(s).repeats).toBe(1);
  });

  it('deviations and cone touches are therapist reports: they pulse and count but never change progress', () => {
    let s = started(2);
    const res = stat(s).res;
    s = run(s, { type: 'deviation', cone: false }, { type: 'deviation', cone: true }, { type: 'deviation', cone: true });
    expect(stat(s).res).toEqual(res);
    expect(stat(s)).toMatchObject({ deviations: 1, coneTouches: 2 });
    expect(s.cue).toMatchObject({ kind: 'cone', n: 3 });
    expect(s.status).toBe('running');
  });

  it('route-changing settings are refused once a stage is running; others apply live', () => {
    let s = started(2);
    expect(run(s, { type: 'configure', config: { rot: 90 } })).toBe(s);
    expect(run(s, { type: 'configure', config: { cones: { '0': [0, 0] } } })).toBe(s);
    s = run(s, { type: 'configure', config: { stopMs: 5000, width: 3.5, volume: 0.2 } });
    expect(s.config).toMatchObject({ stopMs: 5000, width: 3.5, volume: 0.2 });
    // while ready they apply
    const ready = run(createState('r', 1), { type: 'configure', config: { rot: 90, mirror: true } });
    expect(ready.config).toMatchObject({ rot: 90, mirror: true });
  });

  it('a layout change clears manual moves; other changes keep them', () => {
    let s = run(createState('r', 1), { type: 'selectStage', stage: 2 }, { type: 'configure', config: { cones: { '0': [1, 1] }, spacing: 1.1 } });
    expect(s.config.cones).toEqual({ '0': [1, 1] });
    s = run(s, { type: 'configure', config: { course: 'three' } });
    expect(s.config.cones).toEqual({});
  });

  it('safety pauses everything and resume is explicit; a lost connection can use the same path', () => {
    let s = started(0);
    s = run(s, { type: 'safety' });
    expect(s).toMatchObject({ status: 'paused', safety: true });
    expect(run(s, { type: 'confirm', assisted: false })).toBe(s);
    s = run(s, { type: 'resume', at: 5 });
    expect(s).toMatchObject({ status: 'running', safety: false });
  });

  it('every one of the nine stages is fully completable by manual confirmation alone', () => {
    let s = createState('all', 3);
    for (let i = 0; i < 9; i++) {
      expect(s.stage).toBe(i);
      s = run(s, { type: 'start', at: 1000 + i });
      s = advance(s, COUNTDOWN_MS + 50);
      s = confirmAll(s);
      expect(s.status).toBe('stage-complete');
      const sch = schedule(s);
      expect(stat(s).res.length).toBe(sch.plan.cps.length);
      expect(stat(s).res.every((r) => r === 'confirmed')).toBe(true);
      s = run(s, { type: 'next', at: 5000 + i });
    }
    expect(s.status).toBe('ended');
    expect(s.completed).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(summary(s).pending).toBe(0);
  });

  it('stage matrix: cones, stars, stops and events match the nine-stage design', () => {
    const rows = STAGES.map((st) => { const sch = schedule({ ...createState('m', 1), stage: st.id }); return { cones: sch.coneCount, stars: sch.plan.cps.length, stops: sch.kinds.filter((k) => k === 'stop').length, events: sch.events.filter(Boolean).length }; });
    expect(rows[0]).toMatchObject({ cones: 0, stars: 2, stops: 0, events: 0 });
    expect(rows[1]).toMatchObject({ cones: 1, stars: 3 });
    expect(rows[2]).toMatchObject({ cones: 2, stars: 4 });
    expect(rows[3].events).toBe(0);
    expect(rows[5].stops).toBe(2);
    expect(rows[6].stops).toBe(2); // optional short holds
    expect(rows[8].stops).toBeGreaterThanOrEqual(1);
    expect(rows[8].events).toBeGreaterThanOrEqual(3);
    for (const r of rows.slice(3)) expect(r.stars).toBeGreaterThanOrEqual(5);
  });

  it('skipping a stage, restarting a stage, ending, and restarting the run behave safely', () => {
    let s = started(1);
    s = run(s, { type: 'confirm', assisted: false }, { type: 'skipStage', at: 9 });
    expect(s).toMatchObject({ stage: 2, status: 'ready', skipped: [1] });
    s = run(s, { type: 'start', at: 10 });
    s = advance(s, COUNTDOWN_MS + 10);
    s = run(s, { type: 'confirm', assisted: false }, { type: 'restartStage' });
    expect(s.status).toBe('ready');
    expect(stat(s).res).toEqual([]);
    const ended = run(s, { type: 'end', at: 99 });
    expect(ended.status).toBe('ended');
    expect(reduce(ended, { type: 'confirm', assisted: false })).toBe(ended);
    const again = run(ended, { type: 'restart' });
    expect(again).toMatchObject({ run: 1, stage: 0, status: 'ready' });
    expect(summary(again).presented).toBe(0);
  });

  it('a foot sensor hint never collects a star or ends a hold', () => {
    let s = started(5, { inputMode: 'DUAL_FOOT', inputSource: 'simulated', events: false });
    const stopIdx = schedule(s).kinds.indexOf('stop');
    while (activeCp(s) < stopIdx) s = run(s, { type: 'confirm', assisted: false });
    s = run(s, { type: 'confirm', assisted: false });
    const res = stat(s).res;
    s = run(s, { type: 'sensor', role: 'RIGHT_FOOT', event: 'onset', at: 1, seq: 1 });
    expect(s.sensor.pending).toBe(true);
    expect(s.sensor.movements).toBe(1);
    expect(stat(s).res).toEqual(res);
    expect(s.hold).not.toBeNull();
    expect(run(s, { type: 'sensor', role: 'RIGHT_FOOT', event: 'onset', at: 1, seq: 1 })).toBe(s); // stale seq
    s = run(s, { type: 'dismissHint' });
    expect(s.sensor.pending).toBe(false);
  });

  it('syncs through the live record, validates, and recovers paused (never running)', () => {
    let s = started(4);
    s = run(s, { type: 'confirm', assisted: false }, { type: 'confirm', assisted: false });
    const live = makeLive(s, 'uid-1', 'سارة', { controlTabId: 't', heartbeatAt: 5 });
    expect(live.engine).toBe('tg3');
    expect(live.gameState).toBe('PLAYING');
    const back = decode(live)!;
    expect(back.wait?.kind).toBe('switch');
    expect(back.lastTick).toBe(0);
    expect(reviveTurnGoLive(live)).not.toBeNull();
    const rec = recoveredState(live)!;
    expect(rec.status).toBe('paused');
    expect(rec.safety).toBe(true);
    // corrupt payloads are rejected
    for (const mut of [(x: State) => ({ ...x, stage: 12 }), (x: State) => ({ ...x, stats: x.stats.slice(1) }), (x: State) => ({ ...x, config: { ...x.config, volume: 9 } }), (x: State) => ({ ...x, hold: { cp: 99, startedAt: 0, ms: 3000, assisted: false } })]) {
      expect(validState(JSON.parse(JSON.stringify(mut(s))))).toBe(false);
    }
    expect(decode({ ...live, tg3: { ...live.tg3, payload: 'garbage' } })).toBeNull();
    expect(decode({ ...live, sessionId: 'other' })).toBeNull();
  });

  it('builds one honest history record; history is ended-only and revives; stars stay separate from any score', () => {
    let s = createState('h', 5);
    s = run(s, { type: 'start', at: 100 });
    s = advance(s, COUNTDOWN_MS + 50);
    s = run(s, { type: 'confirm', assisted: true }, { type: 'deviation', cone: false }, { type: 'confirm', assisted: false });
    expect(() => buildHistory(s, 'p1', 'u1')).toThrow();
    s = run(s, { type: 'next', at: 7000 }, { type: 'end', at: 9000 });
    const h = buildHistory(s, 'p1', 'u1');
    expect(h).toMatchObject({ gameId: 'turn-and-go-3d', engine: 'tg3', resultVersion: 1, sessionId: 'h-r0', totalCheckpoints: 2, confirmedCheckpoints: 1, assistedCheckpoints: 1, routeDeviations: 1, coneTouches: 0, completedStageCount: 1 });
    expect(h.stageResults[0]).toMatchObject({ course: 'straight', coneCount: 0, total: 2 });
    expect(h).not.toHaveProperty('score');
    expect(h).not.toHaveProperty('accuracy');
    expect(reviveTurnGoHistory(JSON.parse(JSON.stringify(h)))).not.toBeNull();
    expect(reviveTurnGoHistory({ ...h, confirmedCheckpoints: 5 })).toBeNull();
    expect(hasHistoryActivity(s)).toBe(true);
    expect(hasHistoryActivity(createState('x', 1))).toBe(false);
  });
});

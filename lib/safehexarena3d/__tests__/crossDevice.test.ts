import { describe, expect, it } from 'vitest';
import { createState, reduce, tileStates, layoutOf, RESTORE_MS, type Command, type State } from '../engine';
import { decode, makeLive, recoveredState, reviveHexLive, encode } from '../live';
import { buildHistory, hasActivity, reviveHexHistory } from '../history';
import { STAGES, checkWarning } from '../stages';
import { HistorySaver } from '@/lib/liveGame/historySaver';
import { decideRecovery, ControlFreshness, isTakenOver } from '@/lib/liveGame/ownership';
import { reviveHexLive as repoRevive } from '../live';

/** What Firebase does to a record: a JSON round trip. */
const wire = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const OWNER = 'staff-uid';
const run = (s: State, ...cs: Command[]) => cs.reduce(reduce, s);
const safeTile = (s: State) => [...Array(layoutOf(s).tiles).keys()].find((t) => !s.warn.includes(t))!;
function advance(s: State, ms: number): State {
  let t = s.lastTick || 1000;
  for (let i = 0; i < ms / 100; i++) { t += 100; s = reduce(s, { type: 'tick', at: t }); }
  return s;
}

describe('Control -> shared record -> Display', () => {
  it('Display decodes exactly the Control state, so tile identity and states match', () => {
    let s = run(createState('x1'), { type: 'start', at: 1000 }, { type: 'child', tile: 3 });
    s = advance(s, s.config.prepMs + 300);
    const record = wire(makeLive(s, OWNER, 'ليلى', { controlTabId: 't1', heartbeatAt: 1 }));
    const shown = decode(record)!;
    expect(shown).toEqual({ ...s, lastTick: 0 });
    expect(tileStates(shown)).toEqual(tileStates(s));
    expect(shown.warn).toContain(3);
    expect(reviveHexLive(record)).not.toBeNull();
  });
  it('carries stage, round, warning set, child tile, pause and completion for all nine stages', () => {
    let s = run(createState('x2', { prepMs: 1000 }), { type: 'start', at: 1000 });
    for (let stage = 0; stage < 9; stage++) {
      for (let r = 0; r < STAGES[stage].rounds; r++) {
        s = run(s, { type: 'warn' });
        expect(checkWarning(layoutOf(s), s.warn).ok).toBe(true);
        const mid = decode(wire(makeLive(s, OWNER, '', { controlTabId: 't', heartbeatAt: 1 })))!;
        expect(mid.stage).toBe(stage);
        expect(mid.round).toBe(r);
        expect(mid.warn).toEqual(s.warn);
        s = run(s, { type: 'confirm', tile: safeTile(s), assisted: false });
        s = advance(s, RESTORE_MS + 200);
      }
      expect(s.status).toBe('stage-complete');
      expect(decode(wire(makeLive(s, OWNER, '', { controlTabId: 't', heartbeatAt: 1 })))!.completed).toContain(stage);
      s = run(s, { type: 'next', at: 9_000_000 + stage });
      if (stage < 8) s = run(s, { type: 'start', at: 9_100_000 + stage });
    }
    expect(s.status).toBe('ended');
    const rec = wire(makeLive(s, OWNER, '', { controlTabId: 't', heartbeatAt: 1 }));
    expect(decode(rec)!.status).toBe('ended');
    expect(JSON.stringify(rec).length).toBeLessThan(16_000);
  });
  it('keeps patient identity off the public record', () => {
    const rec = makeLive(createState('x3'), OWNER, 'ليلى', { controlTabId: 't', heartbeatAt: 1 });
    expect(JSON.stringify(rec)).not.toMatch(/patientId/);
    expect(rec.config.childFirstName).toBe('ليلى');
  });
  it('rejects hostile or inconsistent payloads', () => {
    const s = run(createState('x4'), { type: 'start', at: 1 }, { type: 'warn' });
    const good = wire(makeLive(s, OWNER, '', { controlTabId: 't', heartbeatAt: 1 }));
    expect(decode(good)).not.toBeNull();
    const tamper = (mut: (o: Record<string, unknown>) => void, sessionId = s.sessionId) => {
      const o = JSON.parse(good.hex3.payload);
      mut(o);
      return decode({ ...good, sessionId, hex3: { ...good.hex3, payload: JSON.stringify(o) } });
    };
    expect(tamper((o) => (o.warn = [0, 1, 2, 3, 4, 5, 6, 7, 8]))).toBeNull(); // no safe tile
    expect(tamper((o) => (o.warn = [99]))).toBeNull();
    expect(tamper((o) => (o.warn = [0, 1, 3]))).toBeNull(); // traps tile 0
    expect(tamper((o) => (o.stage = 9))).toBeNull();
    expect(tamper((o) => (o.childTile = 50))).toBeNull();
    expect(tamper((o) => (o.config = { ...(o.config as object), warnMs: 5 }))).toBeNull();
    expect(tamper((o) => (o.events = [{ key: '0:0:0', stage: 0, round: 0, kind: 'confirmed', tile: 0 }, { key: '0:0:0', stage: 0, round: 0, kind: 'assisted', tile: 1 }]))).toBeNull();
    expect(tamper((o) => (o.status = 'exploding'))).toBeNull();
    expect(tamper(() => {}, 'other-session')).toBeNull();
    expect(decode({ ...good, engine: 'mirror3' })).toBeNull();
    expect(decode({ ...good, hex3: { ...good.hex3, payload: 'x'.repeat(40000) } })).toBeNull();
    expect(decode({ ...good, hex3: { ...good.hex3, payload: '{not json' } })).toBeNull();
    expect(repoRevive({ ...good, hex3: { ...good.hex3, ownerId: '' } })).toBeNull();
  });
});

describe('Display reload and Control reload', () => {
  it('a reloaded Display sees the same state from the same record', () => {
    let s = run(createState('x5'), { type: 'start', at: 1000 });
    s = advance(s, s.config.prepMs + 2000);
    const rec = wire(makeLive(s, OWNER, '', { controlTabId: 't', heartbeatAt: 5 }));
    expect(decode(rec)).toEqual(decode(wire(rec)));
    expect(decode(rec)!.phase).toBe('warning');
  });
  it('a reloaded Control in the same window recovers PAUSED with a safety hold and never resumes by itself', () => {
    let s = run(createState('x6'), { type: 'start', at: 1000 });
    s = advance(s, s.config.prepMs + 1000);
    const live = reviveHexLive(wire(makeLive(s, OWNER, '', { controlTabId: 'tabA', heartbeatAt: Date.now() })))!;
    const snap = recoveredState(live)!;
    expect(snap.status).toBe('paused');
    expect(snap.safety).toBe(true);
    expect(snap.warn).toEqual(s.warn);
    expect(snap.phase).toBe('warning');
    const decision = decideRecovery({ recordSessionId: live.sessionId, recordPatientId: 'p1', meta: live.hex3, snapshot: { sessionId: snap.sessionId, state: snap }, uid: OWNER, patientId: 'p1', tabId: 'tabA', now: Date.now() });
    expect(decision.kind).toBe('recover');
    const later = advance(run(snap, { type: 'tick', at: 5_000_000 }), 60_000);
    expect(later.phase).toBe('warning');
    expect(run(snap, { type: 'resume', at: 1 }).status).toBe('running');
  });
  it('keeps progress, confirmed tile and counts across a reload', () => {
    let s = run(createState('x7', { auto: false }), { type: 'start', at: 1000 }, { type: 'warn' });
    s = run(s, { type: 'confirm', tile: safeTile(s), assisted: true });
    const snap = recoveredState(reviveHexLive(wire(makeLive(s, OWNER, '', { controlTabId: 't', heartbeatAt: 1 })))!)!;
    expect(snap.events).toEqual(s.events);
    expect(snap.childTile).toBe(s.childTile);
  });
  it('a second live window is blocked, a stale one is adopted, and the stood-down window is recognised', () => {
    const s = run(createState('x8'), { type: 'start', at: 1000 });
    const live = makeLive(s, OWNER, '', { controlTabId: 'tabA', heartbeatAt: 1_000_000 });
    const snap = recoveredState(live)!;
    const base = { recordSessionId: live.sessionId, recordPatientId: null, meta: live.hex3, snapshot: { sessionId: snap.sessionId, state: snap }, uid: OWNER, patientId: null, tabId: 'tabB' };
    expect(decideRecovery({ ...base, now: 1_002_000 }).kind).toBe('blocked');
    expect(decideRecovery({ ...base, now: 1_002_000, force: true }).kind).toBe('recover');
    expect(decideRecovery({ ...base, now: 1_030_000 }).kind).toBe('recover');
    expect(decideRecovery({ ...base, uid: 'someone-else', now: 1_002_000 }).kind).toBe('none');
    expect(isTakenOver({ takeoverFrom: 'tabA' }, 'tabA')).toBe(true);
    expect(isTakenOver({ takeoverFrom: 'tabA' }, 'tabB')).toBe(false);
  });
  it('the Display treats a silent Control as gone (freshness is judged on local receipt time only)', () => {
    const f = new ControlFreshness();
    f.observe(111, 0);
    expect(f.alive(5_000)).toBe(true);
    f.observe(111, 10_000); // same heartbeat: not a new write
    expect(f.alive(16_000)).toBe(false);
    f.observe(222, 17_000);
    expect(f.alive(18_000)).toBe(true);
  });
});

describe('history', () => {
  const finished = (assisted = true) => {
    let s = run(createState('h1', { auto: false }), { type: 'start', at: 1000 }, { type: 'warn' });
    s = run(s, { type: 'confirm', tile: safeTile(s), assisted });
    s = advance(s, RESTORE_MS + 200);
    s = run(s, { type: 'warn' });
    s = run(s, { type: 'confirm', tile: safeTile(s), assisted: false }, { type: 'end', at: 90_000 });
    return s;
  };
  it('builds a versioned, therapist-confirmed-only record and round-trips', () => {
    const s = finished();
    const rec = buildHistory(s, 'p1', OWNER);
    expect(rec).toMatchObject({ gameId: 'safe-hex-arena-3d', resultVersion: 1, patientId: 'p1', totalRoundsPresented: 2, totalRoundsCompleted: 2, totalSafeTransitions: 1, totalAssists: 1, inputSource: 'MANUAL', durationMs: 89_000 });
    expect(rec.sessionId).toBe('h1-r0');
    expect(JSON.stringify(rec)).not.toMatch(/sensor|movement|balance/i);
    expect(reviveHexHistory(wire(rec))).toEqual(rec);
    expect(reviveHexHistory({ ...rec, stageResults: { 0: rec.stageResults[0] } })?.stageResults).toHaveLength(1); // Firebase may return arrays as objects
  });
  it('refuses inconsistent or legacy-incompatible records', () => {
    const rec = buildHistory(finished(), 'p1', OWNER);
    expect(reviveHexHistory({ ...rec, totalSafeTransitions: 5 })).toBeNull();
    expect(reviveHexHistory({ ...rec, resultVersion: 2 })).toBeNull();
    expect(reviveHexHistory({ ...rec, gameId: 'mirror-quest-3d' })).toBeNull();
    expect(reviveHexHistory({ ...rec, completedAt: rec.startedAt - 1 })).toBeNull();
    expect(reviveHexHistory(null)).toBeNull();
    expect(() => buildHistory(createState('h2'), 'p1', OWNER)).toThrow();
  });
  it('a restart is a new history record', () => {
    const a = buildHistory(finished(), 'p1', OWNER);
    let s = run(finished(), { type: 'restart' }, { type: 'start', at: 5 }, { type: 'warn' });
    s = run(s, { type: 'confirm', tile: safeTile(s), assisted: false }, { type: 'end', at: 99 });
    expect(buildHistory(s, 'p1', OWNER).sessionId).toBe('h1-r1');
    expect(buildHistory(s, 'p1', OWNER).sessionId).not.toBe(a.sessionId);
  });
  it('is saved exactly once, walk-ins are never saved, and an empty session has nothing to save', async () => {
    const s = finished();
    expect(hasActivity(s)).toBe(true);
    expect(hasActivity(run(createState('e'), { type: 'start', at: 1 }, { type: 'end', at: 2 }))).toBe(false);
    const saver = new HistorySaver(0);
    let saves = 0;
    const save = () => { saves++; return Promise.resolve(); };
    const key = `${s.sessionId}:${s.run}`;
    await Promise.all([saver.save(key, 'p1', 1, save), saver.save(key, 'p1', 1, save), saver.save(key, 'p1', 2, save)]);
    await saver.save(key, 'p1', 3, save);
    expect(saves).toBe(1);
    const walkIn = new HistorySaver(0);
    expect(await walkIn.save(key, null, 1, save)).toBe('walk-in');
    expect(saves).toBe(1);
    const flaky = new HistorySaver(0);
    let n = 0;
    expect(await flaky.save('k', 'p', 1, () => (++n === 1 ? Promise.reject(new Error('x')) : Promise.resolve()))).toBe('retry');
    expect(await flaky.save('k', 'p', 2, () => (++n === 1 ? Promise.reject(new Error('x')) : Promise.resolve()))).toBe('saved');
    expect(n).toBe(2);
  });
  it('payload size stays small for the heartbeat', () => {
    expect(encode(createState('size')).length).toBeLessThan(2000);
  });
});

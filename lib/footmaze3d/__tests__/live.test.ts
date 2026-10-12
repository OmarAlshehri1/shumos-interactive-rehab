import { describe, expect, it } from 'vitest';
import { createState, reduce, routeToFinish, COUNTDOWN_MS, type State } from '../engine';
import { decode, encode, makeLive, recoveredState, reviveFootMazeLive, validState } from '../live';
import { buildHistory, hasHistoryActivity, reviveFootMazeHistory } from '../history';

let T = 5000;
const tick = (s: State, ms: number) => { let n = s; for (let l = ms; l > 0; l -= 100) { T += 100; n = reduce(n, { type: 'tick', at: T }); } return n; };
const walkToGuard = () => {
  let s = reduce(reduce(createState('live-1', 9), { type: 'selectStage', stage: 4 }), { type: 'start', at: T });
  s = tick(s, COUNTDOWN_MS + 100);
  return reduce(reduce(s, { type: 'choose', to: routeToFinish(s)[1] }), { type: 'arrive', assisted: false });
};

describe('live record', () => {
  it('round-trips every state, including a running guardian wait, and stays well under the payload limit', () => {
    const s = walkToGuard();
    expect(s.act).not.toBeNull();
    const live = makeLive(s, 'uid-1', 'ليلى', { controlTabId: 'tab', heartbeatAt: 1 });
    expect(live.fm3.payload.length).toBeLessThan(6000);
    expect(decode(live)).toEqual({ ...s, lastTick: 0, sensor: { ...s.sensor, pending: false } });
    expect(reviveFootMazeLive(live)).not.toBeNull();
  });
  it('rejects garbage: unknown engine, bad ids, impossible counts, tampered config', () => {
    const live = makeLive(walkToGuard(), 'uid-1', '', { controlTabId: 't', heartbeatAt: 1 });
    const patch = (fn: (s: Record<string, unknown>) => void) => { const s = JSON.parse(live.fm3.payload); fn(s); return { ...live, fm3: { ...live.fm3, payload: JSON.stringify(s) } }; };
    expect(decode({ ...live, engine: 'x' })).toBeNull();
    expect(decode(patch((s) => { (s.trail as string[]).push('<script>'); }))).toBeNull();
    expect(decode(patch((s) => { s.stage = 12; }))).toBeNull();
    expect(decode(patch((s) => { (s.stats as { moves: number }[])[4].moves = -1; }))).toBeNull();
    expect(decode(patch((s) => { (s.config as { guardMs: number }).guardMs = 5; }))).toBeNull();
    expect(decode(patch((s) => { (s.act as { kind: string }).kind = 'dragon'; }))).toBeNull();
    expect(decode(patch((s) => { (s.stats as { res: string[] }[])[4].res.push('hacked'); }))).toBeNull();
    expect(validState(null)).toBe(false);
  });
  it('a reloaded Control never resumes by itself: a running stage comes back paused with the safety flag, wait preserved', () => {
    const s = walkToGuard();
    const live = makeLive(s, 'uid-1', '', { controlTabId: 't', heartbeatAt: 1 });
    const r = recoveredState(live)!;
    expect(r.status).toBe('paused');
    expect(r.safety).toBe(true);
    expect(r.act).toEqual(s.act);
    expect(r.trail).toEqual(s.trail);
    expect(encode(r)).not.toBe('');
  });
});

describe('history record', () => {
  it('is one versioned record per run with consistent counts and no score, accuracy or speed', () => {
    let s = walkToGuard();
    s = tick(s, s.act!.leaveAt - s.clock + 2000);
    s = reduce(s, { type: 'end', at: T });
    expect(hasHistoryActivity(s)).toBe(true);
    const rec = buildHistory(s, 'patient-1', 'uid-1');
    expect(rec).toMatchObject({ gameId: 'foot-maze-3d', resultVersion: 1, engine: 'fm3', patientId: 'patient-1', guardWaitsPresented: 1, guardWaitsCompleted: 1 });
    expect(rec.confirmedCheckpoints + rec.assistedCheckpoints + rec.skippedCheckpoints + rec.unfinishedCheckpoints).toBe(rec.totalCheckpoints);
    expect(rec.sessionId).toBe('live-1-r0');
    expect('score' in rec || 'accuracy' in rec || 'averageReactionTimeMs' in rec).toBe(false);
    expect(reviveFootMazeHistory(JSON.parse(JSON.stringify(rec)))).not.toBeNull();
    expect(reviveFootMazeHistory({ ...rec, totalCheckpoints: rec.totalCheckpoints + 1 })).toBeNull();
    expect(reviveFootMazeHistory({ ...rec, routeChoices: 3 })).toBeNull();
    expect(reviveFootMazeHistory({ ...rec, resultVersion: 2 })).toBeNull();
  });
  it('requires an ended session bound to a patient and a user', () => {
    const s = walkToGuard();
    expect(() => buildHistory(s, 'p', 'u')).toThrow();
    expect(() => buildHistory(reduce(s, { type: 'end', at: T }), '', 'u')).toThrow();
  });
  it('a run with no confirmed activity is not worth saving', () => {
    expect(hasHistoryActivity(createState('empty'))).toBe(false);
  });
});

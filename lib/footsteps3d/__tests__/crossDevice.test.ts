import { describe, expect, it } from 'vitest';
import { createState, pathOf, reduce, stoneStates, type Command, type State } from '../engine';
import { decode, encode, isFp3Live, makeLive, recoveredState, reviveFootstepsLive } from '../live';
import { buildHistory, hasActivity, isFootsteps3History, reviveFootsteps3History } from '../history';
import { STAGES, TOTAL_STEPS } from '../stages';
import { HistorySaver } from '@/lib/liveGame/historySaver';
import { ControlFreshness, decideRecovery, isTakenOver } from '@/lib/liveGame/ownership';
import { reviveAnyStoredSession } from '@/lib/sessions/sessionHistoryRepository';

/** What Firebase does to a record: a JSON round trip. */
const wire = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const OWNER = 'staff-uid';
const stamp = { controlTabId: 't', heartbeatAt: 1 };
const run = (s: State, ...cs: Command[]) => cs.reduce(reduce, s);
const confirm = (s: State, assisted = false) => reduce(s, { type: 'confirm', stage: s.stage, step: s.step, assisted });
function finishStage(s: State): State {
  const stage = s.stage;
  let g = 0;
  while (s.stage === stage && s.status !== 'stage-complete' && g++ < 50) s = s.status === 'paused' ? reduce(s, { type: 'resume', at: 9 }) : confirm(s, g % 4 === 0);
  return s;
}

describe('Control -> shared record -> Display', () => {
  it('Display decodes exactly the Control state, so stone identity and states match', () => {
    let s = run(createState('x1'), { type: 'start', at: 1000 });
    s = confirm(s);
    const record = wire(makeLive(s, OWNER, 'ليلى', stamp));
    const shown = decode(record)!;
    expect(shown).toEqual({ ...s, lastTick: 0 });
    expect(stoneStates(shown)).toEqual(stoneStates(s));
    expect(pathOf(shown)).toEqual(pathOf(s)); // the path is a pure function of the shared state
    expect(reviveFootstepsLive(record)).not.toBeNull();
    expect(record.engine).toBe('fp3');
  });
  it('is distinguishable from the original game: only 3D records are tagged', () => {
    const rec = makeLive(createState('x2'), OWNER, '', stamp);
    expect(isFp3Live(rec)).toBe(true);
    expect(isFp3Live({ sessionId: 'a', seed: 1, config: {}, gameState: 'WELCOME' })).toBe(false); // an original record
    expect(isFp3Live(null)).toBe(false);
    expect(isFp3Live({ engine: 'sp3' })).toBe(false);
  });
  it('carries stage, step, target, accepted events, pause, rest, restart and completion for all nine stages', () => {
    let s = run(createState('x3'), { type: 'start', at: 1000 });
    for (let stage = 0; stage < 9; stage++) {
      for (let i = 0; i < STAGES[stage].steps; i++) {
        const mid = decode(wire(makeLive(s, OWNER, '', stamp)))!;
        expect(mid.stage).toBe(stage);
        expect(mid.step).toBe(s.step);
        expect(stoneStates(mid).filter((x) => x === 'TARGET')).toHaveLength(1);
        s = s.status === 'paused' ? reduce(s, { type: 'resume', at: 9 }) : s;
        s = confirm(s);
      }
      expect(s.status).toBe('stage-complete');
      expect(decode(wire(makeLive(s, OWNER, '', stamp)))!.completed).toContain(stage);
      s = run(s, { type: 'next', at: 9_000_000 + stage });
      if (stage < 8) s = run(s, { type: 'start', at: 9_100_000 + stage });
    }
    expect(s.status).toBe('ended');
    const rec = wire(makeLive(s, OWNER, '', stamp));
    expect(decode(rec)!.events).toHaveLength(TOTAL_STEPS);
    expect(JSON.stringify(rec).length).toBeLessThan(16_000);
  });
  it('keeps patient identity off the public record', () => {
    const rec = makeLive(createState('x4'), OWNER, 'ليلى', stamp);
    expect(JSON.stringify(rec)).not.toMatch(/patientId/);
    expect(rec.config.childFirstName).toBe('ليلى');
  });
  it('rejects hostile or inconsistent payloads', () => {
    const s = run(createState('x5'), { type: 'start', at: 1 });
    const good = wire(makeLive(s, OWNER, '', stamp));
    expect(decode(good)).not.toBeNull();
    const tamper = (mut: (o: Record<string, unknown>) => void, sessionId = s.sessionId) => {
      const o = JSON.parse(good.fp3.payload);
      mut(o);
      return decode({ ...good, sessionId, fp3: { ...good.fp3, payload: JSON.stringify(o) } });
    };
    expect(tamper((o) => (o.stage = 9))).toBeNull();
    expect(tamper((o) => (o.step = 99))).toBeNull();
    expect(tamper((o) => (o.status = 'exploding'))).toBeNull();
    expect(tamper((o) => (o.phase = 'dance'))).toBeNull();
    expect(tamper((o) => (o.config = { ...(o.config as object), stoneScale: 5000 }))).toBeNull();
    expect(tamper((o) => (o.config = { ...(o.config as object), spacing: 1 }))).toBeNull();
    expect(tamper((o) => (o.events = [{ key: '0:0:0', stage: 0, step: 0, kind: 'confirmed' }, { key: '0:0:0', stage: 0, step: 0, kind: 'assisted' }]))).toBeNull();
    expect(tamper((o) => (o.events = [{ key: '0:0:99', stage: 0, step: 99, kind: 'confirmed' }]))).toBeNull();
    expect(tamper((o) => (o.completed = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]))).toBeNull();
    expect(tamper(() => {}, 'other-session')).toBeNull();
    expect(decode({ ...good, engine: 'hex3' })).toBeNull();
    expect(decode({ ...good, fp3: { ...good.fp3, payload: 'x'.repeat(40000) } })).toBeNull();
    expect(decode({ ...good, fp3: { ...good.fp3, payload: '{not json' } })).toBeNull();
    expect(reviveFootstepsLive({ ...good, fp3: { ...good.fp3, ownerId: '' } })).toBeNull();
  });
});

describe('Display reload and Control reload', () => {
  it('a reloaded Display sees the same state from the same record', () => {
    let s = run(createState('x6'), { type: 'start', at: 1000 });
    s = confirm(confirm(s));
    const rec = wire(makeLive(s, OWNER, '', { controlTabId: 't', heartbeatAt: 5 }));
    expect(decode(rec)).toEqual(decode(wire(rec)));
  });
  it('a reloaded Control recovers PAUSED with a safety hold, keeps progress, and never resumes by itself', () => {
    let s = run(createState('x7'), { type: 'start', at: 1000 });
    s = confirm(confirm(s, true));
    const live = reviveFootstepsLive(wire(makeLive(s, OWNER, '', { controlTabId: 'tabA', heartbeatAt: Date.now() })))!;
    const snap = recoveredState(live)!;
    expect(snap.status).toBe('paused');
    expect(snap.safety).toBe(true);
    expect(snap.step).toBe(2);
    expect(snap.events).toEqual(s.events);
    const decision = decideRecovery({ recordSessionId: live.sessionId, recordPatientId: 'p1', meta: live.fp3, snapshot: { sessionId: snap.sessionId, state: snap }, uid: OWNER, patientId: 'p1', tabId: 'tabA', now: Date.now() });
    expect(decision.kind).toBe('recover');
    let later = snap;
    for (let i = 0; i < 400; i++) later = reduce(later, { type: 'tick', at: 5_000_000 + i * 250 });
    expect(later.step).toBe(2);
    expect(reduce(snap, { type: 'resume', at: 1 }).status).toBe('running');
  });
  it('a stage-complete or ready session recovers as it was', () => {
    const done = finishStage(run(createState('x8'), { type: 'start', at: 1 }));
    expect(recoveredState(makeLive(done, OWNER, '', stamp))!.status).toBe('stage-complete');
    expect(recoveredState(makeLive(createState('x9'), OWNER, '', stamp))!.status).toBe('ready');
  });
  it('a second live window is blocked, a stale one adopted, and the stood-down window is recognised', () => {
    const live = makeLive(run(createState('x10'), { type: 'start', at: 1000 }), OWNER, '', { controlTabId: 'tabA', heartbeatAt: 1_000_000 });
    const snap = recoveredState(live)!;
    const base = { recordSessionId: live.sessionId, recordPatientId: null, meta: live.fp3, snapshot: { sessionId: snap.sessionId, state: snap }, uid: OWNER, patientId: null, tabId: 'tabB' };
    expect(decideRecovery({ ...base, now: 1_002_000 }).kind).toBe('blocked');
    expect(decideRecovery({ ...base, now: 1_002_000, force: true }).kind).toBe('recover');
    expect(decideRecovery({ ...base, now: 1_030_000 }).kind).toBe('recover');
    expect(decideRecovery({ ...base, uid: 'someone-else', now: 1_002_000 }).kind).toBe('none');
    expect(isTakenOver({ takeoverFrom: 'tabA' }, 'tabA')).toBe(true);
  });
  it('the Display treats a silent Control as gone (local receipt time only)', () => {
    const f = new ControlFreshness();
    f.observe(111, 0);
    expect(f.alive(5_000)).toBe(true);
    f.observe(111, 10_000);
    expect(f.alive(16_000)).toBe(false);
    f.observe(222, 17_000);
    expect(f.alive(18_000)).toBe(true);
  });
});

describe('history: versioned, distinguishable, and original records untouched', () => {
  const finished = () => {
    let s = run(createState('h1'), { type: 'start', at: 1000 });
    s = confirm(s, true); // assisted
    s = confirm(s);
    s = run(s, { type: 'skip', stage: 0, step: s.step });
    s = confirm(s);
    return run(s, { type: 'end', at: 90_000 });
  };
  it('builds a nine-stage-format record with counts only, and round-trips', () => {
    const s = finished();
    const rec = buildHistory(s, 'p1', OWNER);
    expect(rec).toMatchObject({ gameId: 'follow-the-footsteps', resultVersion: 2, engine: 'fp3-forest', patientId: 'p1', totalStepsPresented: 4, totalStepsCompleted: 3, totalAssists: 1, inputSource: 'MANUAL', durationMs: 89_000 });
    expect(rec.completionRate).toBeCloseTo(0.75);
    expect(rec.sessionId).toBe('h1-r0');
    expect(rec.stageResults).toHaveLength(1);
    expect(rec.stageResults[0]).toMatchObject({ stepsPresented: 4, stepsCompleted: 3, assists: 1, engine: 'fp3' });
    expect(JSON.stringify(rec)).not.toMatch(/sensor|movement|balance|gait/i);
    expect(isFootsteps3History(rec)).toBe(true);
    expect(reviveFootsteps3History(wire(rec))).toEqual(rec);
    expect(reviveFootsteps3History({ ...rec, stageResults: { 0: rec.stageResults[0] } })?.stageResults).toHaveLength(1);
  });
  it('the shared history repository routes by marker: new records revive as 3D, original five-stage records are never reinterpreted', () => {
    const rec = buildHistory(finished(), 'p1', OWNER);
    const revived = reviveAnyStoredSession(wire(rec)) as unknown as Record<string, unknown>;
    expect(revived).toMatchObject({ gameId: 'follow-the-footsteps', resultVersion: 2, engine: 'fp3-forest' });
    // an original record: no resultVersion, no engine, five stages per level
    const original = { sessionId: 's-old', patientId: 'p1', gameId: 'follow-the-footsteps', startedAt: 1000, completedAt: 5000, createdByUid: OWNER, startingDifficulty: 'EASY', startingStage: 1, endingDifficulty: 'MEDIUM', endingStage: 5, completedStageCount: 7, skippedStageCount: 1, totalStepsPresented: 40, totalStepsCompleted: 38, durationMs: 4000, stageResults: [{ difficulty: 'MEDIUM', stageNumber: 5, status: 'COMPLETED', stepsPresented: 8, stepsCompleted: 8, durationMs: 1000, averageStepTimeMs: 500 }] };
    const old = reviveAnyStoredSession(original) as unknown as Record<string, unknown>;
    expect(old).not.toBeNull();
    expect(old.engine).toBeUndefined();
    expect(old.resultVersion).toBeUndefined();
    expect(old).toMatchObject({ endingStage: 5, completedStageCount: 7, totalStepsCompleted: 38 });
    expect(isFootsteps3History(original)).toBe(false);
    // a malformed 3D record is rejected, never silently read as an original one
    expect(reviveAnyStoredSession({ ...wire(rec), totalAssists: 99 })).toBeNull();
    expect(reviveAnyStoredSession({ ...wire(rec), engine: 'other' })).not.toMatchObject({ engine: 'fp3-forest' });
  });
  it('refuses inconsistent records and a session that never ended', () => {
    const rec = buildHistory(finished(), 'p1', OWNER);
    expect(reviveFootsteps3History({ ...rec, totalStepsCompleted: 99 })).toBeNull();
    expect(reviveFootsteps3History({ ...rec, resultVersion: 3 })).toBeNull();
    expect(reviveFootsteps3History({ ...rec, completedAt: rec.startedAt - 1 })).toBeNull();
    expect(reviveFootsteps3History(null)).toBeNull();
    expect(() => buildHistory(createState('h2'), 'p1', OWNER)).toThrow();
  });
  it('a restart is a new history record and the old run id is distinct', () => {
    const a = buildHistory(finished(), 'p1', OWNER);
    let s = run(finished(), { type: 'restart' }, { type: 'start', at: 5 });
    s = run(confirm(s), { type: 'end', at: 99 });
    expect(buildHistory(s, 'p1', OWNER).sessionId).toBe('h1-r1');
    expect(buildHistory(s, 'p1', OWNER).sessionId).not.toBe(a.sessionId);
  });
  it('is saved exactly once, walk-ins never, and an empty session has nothing to save', async () => {
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
  });
  it('keeps the live payload small for the heartbeat', () => {
    expect(encode(createState('size')).length).toBeLessThan(2000);
  });
});

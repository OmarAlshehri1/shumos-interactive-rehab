import { describe, expect, it } from 'vitest';
import { activeStep, canConfirm, COUNTDOWN_MS, createState, currentRound, INTER_MS, reduce, rounds, stat, stepNow, summary, type Command, type State } from '../engine';
import { decode, makeLive, recoveredState, reviveBodySequenceLive, validState } from '../live';
import { buildHistory, hasHistoryActivity, reviveBodySequenceHistory } from '../history';
import { guideOf, stepText } from '../captions';
import { previewMs } from '../sequence';
import { STAGES } from '../stages';

const run = (s: State, ...cs: Command[]) => cs.reduce(reduce, s);
const advance = (s: State, ms: number): State => { let t = s.lastTick; let n = s; const end = t + ms; while (t < end) { t = Math.min(end, t + 50); n = reduce(n, { type: 'tick', at: t }); } return n; };
const started = (stage = 0, cfg: Partial<State['config']> = {}): State => {
  let s = createState('s-1', 7);
  s = run(s, { type: 'selectStage', stage }, { type: 'configure', config: cfg }, { type: 'start', at: 1000 });
  return advance(s, COUNTDOWN_MS + 50);
};
/** Plays a stage to the end with therapist confirmations only (previews, holds and intermissions are waited out). */
const playOut = (s: State, guard = 400): State => {
  let n = s;
  while (n.status === 'running' && guard-- > 0) {
    if (n.inter > 0) { n = advance(n, INTER_MS + 60); continue; }
    if (n.phase === 'preview') { n = advance(n, previewMs(currentRound(n).steps.length) + 100); continue; }
    if (n.hold) { n = advance(n, n.hold.ms + 60); continue; }
    n = reduce(n, { type: 'confirm', assisted: false });
  }
  return n;
};

describe('lane limits (owner requirement)', () => {
  it('level 1 uses exactly two lanes; levels 2 and 3 use at most three; no step ever targets a fourth lane', () => {
    for (const def of STAGES) {
      expect(def.lanes).toBe(def.level === 1 ? 2 : 3);
      const s = run(createState('x', 3), { type: 'selectStage', stage: def.id });
      for (const r of rounds(s)) {
        expect(r.lanes).toBe(def.lanes);
        for (const st of r.steps) {
          expect(['L', 'C', 'R', 'H']).toContain(st.lane);
          if (def.lanes === 2) expect(st.lane).not.toBe('C');
        }
      }
    }
  });
  it('stays within the lane limits for every seed and every allowed-feet setting', () => {
    for (let seed = 1; seed < 40; seed++) for (const feet of ['both', 'R', 'L'] as const) for (const def of STAGES) {
      let s = createState('x', seed);
      s = run(s, { type: 'selectStage', stage: def.id }, { type: 'configure', config: { feet } });
      for (const r of rounds(s)) for (const st of r.steps) {
        if (def.lanes === 2) expect(['L', 'R']).toContain(st.move === 'stop' ? 'L' : st.lane === 'H' ? 'L' : st.lane);
        if (st.foot !== 'any' && feet !== 'both' && st.move !== 'stop') expect(st.foot).toBe(feet);
      }
    }
  });
});

describe('sequence generation', () => {
  it('is deterministic and unique per step', () => {
    const a = rounds(run(createState('x', 11), { type: 'selectStage', stage: 4 }));
    const b = rounds(run(createState('x', 11), { type: 'selectStage', stage: 4 }));
    expect(a).toEqual(b);
    const ids = a.flatMap((r) => r.steps.map((x) => x.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('never crosses legs by default and honours therapist lane permissions', () => {
    for (let seed = 1; seed < 30; seed++) {
      const s = run(createState('x', seed), { type: 'selectStage', stage: 3 });
      for (const st of rounds(s).flatMap((r) => r.steps)) {
        if (st.foot === 'R') expect(st.lane).not.toBe('L');
        if (st.foot === 'L') expect(st.lane).not.toBe('R');
      }
    }
    const strict = run(createState('x', 5), { type: 'selectStage', stage: 3 }, { type: 'configure', config: { allow: { R: 'R', L: 'L' } } });
    for (const st of rounds(strict).flatMap((r) => r.steps)) expect(st.lane).toBe(st.foot);
  });
  it('alternate rounds alternate feet; hold-and-move rounds keep the other foot at its own side', () => {
    const alt = rounds(run(createState('x', 9), { type: 'selectStage', stage: 1 }));
    for (const r of alt) r.steps.forEach((st, i) => { if (i > 0) expect(st.foot).not.toBe(r.steps[i - 1].foot); });
    const hm = rounds(run(createState('x', 9), { type: 'selectStage', stage: 4 }));
    for (const st of hm.flatMap((r) => r.steps)) {
      expect(st.anchor).not.toBeNull();
      expect(st.anchor!.foot).not.toBe(st.foot);
      expect(st.anchor!.lane).toBe(st.anchor!.foot);
      expect(st.lane).not.toBe(st.anchor!.lane);
    }
  });
  it('stop-and-continue rounds alternate movement and stop signals', () => {
    const r = rounds(run(createState('x', 9), { type: 'selectStage', stage: 6 }))[0];
    expect(r.steps.map((x) => x.move === 'stop')).toEqual([false, true, false]);
    expect(r.steps[1].holdMs).toBeGreaterThan(0);
  });
  it('the three-lane remember stages have previews; the first three stages differ meaningfully', () => {
    expect(rounds(run(createState('x', 1), { type: 'selectStage', stage: 2 })).every((r) => r.preview && r.steps.length === 2)).toBe(true);
    expect(rounds(run(createState('x', 1), { type: 'selectStage', stage: 7 })).every((r) => r.preview && r.steps.length === 3)).toBe(true);
    expect(rounds(run(createState('x', 1), { type: 'selectStage', stage: 0 })).every((r) => !r.preview)).toBe(true);
  });
  it('the final stage mixes all five modes', () => {
    expect(new Set(STAGES[8].rounds.map((r) => r.mode))).toEqual(new Set(['alternate', 'remember', 'holdmove', 'stopgo']));
  });
  it('captions name the correct foot and lane from the child’s side', () => {
    const t = stepText({ id: 'x', order: 0, foot: 'R', lane: 'R', move: 'step', holdMs: 0, anchor: null });
    expect(t).toContain('اليمنى');
    expect(t).toContain('الأيمن');
    expect(stepText({ id: 'x', order: 0, foot: 'L', lane: 'C', move: 'center', holdMs: 0, anchor: null })).toContain('اليسرى');
  });
});

describe('Body Sequence engine', () => {
  it('opens confirmations only after the countdown', () => {
    let s = run(createState('s', 1), { type: 'start', at: 0 });
    expect(s.status).toBe('running');
    expect(canConfirm(s)).toBe(false);
    expect(reduce(s, { type: 'confirm', assisted: false })).toBe(s);
    s = advance(s, COUNTDOWN_MS + 10);
    expect(canConfirm(s)).toBe(true);
    expect(guideOf(s).phase).toBe('go');
  });

  it('order drives progression: only the active movement can be confirmed; others count as incorrect', () => {
    let s = started(0);
    expect(activeStep(s)).toBe(0);
    const out = reduce(s, { type: 'confirm', assisted: false, step: 1 });
    expect(stat(out).res[0]).toEqual(['pending', 'pending']);
    expect(stat(out).incorrect).toBe(1);
    expect(out.cue?.kind).toBe('order');
    s = run(s, { type: 'confirm', assisted: false, step: 0 });
    expect(stat(s).res[0]).toEqual(['confirmed', 'pending']);
    expect(activeStep(s)).toBe(1);
  });

  it('finishing a sequence celebrates, blocks confirmation for the pause, then moves to the next sequence', () => {
    let s = started(0);
    s = run(s, { type: 'confirm', assisted: false }, { type: 'confirm', assisted: true });
    expect(stat(s).res[0]).toEqual(['confirmed', 'assisted']);
    expect(s.roundSeq).toBe(1);
    expect(s.inter).toBeGreaterThan(s.clock);
    expect(canConfirm(s)).toBe(false);
    expect(reduce(s, { type: 'confirm', assisted: false })).toBe(s);
    s = advance(s, INTER_MS + 60);
    expect(s.round).toBe(1);
    expect(canConfirm(s)).toBe(true);
  });

  it('skip resolves a movement without awarding it', () => {
    let s = started(0);
    s = run(s, { type: 'skip' });
    expect(stat(s).res[0]).toEqual(['skipped', 'pending']);
    expect(summary(s)).toMatchObject({ confirmed: 0, assisted: 0, skipped: 1 });
    expect(s.stepSeq).toBe(0);
  });

  it('incorrect attempts are counted and change nothing else; repeat and replay never punish', () => {
    let s = started(0);
    const before = stat(s).res;
    s = run(s, { type: 'incorrect' }, { type: 'repeat', prev: false }, { type: 'replay' });
    expect(stat(s).res).toEqual(before);
    expect(stat(s)).toMatchObject({ incorrect: 1, repeats: 1, replays: 1 });
    expect(canConfirm(s)).toBe(true);
  });

  it('repeat-previous re-opens the last resolved movement and never double counts', () => {
    let s = started(0);
    s = run(s, { type: 'confirm', assisted: false }, { type: 'repeat', prev: true });
    expect(stat(s).res[0]).toEqual(['pending', 'pending']);
    s = run(s, { type: 'confirm', assisted: false });
    expect(summary(s).confirmed).toBe(1);
  });

  it('memory mode previews first (no confirmation during preview), recalls, and replay returns to the preview without penalty', () => {
    let s = started(2);
    expect(s.phase).toBe('preview');
    expect(canConfirm(s)).toBe(false);
    expect(guideOf(s).phase).toBe('preview');
    s = advance(s, previewMs(2) + 100);
    expect(s.phase).toBe('perform');
    expect(canConfirm(s)).toBe(true);
    expect(guideOf(s).revealed).toBe(false);
    s = run(s, { type: 'replay' });
    expect(s.phase).toBe('preview');
    expect(canConfirm(s)).toBe(false);
    expect(stat(s).replays).toBe(1);
    s = advance(s, previewMs(2) + 100);
    expect(guideOf(reduce(s, { type: 'configure', config: { hints: true } })).revealed).toBe(true);
  });

  it('the therapist can end a memory preview early without any penalty', () => {
    let s = started(2);
    expect(s.phase).toBe('preview');
    s = run(s, { type: 'endPreview' });
    expect(s.phase).toBe('perform');
    expect(canConfirm(s)).toBe(true);
    expect(stat(s)).toMatchObject({ incorrect: 0, replays: 0, repeats: 0 });
    expect(reduce(s, { type: 'endPreview' })).toBe(s);
  });

  it('hold-and-move starts a timed hold on confirm, completes by the running clock and freezes while paused', () => {
    let s = started(4);
    s = run(s, { type: 'confirm', assisted: false });
    expect(s.hold).not.toBeNull();
    expect(canConfirm(s)).toBe(false);
    const hold = s.hold!;
    s = run(advance(s, hold.ms / 2), { type: 'pause' });
    const frozen = s.clock;
    s = run(s, { type: 'tick', at: s.lastTick + 5000 });
    expect(s.clock).toBe(frozen);
    s = run(s, { type: 'resume', at: 100000 });
    s = advance(s, hold.ms);
    expect(s.hold).toBeNull();
    expect(stat(s).res[0][0]).toBe('confirmed');
    expect(stat(s).holds).toBe(1);
  });

  it('a broken hold (incorrect) stops it without progress; the therapist can start it again; an assisted end counts as assisted', () => {
    let s = started(4);
    s = run(s, { type: 'confirm', assisted: false }, { type: 'incorrect' });
    expect(s.hold).toBeNull();
    expect(stat(s).res[0][0]).toBe('pending');
    s = run(s, { type: 'confirm', assisted: false }, { type: 'completeHold', assisted: true });
    expect(stat(s).res[0][0]).toBe('assisted');
    expect(stat(s).holdsAssisted).toBe(1);
  });

  it('with holds disabled a hold-and-move step completes immediately', () => {
    const s = run(started(4, { holds: false }), { type: 'confirm', assisted: false });
    expect(s.hold).toBeNull();
    expect(stat(s).res[0][0]).toBe('confirmed');
  });

  it('stop-and-continue: the stop signal is a held pose and the next movement carries the continue cue', () => {
    let s = started(6);
    s = run(s, { type: 'confirm', assisted: false });
    expect(stepNow(s)?.move).toBe('stop');
    expect(guideOf(s).step?.move).toBe('stop');
    s = run(s, { type: 'confirm', assisted: false });
    expect(guideOf(s).phase).toBe('hold');
    s = advance(s, s.hold!.ms + 60);
    expect(guideOf(s).sub).toBe('تابع');
  });

  it('structural settings lock after Start; hints stay adjustable', () => {
    const s = started(0);
    expect(reduce(s, { type: 'configure', config: { spacing: 1.2 } })).toBe(s);
    expect(reduce(s, { type: 'configure', config: { feet: 'R' } })).toBe(s);
    expect(reduce(s, { type: 'configure', config: { hints: true } }).config.hints).toBe(true);
  });

  it('every one of the nine stages completes with therapist confirmations only (no sensors)', () => {
    let s = createState('all', 21);
    for (let i = 0; i < 9; i++) {
      s = run(s, { type: 'selectStage', stage: i }, { type: 'start', at: 1000 + i });
      s = advance(s, COUNTDOWN_MS + 50);
      s = playOut(s);
      expect(s.status).toBe('stage-complete');
      expect(s.completed).toContain(i);
      s = run(s, { type: 'next', at: 5000 + i });
    }
    expect(s.status).toBe('ended');
    const sum = summary(s);
    expect(sum.pending).toBe(0);
    expect(sum.confirmed).toBe(sum.presented);
    expect(sum.sequences).toBe(STAGES.reduce((n, d) => n + d.rounds.length, 0));
  });

  it('a single allowed foot still completes every stage', () => {
    for (const feet of ['R', 'L'] as const) {
      let s = createState('one', 4);
      s = run(s, { type: 'configure', config: { feet } });
      for (let i = 0; i < 9; i++) {
        s = run(s, { type: 'selectStage', stage: i }, { type: 'start', at: 1000 + i });
        s = playOut(advance(s, COUNTDOWN_MS + 50));
        expect(s.status).toBe('stage-complete');
        s = run(s, { type: 'next', at: 5000 });
      }
      expect(s.status).toBe('ended');
    }
  });

  it('skip stage / restart stage / end behave safely', () => {
    let s = started(0);
    s = run(s, { type: 'skipStage', at: 9000 });
    expect(s.stage).toBe(1);
    expect(s.skipped).toEqual([0]);
    expect(s.status).toBe('ready');
    const before = rounds(s);
    s = run(s, { type: 'start', at: 10000 });
    s = advance(s, COUNTDOWN_MS + 50);
    s = run(s, { type: 'restartStage' });
    expect(s.status).toBe('ready');
    expect(stat(s).res).toEqual([]);
    expect(rounds(s)).not.toEqual(before);
    s = run(s, { type: 'end', at: 20000 });
    expect(s.status).toBe('ended');
    expect(run(s, { type: 'start', at: 30000 })).toBe(s);
  });

  it('safety pause freezes everything and needs an explicit resume', () => {
    let s = started(0);
    s = run(s, { type: 'safety' });
    expect(s.status).toBe('paused');
    expect(s.safety).toBe(true);
    expect(reduce(s, { type: 'confirm', assisted: false })).toBe(s);
    s = run(s, { type: 'resume', at: 99999 });
    expect(s.status).toBe('running');
    expect(s.safety).toBe(false);
  });

  it('restart wipes progress, bumps the run and keeps the therapist settings', () => {
    let s = started(0, { spacing: 1.2 });
    s = run(s, { type: 'confirm', assisted: false }, { type: 'restart' });
    expect(s.run).toBe(1);
    expect(s.status).toBe('ready');
    expect(summary(s).presented).toBe(0);
    expect(s.config.spacing).toBe(1.2);
  });

  it('foot-sensor hints are only a warning during a hold and never move progress', () => {
    let s = started(4);
    const before = JSON.stringify(stat(s).res);
    s = run(s, { type: 'sensor', role: 'RIGHT_FOOT', event: 'onset', at: 1, seq: 1 });
    expect(s.sensor.pending).toBe(false);
    expect(s.sensor.movements).toBe(1);
    const step = stepNow(s)!;
    s = run(s, { type: 'confirm', assisted: false });
    const stay = step.anchor!.foot === 'R' ? 'RIGHT_FOOT' : 'LEFT_FOOT';
    s = run(s, { type: 'sensor', role: stay, event: 'onset', at: 2, seq: 2 });
    expect(s.sensor.pending).toBe(true);
    expect(JSON.stringify(stat(s).res)).toBe(before);
    expect(run(s, { type: 'sensor', role: stay, event: 'onset', at: 3, seq: 2 })).toBe(s);
  });
});

describe('live record, recovery and history', () => {
  it('round-trips through the shared record and rejects garbage', () => {
    const s = started(2);
    const live = makeLive(s, 'uid-1', 'ليلى', { controlTabId: 'tab', heartbeatAt: 5 });
    expect(live.engine).toBe('bs3');
    expect(JSON.stringify(live)).not.toContain('patient');
    expect(decode(live)).toEqual({ ...s, lastTick: 0 });
    expect(reviveBodySequenceLive(live)).not.toBeNull();
    const bad = { ...live, bs3: { ...live.bs3, payload: live.bs3.payload.replace('"stage":2', '"stage":99') } };
    expect(decode(bad)).toBeNull();
    expect(validState({ ...s, stats: s.stats.slice(1) })).toBe(false);
    expect(decode({ ...live, engine: 'tg3' })).toBeNull();
  });
  it('a reloaded Control adopts a running session as safety-paused and never resumes by itself', () => {
    const s = started(0);
    const rec = recoveredState(makeLive(s, 'u', 'x'))!;
    expect(rec.status).toBe('paused');
    expect(rec.safety).toBe(true);
    expect(stat(rec).res).toEqual(stat(s).res);
    const ready = createState('r', 1);
    expect(recoveredState(makeLive(ready, 'u', 'x'))!.status).toBe('ready');
  });
  it('builds exactly one consistent history record and revives it', () => {
    let s = createState('h', 5);
    s = run(s, { type: 'start', at: 1000 });
    s = advance(s, COUNTDOWN_MS + 50);
    expect(hasHistoryActivity(s)).toBe(false);
    s = run(s, { type: 'replay' }, { type: 'confirm', assisted: false }, { type: 'incorrect' }, { type: 'repeat', prev: false }, { type: 'confirm', assisted: true });
    expect(hasHistoryActivity(s)).toBe(true);
    expect(() => buildHistory(s, 'p1', 'u1')).toThrow();
    const ended = run(s, { type: 'end', at: 9000 });
    const h = buildHistory(ended, 'p1', 'u1');
    expect(h).toMatchObject({ gameId: 'body-sequence-3d', engine: 'bs3', confirmedMovements: 1, assistedMovements: 1, incorrectAttempts: 1, movementAttempts: 3, repeats: 1, replays: 1, sequencesCompleted: 1, completedStageCount: 0 });
    expect(h.settings.maxLanes).toBe(2);
    expect(h.stageResults[0]).toMatchObject({ lanes: 2, modes: ['follow'], sequences: 4, sequencesCompleted: 1, total: 8, unfinished: 6 });
    expect(JSON.stringify(h)).not.toMatch(/score|accuracy/i);
    expect(reviveBodySequenceHistory(JSON.parse(JSON.stringify(h)))).toEqual(h);
    expect(reviveBodySequenceHistory({ ...h, movementAttempts: 99 })).toBeNull();
    expect(reviveBodySequenceHistory({ ...h, gameId: 'turn-and-go-3d' })).toBeNull();
  });
  it('a full nine-stage run produces a valid record with no leftover movements', () => {
    let s = createState('full', 3);
    for (let i = 0; i < 9; i++) {
      s = run(s, { type: 'selectStage', stage: i }, { type: 'start', at: 1000 + i });
      s = playOut(advance(s, COUNTDOWN_MS + 50));
      s = run(s, { type: 'next', at: 7000 + i });
    }
    const h = buildHistory(s, 'p', 'u');
    expect(h.completedStageCount).toBe(9);
    expect(h.unfinishedMovements).toBe(0);
    expect(h.settings.maxLanes).toBe(3);
    expect(reviveBodySequenceHistory(JSON.parse(JSON.stringify(h)))).not.toBeNull();
    expect(JSON.stringify(makeLive(s, 'u', 'x')).length).toBeLessThan(32768);
  });
});

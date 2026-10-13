import { describe, expect, it } from 'vitest';
import { DEBOUNCE_MS, allRows, canConfirm, canUndo, createState, done, reduce, summary, type Command, type State } from '../engine';
import { LEVELS, focusMilestone, levelProgress, worldTargets } from '../milestones';
import { decode, makeLive, recoveredState, reviveOceanWondersLive, validState } from '../live';
import { buildHistory, reviveOceanWondersHistory } from '../history';

const run = (s: State, ...cs: Command[]) => cs.reduce(reduce, s);
let T = 10_000;
const at = () => (T += 1000); // well beyond the debounce
const started = (target = 6, level = 0) => run(createState('s1'), { type: 'setTarget', target }, { type: 'selectLevel', level }, { type: 'start', at: at() });
const confirmN = (s: State, n: number, assisted = false) => {
  for (let i = 0; i < n; i++) s = reduce(s, { type: 'confirm', assisted, at: at() });
  return s;
};

describe('exactly three levels, no stages', () => {
  it('has three levels and no stage structure in state', () => {
    expect(LEVELS).toHaveLength(3);
    expect(LEVELS.map((l) => l.nameAr)).toEqual(['الحديقة المرجانية', 'مملكة الأعماق', 'المحيط الأسطوري']);
    const s = createState('x') as unknown as Record<string, unknown>;
    expect('stage' in s || 'stages' in s || 'stageIndex' in s).toBe(false);
  });
  it('level selection clamps to 0..2 and works only before start', () => {
    expect(reduce(createState('x'), { type: 'selectLevel', level: 7 }).level).toBe(0);
    expect(reduce(createState('x'), { type: 'selectLevel', level: 2 }).level).toBe(2);
    expect(reduce(started(), { type: 'selectLevel', level: 2 }).level).toBe(0);
  });
});

describe('milestone mapping spreads over any target', () => {
  it.each([3, 6, 10, 15, 30])('target %i: monotonic, finishes exactly at the target', (target) => {
    for (let level = 0; level < 3; level++) {
      const total = LEVELS[level].milestones.length;
      let prev = 0;
      for (let d = 0; d <= target; d++) {
        const p = levelProgress(level, d, target);
        expect(p.completed).toBeGreaterThanOrEqual(prev);
        prev = p.completed;
        if (d < target) expect(p.completed).toBeLessThan(total);
      }
      expect(levelProgress(level, target, target).completed).toBe(total);
    }
  });
  it('target 6 on the 10-milestone coral garden completes several milestones per confirmation; target 15 shows partial progress each time', () => {
    expect(levelProgress(0, 1, 6).completed).toBe(1);
    expect(levelProgress(0, 2, 6).completed).toBe(3);
    const partial = [1, 2, 3].map((d) => levelProgress(0, d, 15));
    expect(partial.every((p) => p.partial > 0 || p.completed > 0)).toBe(true);
    // with 15 confirmations every single one changes something visible
    let last = -1;
    for (let d = 1; d <= 15; d++) {
      const { completed, partial: f } = levelProgress(0, d, 15);
      const v = completed + f;
      expect(v).toBeGreaterThan(last);
      last = v;
    }
  });
  it('world targets keep earlier levels completed and later levels empty; partial builds never read as finished', () => {
    const w = worldTargets({ level: 1, done: 2, target: 10, complete: false });
    expect(w[0].every((v) => v === 1)).toBe(true);
    expect(w[2].every((v) => v === 0)).toBe(true);
    expect(w[1].filter((v) => v === 1).length).toBe(levelProgress(1, 2, 10).completed);
    expect(Math.max(...w[1].filter((v) => v < 1))).toBeLessThan(1);
    expect(worldTargets({ level: 0, done: 10, target: 10, complete: true })[0].every((v) => v === 1)).toBe(true);
    expect(focusMilestone(0, 0, 10)).toBe(0);
  });
});

describe('confirmations', () => {
  it('every valid confirmation increments progress once and publishes a new sequence number', () => {
    let s = started(6);
    const seq0 = s.seq;
    s = reduce(s, { type: 'confirm', at: at() });
    expect([s.confirmed, s.assisted, done(s), s.seq]).toEqual([1, 0, 1, seq0 + 1]);
    s = reduce(s, { type: 'confirm', assisted: true, at: at() });
    expect([s.confirmed, s.assisted, done(s)]).toEqual([1, 1, 2]);
  });
  it('ignores an accidental double press inside the debounce window, but counts rapid legitimate presses', () => {
    let s = started(6);
    const t = at();
    s = reduce(s, { type: 'confirm', at: t });
    s = reduce(s, { type: 'confirm', at: t + DEBOUNCE_MS - 1 });
    expect(done(s)).toBe(1);
    expect(s.ignored).toBe(1);
    s = reduce(s, { type: 'confirm', at: t + DEBOUNCE_MS });
    s = reduce(s, { type: 'confirm', at: t + 2 * DEBOUNCE_MS });
    expect(done(s)).toBe(3);
  });
  it('is not accepted before start, while paused, or after the level target is reached', () => {
    expect(reduce(createState('x'), { type: 'confirm', at: 5000 }).confirmed).toBe(0);
    let s = started(3);
    s = reduce(s, { type: 'pause' });
    expect(canConfirm(s)).toBe(false);
    expect(done(reduce(s, { type: 'confirm', at: at() }))).toBe(0);
    s = confirmN(reduce(s, { type: 'resume', at: at() }), 3);
    expect(s.status).toBe('level-complete');
    expect(done(reduce(s, { type: 'confirm', at: at() }))).toBe(3);
  });
  it('a skip records a skipped count and builds nothing', () => {
    const s = reduce(started(6), { type: 'skip', at: at() });
    expect([s.skipped, done(s)]).toEqual([1, 0]);
  });
});

describe('undo', () => {
  it('removes only the most recent confirmation, counts the undo, and can walk back through the open level', () => {
    let s = confirmN(started(8), 2);
    s = confirmN(s, 1, true);
    s = reduce(s, { type: 'undo', at: at() });
    expect([s.confirmed, s.assisted, s.undos]).toEqual([2, 0, 1]);
    s = reduce(s, { type: 'undo', at: at() });
    expect([s.confirmed, s.assisted, s.undos]).toEqual([1, 0, 2]);
    expect(canUndo(createState('x'))).toBe(false);
  });
  it('un-completes a level that was just completed and is impossible after the session ended', () => {
    let s = confirmN(started(3), 3);
    expect(s.status).toBe('level-complete');
    s = reduce(s, { type: 'undo', at: at() });
    expect([s.status, done(s)]).toEqual(['running', 2]);
    s = confirmN(s, 1);
    s = reduce(s, { type: 'end', at: at() });
    expect(reduce(s, { type: 'undo', at: at() })).toBe(s);
  });
  it('cannot reach into a previous level and ignores a double tap', () => {
    let s = confirmN(started(3), 3);
    s = reduce(s, { type: 'continue', at: at() });
    expect(s.level).toBe(1);
    expect(canUndo(s)).toBe(false);
    s = confirmN(s, 2);
    const t = at();
    s = reduce(s, { type: 'undo', at: t });
    s = reduce(s, { type: 'undo', at: t + 50 });
    expect(done(s)).toBe(1);
  });
});

describe('continuous ocean: levels, direct selection, completion', () => {
  it('level 1 -> 2 -> 3 keeps one run and records only real confirmations', () => {
    let s = started(3);
    s = confirmN(s, 3);
    s = reduce(s, { type: 'continue', at: at() });
    s = confirmN(s, 3, true);
    s = reduce(s, { type: 'continue', at: at() });
    s = confirmN(s, 3);
    expect([s.level, s.status]).toEqual([2, 'level-complete']);
    expect(reduce(s, { type: 'continue', at: at() })).toBe(s); // nothing after the legendary ocean
    s = reduce(s, { type: 'end', at: at() });
    const sum = summary(s);
    expect([sum.confirmed, sum.assisted, sum.levelsCompleted, allRows(s).length]).toEqual([6, 3, 3, 3]);
    expect(worldTargets({ level: 2, done: 3, target: 3, complete: true }).every((l) => l.every((v) => v === 1))).toBe(true);
  });
  it('direct selection of level 3 draws earlier levels complete but fabricates no history', () => {
    let s = run(createState('d'), { type: 'selectLevel', level: 2 }, { type: 'setTarget', target: 5 }, { type: 'start', at: at() });
    s = confirmN(s, 2);
    s = reduce(s, { type: 'end', at: at() });
    const h = buildHistory(s, 'p1', 'u1');
    expect(h.startingLevel).toBe(3);
    expect(h.levelResults.map((r) => r.level)).toEqual([3]);
    expect(h.confirmedAchievements).toBe(2);
    expect(h.completion).toBe('PARTIAL');
    expect(worldTargets({ level: 2, done: 0, target: 5, complete: false })[0].every((v) => v === 1)).toBe(true);
  });
  it('restart wipes progress, keeps the run counter increasing and returns to setup', () => {
    let s = confirmN(started(6), 3);
    const r = reduce(s, { type: 'restart' });
    expect([r.status, done(r), r.run, r.log]).toEqual(['ready', 0, 1, '']);
    s = reduce(r, { type: 'start', at: at() });
    expect(s.status).toBe('running');
  });
  it('pause/resume freeze the clock; safety pause needs an explicit resume', () => {
    let s = started(6);
    s = reduce(s, { type: 'tick', at: s.lastTick + 100 });
    const c1 = s.clock;
    s = reduce(s, { type: 'safety' });
    expect(reduce(s, { type: 'tick', at: s.lastTick + 500 }).clock).toBe(c1);
    expect(s.safety).toBe(true);
    s = reduce(s, { type: 'resume', at: at() });
    expect([s.status, s.safety]).toEqual(['running', false]);
  });
});

describe('live state, recovery and history', () => {
  it('round-trips through the shared payload and never resumes by itself after a reload', () => {
    const s = confirmN(started(6), 2);
    const live = makeLive(s, 'u1', 'ليلى');
    expect(reviveOceanWondersLive(live)).not.toBeNull();
    expect(live.ow3.payload.length).toBeLessThan(2000);
    const back = decode(live)!;
    expect(done(back)).toBe(2);
    const rec = recoveredState(live)!;
    expect([rec.status, rec.safety, done(rec)]).toEqual(['paused', true, 2]);
  });
  it('rejects garbage and impossible states', () => {
    const s = confirmN(started(6), 2);
    expect(validState({ ...s, level: 3 })).toBe(false);
    expect(validState({ ...s, confirmed: 99 })).toBe(false);
    expect(validState({ ...s, status: 'level-complete' })).toBe(false);
    expect(validState({ ...s, log: 'cxz' })).toBe(false);
    expect(decode({ engine: 'ow3', engineVersion: 1, sessionId: 'a', ow3: { payload: '{' } })).toBeNull();
  });
  it('builds a save-once history with exercise, level, target, counts, undo and notes; no score fields', () => {
    let s = run(started(4), { type: 'setExercise', exercise: 'الوقوف من الجلوس' }, { type: 'setNotes', notes: 'جلسة جيدة' });
    s = confirmN(s, 2);
    s = confirmN(s, 1, true);
    s = reduce(s, { type: 'undo', at: at() });
    s = reduce(s, { type: 'skip', at: at() });
    s = reduce(s, { type: 'end', at: at() });
    const h = buildHistory(s, 'p1', 'u1');
    expect(h).toMatchObject({ gameId: 'ocean-wonders-3d', engine: 'ow3', exerciseTitle: 'الوقوف من الجلوس', startingLevel: 1, endingLevel: 1, targetAchievements: 4, confirmedAchievements: 2, assistedAchievements: 0, skippedAchievements: 1, undoCount: 1, completion: 'PARTIAL', therapistNotes: 'جلسة جيدة' });
    expect(h.sessionId).toBe(`s1-r0`);
    expect(Object.keys(h).some((k) => /score|accuracy|reaction/i.test(k))).toBe(false);
    expect(reviveOceanWondersHistory(JSON.parse(JSON.stringify(h)))).not.toBeNull();
    expect(() => buildHistory(started(4), 'p1', 'u1')).toThrow();
  });
  it('a full three-level run ends COMPLETED; stopping at level 3 before the target does not', () => {
    let s = started(3);
    for (let l = 0; l < 3; l++) {
      s = confirmN(s, 3);
      if (l < 2) s = reduce(s, { type: 'continue', at: at() });
    }
    const full = buildHistory(reduce(s, { type: 'end', at: at() }), 'p', 'u');
    expect([full.completion, full.levelsCompleted, full.endingLevel]).toEqual(['COMPLETED', 3, 3]);
    const part = buildHistory(reduce(confirmN(reduce(confirmN(started(3), 3), { type: 'continue', at: at() }), 1), { type: 'end', at: at() }), 'p', 'u');
    expect([part.completion, part.levelsCompleted, part.endingLevel]).toEqual(['PARTIAL', 1, 2]);
  });
  it('an unstarted setup preview is recognised as unstarted by the shared visit guard', async () => {
    const { isUnstartedActivity } = await import('@/lib/therapyVisits/gameSafety');
    const ready = createState('r');
    const rec = { gameId: 'ocean-wonders-3d', session: { ...makeLive(ready, 'u', 'x'), gameState: 'START_ZONE' } } as never;
    expect(isUnstartedActivity(rec)).toBe(true);
    const live = { gameId: 'ocean-wonders-3d', session: makeLive(confirmN(started(6), 1), 'u', 'x') } as never;
    expect(isUnstartedActivity(live)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { ASPECTS, DEFAULT_CONFIG, createState, pathFor, pathOf, reduce, sanitizeConfig, stoneStates, summary, type Aspect, type Command, type State } from '../engine';
import { PATTERNS, WORLD_H, buildPath, checkPath, physicalEstimate } from '../world';
import { STAGES, TOTAL_STEPS, difficultyOf, worldOf } from '../stages';

const run = (s: State, ...cs: Command[]) => cs.reduce(reduce, s);
const started = (config = {}) => run(createState('f1', config), { type: 'start', at: 1000 });
const confirm = (s: State, assisted = false) => reduce(s, { type: 'confirm', stage: s.stage, step: s.step, assisted });
/** Plays the current stage to its end, resuming any optional rest pauses. */
function playStage(s: State, assistEvery = 0): State {
  const target = s.stage;
  let guard = 0;
  while (s.stage === target && s.status !== 'stage-complete' && s.status !== 'ended' && guard++ < 100) {
    if (s.status === 'paused') s = reduce(s, { type: 'resume', at: 2000 + guard });
    s = confirm(s, assistEvery > 0 && guard % assistEvery === 0);
  }
  return s;
}

describe('stage definitions', () => {
  it('are 3 levels x 3 stages with the specified patterns', () => {
    expect(STAGES).toHaveLength(9);
    expect(STAGES.map((s) => [s.level, s.stage])).toEqual([[1, 1], [1, 2], [1, 3], [2, 1], [2, 2], [2, 3], [3, 1], [3, 2], [3, 3]]);
    expect(STAGES.map((s) => s.pattern)).toEqual(['hops', 'straight', 'zigzag', 'alternate', 'curve', 'straight', 'varied', 'memory', 'combined']);
    expect(STAGES[3].alternating).toBe(true);
    expect(STAGES[5].rests.length).toBeGreaterThan(0);
    expect(STAGES[7].pairs).toBe(true);
    expect(STAGES.reduce((a, s) => a + s.steps, 0)).toBe(TOTAL_STEPS);
    expect([0, 3, 6].map((i) => difficultyOf(i))).toEqual(['EASY', 'MEDIUM', 'ADVANCED']);
    expect([0, 3, 6].map(worldOf)).toEqual([0, 1, 2]);
  });
});

describe('path generator: safety contract', () => {
  const ASP = Object.keys(ASPECTS) as Aspect[];
  it('every stage, every ratio, margin and therapist setting gives a safe, in-bounds, non-overlapping, comfortable path', () => {
    for (const def of STAGES) {
      for (const aspect of ASP) {
        for (const margin of [0, 4, 15]) {
          for (const stoneScale of [70, 100, 120]) {
            for (const spacing of [60, 100]) {
              for (const reach of [50, 100]) {
                for (const seed of [1, 99999]) {
                  const input = { stage: def.index, seed, aspect: ASPECTS[aspect], margin, stoneScale, spacing, reach };
                  const path = buildPath(def.pattern, def.steps, input);
                  expect(checkPath(path, def.steps)).toEqual([]);
                  expect(path).toEqual(buildPath(def.pattern, def.steps, input)); // deterministic: a reload reproduces it
                  expect(path.radius).toBeGreaterThan(0);
                  expect(path.maxStep).toBeLessThanOrEqual(0.4 * WORLD_H * 1.0001);
                  for (const s of path.stones) {
                    expect(s.x - path.radius).toBeGreaterThanOrEqual(-1e-9);
                    expect(s.x + path.radius).toBeLessThanOrEqual(path.worldW + 1e-9);
                    expect(s.y - path.radius).toBeGreaterThanOrEqual(-1e-9);
                    expect(s.y + path.radius).toBeLessThanOrEqual(path.worldH + 1e-9);
                  }
                  // clear separation: at least a 10 % gap relative to the nearest centre distance
                  expect(path.minDistance - 2 * path.radius).toBeGreaterThanOrEqual(0.1 * path.minDistance);
                }
              }
            }
          }
        }
      }
    }
  }, 120_000);
  it('keeps targets large: at default settings every stone is at least 11 % of the floor height wide', () => {
    for (const aspect of ASP) for (const def of STAGES) {
      const p = pathFor(def.index, 4242, { ...DEFAULT_CONFIG, aspect });
      expect((2 * p.radius) / p.worldH).toBeGreaterThanOrEqual(0.11);
    }
  });
  it('uses every pattern, and consecutive stones of every pattern are never a long-distance relocation', () => {
    expect(new Set(STAGES.map((s) => s.pattern))).toEqual(new Set(PATTERNS));
    for (const def of STAGES) {
      const p = pathFor(def.index, 7, DEFAULT_CONFIG);
      for (let i = 1; i < p.stones.length; i++) {
        const d = Math.hypot(p.stones[i].x - p.stones[i - 1].x, p.stones[i].y - p.stones[i - 1].y);
        expect(d).toBeLessThanOrEqual(0.4 * p.worldH * 1.0001);
      }
    }
  });
  it('lets the therapist shrink spacing and reach (shorter steps, smaller overall movement)', () => {
    const base = pathFor(1, 5, DEFAULT_CONFIG);
    const near = pathFor(1, 5, { ...DEFAULT_CONFIG, spacing: 60 });
    const small = pathFor(1, 5, { ...DEFAULT_CONFIG, reach: 50 });
    expect(near.maxStep).toBeLessThan(base.maxStep);
    expect(small.maxStep).toBeLessThan(base.maxStep);
    const bigStone = pathFor(2, 5, { ...DEFAULT_CONFIG, stoneScale: 120 });
    const smallStone = pathFor(2, 5, { ...DEFAULT_CONFIG, stoneScale: 70 });
    expect(bigStone.radius).toBeGreaterThan(smallStone.radius);
  });
  it('alternating-feet stage carries strictly alternating foot cues; other stages carry none', () => {
    const alt = pathFor(3, 3, DEFAULT_CONFIG);
    expect(alt.stones.map((s) => s.foot)).toEqual(['RIGHT', 'LEFT', 'RIGHT', 'LEFT', 'RIGHT', 'LEFT']);
    expect(pathFor(1, 3, DEFAULT_CONFIG).stones.every((s) => s.foot === null)).toBe(true);
  });
  it('estimates physical size from entered centimetres and reports nothing without them', () => {
    const p = pathFor(1, 3, DEFAULT_CONFIG);
    expect(physicalEstimate(p, 0, 0)).toBeNull();
    const a = physicalEstimate(p, 320, 180)!;
    const b = physicalEstimate(p, 640, 360)!;
    expect(a.stoneDiameterCm).toBeGreaterThan(20);
    expect(b.stoneDiameterCm / a.stoneDiameterCm).toBeCloseTo(2, 6);
    expect(a.axisMismatchPct).toBeLessThan(0.5);
    expect(physicalEstimate(p, 400, 300)!.axisMismatchPct).toBeGreaterThan(10);
  });
});

describe('manual play, exactly-once and never failing', () => {
  it('starts on the first stone, which is the only target', () => {
    const s = started();
    expect(s.status).toBe('running');
    expect(stoneStates(s)).toEqual(['TARGET', 'IDLE', 'IDLE', 'IDLE']);
  });
  it('confirms one step at a time and lights the next stone', () => {
    let s = started();
    s = confirm(s);
    expect(s.step).toBe(1);
    expect(stoneStates(s)).toEqual(['DONE', 'TARGET', 'IDLE', 'IDLE']);
    expect(s.events[0]).toMatchObject({ stage: 0, step: 0, kind: 'confirmed' });
  });
  it('rejects stale, duplicate and wrong-step confirmations (exactly once)', () => {
    const s = started();
    const stale = { type: 'confirm', stage: 0, step: 0, assisted: false } as const;
    const once = reduce(s, stale);
    expect(once.events).toHaveLength(1);
    expect(reduce(once, stale)).toBe(once); // the same command again
    expect(reduce(once, { type: 'confirm', stage: 0, step: 3, assisted: false })).toBe(once); // a future step
    expect(reduce(once, { type: 'confirm', stage: 4, step: 1, assisted: false })).toBe(once); // another stage
    expect(reduce(s, { type: 'confirm', stage: 0, step: 0, assisted: true }).events[0].kind).toBe('assisted');
    expect(reduce(createState('x'), stale).events).toHaveLength(0);
  });
  it('records assisted steps and skipped steps honestly', () => {
    let s = started();
    s = confirm(s, true);
    s = reduce(s, { type: 'skip', stage: 0, step: s.step });
    s = confirm(s);
    expect(s.events.map((e) => e.kind)).toEqual(['assisted', 'skipped', 'confirmed']);
    expect(stoneStates(s)[1]).toBe('SKIPPED');
    const sum = summary(s);
    expect(sum).toMatchObject({ presented: 3, completed: 2, confirmed: 1, assisted: 1, skipped: 1 });
  });
  it('completes a stage cleanly, or marks it skipped when a step was skipped', () => {
    const clean = playStage(started());
    expect(clean.status).toBe('stage-complete');
    expect(clean.completed).toContain(0);
    let withSkip = started();
    withSkip = reduce(withSkip, { type: 'skip', stage: 0, step: 0 });
    withSkip = playStage(withSkip);
    expect(withSkip.status).toBe('stage-complete');
    expect(withSkip.skipped).toContain(0);
    expect(withSkip.completed).not.toContain(0);
  });
  it('a slow response never fails or advances anything: ticking for hours changes no step', () => {
    let s = started();
    let t = 1000;
    for (let i = 0; i < 20_000; i++) { t += 250; s = reduce(s, { type: 'tick', at: t }); }
    expect(s.step).toBe(0);
    expect(s.events).toHaveLength(0);
    expect(s.status).toBe('running');
  });
  it('repeat replays the cue without changing progress', () => {
    const s = started();
    const r = reduce(s, { type: 'repeat' });
    expect(r.cue).toBe(1);
    expect(r.step).toBe(s.step);
    expect(r.events).toEqual(s.events);
  });
  it('pause, resume and the safety hold: nothing advances while held, and resume is explicit', () => {
    let s = started();
    s = reduce(s, { type: 'safety' });
    expect(s).toMatchObject({ status: 'paused', safety: true });
    let t = 5000;
    for (let i = 0; i < 100; i++) { t += 250; s = reduce(s, { type: 'tick', at: t }); }
    expect(s.step).toBe(0);
    s = reduce(s, { type: 'resume', at: 9000 });
    expect(s).toMatchObject({ status: 'running', safety: false });
    const p = reduce(started(), { type: 'pause' });
    expect(p.status).toBe('paused');
    expect(p.safety).toBe(false);
  });
  it('skip stage, next stage, stage selection lock, restart and end', () => {
    let s = started();
    s = reduce(s, { type: 'skipStage' });
    expect(s.status).toBe('stage-complete');
    expect(s.skipped).toContain(0);
    s = reduce(s, { type: 'next', at: 5000 });
    expect(s).toMatchObject({ stage: 1, status: 'ready', step: 0 });
    expect(reduce(s, { type: 'stage', stage: 0 })).toBe(s); // visited stages cannot be reselected
    expect(reduce(s, { type: 'stage', stage: 5 }).stage).toBe(5);
    expect(reduce(started(), { type: 'stage', stage: 5 }).stage).toBe(0); // not while running
    const r = reduce(playStage(started()), { type: 'restart' });
    expect(r).toMatchObject({ run: 1, status: 'ready', stage: 0, events: [] });
    const e = reduce(started(), { type: 'end', at: 9999 });
    expect(e.status).toBe('ended');
    expect(reduce(e, { type: 'start', at: 1 })).toBe(e);
  });
});

describe('optional rest pauses and the memory stage', () => {
  const toStage = (idx: number, config = {}) => {
    let s = createState('f2', config);
    s = reduce(s, { type: 'stage', stage: idx });
    return reduce(s, { type: 'start', at: 1000 });
  };
  it('offers a rest after the configured steps, needs an explicit resume, and can be turned off', () => {
    let s = toStage(5);
    s = confirm(confirm(confirm(s)));
    expect(s).toMatchObject({ status: 'paused', rest: true, step: 3 });
    s = reduce(s, { type: 'resume', at: 3000 });
    expect(s).toMatchObject({ status: 'running', rest: false });
    let off = toStage(5, { restPauses: false });
    off = confirm(confirm(confirm(off)));
    expect(off.status).toBe('running');
  });
  it('does not rest after a skipped step', () => {
    let s = toStage(5);
    s = confirm(confirm(s));
    s = reduce(s, { type: 'skip', stage: 5, step: 2 });
    expect(s.status).toBe('running');
  });
  it('memory stage shows each pair first (timed), then the child steps; the preview can be replayed or ended early', () => {
    let s = toStage(7);
    expect(s.phase).toBe('preview');
    let t = 1000;
    for (let i = 0; i < 16; i++) { t += 250; s = reduce(s, { type: 'tick', at: t }); }
    expect(s.phase).toBe('preview'); // 4 s of the 5 s preview
    for (let i = 0; i < 5; i++) { t += 250; s = reduce(s, { type: 'tick', at: t }); }
    expect(s.phase).toBe('step');
    s = confirm(s);
    expect(s.phase).toBe('step'); // second stone of the pair
    s = confirm(s);
    expect(s.step).toBe(2);
    expect(s.phase).toBe('preview'); // next pair
    s = reduce(s, { type: 'startSteps' });
    expect(s.phase).toBe('step');
    const replay = reduce(s, { type: 'preview' });
    expect(replay.phase).toBe('preview');
    expect(replay.cue).toBe(s.cue + 1);
    expect(reduce(started(), { type: 'preview' }).phase).toBe('step'); // not a memory stage: nothing
  });
});

describe('configuration', () => {
  it('sanitises every setting and never moves stones under a running step', () => {
    const c = sanitizeConfig({ ...DEFAULT_CONFIG, stoneScale: 999, spacing: 1, reach: 5, margin: -3, intensity: 9, previewMs: 1, aspect: 'bogus' as Aspect, quality: 'ultra' as never });
    expect(c).toMatchObject({ stoneScale: 120, spacing: 60, reach: 50, margin: 0, intensity: 50, previewMs: 2000, aspect: '16:9', quality: 'high' });
    const running = started();
    const after = reduce(running, { type: 'configure', config: { stoneScale: 70, spacing: 60, aspect: '4:3', margin: 10, quality: 'low', previewNext: true } });
    expect(after.config).toMatchObject({ stoneScale: 100, spacing: 100, aspect: '16:9', margin: 4, quality: 'low', previewNext: true });
    const paused = reduce(running, { type: 'pause' });
    expect(reduce(paused, { type: 'configure', config: { stoneScale: 70 } }).config.stoneScale).toBe(70);
  });
  it('only highlights the next stone when the therapist asks for that assistance', () => {
    let s = started();
    expect(stoneStates(s).filter((x) => x === 'NEXT')).toHaveLength(0);
    s = reduce(s, { type: 'configure', config: { previewNext: true } });
    expect(stoneStates(s)).toEqual(['TARGET', 'NEXT', 'IDLE', 'IDLE']);
    expect(stoneStates(s).filter((x) => x === 'TARGET')).toHaveLength(1);
  });
  it('sanitises calibration: both sizes or none, bounded, confirmation only with sizes', () => {
    const c = (config: object) => createState('cal', config).config;
    expect(c({ floorWidthCm: 400 })).toMatchObject({ floorWidthCm: 0, floorHeightCm: 0 });
    expect(c({ floorWidthCm: 400, floorHeightCm: 225, calibrationConfirmed: true })).toMatchObject({ floorWidthCm: 400, floorHeightCm: 225, calibrationConfirmed: true });
    expect(c({ calibrationConfirmed: true }).calibrationConfirmed).toBe(false);
    expect(c({ floorWidthCm: 99999, floorHeightCm: 225 }).floorWidthCm).toBe(3000);
  });
});

describe('all nine stages are playable manually, without any sensor', () => {
  it('completes every stage with the exact step counts', () => {
    let s = started();
    for (let stage = 0; stage < 9; stage++) {
      expect(pathOf(s).stones).toHaveLength(STAGES[stage].steps);
      s = playStage(s, 3);
      expect(s.status).toBe('stage-complete');
      expect(s.events.filter((e) => e.stage === stage)).toHaveLength(STAGES[stage].steps);
      expect(s.completed).toContain(stage);
      s = reduce(s, { type: 'next', at: 1_000_000 + stage });
      if (stage < 8) s = reduce(s, { type: 'start', at: 2_000_000 + stage });
    }
    expect(s.status).toBe('ended');
    expect(s.completed).toHaveLength(9);
    const sum = summary(s);
    expect(sum.presented).toBe(TOTAL_STEPS);
    expect(sum.completed).toBe(TOTAL_STEPS);
    expect(sum.assisted).toBeGreaterThan(0);
  });
});

describe('foot sensor hints', () => {
  const live = (mode: 'RIGHT_FOOT' | 'DUAL_FOOT' | 'MANUAL') => started({ inputMode: mode, inputSource: 'simulated' });
  it('records a movement hint but never confirms a step or moves anything', () => {
    let s = live('RIGHT_FOOT');
    s = reduce(s, { type: 'sensor', role: 'RIGHT_FOOT', event: 'onset', seq: 1, at: 1 });
    expect(s.sensor).toMatchObject({ pending: true, movements: 1 });
    expect(s.step).toBe(0);
    expect(s.events).toHaveLength(0);
    expect(confirm(s).sensor.pending).toBe(false); // the therapist's confirmation clears the hint
  });
  it('rejects duplicate, stale, wrong-role and manual-mode events', () => {
    const s = live('RIGHT_FOOT');
    const a = reduce(s, { type: 'sensor', role: 'RIGHT_FOOT', event: 'onset', seq: 5, at: 1 });
    expect(reduce(a, { type: 'sensor', role: 'RIGHT_FOOT', event: 'onset', seq: 5, at: 2 })).toBe(a);
    expect(reduce(a, { type: 'sensor', role: 'RIGHT_FOOT', event: 'onset', seq: 4, at: 3 })).toBe(a);
    expect(reduce(s, { type: 'sensor', role: 'LEFT_FOOT', event: 'onset', seq: 1, at: 1 })).toBe(s);
    const manual = live('MANUAL');
    expect(reduce(manual, { type: 'sensor', role: 'RIGHT_FOOT', event: 'onset', seq: 1, at: 1 })).toBe(manual);
  });
  it('keeps manual play fully available after the sensor is lost', () => {
    let s = live('DUAL_FOOT');
    s = reduce(s, { type: 'sensor', role: 'LEFT_FOOT', event: 'lost', seq: 1, at: 1 });
    expect(s.sensor.link.LEFT_FOOT).toBe('lost');
    s = confirm(s);
    expect(s.events[0].kind).toBe('confirmed');
  });
});

import { describe, expect, it } from 'vitest';
import { createState, reduce, tileStates, summary, layoutFor, layoutOf, aspectOf, RESTORE_MS, type Command, type State } from '../engine';
import { ASPECT_PRESETS, SQRT3, TILE_COUNTS, buildLayout, candidateShapes, fitFor, getLayout, physicalEstimate } from '../geometry';
import { LAYOUT_PRESETS, STAGES, checkWarning, generateWarning, tilesFor, warnCap } from '../stages';

const run = (s: State, ...cs: Command[]) => cs.reduce(reduce, s);
/** Advance time in 100 ms ticks. */
function advance(s: State, ms: number, from = s.lastTick || 1000): State {
  let t = from;
  for (let i = 0; i < ms / 100; i++) { t += 100; s = reduce(s, { type: 'tick', at: t }); }
  return s;
}
const started = (config = {}) => run(createState('s1', config), { type: 'start', at: 1000 });

/** Plays the current stage with the therapist confirming a safe neighbour (or the child's tile) each round. */
function playStage(s: State): State {
  const target = s.stage;
  let guard = 0;
  while (s.status === 'running' && s.stage === target && guard++ < 100) {
    if (s.phase === 'prep') s = run(s, { type: 'warn' });
    const dest = [...Array(layoutOf(s).tiles).keys()].find((t) => !s.warn.includes(t))!;
    s = run(s, { type: 'confirm', tile: dest, assisted: guard % 2 === 0 });
    s = advance(s, RESTORE_MS + 200);
  }
  return s;
}

describe('geometry', () => {
  const ASPECTS = [...Object.values(ASPECT_PRESETS), 1, 0.8, 2.8];
  it('builds valid layouts for every tile count and screen ratio: unique centres, no overlap, symmetric hex adjacency', () => {
    for (const n of TILE_COUNTS) {
      for (const aspect of ASPECTS) {
        const layout = getLayout(n, aspect);
        expect(layout.tiles).toBe(n);
        expect(layout.rows.reduce((a, b) => a + b, 0)).toBe(n);
        const seen = new Set<string>();
        for (let i = 0; i < n; i++) {
          const c = layout.centers[i];
          seen.add(`${c.x.toFixed(3)},${c.y.toFixed(3)}`);
          for (let j = 0; j < n; j++) if (j !== i) expect(Math.hypot(layout.centers[j].x - c.x, layout.centers[j].y - c.y)).toBeGreaterThanOrEqual(SQRT3 - 1e-6);
          expect(layout.neighbors[i].length).toBeGreaterThan(0);
          for (const nb of layout.neighbors[i]) {
            expect(layout.neighbors[nb]).toContain(i);
            expect(Math.hypot(layout.centers[nb].x - c.x, layout.centers[nb].y - c.y)).toBeCloseTo(SQRT3, 6);
          }
        }
        expect(seen.size).toBe(n);
        expect(layout.bounds.width).toBeGreaterThan(0);
      }
    }
  });
  it('is deterministic: Control and Display derive the identical layout from the same inputs', () => {
    for (const n of TILE_COUNTS) for (const a of ASPECTS) expect(getLayout(n, a).centers).toEqual(buildFresh(n, a));
  });
  it('only offers shapes that stay safe when any single tile is warned', () => {
    for (const n of TILE_COUNTS) {
      expect(candidateShapes(n).length).toBeGreaterThanOrEqual(2);
      for (const rows of candidateShapes(n)) expect(rows.every((l) => l >= 2)).toBe(true);
    }
  });
  it('picks the shape with the largest hexagons for the floor ratio (wide floors get wide shapes)', () => {
    const wide = getLayout(9, 16 / 9);
    const square = getLayout(9, 1);
    expect(wide.rows.length).toBeLessThan(square.rows.length + 1);
    expect(wide.bounds.width / wide.bounds.height).toBeGreaterThan(square.bounds.width / square.bounds.height);
  });
  it('fits inside the safe margins at every ratio, preset and margin, and never overflows the screen', () => {
    for (const preset of LAYOUT_PRESETS) {
      for (const stage of [0, 3, 6]) {
        for (const aspect of ASPECTS) {
          for (const margin of [0, 3, 8, 15]) {
            for (const scale of [70, 100, 110]) {
              const layout = getLayout(tilesFor(stage, preset), aspect);
              const fit = fitFor(layout, { aspect, margin, scale });
              const f = (1 - (2 * margin) / 100) * (scale / 100);
              expect(fit.widthFill).toBeLessThanOrEqual(f + 1e-9);
              expect(fit.heightFill).toBeLessThanOrEqual(f + 1e-9);
              // the limiting side is exactly filled to the margin
              expect(Math.max(fit.widthFill, fit.heightFill)).toBeCloseTo(f, 9);
              if (scale <= 100) { expect(fit.widthFill).toBeLessThanOrEqual(1 - (2 * margin) / 100 + 1e-9); expect(fit.heightFill).toBeLessThanOrEqual(1 - (2 * margin) / 100 + 1e-9); }
              expect(fit.usableCoverage).toBeLessThanOrEqual(1 + 1e-9);
            }
          }
        }
      }
    }
  });
  it('makes hexagons larger as the preset has fewer tiles, and the enlarged layout beats the previous fixed grids', () => {
    const size = (n: number, aspect: number) => 1 / fitFor(getLayout(n, aspect), { aspect, margin: 3, scale: 100 }).viewH;
    for (const aspect of [16 / 9, 16 / 10, 4 / 3]) {
      expect(size(6, aspect)).toBeGreaterThan(size(9, aspect));
      expect(size(9, aspect)).toBeGreaterThanOrEqual(size(12, aspect) - 1e-9); // equal when both are three-row grids
      expect(size(12, aspect)).toBeGreaterThan(size(16, aspect));
      expect(size(16, aspect)).toBeGreaterThan(size(20, aspect));
    }
    // previous fixed rectangular grids at the old 6 % margin on 16:9: cell size = 1 / viewH
    const old = (rows: number[]) => 1 / fitFor(getLayoutFixed(rows), { aspect: 16 / 9, margin: 6, scale: 100 }).viewH;
    expect(size(9, 16 / 9)).toBeGreaterThan(old([3, 3, 3]));
    expect(size(12, 16 / 9)).toBeGreaterThanOrEqual(old([4, 4, 4]));
    expect(size(16, 16 / 9)).toBeGreaterThan(old([4, 4, 4, 4]));
  });
});

const getLayoutFixed = (rows: number[]) => buildLayout(rows);
const buildFresh = (n: number, aspect: number) => {
  // recompute without the cache: best candidate by the same rule
  let best = candidateShapes(n)[0];
  let bs = -1;
  const a = Math.round(Math.max(0.6, Math.min(3, aspect)) * 1000) / 1000;
  for (const rows of candidateShapes(n)) {
    const l = buildLayout(rows);
    const sc = Math.min(a / l.bounds.width, 1 / l.bounds.height);
    if (sc > bs + 1e-9) { bs = sc; best = rows; }
  }
  return buildLayout(best).centers;
};

describe('stage definitions', () => {
  it('match the specification exactly', () => {
    expect(STAGES.map((s) => [s.tiles, s.rounds, s.maxWarn])).toEqual([
      [9, 3, 1], [9, 3, 1], [9, 4, 2],
      [12, 4, 2], [12, 5, 2], [12, 5, 3],
      [16, 5, 3], [16, 6, 3], [16, 6, 4],
    ]);
    STAGES.forEach((s) => expect(s.warn).toHaveLength(s.rounds));
  });
});

describe('round generator', () => {
  it('is deterministic and always satisfies the safety contract: every preset, stage, round, seed, child tile and screen ratio', () => {
    for (const preset of LAYOUT_PRESETS) {
      for (const def of STAGES) {
        for (const aspect of [16 / 9, 4 / 3]) {
          const layout = getLayout(tilesFor(def.index, preset), aspect);
          for (let seed = 1; seed <= 6; seed++) {
            for (let round = 0; round < def.rounds; round++) {
              for (const child of [null, ...Array(layout.tiles).keys()] as (number | null)[]) {
                for (const targetChild of [true, false]) {
                  const input = { layout, preset, seed: seed * 7919, stage: def.index, round, childTile: child, targetChild };
                  const warn = generateWarning(input);
                  expect(warn).toEqual(generateWarning(input));
                  expect(checkWarning(layout, warn).ok).toBe(true);
                  expect(warn.length).toBeGreaterThanOrEqual(1);
                  expect(warn.length).toBeLessThanOrEqual(def.maxWarn);
                  expect(warn.length).toBeLessThanOrEqual(warnCap(def.index, preset));
                  expect(warn.length).toBeLessThanOrEqual(def.warn[round]);
                  expect(layout.tiles - warn.length).toBeGreaterThanOrEqual(Math.ceil(layout.tiles / 2));
                  if (targetChild && child !== null) {
                    expect(warn).toContain(child);
                    // a one-tile step to a safe tile always exists
                    expect(layout.neighbors[child].some((n) => !warn.includes(n))).toBe(true);
                  }
                }
              }
            }
          }
        }
      }
    }
  }, 240_000);
  it('rejects unsafe sets', () => {
    const l = buildLayout([3, 3, 3]);
    expect(checkWarning(l, [0, 1, 2, 3, 4, 5, 6, 7, 8]).reason).toBe('no-safe');
    expect(checkWarning(l, [99]).reason).toBe('range');
    expect(checkWarning(l, [1, 1]).reason).toBe('duplicates');
    // warning a tile together with all of its neighbours traps it
    expect(checkWarning(l, [0, ...l.neighbors[0]]).ok).toBe(false);
  });
  it('never guesses the child position', () => {
    const s = started();
    expect(s.childTile).toBeNull();
    const warned = run(s, { type: 'warn' });
    expect(warned.childTile).toBeNull();
    expect(warned.warn.length).toBe(1);
  });
});

describe('round lifecycle and timing', () => {
  it('walks prep -> warning (5 s) -> inactive and waits for the therapist, never failing', () => {
    let s = started();
    expect(s.config.warnMs).toBe(5000);
    expect(tileStates(s).every((t) => t === 'SAFE')).toBe(true);
    s = advance(s, s.config.prepMs + 200);
    expect(s.phase).toBe('warning');
    expect(tileStates(s).filter((t) => t === 'WARNING')).toHaveLength(1);
    s = advance(s, 4500);
    expect(s.phase).toBe('warning');
    s = advance(s, 400);
    expect(s.phase).toBe('inactive');
    expect(tileStates(s).filter((t) => t === 'INACTIVE')).toHaveLength(1);
    const later = advance(s, 120_000);
    expect(later.phase).toBe('inactive');
    expect(later.status).toBe('running');
    expect(later.events).toHaveLength(0);
  });
  it('does not change the warning set once it has started', () => {
    let s = run(started({ auto: false }), { type: 'warn' });
    const warn = s.warn;
    s = run(s, { type: 'child', tile: 4 }, { type: 'extend', ms: 3000 });
    expect(s.warn).toEqual(warn);
    s = advance(s, 20_000);
    expect(s.warn).toEqual(warn);
  });
  it('lets the therapist extend, pause, or disable automatic timing', () => {
    let s = started();
    s = advance(s, s.config.prepMs + 200);
    s = run(s, { type: 'extend', ms: 5000 });
    expect(s.config.warnMs).toBe(10000);
    s = advance(s, 6000);
    expect(s.phase).toBe('warning');
    s = run(s, { type: 'pause' });
    const frozen = s.elapsed;
    s = advance(run(s, { type: 'tick', at: 50_000 }), 30_000, 50_000);
    expect(s.elapsed).toBe(frozen);
    expect(s.phase).toBe('warning');
    s = run(s, { type: 'resume', at: 90_000 });
    s = run(s, { type: 'configure', config: { auto: false } });
    s = advance(s, 60_000, 90_000);
    expect(s.phase).toBe('warning');
    s = run(s, { type: 'hide' });
    expect(s.phase).toBe('inactive');
  });
  it('caps a tick so a stalled tab cannot fast-forward a warning', () => {
    let s = run(started({ auto: false, prepMs: 1000 }), { type: 'warn' });
    s = run(s, { type: 'configure', config: { auto: true } }, { type: 'tick', at: 1_000_000 });
    expect(s.elapsed).toBeLessThanOrEqual(250);
    expect(s.phase).toBe('warning');
  });
});

describe('therapist safety override', () => {
  it('freezes the current layout, blocks every automatic transition and needs an explicit resume', () => {
    let s = started();
    s = advance(s, s.config.prepMs + 200);
    const layout = tileStates(s);
    s = run(s, { type: 'safety' });
    expect(s.safety).toBe(true);
    expect(s.status).toBe('paused');
    s = advance(run(s, { type: 'tick', at: 9_000_000 }), 60_000, 9_000_000);
    expect(tileStates(s)).toEqual(layout);
    expect(s.events).toHaveLength(0);
    s = run(s, { type: 'resume', at: 9_100_000 });
    expect(s.status).toBe('running');
    expect(s.safety).toBe(false);
  });
  it('keeps progress and does not start a round by itself', () => {
    let s = started({ auto: false });
    s = run(s, { type: 'warn' }, { type: 'confirm', tile: [...Array(9).keys()].find((t) => !run(s, { type: 'warn' }).warn.includes(t))!, assisted: false });
    const events = s.events;
    s = run(s, { type: 'safety' });
    s = advance(run(s, { type: 'tick', at: 5000 }), 30_000, 5000);
    expect(s.events).toEqual(events);
    expect(s.round).toBe(0);
  });
});

describe('manual play of all nine stages without any sensor', () => {
  it('completes every stage with the exact round counts', () => {
    let s = started({ prepMs: 1000 });
    for (let stage = 0; stage < 9; stage++) {
      s = playStage(s);
      expect(s.status).toBe('stage-complete');
      expect(s.events.filter((e) => e.stage === stage)).toHaveLength(STAGES[stage].rounds);
      expect(s.completed).toContain(stage);
      s = run(s, { type: 'next', at: 1_000_000 + stage });
      if (stage < 8) { expect(s.status).toBe('ready'); s = run(s, { type: 'start', at: 2_000_000 + stage }); }
    }
    expect(s.status).toBe('ended');
    expect(s.completed).toHaveLength(9);
    const sum = summary(s);
    expect(sum.presented).toBe(STAGES.reduce((a, d) => a + d.rounds, 0));
    expect(sum.completed).toBe(sum.presented);
    expect(sum.confirmed + sum.assisted).toBe(sum.completed);
    expect(sum.assisted).toBeGreaterThan(0);
  });
  it('rejects a confirmation onto a warned tile and duplicate confirmations of one round', () => {
    const s = run(started({ auto: false }), { type: 'warn' });
    const bad = s.warn[0];
    expect(run(s, { type: 'confirm', tile: bad, assisted: false })).toBe(s);
    const good = [...Array(9).keys()].find((t) => !s.warn.includes(t))!;
    const once = run(s, { type: 'confirm', tile: good, assisted: false });
    expect(once.events).toHaveLength(1);
    expect(run(once, { type: 'confirm', tile: good, assisted: true }).events).toHaveLength(1);
    expect(once.childTile).toBe(good);
  });
  it('supports repeat, skip round and skip stage with honest accounting', () => {
    let s = run(started({ auto: false }), { type: 'warn' }, { type: 'repeat' });
    expect(s.phase).toBe('prep');
    expect(s.warn).toEqual([]);
    s = run(s, { type: 'skipRound' });
    expect(s.events[0].kind).toBe('skipped');
    s = advance(s, RESTORE_MS + 200);
    expect(s.round).toBe(1);
    s = run(s, { type: 'skipStage' });
    expect(s.status).toBe('stage-complete');
    expect(s.skipped).toContain(0);
    expect(s.completed).not.toContain(0);
    expect(summary(s).completed).toBe(0);
  });
  it('lets the therapist set and correct the child tile', () => {
    let s = started();
    s = run(s, { type: 'child', tile: 4 });
    expect(s.childTile).toBe(4);
    s = run(s, { type: 'child', tile: 5 });
    expect(s.childTile).toBe(5);
    expect(run(s, { type: 'child', tile: 99 })).toBe(s);
    expect(run(s, { type: 'child', tile: null }).childTile).toBeNull();
    // the confirmed tile is the one practised
    s = run(started({ prepMs: 1000 }), { type: 'child', tile: 4 }, { type: 'warn' });
    expect(s.warn).toContain(4);
  });
  it('ends the session and restarts as a new run', () => {
    let s = run(started(), { type: 'end', at: 5000 });
    expect(s.status).toBe('ended');
    expect(run(s, { type: 'warn' })).toBe(s);
    s = run(s, { type: 'restart' });
    expect(s.run).toBe(1);
    expect(s.status).toBe('ready');
    expect(s.events).toEqual([]);
  });
});

describe('foot sensor hints', () => {
  const live = (mode: 'RIGHT_FOOT' | 'DUAL_FOOT' | 'MANUAL') => {
    let s = started({ inputMode: mode, inputSource: 'simulated', auto: false });
    s = run(s, { type: 'warn' });
    return s;
  };
  it('records a movement hint but never moves the child or counts a transition', () => {
    let s = live('RIGHT_FOOT');
    s = run(s, { type: 'sensor', role: 'RIGHT_FOOT', event: 'onset', seq: 1, at: 1 });
    expect(s.sensor.pending).toBe(true);
    expect(s.sensor.movements).toBe(1);
    expect(s.childTile).toBeNull();
    expect(s.events).toHaveLength(0);
  });
  it('rejects duplicate, stale, wrong-role and manual-mode events', () => {
    const s = live('RIGHT_FOOT');
    const a = run(s, { type: 'sensor', role: 'RIGHT_FOOT', event: 'onset', seq: 5, at: 1 });
    expect(run(a, { type: 'sensor', role: 'RIGHT_FOOT', event: 'onset', seq: 5, at: 2 })).toBe(a);
    expect(run(a, { type: 'sensor', role: 'RIGHT_FOOT', event: 'onset', seq: 4, at: 3 })).toBe(a);
    expect(run(s, { type: 'sensor', role: 'LEFT_FOOT', event: 'onset', seq: 1, at: 1 })).toBe(s);
    const manual = live('MANUAL');
    expect(run(manual, { type: 'sensor', role: 'RIGHT_FOOT', event: 'onset', seq: 1, at: 1 })).toBe(manual);
  });
  it('keeps the session playable manually after the sensor is lost', () => {
    let s = live('DUAL_FOOT');
    s = run(s, { type: 'sensor', role: 'LEFT_FOOT', event: 'lost', seq: 1, at: 1 });
    expect(s.sensor.link.LEFT_FOOT).toBe('lost');
    const good = [...Array(9).keys()].find((t) => !s.warn.includes(t))!;
    s = run(s, { type: 'confirm', tile: good, assisted: false });
    expect(s.events).toHaveLength(1);
    expect(s.events[0].kind).toBe('confirmed');
  });
  it('resets sensor state when the input mode changes', () => {
    let s = live('RIGHT_FOOT');
    s = run(s, { type: 'sensor', role: 'RIGHT_FOOT', event: 'onset', seq: 1, at: 1 });
    s = run(s, { type: 'configure', config: { inputMode: 'DUAL_FOOT', inputSource: 'simulated' } });
    expect(s.sensor.movements).toBe(0);
  });
});

describe('layout presets, calibration and the between-stages lock', () => {
  it('defines the three presets: STANDARD keeps the approved counts; EXTRA_LARGE and COMPACT are explicit adaptations', () => {
    expect([0, 3, 6].map((i) => tilesFor(i, 'STANDARD'))).toEqual([9, 12, 16]);
    expect([0, 3, 6].map((i) => tilesFor(i, 'EXTRA_LARGE'))).toEqual([6, 9, 12]);
    expect([0, 3, 6].map((i) => tilesFor(i, 'COMPACT'))).toEqual([12, 16, 20]);
    for (let i = 0; i < 9; i++) expect(tilesFor(i, 'STANDARD')).toBe(STAGES[i].tiles);
    // rounds and warned-tile rules are identical in every preset
    expect(STAGES.map((d) => d.rounds)).toEqual([3, 3, 4, 4, 5, 5, 5, 6, 6]);
    expect(createState('p').config.layoutPreset).toBe('STANDARD');
  });
  it('plays all nine stages on every preset with the right tile counts', () => {
    for (const preset of LAYOUT_PRESETS) {
      let s = run(createState('pp-' + preset, { prepMs: 1000, layoutPreset: preset }), { type: 'start', at: 1000 });
      for (let stage = 0; stage < 9; stage++) {
        expect(layoutOf(s).tiles).toBe(tilesFor(stage, preset));
        s = playStage(s);
        expect(s.status).toBe('stage-complete');
        expect(s.events.filter((e) => e.stage === stage)).toHaveLength(STAGES[stage].rounds);
        expect(s.events.filter((e) => e.stage === stage).every((e) => e.tiles === tilesFor(stage, preset))).toBe(true);
        s = run(s, { type: 'next', at: 1_000_000 + stage });
        if (stage < 8) s = run(s, { type: 'start', at: 2_000_000 + stage });
      }
      expect(s.status).toBe('ended');
      expect(s.completed).toHaveLength(9);
    }
  }, 120_000);
  it('changes layout settings only between stages and clears the child tile when the geometry changes', () => {
    let s = run(createState('lock'), { type: 'child', tile: 4 });
    const ready = run(s, { type: 'configure', config: { layoutPreset: 'EXTRA_LARGE' } });
    expect(ready.config.layoutPreset).toBe('EXTRA_LARGE');
    expect(ready.childTile).toBeNull();
    expect(layoutOf(ready).tiles).toBe(6);
    s = run(createState('lock2', { auto: false }), { type: 'start', at: 1 }, { type: 'warn' });
    for (const config of [{ layoutPreset: 'COMPACT' as const }, { aspect: '4:3' as const }, { floorWidthCm: 300, floorHeightCm: 200 }]) {
      const after = run(s, { type: 'configure', config });
      expect(after.config.layoutPreset).toBe('STANDARD');
      expect(after.config.aspect).toBe('16:9');
      expect(after.config.floorWidthCm).toBe(0);
      expect(after.warn).toEqual(s.warn);
    }
    const paused = run(s, { type: 'pause' }, { type: 'configure', config: { layoutPreset: 'COMPACT' } });
    expect(paused.config.layoutPreset).toBe('STANDARD');
    // margin and scale stay adjustable at any time
    expect(run(s, { type: 'configure', config: { margin: 10, scale: 90 } }).config).toMatchObject({ margin: 10, scale: 90 });
    const done = playStage(run(createState('lock3', { prepMs: 1000 }), { type: 'start', at: 1000 }));
    expect(run(done, { type: 'configure', config: { layoutPreset: 'COMPACT' } }).config.layoutPreset).toBe('COMPACT');
  });
  it('sanitises calibration input: both sizes or none, bounded, confirmation only with sizes', () => {
    const c = (config: object) => createState('cal', config).config;
    expect(c({ floorWidthCm: 400 })).toMatchObject({ floorWidthCm: 0, floorHeightCm: 0 });
    expect(c({ floorWidthCm: 10, floorHeightCm: 10 })).toMatchObject({ floorWidthCm: 0, floorHeightCm: 0 });
    expect(c({ floorWidthCm: 400, floorHeightCm: 225 })).toMatchObject({ floorWidthCm: 400, floorHeightCm: 225, calibrationConfirmed: false });
    expect(c({ floorWidthCm: 99999, floorHeightCm: 225 }).floorWidthCm).toBe(3000);
    expect(c({ calibrationConfirmed: true }).calibrationConfirmed).toBe(false);
    expect(c({ floorWidthCm: 400, floorHeightCm: 225, calibrationConfirmed: true }).calibrationConfirmed).toBe(true);
    expect(c({ aspect: 'bogus' }).aspect).toBe('16:9');
    expect(c({ layoutPreset: 'bogus' }).layoutPreset).toBe('STANDARD');
  });
  it('estimates physical hexagon size and spacing from entered centimetres, and reports nothing without them', () => {
    const cfg = createState('est').config;
    const layout = layoutFor(0, cfg);
    const fit = fitFor(layout, { aspect: aspectOf(cfg), margin: cfg.margin, scale: cfg.scale });
    expect(physicalEstimate(layout, fit, { floorWidthCm: 0, floorHeightCm: 0 })).toBeNull();
    const est = physicalEstimate(layout, fit, { floorWidthCm: 320, floorHeightCm: 180 })!;
    expect(est.axisMismatchPct).toBeLessThan(0.5); // 320x180 is exactly 16:9
    expect(est.arenaWidthCm).toBeLessThanOrEqual(320);
    expect(est.arenaHeightCm).toBeLessThanOrEqual(180);
    expect(est.tileFlatToFlatCm).toBeCloseTo(est.cellFlatToFlatCm * 0.93, 6);
    expect(est.gapCm).toBeCloseTo(est.cellFlatToFlatCm * 0.07, 6);
    // doubling the floor doubles every physical size
    const big = physicalEstimate(layout, fit, { floorWidthCm: 640, floorHeightCm: 360 })!;
    expect(big.tileFlatToFlatCm / est.tileFlatToFlatCm).toBeCloseTo(2, 6);
    // a floor whose shape differs from the projector image is stretched, and that is reported
    expect(physicalEstimate(layout, fit, { floorWidthCm: 400, floorHeightCm: 300 })!.axisMismatchPct).toBeGreaterThan(10);
  });
  it('before/after tile coverage: enlarged layouts use more of the floor and have larger hexagons than the old fixed grids', () => {
    const rows: Record<number, number[]> = { 9: [3, 3, 3], 12: [4, 4, 4], 16: [4, 4, 4, 4] };
    for (const n of [9, 12, 16]) {
      const before = fitFor(buildLayout(rows[n]), { aspect: 16 / 9, margin: 6, scale: 100 });
      const after = fitFor(getLayout(n, 16 / 9), { aspect: 16 / 9, margin: 3, scale: 100 });
      expect(after.usableCoverage).toBeGreaterThanOrEqual(before.usableCoverage - 1e-9);
      expect(after.cellPointToPointFrac).toBeGreaterThanOrEqual(before.cellPointToPointFrac - 1e-9);
      expect(after.screenCoverage).toBeGreaterThan(before.screenCoverage);
    }
  });
});

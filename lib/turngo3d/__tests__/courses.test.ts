import { describe, expect, it } from 'vitest';
import { AREA_H, AREA_W, buildPlan, CONE_SAFE, COURSE_IDS, COURSES, DEFAULT_PLAN_CONFIG, dist, makeFrame, minDistToPoints, routePoints, sampleSpline, turnAt, type Pt } from '../courses';

const plan = (id: (typeof COURSE_IDS)[number], over = {}) => buildPlan(id, { ...DEFAULT_PLAN_CONFIG, ...over });

describe('course geometry', () => {
  for (const id of COURSE_IDS) {
    it(`${id}: stars keep the safe margin from every cone and stay inside the area`, () => {
      for (const rot of [0, 90, 180, 270] as const) for (const mirror of [false, true]) for (const density of [0, 1, 2] as const) {
        const p = plan(id, { rot, mirror, density });
        for (const cp of p.cps) {
          for (const c of p.cones) expect(dist(cp, c)).toBeGreaterThanOrEqual(CONE_SAFE - 1e-6);
          expect(Math.abs(cp[0])).toBeLessThanOrEqual(AREA_W / 2);
          expect(Math.abs(cp[1])).toBeLessThanOrEqual(AREA_H / 2);
        }
        for (const c of p.cones) expect(dist(p.start, c)).toBeGreaterThanOrEqual(CONE_SAFE - 1e-6);
        // sideways orientations squeeze long courses: only the honest "cone close to the corridor" notice may appear there
        expect(p.warnings.filter((w) => rot % 180 === 0 || !w.startsWith('مخروط قريب'))).toEqual([]);
        expect(p.kinds.at(-1)).toBe('finish');
        expect(p.cps.length).toBeGreaterThanOrEqual(1);
      }
    });
    it(`${id}: the drawn corridor never covers a cone`, () => {
      const p = plan(id);
      if (!p.cones.length) return;
      const path = sampleSpline([p.start, ...p.cps]);
      expect(minDistToPoints(path, p.cones)).toBeGreaterThan(p.width / 2 + 0.25);
    });
  }

  it('rotation and mirror are exactly invertible', () => {
    for (const rot of [0, 90, 180, 270] as const) for (const mirror of [false, true]) {
      const f = makeFrame(rot, mirror, 0.8, 0.6, [1, -0.5]);
      const q: Pt = [3.1, 2.2];
      const back = f.toBase(f.toFinal(q));
      expect(back[0]).toBeCloseTo(q[0], 9);
      expect(back[1]).toBeCloseTo(q[1], 9);
    }
  });

  it('mirroring swaps left and right turns', () => {
    const a = plan('one'), b = plan('one', { mirror: true });
    const turn = (p: typeof a) => turnAt(p.cps[0], p.cps[1], p.cps[2]);
    expect(turn(a)).not.toBe('straight');
    expect(turn(a)).toBe(turn(b) === 'left' ? 'right' : 'left');
  });

  it('density: fewer drops optional stars only, more adds midpoints, the finish always remains', () => {
    const base = plan('straight', { density: 1 }), fewer = plan('straight', { density: 0 }), more = plan('straight', { density: 2 });
    expect(base.cps.length).toBe(2);
    expect(fewer.cps.length).toBe(1);
    expect(more.cps.length).toBeGreaterThan(base.cps.length);
    for (const id of COURSE_IDS) expect(plan(id, { density: 0 }).kinds.at(-1)).toBe('finish');
  });

  it('therapist moves are honoured in the base frame and survive a rotation', () => {
    const moved = plan('one', { cones: { '0': [1.5, 0.5] as Pt }, rot: 90 });
    const plain = plan('one', { rot: 90 });
    expect(dist(moved.cones[0], plain.cones[0])).toBeGreaterThan(0.5);
    // the star anchored to the cone travelled with it
    expect(dist(moved.cps[1], plain.cps[1])).toBeGreaterThan(0.5);
  });

  it('a cone dragged onto a star pushes the star away instead of putting it under the cone', () => {
    const p = plan('straight');
    expect(p.cones).toEqual([]);
    const q = buildPlan('two', { ...DEFAULT_PLAN_CONFIG, cones: { '0': COURSES.two.cps[0].p as Pt } });
    for (const cp of q.cps) for (const c of q.cones) expect(dist(cp, c)).toBeGreaterThanOrEqual(CONE_SAFE - 1e-6);
  });

  it('alternates (route events) are safe and never the finish', () => {
    for (const id of COURSE_IDS) {
      const p = plan(id);
      expect(p.alts.at(-1)).toBeNull();
      p.alts.forEach((alt) => {
        if (!alt) return;
        for (const c of p.cones) expect(dist(alt, c)).toBeGreaterThanOrEqual(CONE_SAFE);
      });
      expect(routePoints(p, { 1: 1 }).length).toBe(p.cps.length + 1);
    }
  });

  it('turn directions are the child\'s left and right', () => {
    expect(turnAt([0, 0], [1, 0], [1, 1])).toBe('left');
    expect(turnAt([0, 0], [1, 0], [1, -1])).toBe('right');
    expect(turnAt([0, 0], [1, 0], [2, 0.05])).toBe('straight');
  });
});

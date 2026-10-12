import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, LANE_SETS, sanitizeConfig, type LaneSet } from '../config';
import { computeLayout, estimateZoneCm, projectFloor } from '../layout';
import { captionOf, shortOf } from '../captions';
import { planStage, STAGES_FOR_TEST } from './helpers';

const ASPECTS = [16 / 9, 16 / 10, 4 / 3, 21 / 9];

describe('arena layout and projection geometry', () => {
  it('near zones appear square in the image whatever the perspective, so they are square on a projected floor', () => {
    for (const aspect of ASPECTS)
      for (const perspective of [0, 30, 60, 82, 100]) {
        const cfg = sanitizeConfig({ perspective });
        const L = computeLayout(cfg, aspect);
        const i = Math.floor(L.n / 2);
        const half = L.size / 2;
        const dz = (L.size * L.depthStretch) / 2;
        // width along the near line, height along the centre of the zone
        const wl = projectFloor(L, cfg, L.xs[i] - half, 0), wr = projectFloor(L, cfg, L.xs[i] + half, 0);
        const far = projectFloor(L, cfg, L.xs[i], -dz), near = projectFloor(L, cfg, L.xs[i], dz);
        const wPx = (wr.x - wl.x) * aspect;
        const hPx = near.y - far.y;
        expect(wPx / hPx).toBeGreaterThan(0.93);
        expect(wPx / hPx).toBeLessThan(1.08);
      }
  });
  it('the near zones stay on screen: inside the safe margin horizontally and clear of the bottom edge', () => {
    for (const aspect of ASPECTS)
      for (const laneSet of Object.keys(LANE_SETS) as LaneSet[])
        for (const margin of [0, 4, 12]) {
          const cfg = sanitizeConfig({ laneSet, margin, nearY: 8, laneSpacing: 140, targetSize: 120 });
          const L = computeLayout(cfg, aspect);
          const left = projectFloor(L, cfg, L.xs[0] - L.size / 2, 0);
          const right = projectFloor(L, cfg, L.xs[L.n - 1] + L.size / 2, 0);
          expect(left.x).toBeGreaterThanOrEqual(margin / 100 - 0.01);
          expect(right.x).toBeLessThanOrEqual(1 - margin / 100 + 0.01);
          const bottom = projectFloor(L, cfg, L.xs[0], (L.size * 1.1 * L.depthStretch) / 2);
          expect(bottom.y).toBeLessThanOrEqual(1 - margin / 100 + 0.01);
        }
  });
  it('the layout is a pure function of the settings: nothing moves between calls', () => {
    const a = computeLayout(DEFAULT_CONFIG, 16 / 9);
    const b = computeLayout(DEFAULT_CONFIG, 16 / 9);
    expect(b).toEqual(a);
  });
  it('fewer lanes give larger targets; the lane spacing and size sliders change the layout', () => {
    const four = computeLayout(sanitizeConfig({ laneSet: '4' }), 16 / 9);
    const two = computeLayout(sanitizeConfig({ laneSet: '2C' }), 16 / 9);
    expect(two.size).toBeGreaterThan(four.size);
    expect(two.xs).toHaveLength(2);
    expect(computeLayout(sanitizeConfig({ targetSize: 70 }), 16 / 9).size).toBeLessThan(four.size);
    expect(computeLayout(sanitizeConfig({ laneSpacing: 80 }), 16 / 9).pitch).toBeLessThan(four.pitch);
  });
  it('lane positions are symmetric and ordered left to right', () => {
    const L = computeLayout(DEFAULT_CONFIG, 16 / 9);
    expect(L.xs[0]).toBeCloseTo(-L.xs[3], 6);
    expect([...L.xs].sort((p, q) => p - q)).toEqual(L.xs);
    expect(L.lanes).toEqual([0, 1, 2, 3]);
  });
  it('shows physical distances only when the therapist entered a measured floor size', () => {
    const L = computeLayout(DEFAULT_CONFIG, 16 / 9);
    expect(estimateZoneCm(L, { floorWidthCm: 0 })).toBeNull();
    const cm = estimateZoneCm(L, { floorWidthCm: 400 });
    expect(cm).not.toBeNull();
    expect(cm!).toBeGreaterThan(20);
    expect(cm!).toBeLessThan(200);
    expect(estimateZoneCm(L, { floorWidthCm: 800 })!).toBeGreaterThan(cm!);
  });
});

describe('captions never rely on colour alone', () => {
  it('every target caption names the foot and the colour', () => {
    for (let stage = 0; stage < STAGES_FOR_TEST; stage++)
      for (const st of planStage(stage)) {
        const text = captionOf(st);
        expect(text).toMatch(/القدم|القدمان|أي قدم/);
        expect(text).toMatch(/أحمر|أزرق|أخضر|أصفر/);
        expect(shortOf(st).length).toBeGreaterThan(3);
      }
  });
});

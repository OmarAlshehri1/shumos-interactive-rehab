import { describe, expect, it } from 'vitest';
import { CAPABILITY_MATRIX, FOOT_THRESHOLDS, FootMovementDetector, SimulatedFootSource } from '../sensorInput';

const feed = (d: FootMovementDetector, role: string, mags: number[], stepMs = 50, startAt = 100, startSeq = 1) =>
  mags.flatMap((m, i) => d.push({ role, magnitude: m, at: startAt + i * stepMs, seq: startSeq + i }));

describe('FootMovementDetector', () => {
  it('needs sustained, clear movement for onset, and a sustained stillness for rest', () => {
    const d = new FootMovementDetector('RIGHT_FOOT');
    expect(feed(d, 'RIGHT_FOOT', [0.9])).toEqual([]);
    const events = feed(d, 'RIGHT_FOOT', Array(10).fill(0.8), 50, 200, 10);
    expect(events.map((e) => e.event)).toEqual(['onset']);
    const rest = feed(d, 'RIGHT_FOOT', Array(20).fill(0.02), 50, 1000, 30);
    expect(rest.map((e) => e.event)).toEqual(['rest']);
  });
  it('ignores a brief spike and sub-threshold jitter', () => {
    const d = new FootMovementDetector('LEFT_FOOT');
    expect(feed(d, 'LEFT_FOOT', [0.9, 0.05, 0.9, 0.05, 0.9, 0.05])).toEqual([]);
    expect(feed(d, 'LEFT_FOOT', Array(20).fill(FOOT_THRESHOLDS.onsetLevel - 0.05), 50, 1000, 10)).toEqual([]);
  });
  it('drops duplicate and out-of-order samples', () => {
    const d = new FootMovementDetector('RIGHT_FOOT');
    d.push({ role: 'RIGHT_FOOT', magnitude: 0.9, at: 100, seq: 5 });
    expect(d.push({ role: 'RIGHT_FOOT', magnitude: 0.9, at: 400, seq: 5 })).toEqual([]);
    expect(d.push({ role: 'RIGHT_FOOT', magnitude: 0.9, at: 50, seq: 6 })).toEqual([]);
  });
  it('only listens to the roles the mode allows; hands never affect the game', () => {
    const d = new FootMovementDetector('RIGHT_FOOT');
    expect(feed(d, 'RIGHT_HAND', Array(10).fill(1))).toEqual([]);
    expect(feed(d, 'LEFT_FOOT', Array(10).fill(1))).toEqual([]);
    expect(feed(new FootMovementDetector('MANUAL'), 'RIGHT_FOOT', Array(10).fill(1))).toEqual([]);
    const dual = new FootMovementDetector('DUAL_FOOT');
    expect(feed(dual, 'LEFT_FOOT', Array(10).fill(1)).map((e) => e.event)).toEqual(['onset']);
    expect(feed(dual, 'RIGHT_FOOT', Array(10).fill(1)).map((e) => e.event)).toEqual(['onset']);
  });
  it('reports a stale sensor once, and a resumed one after samples return', () => {
    const d = new FootMovementDetector('RIGHT_FOOT');
    feed(d, 'RIGHT_FOOT', Array(10).fill(0.8));
    expect(d.poll(700)).toEqual([]);
    expect(d.poll(100 + 9 * 50 + FOOT_THRESHOLDS.staleMs + 10).map((e) => e.event)).toEqual(['lost']);
    expect(d.poll(99_999)).toEqual([]);
    expect(d.push({ role: 'RIGHT_FOOT', magnitude: 0.1, at: 100_000, seq: 99 }).map((e) => e.event)).toEqual(['resumed']);
  });
  it('simulated source can be disconnected', () => {
    const src = new SimulatedFootSource();
    expect(src.sample('RIGHT_FOOT', 1, 1)?.seq).toBe(1);
    src.setConnected('RIGHT_FOOT', false);
    expect(src.sample('RIGHT_FOOT', 1, 2)).toBeNull();
  });
  it('never claims absolute tile tracking or validated hardware', () => {
    for (const row of Object.values(CAPABILITY_MATRIX)) {
      expect(row.absoluteTile).toBe(false);
      expect(row.manualTileConfirmation).toBe(true);
      expect(row.physical === 'n/a' || row.physical === 'pending-hardware-validation').toBe(true);
    }
  });
});

import { describe, expect, it, vi } from 'vitest';
import { RhythmAudio } from '@/components/display/rhythmsteps3d/audio';
import { BEAT_MS } from '../stages';

/** A fake Web Audio graph that records when notes start, so scheduling can be checked without a browser. */
function fakeContext() {
  const starts: number[] = [];
  const node = (): Record<string, unknown> => ({ connect: (n: unknown) => n, disconnect() {}, gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} }, frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, start: (t: number) => starts.push(t), stop() {} });
  const ctx = { state: 'running', currentTime: 100, sampleRate: 8000, destination: node(), createGain: node, createOscillator: node, createBiquadFilter: node, createBufferSource: node, createBuffer: () => ({ getChannelData: () => new Float32Array(4000) }), resume: () => Promise.resolve(), close: () => Promise.resolve() };
  return { ctx, starts };
}

describe('music is scheduled from the gameplay clock', () => {
  it('puts every beat on the clock grid, stretches with speed, and stops when the clock stops', () => {
    const { ctx, starts } = fakeContext();
    vi.stubGlobal('window', { AudioContext: function () { return ctx; } });
    const a = new RhythmAudio();
    a.unlock();
    const base = { running: true, connected: true, stage: 0, music: true, sfx: true, volume: 70 };
    // 1x speed: kicks (every other half beat) start on the beat grid relative to the clock
    a.update({ ...base, clock: 0, speed: 1 });
    ctx.currentTime = 100.7;
    a.update({ ...base, clock: 700, speed: 1 });
    expect(starts.length).toBeGreaterThan(2);
    for (const t of starts) {
      const gameMs = (t - 100) * 1000;
      expect(gameMs % (BEAT_MS / 2)).toBeLessThan(1e-6 + 0.5);
    }
    // paused: nothing more is scheduled however long the real time runs
    const n = starts.length;
    for (let c = 800; c < 4000; c += 100) a.update({ ...base, running: false, clock: 700, speed: 1 });
    expect(starts.length).toBe(n);
    // half speed: the same beat is twice as far apart in real time
    const { ctx: c2, starts: s2 } = fakeContext();
    vi.stubGlobal('window', { AudioContext: function () { return c2; } });
    const b = new RhythmAudio();
    b.unlock();
    b.update({ ...base, clock: 0, speed: 0.5 });
    c2.currentTime = 100.6;
    b.update({ ...base, clock: 300, speed: 0.5 });
    const kicks = [...new Set(s2.map((t) => Math.round((t - 100) * 1000)))].sort((x, y) => x - y);
    expect(kicks[1] - kicks[0]).toBeGreaterThanOrEqual(BEAT_MS / 2 / 0.5 - 2);
    vi.unstubAllGlobals();
  });
  it('is silent when music is off or the volume is zero', () => {
    const { ctx, starts } = fakeContext();
    vi.stubGlobal('window', { AudioContext: function () { return ctx; } });
    const a = new RhythmAudio();
    a.unlock();
    a.update({ running: true, connected: true, stage: 0, music: false, sfx: true, volume: 70, clock: 0, speed: 1 });
    a.update({ running: true, connected: true, stage: 0, music: true, sfx: true, volume: 0, clock: 500, speed: 1 });
    expect(starts).toHaveLength(0);
    vi.unstubAllGlobals();
  });
});

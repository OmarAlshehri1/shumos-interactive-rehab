import { describe, expect, it } from 'vitest';
import { ButtonEdgeDetector, DEFAULT_PAD_MAPPING, PAD_DEBOUNCE_MS, downSet, newlyPressedButton, sanitizePadMapping, type PadLike } from '../gamepad';

const pad = (pressed: boolean, ts: number, connected = true, button = 0): PadLike => ({ connected, timestamp: ts, buttons: Array.from({ length: 4 }, (_, i) => ({ pressed: pressed && i === button, value: pressed && i === button ? 1 : 0 })) });
const M = DEFAULT_PAD_MAPPING;

describe('therapist controller button edge detection (simulated input)', () => {
  it('one physical press fires exactly once; holding never repeats', () => {
    const d = new ButtonEdgeDetector();
    expect(d.push(pad(false, 100), M, 110)).toBe(false);
    expect(d.push(pad(true, 200), M, 210)).toBe(true);
    for (let t = 220; t < 3000; t += 25) expect(d.push(pad(true, 200), M, t - 100 > 200 ? 215 : t), `held at ${t}`).toBe(false);
  });
  it('a held button repeated over many samples fires once even when the pad timestamp keeps updating', () => {
    const d = new ButtonEdgeDetector();
    d.push(pad(false, 100), M, 110);
    let n = 0;
    for (let t = 200; t < 2000; t += 25) n += d.push(pad(true, t), M, t + 5) ? 1 : 0;
    expect(n).toBe(1);
  });
  it('a second press after release fires again, but a bounce inside the debounce window does not', () => {
    const d = new ButtonEdgeDetector();
    d.push(pad(false, 0.5), M, 1);
    expect(d.push(pad(true, 1000), M, 1005)).toBe(true);
    d.push(pad(false, 1050), M, 1055);
    expect(d.push(pad(true, 1100), M, 1105)).toBe(false); // 100 ms after: bounce
    expect(d.rejected).toBe(1);
    d.push(pad(false, 1150), M, 1155);
    expect(d.push(pad(true, 1000 + PAD_DEBOUNCE_MS + 50), M, 1000 + PAD_DEBOUNCE_MS + 55)).toBe(true);
  });
  it('rejects a press already held when the pad appears or reconnects, until it is released', () => {
    const d = new ButtonEdgeDetector();
    expect(d.push(pad(true, 100), M, 105)).toBe(false);
    expect(d.push(pad(false, 200), M, 205)).toBe(false);
    expect(d.push(pad(true, 900), M, 905)).toBe(true);
    d.push(pad(true, 950, false), M, 955); // disconnect while held
    expect(d.status).toBe('lost');
    expect(d.push(pad(true, 5000), M, 5005)).toBe(false); // reconnects already held
  });
  it('rejects stale controller state', () => {
    const d = new ButtonEdgeDetector();
    d.push(pad(false, 100), M, 110);
    expect(d.push(pad(true, 100), M, 2000)).toBe(false); // press reported with a 1.9 s old timestamp
    expect(d.rejected).toBe(1);
    expect(d.push(pad(true, NaN), M, 2100)).toBe(false);
  });
  it('reports disconnect and "never seen"', () => {
    const d = new ButtonEdgeDetector();
    d.push(null, M, 0);
    expect(d.status).toBe('none');
    d.push(pad(false, 10), M, 20);
    expect(d.status).toBe('connected');
    d.push(null, M, 30);
    expect(d.status).toBe('lost');
  });
  it('uses the configured button only and can learn a new one', () => {
    const d = new ButtonEdgeDetector();
    const m = { ...M, button: 2 };
    d.push(pad(false, 1), m, 2);
    expect(d.push(pad(true, 600, true, 0), m, 605)).toBe(false);
    d.push(pad(false, 700), m, 705);
    expect(d.push(pad(true, 1200, true, 2), m, 1205)).toBe(true);
    expect(newlyPressedButton(pad(true, 1, true, 3), downSet(pad(false, 1)))).toBe(3);
    expect(newlyPressedButton(pad(true, 1, true, 3), downSet(pad(true, 1, true, 3)))).toBe(-1);
  });
  it('validates stored mappings', () => {
    expect(sanitizePadMapping(M)).toEqual(M);
    for (const bad of [null, {}, { ...M, button: -1 }, { ...M, deviceIndex: 99 }, { ...M, freshMs: 5 }, { ...M, version: 2 }]) expect(sanitizePadMapping(bad)).toBeNull();
  });
});

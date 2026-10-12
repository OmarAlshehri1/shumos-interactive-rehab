import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startAmbience } from "../ambience";
import { startCosmicAmbience } from "../cosmicAmbience";
import { startSpaceAmbience } from "../spaceAmbience";
import { startUnderwaterAmbience } from "../underwaterAmbience";

class FakeParam {
  value = 0;
  values: number[] = [];
  setValueAtTime(value: number) { this.value = value; this.values.push(value); }
  linearRampToValueAtTime(value: number) { this.value = value; this.values.push(value); }
  exponentialRampToValueAtTime(value: number) { this.value = value; this.values.push(value); }
  setTargetAtTime(value: number) { this.value = value; this.values.push(value); }
}

class FakeNode {
  connect<T>(destination: T): T { return destination; }
}

class FakeSource extends FakeNode {
  starts: (number | undefined)[] = [];
  stops: (number | undefined)[] = [];
  start(when?: number) { this.starts.push(when); }
  stop(when?: number) { this.stops.push(when); }
}

class FakeOscillator extends FakeSource {
  type: OscillatorType = "sine";
  frequency = new FakeParam();
}

class FakeBufferSource extends FakeSource {
  buffer: AudioBuffer | null = null;
  loop = false;
  onended: (() => void) | null = null;
}

function createGraph() {
  const oscillators: FakeOscillator[] = [];
  const bufferSources: FakeBufferSource[] = [];
  const gains: FakeParam[] = [];
  const ctx = {
    currentTime: 0,
    sampleRate: 100,
    createOscillator() {
      const source = new FakeOscillator();
      oscillators.push(source);
      return source;
    },
    createBufferSource() {
      const source = new FakeBufferSource();
      bufferSources.push(source);
      return source;
    },
    createGain() {
      const gain = new FakeParam();
      gains.push(gain);
      return Object.assign(new FakeNode(), { gain });
    },
    createBiquadFilter() {
      return Object.assign(new FakeNode(), { type: "lowpass", frequency: new FakeParam(), Q: new FakeParam() });
    },
    createStereoPanner() {
      return Object.assign(new FakeNode(), { pan: new FakeParam() });
    },
    createBuffer(_channels: number, length: number) {
      const data = new Float32Array(length);
      return { getChannelData: () => data };
    },
  } as unknown as AudioContext;
  return { ctx, destination: new FakeNode() as unknown as AudioNode, oscillators, bufferSources, gains };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ambience source lifecycles", () => {
  it("waiting/garden ambience creates no continuous tone and leaves silence between bird accents", () => {
    const graph = createGraph();
    const handle = startAmbience(graph.ctx, graph.destination);
    expect(graph.oscillators).toHaveLength(0);

    vi.advanceTimersByTime(5999);
    expect(graph.oscillators).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(graph.oscillators).toHaveLength(1);
    expect(graph.oscillators[0]!.stops).toHaveLength(1);

    handle.stop();
    const countAtStop = graph.oscillators.length;
    vi.advanceTimersByTime(120_000);
    expect(graph.oscillators).toHaveLength(countAtStop);
  });

  it("Bubble Pop waves use finite non-looping noise with an explicit return to zero and stop on cleanup", () => {
    const graph = createGraph();
    const handle = startUnderwaterAmbience(graph.ctx, graph.destination);
    expect(graph.bufferSources).toHaveLength(0);

    vi.advanceTimersByTime(800);
    expect(graph.bufferSources).toHaveLength(1);
    expect(graph.bufferSources[0]!.loop).toBe(false);
    expect(graph.gains.some((gain) => gain.values.at(-1) === 0)).toBe(true);

    handle.stop();
    expect(graph.bufferSources[0]!.stops.at(-1)).toBeUndefined();
    const countAtStop = graph.bufferSources.length;
    vi.advanceTimersByTime(120_000);
    expect(graph.bufferSources).toHaveLength(countAtStop);
  });

  it.each([
    ["Follow the Footsteps", startCosmicAmbience],
    ["Space Pilot", startSpaceAmbience],
  ] as const)("%s starts with true silence and cancels every future accent on stop", (_name, start) => {
    const graph = createGraph();
    const handle = start(graph.ctx, graph.destination);
    expect(graph.oscillators).toHaveLength(0);
    expect(graph.bufferSources).toHaveLength(0);

    handle.stop();
    vi.advanceTimersByTime(120_000);
    expect(graph.oscillators).toHaveLength(0);
    expect(graph.bufferSources).toHaveLength(0);
  });

  it("Space Pilot keeps sparse high shimmer accents without recreating the removed low pulse", () => {
    const graph = createGraph();
    startSpaceAmbience(graph.ctx, graph.destination);
    vi.advanceTimersByTime(9000);

    expect(graph.oscillators).toHaveLength(2);
    expect(graph.oscillators.every((oscillator) => oscillator.frequency.value >= 1500)).toBe(true);
    expect(graph.oscillators.every((oscillator) => oscillator.stops.length === 1)).toBe(true);
  });
});

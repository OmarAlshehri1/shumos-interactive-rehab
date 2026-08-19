import { createNoiseBuffer } from "./primitives";
import type { AmbienceHandle } from "./ambience";

/**
 * Bubble Pop Wall's own ambient soundscape — CALM SEA (client feedback:
 * wanted "أنا في البحر" (I'm at the sea), not a continuous underwater hush.
 * Previously this was a permanently-audible filtered-noise wash plus a
 * steady low drone; the client flagged that same "constant background
 * noise" texture as unpleasant when it showed up in Follow the Footsteps'
 * ambience, so this file deliberately has NO permanent layer at all — only
 * scheduled, discrete events with real silence between them: gentle wave
 * swells (rise → hold → fade → silence) and rare distant bubble blips.
 * Same AmbienceHandle contract as ambience.ts/cosmicAmbience.ts so
 * AudioManager can treat all ambience modules interchangeably.
 */
export function startUnderwaterAmbience(ctx: AudioContext, destination: AudioNode): AmbienceHandle {
  let stopped = false;
  const timers: ReturnType<typeof setTimeout>[] = [];

  function every(fn: () => void, delayMs: number): void {
    if (stopped) return;
    const timer = setTimeout(() => {
      const index = timers.indexOf(timer);
      if (index !== -1) timers.splice(index, 1);
      fn();
    }, delayMs);
    timers.push(timer);
  }

  const waves = scheduleWaves(ctx, destination, every);
  scheduleDistantBubbles(ctx, destination, every);

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      for (const timer of timers) clearTimeout(timer);
      waves.stop();
    },
  };
}

/**
 * Gentle wave cycles — soft swell, brief hold, fade, then real silence
 * before the next one. Each swell now owns a finite, non-looping filtered
 * noise buffer with an explicit zero-to-zero envelope. The previous source
 * looped forever at a nominal 0.0001 gain; that was intended to be
 * inaudible, but it still left a permanent noise generator in the graph and
 * an exponential tail rather than guaranteed digital silence.
 */
function scheduleWaves(ctx: AudioContext, destination: AudioNode, every: (fn: () => void, delayMs: number) => void) {
  const activeSources = new Set<AudioBufferSourceNode>();

  function swell() {
    const now = ctx.currentTime;
    const peak = 0.04 + Math.random() * 0.018;
    const riseSeconds = 1.6 + Math.random() * 1.4;
    const holdSeconds = 0.3 + Math.random() * 0.5;
    const fallSeconds = 2.2 + Math.random() * 1.6;
    const silenceSeconds = 3 + Math.random() * 5;
    const peakCutoff = 420 + Math.random() * 260;
    const durationSeconds = riseSeconds + holdSeconds + fallSeconds;

    const source = ctx.createBufferSource();
    source.buffer = createNoiseBuffer(ctx, durationSeconds + 0.1);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 360;
    filter.Q.value = 0.4;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + riseSeconds);
    gain.gain.setValueAtTime(peak, now + riseSeconds + holdSeconds);
    gain.gain.linearRampToValueAtTime(0, now + durationSeconds);

    filter.frequency.setValueAtTime(360, now);
    filter.frequency.linearRampToValueAtTime(peakCutoff, now + riseSeconds);
    filter.frequency.linearRampToValueAtTime(360, now + durationSeconds);

    source.connect(filter).connect(gain).connect(destination);
    activeSources.add(source);
    source.onended = () => activeSources.delete(source);
    source.start(now);
    source.stop(now + durationSeconds + 0.1);

    every(swell, (durationSeconds + silenceSeconds) * 1000);
  }
  every(swell, 800 + Math.random() * 1200);

  return {
    stop() {
      for (const source of activeSources) {
        try {
          source.stop();
        } catch {
          // Already stopped.
        }
      }
      activeSources.clear();
    },
  };
}

/** Rare distant bubble blips at wide, randomized intervals — never a metronomic loop, never a loud "boop." */
function scheduleDistantBubbles(ctx: AudioContext, destination: AudioNode, every: (fn: () => void, delayMs: number) => void) {
  function next() {
    const delay = 7000 + Math.random() * 9000;
    every(() => {
      playDistantBubble(ctx, destination);
      next();
    }, delay);
  }
  next();
}

function playDistantBubble(ctx: AudioContext, destination: AudioNode): void {
  const now = ctx.currentTime;
  const startFreq = 320 + Math.random() * 180;

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(startFreq, now);
  osc.frequency.exponentialRampToValueAtTime(startFreq * 2.2, now + 0.22);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.035, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);

  osc.connect(gain).connect(destination);
  osc.start(now);
  osc.stop(now + 0.35);
}

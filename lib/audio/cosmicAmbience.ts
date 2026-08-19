import type { AmbienceHandle } from "./ambience";
import { createNoiseBuffer } from "./primitives";

/**
 * Follow the Footsteps' own ambient soundscape — "رحلة النجوم" / COSMIC
 * JOURNEY. A calm, magical NIGHT-outdoors atmosphere: a very gentle breeze
 * that comes and goes (never a continuous bed), an occasional distant
 * owl-like night call, and a rare magical sparkle — lots of quiet space
 * between every element, deliberately never filling every second with
 * sound. This replaced an earlier version whose "airy atmosphere" layer was
 * in practice a continuously-looping high-pass-filtered noise buffer — an
 * unpleasant constant "shhhh," not a breeze — and a permanently-held two-note
 * drone that risked reading as a spaceship hum. Neither is here anymore:
 * every layer below is a scheduled, self-fading ONE-SHOT with real silence
 * around it, using the same "self-cleaning scheduled timers" pattern (and
 * the same AmbienceHandle contract) as lib/audio/ambience.ts, so
 * AudioManager can keep treating both interchangeably.
 */
export function startCosmicAmbience(ctx: AudioContext, destination: AudioNode): AmbienceHandle {
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

  scheduleBreezeGusts(ctx, destination, every);
  scheduleNightCalls(ctx, destination, every);
  scheduleSparkles(ctx, destination, every);

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      for (const timer of timers) clearTimeout(timer);
    },
  };
}

/**
 * A very gentle night breeze — a short (2-5s), lowpass-filtered noise SWELL
 * that fades all the way up and back down to silence, then waits a real
 * silent gap before the next one. Never loops, never holds a constant bed —
 * "quiet -> breeze -> quiet," not "quiet air conditioner hiss."
 */
function scheduleBreezeGusts(ctx: AudioContext, destination: AudioNode, every: (fn: () => void, delayMs: number) => void) {
  const PEAK_GAIN = 0.045;

  function playGust() {
    const durationSeconds = 2.2 + Math.random() * 2.6;
    const now = ctx.currentTime;

    const source = ctx.createBufferSource();
    source.buffer = createNoiseBuffer(ctx, durationSeconds);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 320 + Math.random() * 140;
    filter.Q.value = 0.3;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    // Slow swell up, hold briefly, slow fade back to nothing — a gust, not a switch flipping.
    gain.gain.linearRampToValueAtTime(PEAK_GAIN, now + durationSeconds * 0.4);
    gain.gain.linearRampToValueAtTime(PEAK_GAIN, now + durationSeconds * 0.6);
    gain.gain.linearRampToValueAtTime(0.0001, now + durationSeconds);

    source.connect(filter).connect(gain).connect(destination);
    source.start(now);
    source.stop(now + durationSeconds + 0.1);

    scheduleNext();
  }

  function scheduleNext() {
    every(playGust, 15000 + Math.random() * 15000);
  }
  scheduleNext();
}

/**
 * A rare, distant, friendly night call — soft and low, more "owl in a
 * storybook" than a realistic field recording. Long, gentle attack/decay
 * (no chirp-like quickness), wide randomized spacing so it never becomes a
 * pattern the child starts anticipating.
 */
function scheduleNightCalls(ctx: AudioContext, destination: AudioNode, every: (fn: () => void, delayMs: number) => void) {
  function next() {
    every(() => {
      playNightCall(ctx, destination);
      next();
    }, 20000 + Math.random() * 25000);
  }
  next();
}

function playNightCall(ctx: AudioContext, destination: AudioNode): void {
  const now = ctx.currentTime;
  const baseFreq = 480 + Math.random() * 140;

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(baseFreq, now);
  // A gentle downward "hoo" — soft portamento, never a chirp's quick upward snap.
  osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.82, now + 0.5);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.05, now + 0.12);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);

  if (typeof ctx.createStereoPanner === "function") {
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.random() * 1.4 - 0.7;
    osc.connect(gain).connect(panner).connect(destination);
  } else {
    osc.connect(gain).connect(destination);
  }

  osc.start(now);
  osc.stop(now + 0.7);
}

/** Rare magical chimes at wide, randomized intervals — a "distant bell-like sparkle," never a metronomic loop, never a laser/sci-fi effect. */
function scheduleSparkles(ctx: AudioContext, destination: AudioNode, every: (fn: () => void, delayMs: number) => void) {
  function next() {
    const delay = 12000 + Math.random() * 16000;
    every(() => {
      playAmbientSparkle(ctx, destination);
      next();
    }, delay);
  }
  next();
}

function playAmbientSparkle(ctx: AudioContext, destination: AudioNode): void {
  const now = ctx.currentTime;
  const freq = 1760 + Math.random() * 880;

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, now);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.045, now + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);

  osc.connect(gain).connect(destination);
  osc.start(now);
  osc.stop(now + 1.5);
}

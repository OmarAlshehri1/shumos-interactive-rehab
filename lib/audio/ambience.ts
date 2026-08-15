import { createNoiseBuffer } from "./primitives";

export interface AmbienceHandle {
  stop: () => void;
}

/**
 * TASK 8.2 — the magical garden's ambient soundscape, three restrained
 * layers under a single gain bus (AudioManager's existing `ambienceGain` —
 * see its ducking logic, unchanged by this file): a slowly-evolving breeze
 * (very low), occasional bird chirps (low), and a barely-audible warm
 * "nature" pad (very low), roughly matching the spec's relative hierarchy
 * (Lama > effects > birds > breeze ≈ nature). Deliberately NOT a melody and
 * NOT a fixed loop a child would recognize as "a song" — everything here is
 * either continuous filtered noise/tone or randomly-timed one-shots, so two
 * minutes of listening never sounds identical to the next two minutes.
 * "The child should barely notice the ambience consciously... it should
 * make silence feel pleasant" — every gain value below was chosen low
 * enough to disappear under normal room noise, let alone Lama's voice
 * (which ducks this whole bus further — see AudioManager.duckAmbience).
 */
export function startAmbience(ctx: AudioContext, destination: AudioNode): AmbienceHandle {
  let stopped = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  function every(fn: () => void, delayMs: number): void {
    if (stopped) return;
    timers.push(setTimeout(fn, delayMs));
  }

  const breeze = startBreeze(ctx, destination, every);
  const nature = startNaturePad(ctx, destination, every);
  scheduleBirds(ctx, destination, every);

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      for (const timer of timers) clearTimeout(timer);
      breeze.stop();
      nature.stop();
    },
  };
}

/**
 * Very soft, slowly-evolving lowpass-filtered noise — a breeze, not a
 * static "air conditioner" hiss. Every 4-7s it wanders the filter cutoff
 * and gain toward a new nearby random target over a multi-second ramp
 * (never a jump, never a loud gust), so the texture keeps a faint sense of
 * life without ever becoming a recognizable pattern.
 */
function startBreeze(ctx: AudioContext, destination: AudioNode, every: (fn: () => void, delayMs: number) => void) {
  const BASE_GAIN = 0.12;
  const GAIN_WANDER = 0.05;
  const BASE_CUTOFF = 380;
  const CUTOFF_WANDER = 160;

  const source = ctx.createBufferSource();
  source.buffer = createNoiseBuffer(ctx, 8);
  source.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = BASE_CUTOFF;
  filter.Q.value = 0.3;

  const gain = ctx.createGain();
  gain.gain.value = 0;

  source.connect(filter).connect(gain).connect(destination);
  source.start();
  // Fade in on start rather than snapping to volume, so the garden never begins with an audible click.
  gain.gain.setTargetAtTime(BASE_GAIN, ctx.currentTime, 2);

  function wander() {
    const rampSeconds = 4 + Math.random() * 3;
    filter.frequency.setTargetAtTime(BASE_CUTOFF + (Math.random() * 2 - 1) * CUTOFF_WANDER, ctx.currentTime, rampSeconds / 3);
    gain.gain.setTargetAtTime(BASE_GAIN + (Math.random() * 2 - 1) * GAIN_WANDER, ctx.currentTime, rampSeconds / 3);
    every(wander, rampSeconds * 1000);
  }
  every(wander, 4500);

  return {
    stop() {
      try {
        gain.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
        source.stop(ctx.currentTime + 1.5);
      } catch {
        // Already stopped — nothing to clean up.
      }
    },
  };
}

/**
 * A barely-audible warm pad: two sine oscillators a plain fifth apart in a
 * low register, breathing very slowly in and out (roughly a 13-20s full
 * swell-and-fade cycle, randomized so it never settles into a fixed loop).
 * This is the layer that "makes silence feel pleasant" without ever being
 * consciously identifiable as a sound — closer to a felt warmth than a
 * heard note.
 */
function startNaturePad(ctx: AudioContext, destination: AudioNode, every: (fn: () => void, delayMs: number) => void) {
  const PEAK_GAIN = 0.035;

  const gain = ctx.createGain();
  gain.gain.value = 0.0001;
  gain.connect(destination);

  const oscA = ctx.createOscillator();
  oscA.type = "sine";
  oscA.frequency.value = 130.8; // C3
  const oscB = ctx.createOscillator();
  oscB.type = "sine";
  oscB.frequency.value = 196.0; // G3 — a plain, consonant fifth, never a "melody"
  const oscBGain = ctx.createGain();
  oscBGain.gain.value = 0.55;

  oscA.connect(gain);
  oscB.connect(oscBGain).connect(gain);
  oscA.start();
  oscB.start();

  function breathe() {
    const holdSeconds = 5 + Math.random() * 3;
    gain.gain.setTargetAtTime(PEAK_GAIN, ctx.currentTime, holdSeconds);
    every(() => {
      gain.gain.setTargetAtTime(0.0001, ctx.currentTime, holdSeconds);
      every(breathe, holdSeconds * 1000 + 1500);
    }, holdSeconds * 1000);
  }
  every(breathe, 2000);

  return {
    stop() {
      try {
        gain.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
        oscA.stop(ctx.currentTime + 1.2);
        oscB.stop(ctx.currentTime + 1.2);
      } catch {
        // Already stopped — nothing to clean up.
      }
    },
  };
}

/**
 * Occasional, gentle bird chirps at comfortably wide, randomized intervals
 * — never a metronomic loop. Wider spacing and a chance of a soft
 * double-note than the Task 4 original, per the Task 8.2 spec's "do not
 * make birds chirp constantly, avoid predictable repetitive looping."
 */
function scheduleBirds(ctx: AudioContext, destination: AudioNode, every: (fn: () => void, delayMs: number) => void) {
  function next() {
    const delay = 6000 + Math.random() * 9000;
    every(() => {
      playBirdChirp(ctx, destination);
      // Roughly a third of the time, a soft second chirp follows shortly after — an organic "reply," not a fixed pattern.
      if (Math.random() < 0.32) {
        every(() => playBirdChirp(ctx, destination), 260 + Math.random() * 340);
      }
      next();
    }, delay);
  }
  next();
}

function playBirdChirp(ctx: AudioContext, destination: AudioNode): void {
  const now = ctx.currentTime;
  const baseFreq = 2400 + Math.random() * 1400;

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(baseFreq, now);
  osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.3, now + 0.05);
  osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.9, now + 0.11);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.05, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

  if (typeof ctx.createStereoPanner === "function") {
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.random() * 1.6 - 0.8;
    osc.connect(gain).connect(panner).connect(destination);
  } else {
    osc.connect(gain).connect(destination);
  }

  osc.start(now);
  osc.stop(now + 0.16);
}

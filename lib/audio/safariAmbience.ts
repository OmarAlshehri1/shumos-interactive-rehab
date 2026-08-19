import type { AmbienceHandle } from "./ambience";

/**
 * Feed the Animals' own ambient soundscape — LIVING SAFARI/JUNGLE. Client
 * feedback: the previous continuous band-passed-noise "warm wind" layer
 * read as an unpleasant constant background texture — the same complaint
 * that showed up in Follow the Footsteps' and the Waiting World's own
 * ambience (see lib/audio/ambience.ts's doc comment). That continuous layer
 * is gone entirely — this is now purely scheduled, discrete accents (bright
 * tropical bird chirps, occasional leaf rustles, a very rare soft distant
 * lion presence) with REAL SILENCE between them, never a rhythmic/melodic
 * loop, never a roar. Same AmbienceHandle contract as every other ambience
 * module so AudioManager can treat all four interchangeably (start/stop
 * only), and the same "self-cleaning scheduled timers" pattern to stay safe
 * across hours on the idle world.
 */
export function startSafariAmbience(ctx: AudioContext, destination: AudioNode): AmbienceHandle {
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

  scheduleTropicalBird(ctx, destination, every);
  scheduleLeafRustle(ctx, destination, every);
  scheduleDistantLion(ctx, destination, every);
  scheduleDistantElephant(ctx, destination, every);
  scheduleMonkeyChatter(ctx, destination, every);

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      for (const timer of timers) clearTimeout(timer);
    },
  };
}

/** Bright, tropical-bird-style chirps at wide, randomized intervals — a different timbre from the Waiting World's own gentle garden bird (lib/audio/ambience.ts), so the two worlds never sound alike. Sometimes a quick two-note call, never a metronomic loop. */
function scheduleTropicalBird(ctx: AudioContext, destination: AudioNode, every: (fn: () => void, delayMs: number) => void) {
  function next() {
    const delay = 6500 + Math.random() * 9000;
    every(() => {
      playTropicalBird(ctx, destination);
      if (Math.random() < 0.4) {
        every(() => playTropicalBird(ctx, destination), 200 + Math.random() * 260);
      }
      next();
    }, delay);
  }
  next();
}

function playTropicalBird(ctx: AudioContext, destination: AudioNode): void {
  const now = ctx.currentTime;
  const baseFreq = 1800 + Math.random() * 1200;

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(baseFreq, now);
  osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.7, now + 0.09);
  osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.85, now + 0.16);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.06, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.19);

  if (typeof ctx.createStereoPanner === "function") {
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.random() * 1.6 - 0.8;
    osc.connect(gain).connect(panner).connect(destination);
  } else {
    osc.connect(gain).connect(destination);
  }

  osc.start(now);
  osc.stop(now + 0.22);
}

/** A rare, soft leaf-rustle texture — a brief filtered noise burst, quieter and shorter than any continuous bed ever was. */
function scheduleLeafRustle(ctx: AudioContext, destination: AudioNode, every: (fn: () => void, delayMs: number) => void) {
  function next() {
    const delay = 9000 + Math.random() * 10000;
    every(() => {
      playLeafRustle(ctx, destination);
      next();
    }, delay);
  }
  next();
}

function playLeafRustle(ctx: AudioContext, destination: AudioNode): void {
  const now = ctx.currentTime;
  const bufferLength = 0.5;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * bufferLength, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / data.length);
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 2200;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.022, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + bufferLength);
  noise.connect(filter).connect(gain).connect(destination);
  noise.start(now);
  noise.stop(now + bufferLength + 0.05);
}

/**
 * A VERY rare, soft, stylized distant-lion PRESENCE cue — deliberately not
 * an attempt at a realistic roar (procedural Web Audio cannot produce a
 * convincing one, and an ugly synthetic buzz pretending to be a lion is
 * worse than no lion at all): two low, breathy sine tones under a slow
 * swell/fade envelope, so quiet and far away it reads as "something big is
 * out there, calm and safe," never startling.
 */
function scheduleDistantLion(ctx: AudioContext, destination: AudioNode, every: (fn: () => void, delayMs: number) => void) {
  function next() {
    const delay = 26000 + Math.random() * 20000;
    every(() => {
      playDistantLion(ctx, destination);
      next();
    }, delay);
  }
  next();
}

function playDistantLion(ctx: AudioContext, destination: AudioNode): void {
  const now = ctx.currentTime;
  [82, 98].forEach((frequency, i) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = frequency;
    const gain = ctx.createGain();
    const startTime = now + i * 0.35;
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(0.028, startTime + 0.7);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 2.2);
    osc.connect(gain).connect(destination);
    osc.start(startTime);
    osc.stop(startTime + 2.3);
  });
}

/** An occasional, friendly, FAR-AWAY elephant presence — a soft short rising-then-falling low tone, deliberately nothing like a trumpeting blast, so it reads as "a gentle giant somewhere out there," never startling. Different timbre/rate from the distant lion so the two never blur together. */
function scheduleDistantElephant(ctx: AudioContext, destination: AudioNode, every: (fn: () => void, delayMs: number) => void) {
  function next() {
    const delay = 15000 + Math.random() * 14000;
    every(() => {
      playDistantElephant(ctx, destination);
      next();
    }, delay);
  }
  next();
}

function playDistantElephant(ctx: AudioContext, destination: AudioNode): void {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(130, now);
  osc.frequency.linearRampToValueAtTime(190, now + 0.35);
  osc.frequency.exponentialRampToValueAtTime(110, now + 0.9);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.05, now + 0.15);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.0);
  osc.connect(gain).connect(destination);
  osc.start(now);
  osc.stop(now + 1.05);
}

/** A soft, occasional nature accent (light monkey chatter) — a quick playful pair of high, short chirrup-plucks, never a screech, at wide randomized intervals with real silence between. */
function scheduleMonkeyChatter(ctx: AudioContext, destination: AudioNode, every: (fn: () => void, delayMs: number) => void) {
  function next() {
    const delay = 12000 + Math.random() * 13000;
    every(() => {
      playMonkeyChatter(ctx, destination);
      next();
    }, delay);
  }
  next();
}

function playMonkeyChatter(ctx: AudioContext, destination: AudioNode): void {
  const now = ctx.currentTime;
  [0, 0.11].forEach((delay, i) => {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    const base = 520 + i * 90;
    osc.frequency.setValueAtTime(base, now + delay);
    osc.frequency.exponentialRampToValueAtTime(base * 1.35, now + delay + 0.08);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now + delay);
    gain.gain.linearRampToValueAtTime(0.045, now + delay + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.13);
    osc.connect(gain).connect(destination);
    osc.start(now + delay);
    osc.stop(now + delay + 0.15);
  });
}

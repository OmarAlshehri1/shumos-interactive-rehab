export interface AmbienceHandle {
  stop: () => void;
}

/**
 * The Shumos Waiting World's ambient soundscape — CALM, QUIET MORNING.
 * Client feedback: the previous continuous lowpass-filtered-noise "breeze"
 * layer read as an unpleasant constant air/wind hiss (the same complaint
 * that showed up in Follow the Footsteps' ambience), which is especially
 * bad here since the display can sit on the Waiting World for hours between
 * patients. That breeze layer is gone entirely — this is now just
 * randomly-timed bird chirps with real silence between them. The former
 * "warm pad" was two indefinitely-running sine oscillators (130.8 Hz and
 * 196 Hz); even at low gain it was clearly audible as a continuous
 * electrical-sounding "nnnn" in a quiet clinic, so it is gone entirely.
 * "The child should barely notice the ambience consciously... it should
 * make silence feel pleasant" — every gain value below was chosen low
 * enough to disappear under normal room noise, let alone Lama's voice
 * (which ducks this whole bus further — see AudioManager's duck counter).
 */
export function startAmbience(ctx: AudioContext, destination: AudioNode): AmbienceHandle {
  let stopped = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  // RELIABILITY FIX: the display can sit on the waiting world for hours
    // between patients, and every scheduled bird tick
  // re-schedules itself via `every` — a fired timer id that's never removed
  // from `timers` accumulated forever, growing unbounded for the life of
  // the tab even though it no longer does anything. Each timer now removes
  // its own (already-fired) id from the array before running, so `timers`
  // only ever holds ids that are still pending.
  function every(fn: () => void, delayMs: number): void {
    if (stopped) return;
    const timer = setTimeout(() => {
      const index = timers.indexOf(timer);
      if (index !== -1) timers.splice(index, 1);
      fn();
    }, delayMs);
    timers.push(timer);
  }

  scheduleBirds(ctx, destination, every);

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      for (const timer of timers) clearTimeout(timer);
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

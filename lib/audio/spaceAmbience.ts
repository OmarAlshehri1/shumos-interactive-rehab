import type { AmbienceHandle } from "./ambience";

/**
 * Space Pilot's own ambient soundscape — "رحلة النجوم" / DEEP SPACE. Task's
 * explicit brief: "NO constant hiss. NO white-noise spaceship hum. Use: soft
 * distant cosmic ambience, rare magical space shimmer, occasional distant
 * comet sparkle, silence/space." The former recurring 58–68 Hz, 5–7.5
 * second sine pulse could still read as the exact low "nnnn" this brief
 * rejects, despite being intermittent, so it has been removed. Every layer below
 * is a scheduled, self-fading ONE-SHOT with real silence around it (same
 * "self-cleaning scheduled timers" pattern as cosmicAmbience.ts/
 * underwaterAmbience.ts) — nothing here ever loops continuously.
 */
export function startSpaceAmbience(ctx: AudioContext, destination: AudioNode): AmbienceHandle {
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

  scheduleShimmers(ctx, destination, every);
  scheduleCometSparkles(ctx, destination, every);

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      for (const timer of timers) clearTimeout(timer);
    },
  };
}

/** A rare, magical two/three-note bell shimmer — distinct timbre from cosmicAmbience's own sparkle (higher, airier, no portamento night-call analogue exists here at all — this is deep space, not a garden). */
function scheduleShimmers(ctx: AudioContext, destination: AudioNode, every: (fn: () => void, delayMs: number) => void) {
  function playShimmer() {
    const now = ctx.currentTime;
    const base = 1568 + Math.random() * 500;
    [base, base * 1.5].forEach((freq, i) => {
      const start = now + i * 0.14;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.04, start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.6);
      osc.connect(gain).connect(destination);
      osc.start(start);
      osc.stop(start + 1.7);
    });
    every(playShimmer, 16000 + Math.random() * 18000);
  }
  every(playShimmer, 9000 + Math.random() * 10000);
}

/** Task's "occasional distant comet sparkle" — a quick, quiet, high rising sweep, much rarer than the shimmer above. */
function scheduleCometSparkles(ctx: AudioContext, destination: AudioNode, every: (fn: () => void, delayMs: number) => void) {
  function playSparkle() {
    const now = ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const start = now + i * 0.05;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 2200 + i * 260 + Math.random() * 100;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.035, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
      osc.connect(gain).connect(destination);
      osc.start(start);
      osc.stop(start + 0.55);
    }
    every(playSparkle, 30000 + Math.random() * 25000);
  }
  every(playSparkle, 20000 + Math.random() * 15000);
}

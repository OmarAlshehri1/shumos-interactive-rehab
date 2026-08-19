import { playTone } from "./primitives";

/**
 * Bubble Pop Wall's own procedural sound effects — deliberately separate
 * from effects.ts (Balloon Quest) and cosmicEffects.ts (Follow the
 * Footsteps), per the product rule that every game must sound nothing
 * alike. Same synthesis approach (no licensed/downloaded audio assets),
 * same pediatric-appropriate soft envelopes.
 */

/** The correct-pop sound (task section 29) — a soft pop + a quick water-droplet pitch drop + a small glassy chime layered on top. No stadium applause for every bubble; richer celebration is reserved for stage/session milestones. */
export function playBubblePop(ctx: AudioContext, destination: AudioNode): void {
  const now = ctx.currentTime;

  // Soft "pop" — a short noise burst through a band-pass filter.
  const bufferLength = 0.12;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * bufferLength, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.value = 1400;
  noiseFilter.Q.value = 1.1;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.28, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + bufferLength);
  noise.connect(noiseFilter).connect(noiseGain).connect(destination);
  noise.start(now);
  noise.stop(now + bufferLength + 0.02);

  // Water-droplet pitch drop.
  const dropOsc = ctx.createOscillator();
  dropOsc.type = "sine";
  dropOsc.frequency.setValueAtTime(1200, now + 0.02);
  dropOsc.frequency.exponentialRampToValueAtTime(420, now + 0.16);
  const dropGain = ctx.createGain();
  dropGain.gain.setValueAtTime(0.0001, now + 0.02);
  dropGain.gain.linearRampToValueAtTime(0.22, now + 0.04);
  dropGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
  dropOsc.connect(dropGain).connect(destination);
  dropOsc.start(now + 0.02);
  dropOsc.stop(now + 0.25);

  // Small glassy chime on top.
  playTone(ctx, destination, { frequency: 1567.98, startTime: now + 0.08, duration: 0.45, peakGain: 0.14, attack: 0.008, overtoneRatio: 2.0, overtoneGain: 0.12 });
}

/**
 * A short, watery/glassy sting for the underwater world's own intro moment
 * (task section 6's "watery/glassy intro sound") — plays once, alongside
 * Mariam's welcome line, when BubblePopWelcomeScene mounts. Distinct from
 * playBubblePop (a per-pop reward) and playUnderwaterCelebration
 * (stage/session milestones): a soft descending glassy sweep, nothing more.
 */
export function playUnderwaterIntroSting(ctx: AudioContext, destination: AudioNode): void {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(1760, now);
  osc.frequency.exponentialRampToValueAtTime(880, now + 0.5);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.13, now + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
  osc.connect(gain).connect(destination);
  osc.start(now);
  osc.stop(now + 0.58);

  playTone(ctx, destination, { frequency: 1174.66, startTime: now + 0.1, duration: 0.5, peakGain: 0.11, attack: 0.01, overtoneRatio: 2.0, overtoneGain: 0.1 });
}

/** Incorrect selection (task section 30) — a soft, friendly "boop," never harsh, never a buzzer. */
export function playBubbleIncorrect(ctx: AudioContext, destination: AudioNode): void {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(260, now);
  osc.frequency.exponentialRampToValueAtTime(200, now + 0.18);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.14, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
  osc.connect(gain).connect(destination);
  osc.start(now);
  osc.stop(now + 0.26);
}

/** How big an underwater celebration feels — scales the same building block, never a different sound design per level. */
export type UnderwaterCelebrationLevel = "stage1" | "stage2" | "stage3" | "stage4" | "stage5" | "session";

const LEVEL_PARAMS: Record<UnderwaterCelebrationLevel, { bubbleCount: number; peakGain: number }> = {
  stage1: { bubbleCount: 4, peakGain: 0.14 },
  stage2: { bubbleCount: 5, peakGain: 0.16 },
  stage3: { bubbleCount: 6, peakGain: 0.18 },
  stage4: { bubbleCount: 7, peakGain: 0.19 },
  stage5: { bubbleCount: 8, peakGain: 0.2 },
  session: { bubbleCount: 10, peakGain: 0.22 },
};

/** Underwater celebration — a warm resolving chord with a scatter of rising bubble blips over it. Deliberately no ascending "arcade run" or cosmic sparkle — this reads as bubbles rising to the surface, not a fanfare. */
export function playUnderwaterCelebration(ctx: AudioContext, destination: AudioNode, level: UnderwaterCelebrationLevel): void {
  const now = ctx.currentTime;
  const { bubbleCount, peakGain } = LEVEL_PARAMS[level];

  const chord = [349.23, 440, 523.25]; // F4 A4 C5
  chord.forEach((frequency, i) => {
    playTone(ctx, destination, {
      frequency,
      startTime: now + i * 0.05,
      duration: 1.3,
      peakGain,
      attack: 0.05,
      overtoneRatio: 2.0,
      overtoneGain: 0.13,
    });
  });

  for (let i = 0; i < bubbleCount; i++) {
    const delay = 0.15 + Math.random() * 1.2;
    const startFreq = 500 + Math.random() * 400;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(startFreq, now + delay);
    osc.frequency.exponentialRampToValueAtTime(startFreq * 2, now + delay + 0.25);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now + delay);
    gain.gain.linearRampToValueAtTime(0.07, now + delay + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.35);
    osc.connect(gain).connect(destination);
    osc.start(now + delay);
    osc.stop(now + delay + 0.4);
  }
}

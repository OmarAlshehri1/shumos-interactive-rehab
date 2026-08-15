import { createNoiseBuffer, playTone } from "./primitives";

/**
 * Balloon pop: a quick pitch-dropping tone (the "boing") layered with a
 * short filtered-noise transient (the "snap"), both under 200ms. Soft sine
 * source and a fast exponential decay keep it satisfying rather than
 * arcade-harsh.
 */
export function playPop(ctx: AudioContext, destination: AudioNode): void {
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(620, now);
  osc.frequency.exponentialRampToValueAtTime(180, now + 0.11);
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.0001, now);
  oscGain.gain.linearRampToValueAtTime(0.85, now + 0.008);
  oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
  osc.connect(oscGain).connect(destination);
  osc.start(now);
  osc.stop(now + 0.18);

  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = createNoiseBuffer(ctx, 0.05);
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.value = 2200;
  noiseFilter.Q.value = 0.7;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.45, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
  noiseSource.connect(noiseFilter).connect(noiseGain).connect(destination);
  noiseSource.start(now);
  noiseSource.stop(now + 0.06);
}

/** A small bright two-note bell chime — plays on every correct balloon, alongside the pop. */
export function playChime(ctx: AudioContext, destination: AudioNode): void {
  const now = ctx.currentTime;
  playTone(ctx, destination, { frequency: 880, startTime: now, duration: 0.32, peakGain: 0.4, overtoneRatio: 2.01, overtoneGain: 0.22 });
  playTone(ctx, destination, {
    frequency: 1108.73,
    startTime: now + 0.06,
    duration: 0.36,
    peakGain: 0.36,
    overtoneRatio: 2.01,
    overtoneGain: 0.2,
  });
}

/**
 * Incorrect feedback: two soft, short, descending sine tones — a gentle
 * "oops," never a buzzer. Deliberately warm (pure sine, no harsh
 * waveforms) and quiet.
 */
export function playOops(ctx: AudioContext, destination: AudioNode): void {
  const now = ctx.currentTime;
  playTone(ctx, destination, { frequency: 392, startTime: now, duration: 0.18, peakGain: 0.3, attack: 0.02 });
  playTone(ctx, destination, { frequency: 311.13, startTime: now + 0.11, duration: 0.24, peakGain: 0.26, attack: 0.02 });
}

/** How big a celebration feels — used only to scale the SAME procedural ascending-run building block, never a different sound design per level. */
export type CelebrationLevel = "stage1" | "stage2" | "stage3" | "stage4" | "stage5" | "session";

const CELEBRATION_LEVEL_PARAMS: Record<CelebrationLevel, { noteCount: number; peakGain: number; sparkleCount: number }> = {
  // TASK 9: each stage should feel a little bigger than the last, and the
  // final session celebration the biggest of all — see the report's "Stage
  // 1/2/3 celebration" sections for the matching visual design. Reusing one
  // parametrized building block (not a different sound per stage) keeps
  // this cheap and consistent, per "prefer... avoid... expensive systems."
  // TASK 11: stage4/stage5 (added when every difficulty grew from 3 to 5
  // stages) continue the same escalation, capped by runNotes' own 7-note
  // length — "session" stays the single loudest/biggest of them all.
  stage1: { noteCount: 4, peakGain: 0.34, sparkleCount: 3 },
  stage2: { noteCount: 5, peakGain: 0.38, sparkleCount: 4 },
  stage3: { noteCount: 6, peakGain: 0.4, sparkleCount: 5 },
  stage4: { noteCount: 7, peakGain: 0.41, sparkleCount: 5 },
  stage5: { noteCount: 7, peakGain: 0.42, sparkleCount: 6 },
  session: { noteCount: 7, peakGain: 0.44, sparkleCount: 6 },
};

/**
 * Celebration flourish: an ascending pentatonic run plus a scattering of
 * quiet high "sparkle" blips — plays once, never loops. `level` scales note
 * count / loudness / sparkle count only; the underlying run and timbre stay
 * identical across all four levels, so this always sounds like the same
 * character getting more excited, never a different jingle per stage.
 */
export function playCelebration(ctx: AudioContext, destination: AudioNode, level: CelebrationLevel): void {
  const now = ctx.currentTime;
  const runNotes = [523.25, 587.33, 659.25, 783.99, 880, 987.77, 1046.5];
  const { noteCount, peakGain, sparkleCount } = CELEBRATION_LEVEL_PARAMS[level];
  const notes = runNotes.slice(0, noteCount);

  notes.forEach((freq, i) => {
    playTone(ctx, destination, {
      frequency: freq,
      startTime: now + i * 0.09,
      duration: 0.4,
      peakGain,
      overtoneRatio: 2.01,
      overtoneGain: 0.18,
    });
  });

  for (let i = 0; i < sparkleCount; i++) {
    playTone(ctx, destination, {
      frequency: 1760 + (i % 3) * 220,
      startTime: now + 0.18 + i * 0.13,
      duration: 0.22,
      peakGain: 0.1,
      attack: 0.005,
    });
  }
}

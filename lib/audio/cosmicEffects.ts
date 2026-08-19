import { playTone } from "./primitives";

/**
 * Follow the Footsteps' own procedural sound effects — deliberately separate
 * from effects.ts (Balloon Quest's pop/applause/chime/oops/celebration
 * sounds), per the product rule that the two games must sound nothing
 * alike. Same synthesis approach (no licensed/downloaded audio assets), same
 * pediatric-appropriate soft envelopes.
 */

/** A gentle glass/mallet tone + a small sparkle, cycling through 3 harmonious pitches (a simple ascending pentatonic set) so consecutive steps feel like a slowly-building musical phrase without ever becoming a song — see task section 52's "musical progression." `pitchIndex` is typically the step's own index within the stage, cycling with `% 3`. */
export function playFootstepChime(ctx: AudioContext, destination: AudioNode, pitchIndex: number): void {
  const now = ctx.currentTime;
  const pitches = [659.25, 783.99, 987.77]; // E5, G5, B5 — consonant, airy
  const frequency = pitches[((pitchIndex % pitches.length) + pitches.length) % pitches.length];

  playTone(ctx, destination, { frequency, startTime: now, duration: 0.5, peakGain: 0.32, attack: 0.01, overtoneRatio: 2.0, overtoneGain: 0.16 });

  // A tiny high sparkle layered just after the mallet tone.
  playTone(ctx, destination, { frequency: frequency * 2.5, startTime: now + 0.05, duration: 0.3, peakGain: 0.09, attack: 0.005 });
}

/** Plays once when the final step of a stage resolves — a gentle satisfying chord (not a fanfare), per task section 52's "final step resolves into a gentle satisfying chord." */
export function playFootstepsChordResolve(ctx: AudioContext, destination: AudioNode): void {
  const now = ctx.currentTime;
  const chord = [523.25, 659.25, 783.99]; // C5 E5 G5 — a plain major triad
  chord.forEach((frequency, i) => {
    playTone(ctx, destination, {
      frequency,
      startTime: now + i * 0.02,
      duration: 1.1,
      peakGain: 0.26,
      attack: 0.02,
      overtoneRatio: 2.0,
      overtoneGain: 0.14,
    });
  });
}

/**
 * A short, magical sting for the cosmic world's own intro moment (task
 * section 5's "magical night chime") — plays once, alongside Mariam's
 * welcome line, when FootstepsWelcomeScene mounts. Distinct from
 * playFootstepChime (a per-step reward) and playCosmicCelebration
 * (stage/session milestones): two soft high bell tones a fifth apart,
 * nothing more.
 */
export function playCosmicIntroChime(ctx: AudioContext, destination: AudioNode): void {
  const now = ctx.currentTime;
  playTone(ctx, destination, { frequency: 987.77, startTime: now, duration: 0.55, peakGain: 0.14, attack: 0.01, overtoneRatio: 2.0, overtoneGain: 0.12 });
  playTone(ctx, destination, { frequency: 1479.98, startTime: now + 0.12, duration: 0.6, peakGain: 0.12, attack: 0.008, overtoneRatio: 2.0, overtoneGain: 0.1 });
}

/**
 * JOURNEY REDESIGN — a short milestone chime for reaching a checkpoint star
 * mid-route. Distinct from playFootstepChime (a per-step tone, cycling 3
 * pitches) and playFootstepsChordResolve (the stage's own final chord): a
 * brief two-note rising sparkle, bigger than a step chime but smaller than a
 * full celebration — a genuine milestone, never the stage-complete moment.
 */
export function playCheckpointChime(ctx: AudioContext, destination: AudioNode): void {
  const now = ctx.currentTime;
  playTone(ctx, destination, { frequency: 880, startTime: now, duration: 0.4, peakGain: 0.24, attack: 0.008, overtoneRatio: 2.0, overtoneGain: 0.14 });
  playTone(ctx, destination, { frequency: 1318.51, startTime: now + 0.09, duration: 0.5, peakGain: 0.2, attack: 0.006, overtoneRatio: 2.0, overtoneGain: 0.12 });
  playTone(ctx, destination, { frequency: 2637.02, startTime: now + 0.16, duration: 0.35, peakGain: 0.08, attack: 0.004 });
}

/**
 * ROUTE ARCHITECTURE REWRITE — obstacle-cleared sounds (replaces the old
 * SINGLE/PAIR stance mechanic's plain per-step chime for these moments):
 * stronger than a normal playFootstepChime, distinct per obstacle kind, but
 * still nowhere near a full playCosmicCelebration — a genuine "bigger than a
 * step, smaller than a stage" moment (task section 21).
 */
export function playMeteorBreakEffect(ctx: AudioContext, destination: AudioNode): void {
  const now = ctx.currentTime;
  // A soft "impact" thump, then the meteor scatters into 6 bright star fragments.
  playTone(ctx, destination, { frequency: 196, startTime: now, duration: 0.3, peakGain: 0.22, attack: 0.005, type: "triangle" });
  for (let i = 0; i < 6; i++) {
    const delay = 0.08 + i * 0.05;
    playTone(ctx, destination, { frequency: 1568 + i * 220, startTime: now + delay, duration: 0.45, peakGain: 0.14, attack: 0.006 });
  }
}

export function playRockDissolveEffect(ctx: AudioContext, destination: AudioNode): void {
  const now = ctx.currentTime;
  // A low crack, then a warm glow settling into two soft resolving tones.
  playTone(ctx, destination, { frequency: 220, startTime: now, duration: 0.22, peakGain: 0.2, attack: 0.003, type: "square" });
  playTone(ctx, destination, { frequency: 587.33, startTime: now + 0.15, duration: 0.7, peakGain: 0.16, attack: 0.03, overtoneRatio: 2.0, overtoneGain: 0.12 });
  playTone(ctx, destination, { frequency: 880, startTime: now + 0.22, duration: 0.6, peakGain: 0.12, attack: 0.03 });
}

export function playCometSweepEffect(ctx: AudioContext, destination: AudioNode): void {
  const now = ctx.currentTime;
  // A rising sparkle sweep of 8 quick high notes, comet-tail style.
  for (let i = 0; i < 8; i++) {
    const t = now + i * 0.045;
    playTone(ctx, destination, { frequency: 1100 + i * 140, startTime: t, duration: 0.28, peakGain: 0.11, attack: 0.004 });
  }
}

/** How big a cosmic celebration feels — scales the same building block, never a different sound design per level (mirrors effects.ts's CelebrationLevel philosophy). */
export type CosmicCelebrationLevel = "stage1" | "stage2" | "stage3" | "stage4" | "stage5" | "session";

const COSMIC_LEVEL_PARAMS: Record<CosmicCelebrationLevel, { sparkleCount: number; peakGain: number }> = {
  stage1: { sparkleCount: 4, peakGain: 0.14 },
  stage2: { sparkleCount: 5, peakGain: 0.16 },
  stage3: { sparkleCount: 6, peakGain: 0.18 },
  stage4: { sparkleCount: 7, peakGain: 0.19 },
  stage5: { sparkleCount: 8, peakGain: 0.2 },
  session: { sparkleCount: 10, peakGain: 0.22 },
};

/**
 * Cosmic sparkle/chime celebration — a scattering of high, airy sparkle
 * blips over a warm resolving chord underneath. Deliberately no ascending
 * "arcade run" (that's Balloon Quest's playCelebration's own signature) —
 * this reads as stardust settling, not a fanfare.
 */
export function playCosmicCelebration(ctx: AudioContext, destination: AudioNode, level: CosmicCelebrationLevel): void {
  const now = ctx.currentTime;
  const { sparkleCount, peakGain } = COSMIC_LEVEL_PARAMS[level];

  const chord = [392, 493.88, 587.33]; // G4 B4 D5
  chord.forEach((frequency, i) => {
    playTone(ctx, destination, {
      frequency,
      startTime: now + i * 0.05,
      duration: 1.4,
      peakGain,
      attack: 0.04,
      overtoneRatio: 2.0,
      overtoneGain: 0.15,
    });
  });

  for (let i = 0; i < sparkleCount; i++) {
    const delay = 0.1 + Math.random() * 1.1;
    playTone(ctx, destination, {
      frequency: 1568 + Math.random() * 1400,
      startTime: now + delay,
      duration: 0.5,
      peakGain: 0.08,
      attack: 0.005,
    });
  }
}

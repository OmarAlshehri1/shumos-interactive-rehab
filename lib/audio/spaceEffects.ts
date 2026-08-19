import { playTone } from "./primitives";

/**
 * Space Pilot's own procedural sound effects — deliberately separate from
 * every other game's effects module, same pediatric-appropriate soft
 * envelopes, same "no licensed/downloaded audio" convention. Task's engine
 * sound brief: "Do NOT use a constant loud buzzing oscillator. Use a subtle
 * stylized engine layer or short movement/boost accents" — there is
 * deliberately no continuous engine drone anywhere in this file; the
 * flame's own life comes from CSS (app/display/space-pilot.css's
 * sp-flame-flicker), not audio.
 */

/** Task's "LANE CHANGE SOUND: short smooth futuristic movement/boost sound synchronized with lane movement." A quick upward (UP) or downward (DOWN) pitch sweep — synthesized as two close, fast notes rather than a real frequency ramp, so it stays crisp on every browser. */
export function playLaneChangeSound(ctx: AudioContext, destination: AudioNode, direction: "UP" | "DOWN"): void {
  const now = ctx.currentTime;
  const [first, second] = direction === "UP" ? [420, 640] : [640, 420];
  playTone(ctx, destination, { frequency: first, startTime: now, duration: 0.16, peakGain: 0.16, attack: 0.005, type: "triangle" });
  playTone(ctx, destination, { frequency: second, startTime: now + 0.07, duration: 0.2, peakGain: 0.14, attack: 0.005, type: "triangle" });
}

/**
 * Task's "STAR SOUND: every star — bright satisfying collectible chime. As
 * upgrades progress, the musical pitch/texture may gently rise." `upgradeLevel`
 * (1-7 for an ordinary star; the 8th/final star uses playFinalStarChord
 * instead) nudges the chime's base pitch up a step each time, so star 7
 * genuinely sounds a little brighter/higher than star 1.
 */
export function playStarCollectChime(ctx: AudioContext, destination: AudioNode, upgradeLevel: number): void {
  const now = ctx.currentTime;
  const step = Math.max(0, Math.min(6, upgradeLevel - 1));
  const base = 880 * Math.pow(2, step / 24); // gentle rise, well under a full octave across all 7 ordinary stars
  playTone(ctx, destination, { frequency: base, startTime: now, duration: 0.45, peakGain: 0.3, attack: 0.008, overtoneRatio: 2.0, overtoneGain: 0.18 });
  playTone(ctx, destination, { frequency: base * 1.5, startTime: now + 0.06, duration: 0.4, peakGain: 0.16, attack: 0.006 });
}

/** A very gentle, neutral pass-by tone — task's "no failure sound," so this is deliberately soft and NOT a buzzer/error sound, just a soft two-note whoosh acknowledging the star passed. */
export function playStarMissSound(ctx: AudioContext, destination: AudioNode): void {
  const now = ctx.currentTime;
  playTone(ctx, destination, { frequency: 520, startTime: now, duration: 0.3, peakGain: 0.08, attack: 0.02, type: "sine" });
  playTone(ctx, destination, { frequency: 440, startTime: now + 0.08, duration: 0.32, peakGain: 0.06, attack: 0.02, type: "sine" });
}

/** Task's "UPGRADE SOUND: each transformation — short energy/power-up sound. Not loud. Not arcade-aggressive." A quick rising sweep of 3 close notes, distinct from (and layered just after) playStarCollectChime. */
export function playRocketUpgradeSound(ctx: AudioContext, destination: AudioNode): void {
  const now = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99]; // C5 E5 G5
  notes.forEach((freq, i) => {
    playTone(ctx, destination, { frequency: freq, startTime: now + i * 0.045, duration: 0.22, peakGain: 0.14, attack: 0.004, type: "triangle" });
  });
}

/** Task's "FINAL STAR / LEVEL COMPLETE: strong resolving space chord." Plays instead of playStarCollectChime for star 8. */
export function playFinalStarChord(ctx: AudioContext, destination: AudioNode): void {
  const now = ctx.currentTime;
  const chord = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6 — resolving major chord, an octave topped
  chord.forEach((frequency, i) => {
    playTone(ctx, destination, {
      frequency,
      startTime: now + i * 0.04,
      duration: 1.6,
      peakGain: 0.26,
      attack: 0.02,
      overtoneRatio: 2.0,
      overtoneGain: 0.16,
    });
  });
  for (let i = 0; i < 8; i++) {
    const delay = 0.15 + Math.random() * 1.2;
    playTone(ctx, destination, { frequency: 1760 + Math.random() * 1400, startTime: now + delay, duration: 0.5, peakGain: 0.09, attack: 0.005 });
  }
}

/**
 * MEDIUM/ADVANCED's FIRE mechanic (task's "Short futuristic: pew / energy
 * pulse, but soft and child-friendly. No loud gunshot."). A single quick
 * downward-pitched blip, softer and shorter than playLaneChangeSound so it
 * reads as a light energy tool rather than a weapon.
 */
export function playFireSound(ctx: AudioContext, destination: AudioNode): void {
  const now = ctx.currentTime;
  playTone(ctx, destination, { frequency: 1100, startTime: now, duration: 0.09, peakGain: 0.15, attack: 0.002, type: "triangle" });
  playTone(ctx, destination, { frequency: 700, startTime: now + 0.04, duration: 0.12, peakGain: 0.12, attack: 0.002, type: "triangle" });
}

/** An asteroid destroyed by FIRE (task's "Impact: crystal/rock energy break. No loud gunshot."). A bright glassy crack — two quick high overtone-rich notes, deliberately NOT an explosion boom. */
export function playAsteroidClearSound(ctx: AudioContext, destination: AudioNode): void {
  const now = ctx.currentTime;
  playTone(ctx, destination, { frequency: 1568, startTime: now, duration: 0.22, peakGain: 0.16, attack: 0.004, overtoneRatio: 1.5, overtoneGain: 0.14 });
  playTone(ctx, destination, { frequency: 2093, startTime: now + 0.03, duration: 0.18, peakGain: 0.12, attack: 0.004 });
  for (let i = 0; i < 3; i++) {
    playTone(ctx, destination, { frequency: 2400 + Math.random() * 800, startTime: now + 0.05 + i * 0.04, duration: 0.15, peakGain: 0.06, attack: 0.003 });
  }
}

/** A friendly alien spacecraft passing by (task's "friendly/cartoon... NOT scary") — a warm two-note wave-hello chime, never overlapping with the star chime's timbre. */
export function playAlienPassSound(ctx: AudioContext, destination: AudioNode): void {
  const now = ctx.currentTime;
  playTone(ctx, destination, { frequency: 392, startTime: now, duration: 0.28, peakGain: 0.12, attack: 0.015, type: "sine" });
  playTone(ctx, destination, { frequency: 493.88, startTime: now + 0.1, duration: 0.3, peakGain: 0.11, attack: 0.015, type: "sine" });
}

/** ADVANCED's final-star portal payoff (task's "portal opens... huge space celebration. No strobe."). A shimmering upward sweep of close overtone-rich tones, layered just before playFinalStarChord. */
export function playPortalSound(ctx: AudioContext, destination: AudioNode): void {
  const now = ctx.currentTime;
  const sweep = [660, 880, 1100, 1320];
  sweep.forEach((frequency, i) => {
    playTone(ctx, destination, { frequency, startTime: now + i * 0.07, duration: 0.5, peakGain: 0.14, attack: 0.02, overtoneRatio: 2.0, overtoneGain: 0.12 });
  });
}

/** A short, magical sting for the Welcome scene — two soft high tones, mirrors every other game's own intro sting but with this game's own interval/timbre. */
export function playSpaceIntroSting(ctx: AudioContext, destination: AudioNode): void {
  const now = ctx.currentTime;
  playTone(ctx, destination, { frequency: 880, startTime: now, duration: 0.5, peakGain: 0.13, attack: 0.01, overtoneRatio: 2.0, overtoneGain: 0.1 });
  playTone(ctx, destination, { frequency: 1318.51, startTime: now + 0.12, duration: 0.55, peakGain: 0.11, attack: 0.008, overtoneRatio: 2.0, overtoneGain: 0.1 });
}

/** How big a Space Pilot celebration feels — scales the same building block, same convention as every other game's own CelebrationLevel philosophy. */
export type SpaceCelebrationLevel = "stage" | "session";

const SPACE_LEVEL_PARAMS: Record<SpaceCelebrationLevel, { sparkleCount: number; peakGain: number }> = {
  stage: { sparkleCount: 8, peakGain: 0.2 },
  session: { sparkleCount: 10, peakGain: 0.22 },
};

/** Level/session-complete celebration — a warm resolving chord with a scattering of high sparkles, deliberately distinct from playFinalStarChord (bigger, but not a repeat of the same exact voicing). */
export function playSpaceCelebration(ctx: AudioContext, destination: AudioNode, level: SpaceCelebrationLevel): void {
  const now = ctx.currentTime;
  const { sparkleCount, peakGain } = SPACE_LEVEL_PARAMS[level];
  const chord = [440, 554.37, 659.25, 880]; // A4 C#5 E5 A5
  chord.forEach((frequency, i) => {
    playTone(ctx, destination, { frequency, startTime: now + i * 0.05, duration: 1.5, peakGain, attack: 0.03, overtoneRatio: 2.0, overtoneGain: 0.15 });
  });
  for (let i = 0; i < sparkleCount; i++) {
    const delay = 0.1 + Math.random() * 1.2;
    playTone(ctx, destination, { frequency: 1568 + Math.random() * 1600, startTime: now + delay, duration: 0.5, peakGain: 0.08, attack: 0.005 });
  }
}

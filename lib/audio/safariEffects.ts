import type { Animal } from "@/lib/feedanimals";
import { playTone } from "./primitives";

/**
 * Feed the Animals' own procedural sound effects — deliberately separate
 * from effects.ts (Balloon Quest), cosmicEffects.ts (Follow the
 * Footsteps), and underwaterEffects.ts (Bubble Pop Wall), per the product
 * rule that every game must sound nothing alike. Same synthesis approach
 * (no licensed/downloaded audio assets), same pediatric-appropriate soft
 * envelopes.
 */

/** The correct-feed sound (task section 28) — a soft wooden/marimba note + a tiny hand-drum tap + a light sparkle, warm and playful. Never Balloon Quest's POP identity, Follow the Footsteps' cosmic chime, or Bubble Pop Wall's watery pop. */
export function playFeedCorrect(ctx: AudioContext, destination: AudioNode): void {
  const now = ctx.currentTime;

  // Soft wooden/marimba note.
  playTone(ctx, destination, { frequency: 523.25, startTime: now, duration: 0.55, peakGain: 0.2, attack: 0.006, overtoneRatio: 2.76, overtoneGain: 0.16 });

  // Tiny hand-drum tap — a short, low, damped thump.
  const bufferLength = 0.09;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * bufferLength, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 500;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.22, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + bufferLength);
  noise.connect(filter).connect(noiseGain).connect(destination);
  noise.start(now);
  noise.stop(now + bufferLength + 0.02);

  // Light sparkle on top.
  playTone(ctx, destination, { frequency: 1567.98, startTime: now + 0.1, duration: 0.4, peakGain: 0.1, attack: 0.01, overtoneRatio: 1.5, overtoneGain: 0.08 });
}

/**
 * A short, warm sting for the safari world's own intro moment (task section
 * 7's "warm wooden/marimba safari sting") — plays once, alongside Mariam's
 * welcome line, when FeedAnimalsWelcomeScene mounts. Distinct from
 * playFeedCorrect (a per-feed reward) and playSafariCelebration (stage/
 * session milestones): a single rising two-note marimba phrase, nothing
 * more.
 */
export function playSafariIntroSting(ctx: AudioContext, destination: AudioNode): void {
  const now = ctx.currentTime;
  playTone(ctx, destination, { frequency: 392, startTime: now, duration: 0.5, peakGain: 0.16, attack: 0.008, overtoneRatio: 2.5, overtoneGain: 0.14 });
  playTone(ctx, destination, { frequency: 523.25, startTime: now + 0.14, duration: 0.6, peakGain: 0.18, attack: 0.008, overtoneRatio: 2.5, overtoneGain: 0.14 });
}

/**
 * The tiny character-specific accent (task section 16) that plays the
 * instant an animal actually RECEIVES its food (see
 * components/display/feedanimals/scenes/FeedAnimalsPlayingScene.tsx's
 * feed_animals_animal_reaction event) — layered a beat after
 * playFeedCorrect's own "chosen" sound, never replacing it. Each animal
 * gets its own brief timbre per the spec's own list; none of these are
 * realistic animal sounds (no roars, no chatter) — every one is a soft,
 * synthesized musical accent, same pediatric-appropriate envelope as every
 * other effect in this file.
 */
export function playAnimalAccent(ctx: AudioContext, destination: AudioNode, animal: Animal): void {
  const now = ctx.currentTime;
  switch (animal) {
    case "MONKEY": {
      // Playful light percussion — three quick soft wood ticks.
      [0, 0.08, 0.16].forEach((delay, i) => {
        playTone(ctx, destination, { frequency: 880 + i * 60, startTime: now + delay, duration: 0.12, peakGain: 0.14, attack: 0.004, type: "triangle" });
      });
      break;
    }
    case "RABBIT": {
      // Soft springy pluck — a quick upward pitch bounce.
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.16, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
      osc.connect(gain).connect(destination);
      osc.start(now);
      osc.stop(now + 0.22);
      break;
    }
    case "PANDA": {
      // Gentle wooden chime — one soft mallet note.
      playTone(ctx, destination, { frequency: 349.23, startTime: now, duration: 0.5, peakGain: 0.16, attack: 0.01, overtoneRatio: 2.76, overtoneGain: 0.14 });
      break;
    }
    case "ELEPHANT": {
      // Soft warm low note — a single gentle sine, never a trumpet/roar.
      playTone(ctx, destination, { frequency: 155.56, startTime: now, duration: 0.6, peakGain: 0.14, attack: 0.03, overtoneRatio: 2, overtoneGain: 0.1 });
      break;
    }
    case "GIRAFFE": {
      // Light marimba rise — a short three-note ascending run.
      [523.25, 587.33, 659.25].forEach((frequency, i) => {
        playTone(ctx, destination, { frequency, startTime: now + i * 0.07, duration: 0.35, peakGain: 0.13, attack: 0.006, overtoneRatio: 2.5, overtoneGain: 0.1 });
      });
      break;
    }
  }
}

/** Synthesizes one filtered noise "tick," the shared building block behind every animal's own movement sound below — only the filter frequency/Q, gain, and length differ. */
function playFilteredTick(ctx: AudioContext, destination: AudioNode, frequency: number, q: number, peakGain: number, bufferLength: number): void {
  const now = ctx.currentTime;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * bufferLength, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = frequency;
  filter.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(peakGain, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + bufferLength);
  noise.connect(filter).connect(gain).connect(destination);
  noise.start(now);
  noise.stop(now + bufferLength + 0.02);
}

/**
 * SAFARI ANIMAL ADVENTURE — a single movement sound synchronized with each
 * LEFT/RIGHT/JUMP press along the path (task's "PRESS -> ANIMAL MOVES, no
 * confusing delay" needs an audible confirmation on every single press, not
 * just the arrival). Deliberately much lighter than playFeedCorrect (the
 * "you did it!" reward) — closer to a UI click than a celebration. Each
 * animal gets its own distinct movement personality (task's explicit list:
 * monkey soft dirt steps, rabbit soft hop-hop, panda soft padded steps,
 * elephant gentle heavier ground steps, giraffe light longer-spaced
 * ground/hoof taps) — pitched slightly differently for LEFT vs RIGHT so the
 * two directions never sound identical, and JUMP gets its own brief
 * two-tick "up-and-land" landing accent regardless of animal.
 */
export function playAnimalStep(ctx: AudioContext, destination: AudioNode, animal: Animal, direction: "left" | "right" | "jump"): void {
  if (direction === "jump") {
    playFilteredTick(ctx, destination, 900, 1.1, 0.12, 0.05);
    const now = ctx.currentTime;
    setTimeout(() => {
      if (ctx.state === "closed") return;
      playFilteredTick(ctx, destination, 340, 0.9, 0.18, 0.07);
    }, 130);
    void now;
    return;
  }

  const dirShift = direction === "right" ? 1 : -1;
  switch (animal) {
    case "RABBIT": {
      // Soft hop-hop — two quick light ticks close together.
      playFilteredTick(ctx, destination, 700 + dirShift * 40, 1.4, 0.13, 0.045);
      setTimeout(() => {
        if (ctx.state === "closed") return;
        playFilteredTick(ctx, destination, 780 + dirShift * 40, 1.4, 0.1, 0.04);
      }, 90);
      break;
    }
    case "PANDA": {
      // Soft padded step — warm, low, rounded.
      playFilteredTick(ctx, destination, 340 + dirShift * 20, 0.7, 0.17, 0.09);
      break;
    }
    case "ELEPHANT": {
      // Gentle heavier ground step — low thump, longer decay.
      playFilteredTick(ctx, destination, 200 + dirShift * 15, 0.6, 0.22, 0.13);
      break;
    }
    case "GIRAFFE": {
      // Light, longer-spaced hoof tap — bright and short.
      playFilteredTick(ctx, destination, 900 + dirShift * 50, 1.6, 0.11, 0.045);
      break;
    }
    case "MONKEY":
    default: {
      // Soft dirt step.
      playFilteredTick(ctx, destination, 620 + dirShift * 100, 0.8, 0.16, 0.06);
      break;
    }
  }
}

/** Incorrect selection (task section 29) — a soft woodblock "boop," never harsh, never a buzzer. */
export function playFeedIncorrect(ctx: AudioContext, destination: AudioNode): void {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(300, now);
  osc.frequency.exponentialRampToValueAtTime(220, now + 0.12);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.13, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
  osc.connect(gain).connect(destination);
  osc.start(now);
  osc.stop(now + 0.22);
}

/** How big a safari celebration feels — scales the same building block, never a different sound design per level. */
export type SafariCelebrationLevel = "stage1" | "stage2" | "stage3" | "stage4" | "stage5" | "session";

const LEVEL_PARAMS: Record<SafariCelebrationLevel, { plucks: number; peakGain: number }> = {
  stage1: { plucks: 4, peakGain: 0.15 },
  stage2: { plucks: 5, peakGain: 0.16 },
  stage3: { plucks: 6, peakGain: 0.18 },
  stage4: { plucks: 7, peakGain: 0.19 },
  stage5: { plucks: 9, peakGain: 0.21 },
  session: { plucks: 11, peakGain: 0.23 },
};

/** Safari celebration — a warm resolving marimba chord with a scatter of bright plucks over it. Deliberately no arcade run, no bubble shower, no cosmic sparkle — this reads as a warm safari-camp gathering, not a fanfare. */
export function playSafariCelebration(ctx: AudioContext, destination: AudioNode, level: SafariCelebrationLevel): void {
  const now = ctx.currentTime;
  const { plucks, peakGain } = LEVEL_PARAMS[level];

  const chord = [349.23, 440, 523.25]; // F4 A4 C5
  chord.forEach((frequency, i) => {
    playTone(ctx, destination, {
      frequency,
      startTime: now + i * 0.05,
      duration: 1.2,
      peakGain,
      attack: 0.04,
      overtoneRatio: 2.5,
      overtoneGain: 0.14,
    });
  });

  const NOTES = [523.25, 587.33, 659.25, 698.46, 783.99]; // C5 D5 E5 F5 G5
  for (let i = 0; i < plucks; i++) {
    const delay = 0.15 + Math.random() * 1.2;
    const frequency = NOTES[Math.floor(Math.random() * NOTES.length)];
    playTone(ctx, destination, { frequency, startTime: now + delay, duration: 0.4, peakGain: 0.09, attack: 0.008, overtoneRatio: 2, overtoneGain: 0.08 });
  }
}

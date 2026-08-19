import { playCelebration, playChime, playOops } from "./effects";
import { playTone } from "./primitives";

export function playColorPadActivation(ctx: AudioContext, destination: AudioNode): void {
  playTone(ctx, destination, { frequency: 523.25, startTime: ctx.currentTime, duration: 0.16, peakGain: 0.18, attack: 0.015 });
}

export function playColorCorrect(ctx: AudioContext, destination: AudioNode, combo: number): void {
  playChime(ctx, destination);
  if (combo > 1) playTone(ctx, destination, { frequency: 1174.66 + Math.min(combo, 5) * 45, startTime: ctx.currentTime + 0.11, duration: 0.25, peakGain: 0.18 });
}

export function playColorWrong(ctx: AudioContext, destination: AudioNode): void {
  playOops(ctx, destination);
}

export function playColorDanger(ctx: AudioContext, destination: AudioNode): void {
  const now = ctx.currentTime;
  playTone(ctx, destination, { frequency: 329.63, startTime: now, duration: 0.16, peakGain: 0.22, attack: 0.02 });
  playTone(ctx, destination, { frequency: 261.63, startTime: now + 0.1, duration: 0.18, peakGain: 0.18, attack: 0.02 });
}

export function playColorCelebration(ctx: AudioContext, destination: AudioNode, level: "stage1" | "stage2" | "stage3" | "stage4" | "stage5" | "session"): void {
  playCelebration(ctx, destination, level);
}

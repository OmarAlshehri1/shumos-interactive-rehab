/**
 * Small Web Audio building blocks shared by effects.ts and ambience.ts.
 * Everything here is procedurally synthesized — no audio files are loaded
 * or decoded, so there's nothing to preload, nothing that can 404, and no
 * licensing question for any of it. See ARCHITECTURE.md / the Task 4
 * report for the reasoning.
 */

/** A buffer of white noise, used as the raw material for both the pop "snap" and the ambience air texture. */
export function createNoiseBuffer(ctx: AudioContext, durationSeconds: number): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * durationSeconds));
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

export interface ToneParams {
  frequency: number;
  startTime: number;
  duration: number;
  /** Peak linear gain (0-1) at the top of the attack. */
  peakGain: number;
  type?: OscillatorType;
  attack?: number;
  /** Adds a quiet second oscillator at frequency * overtoneRatio for a "bell" timbre. */
  overtoneRatio?: number;
  overtoneGain?: number;
}

/**
 * A single enveloped tone: linear attack, exponential decay to silence.
 * The building block for every chime/pop/celebration note — deliberately
 * soft-edged (no clicks) since this is a pediatric context, not an arcade.
 */
export function playTone(ctx: AudioContext, destination: AudioNode, params: ToneParams): void {
  const { frequency, startTime, duration, peakGain, type = "sine", attack = 0.015, overtoneRatio, overtoneGain = 0.25 } = params;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(peakGain, startTime + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  gain.connect(destination);

  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = frequency;
  osc.connect(gain);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.05);

  if (overtoneRatio) {
    const overtoneOsc = ctx.createOscillator();
    overtoneOsc.type = type;
    overtoneOsc.frequency.value = frequency * overtoneRatio;
    const overtoneGainNode = ctx.createGain();
    overtoneGainNode.gain.value = overtoneGain;
    overtoneOsc.connect(overtoneGainNode).connect(gain);
    overtoneOsc.start(startTime);
    overtoneOsc.stop(startTime + duration + 0.05);
  }
}

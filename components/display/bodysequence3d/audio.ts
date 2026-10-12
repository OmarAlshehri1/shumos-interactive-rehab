import { createNoiseBuffer, playTone } from '@/lib/audio/primitives';
import { createSpeechSynthesisVoiceProvider, type VoiceProvider } from '@/lib/audio/speech';

/**
 * Body Sequence sound: a small synthesiser built on the shared audio primitives (no audio files, nothing to license)
 * plus the shared browser speech provider for the few spoken lines. Every level is low and soft; a mistake is a gentle
 * sigh, never a buzzer. Browsers only start audio after a user gesture: until then `blocked` is true and the Display
 * shows a small hint. Everything is optional: the game is fully playable (and every instruction visible) without sound.
 */
export type Sfx = 'step' | 'sequence' | 'tick' | 'go' | 'start' | 'preview' | 'stop' | 'holdDone' | 'gentle' | 'replay' | 'stage' | 'final';

const SCALE = [196, 233.08, 261.63, 311.13, 349.23, 392, 466.16, 523.25];

export class BodySequenceAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private step = 0;
  private sound = true;
  private music = true;
  private volume = 0.7;
  private speech: VoiceProvider | null = null;
  private spoken = new Set<string>();
  blocked = false;
  played = 0;
  lastSpoken = '';

  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        this.musicBus = this.ctx.createGain();
        this.musicBus.connect(this.master);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
      this.blocked = this.ctx.state !== 'running';
      this.apply();
    } catch {
      this.blocked = true;
    }
  }

  configure(o: { sound: boolean; music: boolean; volume: number }): void {
    this.sound = o.sound; this.music = o.music; this.volume = o.volume;
    if (!o.sound) this.cancelSpeech();
    this.apply();
  }

  private apply() {
    if (!this.ctx || !this.master || !this.musicBus) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.linearRampToValueAtTime(this.sound ? this.volume : 0, t + 0.25);
    this.musicBus.gain.value = 0.36;
    const musicOn = this.sound && this.music && this.ctx.state === 'running';
    if (musicOn && !this.timer) this.timer = setInterval(() => this.tick(), 600);
    if (!musicOn && this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  /** A slow, soft synth pad: a low drone and a sparse bell arpeggio. */
  private tick() {
    const ctx = this.ctx, bus = this.musicBus;
    if (!ctx || !bus || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.03;
    const idx = [0, 2, 4, 2, 5, 3, 4, 1][this.step % 8];
    if (this.step % 4 === 0) playTone(ctx, bus, { frequency: SCALE[0] / 2, startTime: t, duration: 2.6, peakGain: 0.09, type: 'sine', attack: 0.5 });
    if (this.step % 2 === 0) playTone(ctx, bus, { frequency: SCALE[idx], startTime: t, duration: 1.3, peakGain: 0.06, type: 'triangle', attack: 0.06, overtoneRatio: 2.01, overtoneGain: 0.18 });
    this.step++;
  }

  sfx(kind: Sfx): void {
    const ctx = this.ctx, bus = this.master;
    if (!ctx || !bus || !this.sound || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.02;
    const bell = (f: number, at: number, dur = 0.9, g = 0.16) => playTone(ctx, bus, { frequency: f, startTime: t + at, duration: dur, peakGain: g, type: 'sine', attack: 0.008, overtoneRatio: 2.76, overtoneGain: 0.22 });
    this.played++;
    switch (kind) {
      case 'step': bell(659.25, 0, 0.6, 0.13); bell(987.77, 0.07, 0.8, 0.1); break;
      case 'sequence': [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => bell(f, i * 0.085, 1.0 + i * 0.1, 0.15)); break;
      case 'tick': playTone(ctx, bus, { frequency: 523.25, startTime: t, duration: 0.18, peakGain: 0.1, attack: 0.005 }); break;
      case 'go': bell(392, 0, 0.5, 0.1); bell(523.25, 0.14, 0.7, 0.11); break;
      case 'start': bell(784, 0, 0.7, 0.14); bell(1046.5, 0.12, 0.9, 0.14); break;
      case 'preview': bell(587.33, 0, 0.45, 0.08); break;
      case 'stop': playTone(ctx, bus, { frequency: 220, startTime: t, duration: 0.8, peakGain: 0.13, attack: 0.06 }); playTone(ctx, bus, { frequency: 164.81, startTime: t + 0.18, duration: 0.9, peakGain: 0.1, attack: 0.06 }); break;
      case 'holdDone': [659.25, 783.99, 987.77].forEach((f, i) => bell(f, i * 0.09, 0.9)); break;
      case 'gentle': playTone(ctx, bus, { frequency: 293.66, startTime: t, duration: 0.7, peakGain: 0.07, attack: 0.12 }); playTone(ctx, bus, { frequency: 261.63, startTime: t + 0.3, duration: 0.9, peakGain: 0.06, attack: 0.12 }); break;
      case 'replay': bell(587.33, 0, 0.5, 0.07); bell(587.33, 0.2, 0.6, 0.06); break;
      case 'stage': [0, 2, 4, 5, 7].forEach((n, i) => bell(SCALE[n] * 2, i * 0.13, 1.1, 0.15)); break;
      case 'final': {
        [0, 2, 3, 5, 7].forEach((n, i) => bell(SCALE[n] * 2, i * 0.12, 1.4, 0.16));
        for (let i = 0; i < 8; i++) bell(1318.5 + i * 90, 0.9 + i * 0.07, 0.6, 0.06);
        const src = ctx.createBufferSource(); src.buffer = createNoiseBuffer(ctx, 0.6);
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(500, t); bp.frequency.exponentialRampToValueAtTime(3000, t + 0.5); bp.Q.value = 1.2;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.07, t + 0.15); g.gain.linearRampToValueAtTime(0.0001, t + 0.55);
        src.connect(bp); bp.connect(g); g.connect(bus); src.start(t); src.stop(t + 0.6);
        break;
      }
    }
  }

  /** Speaks a line once per `key` (a session-long dedupe), only while sound is on and voice is allowed. */
  say(key: string, text: string, enabled: boolean): void {
    if (!enabled || !this.sound || this.spoken.has(key)) return;
    this.spoken.add(key);
    try {
      this.speech ??= createSpeechSynthesisVoiceProvider();
      if (!this.speech.isAvailable()) return;
      this.lastSpoken = text;
      this.speech.speak(text, { rate: 0.9, pitch: 1.05, volume: Math.min(1, this.volume) });
    } catch { /* speech is optional */ }
  }

  resetSpoken() { this.spoken.clear(); }

  cancelSpeech() {
    try { this.speech?.cancel(); } catch { /* optional */ }
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.cancelSpeech();
    const c = this.ctx;
    this.ctx = null; this.master = null; this.musicBus = null;
    void c?.close().catch(() => {});
  }
}

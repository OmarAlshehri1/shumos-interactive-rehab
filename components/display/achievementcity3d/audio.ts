import { createNoiseBuffer, playTone } from '@/lib/audio/primitives';
import { createSpeechSynthesisVoiceProvider, type VoiceProvider } from '@/lib/audio/speech';

/**
 * Achievement City sound: a small synthesiser on the shared audio primitives (no audio files, nothing to license) plus
 * the shared browser speech provider for a few spoken lines. Soft and pleasant; browsers only start audio after a user
 * gesture, so `blocked` is true until then and the Display shows a small hint. Everything is optional.
 */
export type Sfx = 'build' | 'ding' | 'confirm' | 'undo' | 'level' | 'final' | 'start';

const SCALE = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25];

export class CityAudio {
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
    this.musicBus.gain.value = 0.3;
    const on = this.sound && this.music && this.ctx.state === 'running';
    if (on && !this.timer) this.timer = setInterval(() => this.tick(), 700);
    if (!on && this.timer) { clearInterval(this.timer); this.timer = null; }
  }
  /** A calm major-pentatonic background: soft pad plus a sparse bell line. Gets a little warmer with each level. */
  private tick() {
    const ctx = this.ctx, bus = this.musicBus;
    if (!ctx || !bus || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.03;
    const idx = [0, 2, 4, 2, 5, 4, 2, 1][this.step % 8];
    if (this.step % 4 === 0) playTone(ctx, bus, { frequency: SCALE[0] / 2, startTime: t, duration: 3, peakGain: 0.08, type: 'sine', attack: 0.6 });
    if (this.step % 4 === 2) playTone(ctx, bus, { frequency: SCALE[4] / 2, startTime: t, duration: 2.6, peakGain: 0.05, type: 'sine', attack: 0.6 });
    if (this.step % 2 === 0) playTone(ctx, bus, { frequency: SCALE[idx], startTime: t, duration: 1.4, peakGain: 0.05, type: 'triangle', attack: 0.05, overtoneRatio: 2.01, overtoneGain: 0.16 });
    this.step++;
  }

  sfx(kind: Sfx): void {
    const ctx = this.ctx, bus = this.master;
    if (!ctx || !bus || !this.sound || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.02;
    const bell = (f: number, at: number, dur = 0.9, g = 0.15) => playTone(ctx, bus, { frequency: f, startTime: t + at, duration: dur, peakGain: g, type: 'sine', attack: 0.008, overtoneRatio: 2.76, overtoneGain: 0.22 });
    this.played++;
    switch (kind) {
      case 'confirm': bell(659.25, 0, 0.5, 0.12); bell(880, 0.07, 0.7, 0.1); break;
      case 'build': {
        // a couple of soft wooden taps and a rising whoosh: building, not drilling
        for (let i = 0; i < 3; i++) playTone(ctx, bus, { frequency: 180 + i * 25, startTime: t + 0.05 + i * 0.13, duration: 0.12, peakGain: 0.12, type: 'triangle', attack: 0.003 });
        const src = ctx.createBufferSource(); src.buffer = createNoiseBuffer(ctx, 0.5);
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(1800, t + 0.45); bp.Q.value = 1.1;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.04, t + 0.12); g.gain.linearRampToValueAtTime(0.0001, t + 0.5);
        src.connect(bp); bp.connect(g); g.connect(bus); src.start(t); src.stop(t + 0.5);
        break;
      }
      case 'ding': [783.99, 987.77, 1318.5].forEach((f, i) => bell(f, 0.3 + i * 0.09, 1.1, 0.13)); break;
      case 'undo': bell(493.88, 0, 0.45, 0.08); bell(392, 0.12, 0.6, 0.07); break;
      case 'start': bell(523.25, 0, 0.7, 0.12); bell(783.99, 0.14, 0.9, 0.12); break;
      case 'level': [0, 2, 4, 5, 7].forEach((n, i) => bell(SCALE[n] * 2, i * 0.13, 1.2, 0.15)); break;
      case 'final': {
        [0, 2, 4, 5, 7, 5, 7].forEach((n, i) => bell(SCALE[n] * 2, i * 0.14, 1.5, 0.16));
        for (let i = 0; i < 9; i++) bell(1318.5 + i * 80, 1.1 + i * 0.08, 0.7, 0.06);
        break;
      }
    }
  }
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
  cancelSpeech() { try { this.speech?.cancel(); } catch { /* optional */ } }
  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.cancelSpeech();
    const c = this.ctx;
    this.ctx = null; this.master = null; this.musicBus = null;
    void c?.close().catch(() => {});
  }
}

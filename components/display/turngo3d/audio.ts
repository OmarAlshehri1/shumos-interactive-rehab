import { createNoiseBuffer, playTone } from '@/lib/audio/primitives';
import { createSpeechSynthesisVoiceProvider, type VoiceProvider } from '@/lib/audio/speech';
import type { ThemeId } from '@/lib/turngo3d/stages';

/**
 * Turn & Go sound: small synthesiser built on the shared primitives (no audio files, nothing to license) plus the
 * shared browser speech provider for the few spoken lines. Every level is low and soft; mistakes are a gentle sigh,
 * never a buzzer. Browsers only start audio after a user gesture: until then `blocked` is true and the Display shows a
 * small hint. Everything is optional: the game is fully playable (and every instruction visible) without sound.
 */
export type Sfx = 'star' | 'activate' | 'go' | 'wait' | 'holdStart' | 'holdDone' | 'gentle' | 'stage' | 'final' | 'gate' | 'switch' | 'tick' | 'start' | 'repeat';

const SCALES: Record<ThemeId, number[]> = {
  garden: [261.63, 293.66, 329.63, 392, 440, 523.25],
  playground: [293.66, 329.63, 392, 440, 523.25, 587.33],
  flowers: [329.63, 392, 440, 523.25, 587.33, 659.25],
  beach: [261.63, 311.13, 349.23, 392, 466.16, 523.25],
  festivalPark: [293.66, 349.23, 392, 440, 523.25, 587.33],
  forest: [220, 261.63, 293.66, 349.23, 392, 440],
  luminous: [196, 233.08, 261.63, 311.13, 349.23, 392],
  town: [261.63, 329.63, 392, 440, 523.25, 659.25],
  finale: [261.63, 329.63, 392, 523.25, 659.25, 783.99],
};

export class TurnGoAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private waves: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private step = 0;
  private sound = true;
  private music = true;
  private volume = 0.7;
  private theme: ThemeId = 'garden';
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

  configure(o: { sound: boolean; music: boolean; volume: number; theme: ThemeId }): void {
    this.sound = o.sound; this.music = o.music; this.volume = o.volume;
    const themeChanged = o.theme !== this.theme;
    this.theme = o.theme;
    if (themeChanged) this.step = 0;
    if (!o.sound) this.cancelSpeech();
    this.apply();
  }

  private apply() {
    if (!this.ctx || !this.master || !this.musicBus) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.linearRampToValueAtTime(this.sound ? this.volume : 0, t + 0.25);
    this.musicBus.gain.value = 0.42;
    const musicOn = this.sound && this.music && this.ctx.state === 'running';
    if (musicOn && !this.timer) this.timer = setInterval(() => this.tick(), 520);
    if (!musicOn && this.timer) { clearInterval(this.timer); this.timer = null; }
    if (musicOn && this.theme === 'beach') this.startWaves(); else this.stopWaves();
  }

  private tick() {
    const ctx = this.ctx, bus = this.musicBus;
    if (!ctx || !bus || ctx.state !== 'running') return;
    const sc = SCALES[this.theme], t = ctx.currentTime + 0.03;
    // slow, soft arpeggio: a low root every fourth step, otherwise a gentle upper note
    const idx = [0, 2, 4, 2, 1, 3, 5, 3][this.step % 8];
    if (this.step % 4 === 0) playTone(ctx, bus, { frequency: sc[0] / 2, startTime: t, duration: 2.2, peakGain: 0.09, type: 'sine', attack: 0.4 });
    if (this.step % 2 === 0) playTone(ctx, bus, { frequency: sc[idx], startTime: t, duration: 1.1, peakGain: 0.07, type: this.theme === 'luminous' || this.theme === 'finale' ? 'triangle' : 'sine', attack: 0.05, overtoneRatio: 2.01, overtoneGain: 0.18 });
    this.step++;
  }

  private startWaves() {
    if (!this.ctx || !this.musicBus || this.waves) return;
    const src = this.ctx.createBufferSource();
    src.buffer = createNoiseBuffer(this.ctx, 6); src.loop = true;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 480; lp.Q.value = 0.4;
    const gain = this.ctx.createGain(); gain.gain.value = 0.05;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.11;
    const depth = this.ctx.createGain(); depth.gain.value = 0.035;
    lfo.connect(depth); depth.connect(gain.gain); src.connect(lp); lp.connect(gain); gain.connect(this.musicBus);
    src.start(); lfo.start();
    this.waves = { src, gain };
  }

  private stopWaves() {
    if (!this.waves) return;
    try { this.waves.src.stop(); } catch { /* already stopped */ }
    this.waves = null;
  }

  sfx(kind: Sfx): void {
    const ctx = this.ctx, bus = this.master;
    if (!ctx || !bus || !this.sound || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.02;
    const sc = SCALES[this.theme];
    const bell = (f: number, at: number, dur = 0.9, g = 0.16) => playTone(ctx, bus, { frequency: f, startTime: t + at, duration: dur, peakGain: g, type: 'sine', attack: 0.008, overtoneRatio: 2.76, overtoneGain: 0.22 });
    this.played++;
    switch (kind) {
      case 'star': [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => bell(f, i * 0.075, 0.95 + i * 0.1)); break;
      case 'activate': bell(880, 0, 0.5, 0.08); break;
      case 'go': bell(392, 0, 0.5, 0.1); bell(523.25, 0.14, 0.7, 0.11); break;
      case 'wait': playTone(ctx, bus, { frequency: 440, startTime: t, duration: 0.5, peakGain: 0.09, attack: 0.06 }); playTone(ctx, bus, { frequency: 349.23, startTime: t + 0.24, duration: 0.7, peakGain: 0.09, attack: 0.06 }); break;
      case 'holdStart': playTone(ctx, bus, { frequency: 196, startTime: t, duration: 0.9, peakGain: 0.14, attack: 0.08 }); break;
      case 'holdDone': [659.25, 783.99, 987.77].forEach((f, i) => bell(f, i * 0.09, 0.9)); break;
      case 'gentle': playTone(ctx, bus, { frequency: 293.66, startTime: t, duration: 0.7, peakGain: 0.07, attack: 0.12 }); playTone(ctx, bus, { frequency: 261.63, startTime: t + 0.3, duration: 0.9, peakGain: 0.06, attack: 0.12 }); break;
      case 'repeat': bell(587.33, 0, 0.5, 0.07); bell(587.33, 0.2, 0.6, 0.06); break;
      case 'tick': playTone(ctx, bus, { frequency: 523.25, startTime: t, duration: 0.18, peakGain: 0.1, attack: 0.005 }); break;
      case 'start': bell(784, 0, 0.7, 0.14); bell(1046.5, 0.12, 0.9, 0.14); break;
      case 'stage': [0, 2, 4, 5].forEach((n, i) => bell(sc[n] * 2, i * 0.13, 1.1, 0.15)); bell(sc[5] * 2 * 1.5, 0.55, 1.4, 0.12); break;
      case 'final': [0, 2, 3, 4, 5].forEach((n, i) => bell(sc[n] * 2, i * 0.12, 1.4, 0.16)); [0, 1, 2, 3, 4, 5, 6, 7].forEach((i) => bell(1318.5 + i * 90, 0.9 + i * 0.07, 0.6, 0.06)); break;
      case 'gate': {
        const src = ctx.createBufferSource(); src.buffer = createNoiseBuffer(ctx, 0.5);
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(260, t); bp.frequency.linearRampToValueAtTime(520, t + 0.5); bp.Q.value = 3;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.1, t + 0.15); g.gain.linearRampToValueAtTime(0.0001, t + 0.5);
        src.connect(bp); bp.connect(g); g.connect(bus); src.start(t); src.stop(t + 0.55);
        bell(659.25, 0.5, 0.8, 0.09); break;
      }
      case 'switch': {
        const src = ctx.createBufferSource(); src.buffer = createNoiseBuffer(ctx, 0.4);
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(2200, t + 0.35); bp.Q.value = 1.2;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.08, t + 0.1); g.gain.linearRampToValueAtTime(0.0001, t + 0.38);
        src.connect(bp); bp.connect(g); g.connect(bus); src.start(t); src.stop(t + 0.42);
        bell(783.99, 0.3, 0.6, 0.08); break;
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
    this.stopWaves();
    this.cancelSpeech();
    const c = this.ctx;
    this.ctx = null; this.master = null; this.musicBus = null;
    void c?.close().catch(() => {});
  }
}

export const INTRO_LINE = 'اتبع الأسهم، وامشِ حول الأقماع، واجمع النجوم حتى تصل للنهاية.';

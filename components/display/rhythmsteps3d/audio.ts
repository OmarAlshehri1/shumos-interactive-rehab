import { BEAT_MS } from '@/lib/rhythmsteps3d/stages';

/**
 * Rhythm Steps audio: a small synthesiser, no audio files (so there is nothing to license). The music is scheduled
 * from the SAME authoritative gameplay clock that places the targets: every beat lies on the clock's beat grid, so the
 * beat and the target arrivals cannot drift apart. Pause, a stalled stream (assisted flow) or a speed change simply
 * stop or stretch the schedule, because the schedule is derived from the clock and never runs on its own timer.
 *
 * Browsers only start audio after a user gesture: until then `blocked` is true and the Display shows a small hint.
 * Everything is optional: the game is fully playable (and every instruction visible) without sound.
 */
const HALF = BEAT_MS / 2;
const LOOK_AHEAD_MS = 320;

// Chord roots (Hz) per level: A minor / D minor / E minor feel, bright but never harsh.
const PROGRESSIONS = [
  [110, 87.31, 130.81, 98], // A F C G
  [73.42, 116.54, 87.31, 130.81], // D Bb F C
  [82.41, 98, 73.42, 110], // E G D A
];
const ARP = [0, 7, 12, 7, 15, 12, 7, 3];

export interface AudioFrame {
  clock: number;
  speed: number;
  running: boolean;
  connected: boolean;
  stage: number;
  music: boolean;
  sfx: boolean;
  volume: number;
}

export type Sfx = 'spawn' | 'hit' | 'dual' | 'assist' | 'hold' | 'stage' | 'final';

export class RhythmAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private nextHalf = 0;
  private wasRunning = false;
  private lastClock = 0;
  private volume = 0.7;
  private musicOn = true;
  private sfxOn = true;
  blocked = false;
  scheduled = 0;

  /** Call from a user gesture (or when autoplay is allowed). Safe to call repeatedly. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.ctx.destination);
        const len = Math.floor(this.ctx.sampleRate * 0.4);
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume().then(() => (this.blocked = this.ctx?.state !== 'running'), () => (this.blocked = true));
      this.blocked = this.ctx.state !== 'running';
    } catch {
      this.blocked = true;
    }
  }

  private newBus(): void {
    if (!this.ctx || !this.master) return;
    const old = this.bus;
    this.bus = this.ctx.createGain();
    this.bus.gain.value = this.musicOn ? 0.5 : 0;
    this.bus.connect(this.master);
    if (old) {
      old.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
      setTimeout(() => old.disconnect(), 400);
    }
  }

  private tone(freq: number, at: number, dur: number, type: OscillatorType, gain: number, dest: AudioNode, slide = 0, lp = 0): void {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.02, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    let node: AudioNode = o;
    if (lp) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lp;
      o.connect(f);
      node = f;
    }
    node.connect(g).connect(dest);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  private hat(at: number, gain: number, dest: AudioNode): void {
    if (!this.ctx || !this.noise) return;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    s.connect(f).connect(g).connect(dest);
    s.start(at);
    s.stop(at + 0.08);
  }

  /** One half-beat of music at audio time `at`. */
  private halfBeat(h: number, at: number, stage: number): void {
    if (!this.bus) return;
    const bar = Math.floor(h / 8);
    const inBar = h % 8;
    const level = Math.floor(stage / 3);
    const root = PROGRESSIONS[level][bar % 4];
    const dest = this.bus;
    const lively = 0.5 + stage * 0.06;
    if (inBar % 2 === 0) {
      this.tone(118, at, 0.2, 'sine', 0.55, dest, 0.36);
      this.scheduled++;
    } else this.hat(at, 0.09 * lively, dest);
    if (inBar === 0 || inBar === 3 || inBar === 6) this.tone(root, at, 0.34, 'sawtooth', 0.12, dest, 1, 420 + stage * 40);
    const semis = ARP[(h + bar) % ARP.length] + (bar % 2 ? 3 : 0);
    if (stage >= 3 || inBar % 2 === 1) this.tone(root * 4 * 2 ** (semis / 12), at, 0.18, 'triangle', 0.045 * lively, dest);
    if (inBar === 0) for (const k of [0, 7, 12]) this.tone(root * 2 * 2 ** (k / 12 + (bar % 2 ? 0.25 : 0)), at, 3.0, 'sine', 0.035, dest);
  }

  /** Called every animation frame with the Display's visual clock. */
  update(f: AudioFrame): void {
    this.volume = Math.max(0, Math.min(1, f.volume / 100));
    this.sfxOn = f.sfx;
    if (!this.ctx || !this.master) return;
    this.master.gain.value = this.volume;
    if (this.musicOn !== f.music && this.bus) this.bus.gain.setTargetAtTime(f.music ? 0.5 : 0, this.ctx.currentTime, 0.05);
    this.musicOn = f.music;
    if (this.ctx.state !== 'running') {
      this.blocked = true;
      return;
    }
    this.blocked = false;
    const play = f.running && f.connected && f.music && this.volume > 0;
    if (!play) {
      if (this.wasRunning) this.bus?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.04);
      this.wasRunning = false;
      this.lastClock = f.clock;
      return;
    }
    if (!this.wasRunning || !this.bus) {
      this.newBus();
      this.nextHalf = Math.ceil(f.clock / HALF);
      this.wasRunning = true;
    }
    if (f.clock < this.lastClock - 400) this.nextHalf = Math.ceil(f.clock / HALF); // a new stage restarts the clock
    this.lastClock = f.clock;
    const now = this.ctx.currentTime;
    const horizon = f.clock + LOOK_AHEAD_MS * f.speed;
    let guard = 0;
    while (this.nextHalf * HALF <= horizon && guard++ < 8) {
      const delay = (this.nextHalf * HALF - f.clock) / (f.speed * 1000);
      if (delay > -0.05) this.halfBeat(this.nextHalf, now + Math.max(0, delay), f.stage);
      this.nextHalf++;
    }
  }

  sfx(kind: Sfx): void {
    if (!this.ctx || !this.master || !this.sfxOn || this.volume <= 0 || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + 0.01;
    const d = this.master;
    switch (kind) {
      case 'spawn':
        this.tone(1760, t, 0.07, 'sine', 0.06, d);
        break;
      case 'hit':
        this.tone(784, t, 0.28, 'triangle', 0.34, d);
        this.tone(1175, t + 0.07, 0.4, 'triangle', 0.3, d);
        this.hat(t, 0.25, d);
        break;
      case 'assist':
        this.tone(659, t, 0.32, 'triangle', 0.3, d);
        this.tone(880, t + 0.09, 0.4, 'sine', 0.22, d);
        break;
      case 'dual':
        for (const [i, fq] of [659, 880, 1109, 1318].entries()) this.tone(fq, t + i * 0.045, 0.45, 'triangle', 0.26, d);
        this.hat(t, 0.3, d);
        break;
      case 'hold':
        for (const [i, fq] of [523, 659, 784, 1047].entries()) this.tone(fq, t + i * 0.08, 0.5, 'sine', 0.3, d);
        break;
      case 'stage':
        for (const [i, fq] of [523, 659, 784, 1047, 1319].entries()) this.tone(fq, t + i * 0.11, 0.7, 'triangle', 0.3, d);
        break;
      case 'final':
        for (const [i, fq] of [392, 523, 659, 784, 1047, 1319, 1568].entries()) this.tone(fq, t + i * 0.13, 1.1, 'triangle', 0.3, d);
        for (const fq of [262, 330, 392]) this.tone(fq, t + 0.9, 2.4, 'sine', 0.18, d);
        break;
    }
  }

  dispose(): void {
    try {
      this.bus?.disconnect();
      void this.ctx?.close();
    } catch {
      /* closing is best effort */
    }
    this.ctx = null;
    this.master = null;
    this.bus = null;
  }
}

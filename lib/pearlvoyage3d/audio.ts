import { createNoiseBuffer, playTone } from '@/lib/audio/primitives';

/**
 * Pearl Voyage soundscape: soft waves, gentle splashes, calm pentatonic music and bell-like chimes, all synthesised
 * (no audio files, nothing to license). Every level is intentionally low, with slow attacks and no sudden peaks.
 * The AudioContext is only created from a user gesture and everything stops cleanly when sound is turned off.
 */
const PENTATONIC = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25];
export class PearlAudio {
    private ctx: AudioContext | null = null;
    private master: GainNode | null = null;
    private waves: { src: AudioBufferSourceNode; gain: GainNode; lfo: OscillatorNode } | null = null;
    private musicTimer: ReturnType<typeof setInterval> | null = null;
    private step = 0;
    private enabled = false;
    private music = true;
    private volume = 0.4;
    /** call from a user gesture (pointer/key); safe to call repeatedly */
    unlock() {
        if (typeof window === 'undefined') return;
        try {
            if (!this.ctx) {
                this.ctx = new AudioContext();
                this.master = this.ctx.createGain();
                this.master.gain.value = 0;
                this.master.connect(this.ctx.destination);
            }
            if (this.ctx.state === 'suspended') void this.ctx.resume();
            this.apply();
        }
        catch { /* audio is optional */ }
    }
    configure(enabled: boolean, music: boolean, volume: number) {
        this.enabled = enabled; this.music = music; this.volume = volume;
        this.apply();
    }
    private apply() {
        if (!this.ctx || !this.master) return;
        const t = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(t);
        this.master.gain.linearRampToValueAtTime(this.enabled ? this.volume * 0.7 : 0, t + 0.6);
        if (this.enabled) this.startWaves(); else this.stopWaves();
        if (this.enabled && this.music) this.startMusic(); else this.stopMusic();
    }
    private startWaves() {
        if (!this.ctx || !this.master || this.waves) return;
        const src = this.ctx.createBufferSource();
        src.buffer = createNoiseBuffer(this.ctx, 6);
        src.loop = true;
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 0.4;
        const gain = this.ctx.createGain();
        gain.gain.value = 0.07;
        const lfo = this.ctx.createOscillator();
        lfo.frequency.value = 0.11;
        const depth = this.ctx.createGain();
        depth.gain.value = 0.045;
        lfo.connect(depth); depth.connect(gain.gain);
        src.connect(lp); lp.connect(gain); gain.connect(this.master);
        src.start(); lfo.start();
        this.waves = { src, gain, lfo };
    }
    private stopWaves() {
        if (!this.waves) return;
        try { this.waves.src.stop(); this.waves.lfo.stop(); } catch { /* already stopped */ }
        this.waves = null;
    }
    private startMusic() {
        if (this.musicTimer || !this.ctx) return;
        const note = () => {
            if (!this.ctx || !this.master || !this.enabled || !this.music) return;
            const base = [0, 2, 4, 2, 5, 4, 2, 1][this.step++ % 8];
            const f = PENTATONIC[base];
            const t = this.ctx.currentTime;
            playTone(this.ctx, this.master, { frequency: f / 2, startTime: t, duration: 3.4, peakGain: 0.035, type: 'sine', attack: 0.9 });
            if (this.step % 2 === 0) playTone(this.ctx, this.master, { frequency: f, startTime: t + 0.4, duration: 2.2, peakGain: 0.03, type: 'triangle', attack: 0.5, overtoneRatio: 2, overtoneGain: 0.12 });
        };
        note();
        this.musicTimer = setInterval(note, 2600);
    }
    private stopMusic() { if (this.musicTimer) clearInterval(this.musicTimer); this.musicTimer = null; }
    private ready() { return !!this.ctx && !!this.master && this.enabled && this.ctx.state === 'running'; }
    splash(strength = 1) {
        if (!this.ready() || !this.ctx || !this.master) return;
        const src = this.ctx.createBufferSource();
        src.buffer = createNoiseBuffer(this.ctx, 0.5);
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.8;
        const g = this.ctx.createGain(), t = this.ctx.currentTime;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.09 * strength, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
        src.connect(bp); bp.connect(g); g.connect(this.master);
        src.start(t); src.stop(t + 0.6);
    }
    /** soft two-note bell: a fish has appeared */
    appear() {
        if (!this.ready() || !this.ctx || !this.master) return;
        const t = this.ctx.currentTime;
        [659.25, 880].forEach((f, i) => playTone(this.ctx!, this.master!, { frequency: f, startTime: t + i * 0.22, duration: 1.1, peakGain: 0.07, overtoneRatio: 2.01, overtoneGain: 0.18, attack: 0.03 }));
    }
    tick(progress: number) {
        if (!this.ready() || !this.ctx || !this.master) return;
        playTone(this.ctx, this.master, { frequency: 440 + progress * 330, startTime: this.ctx.currentTime, duration: 0.7, peakGain: 0.04, overtoneRatio: 2, overtoneGain: 0.15, attack: 0.04 });
    }
    discover() {
        if (!this.ready() || !this.ctx || !this.master) return;
        const t = this.ctx.currentTime;
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => playTone(this.ctx!, this.master!, { frequency: f, startTime: t + i * 0.16, duration: 1.4, peakGain: 0.085, overtoneRatio: 2.005, overtoneGain: 0.2, attack: 0.02 }));
        this.splash(0.8);
    }
    stageDone() {
        if (!this.ready() || !this.ctx || !this.master) return;
        const t = this.ctx.currentTime;
        [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => playTone(this.ctx!, this.master!, { frequency: f, startTime: t + i * 0.24, duration: 1.8, peakGain: 0.07, overtoneRatio: 2, overtoneGain: 0.18, attack: 0.03 }));
    }
    dispose() {
        this.stopMusic(); this.stopWaves();
        const ctx = this.ctx;
        this.ctx = null; this.master = null;
        if (ctx) void ctx.close().catch(() => undefined);
    }
}
/** optional spoken Arabic cue through the browser's own speech synthesis (never a paid service) */
export function speak(text: string, volume: number) {
    try {
        if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
        const synth = window.speechSynthesis;
        synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'ar-SA'; u.rate = 0.88; u.pitch = 1.05; u.volume = Math.min(1, volume);
        const voice = synth.getVoices().find(v => v.lang.toLowerCase().startsWith('ar'));
        if (voice) u.voice = voice;
        synth.speak(u);
    }
    catch { /* speech is optional */ }
}

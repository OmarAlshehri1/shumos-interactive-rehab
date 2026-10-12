'use client';
import { useEffect, useRef, useState } from 'react';
import { INSTRUCTION_INTRO_AR, INSTRUCTION_MEMORY_AR, guideOf } from '@/lib/bodysequence3d/captions';
import { rounds, summary, type State } from '@/lib/bodysequence3d/engine';
import { STAGES } from '@/lib/bodysequence3d/stages';
import { createScene, type SceneStats } from './scene';
import { BodySequenceAudio } from './audio';

/**
 * The Display's visual clock. Control sends the authoritative running clock every couple of seconds and whenever
 * something changes; in between this extrapolates with THIS device's own time (so clock differences between the iPad and
 * the projector computer never matter) and eases onto each new update instead of jumping.
 */
export function visualClockTarget(s: State, receivedAt: number, now: number, connected: boolean): number {
  let target = s.clock;
  if (s.status === 'running' && connected) target += Math.min(2600, now - receivedAt);
  return target;
}

export interface CanvasMetrics extends SceneStats { fps: number; clock: number; pixelRatio: number }

export interface BodySequenceCanvasProps {
  state: State;
  connected: boolean;
  muted?: boolean;
  onAudioBlocked?: (blocked: boolean) => void;
  /** ~8 Hz: the smoothed visual clock, for the HUD's countdown / hold timers. */
  onClock?: (clock: number) => void;
}

export function BodySequenceCanvas({ state, connected, muted = false, onAudioBlocked, onClock }: BodySequenceCanvasProps) {
  const host = useRef<HTMLDivElement>(null);
  const received = useRef({ state, at: 0 });
  const latest = useRef({ state, connected, muted });
  const [error, setError] = useState(false);
  const cfg = state.config;

  useEffect(() => {
    received.current = { state, at: performance.now() };
    latest.current = { state, connected, muted };
  }, [state, connected, muted]);

  // the scene is rebuilt only for options baked into the renderer; everything else is read live
  useEffect(() => {
    const parent = host.current;
    if (!parent) return;
    const el = document.createElement('canvas');
    el.style.cssText = 'width:100%;height:100%;display:block';
    parent.appendChild(el);
    const rect = () => ({ w: Math.max(2, parent.clientWidth), h: Math.max(2, parent.clientHeight) });
    let scene: ReturnType<typeof createScene>;
    let size = rect();
    try {
      scene = createScene(el, { quality: cfg.quality, reducedEffects: cfg.reducedEffects, reducedMotion: cfg.reducedMotion, highContrast: cfg.highContrast });
    } catch (e) {
      console.error('Body Sequence: 3D scene failed to start', e);
      el.remove();
      queueMicrotask(() => setError(true));
      return;
    }
    queueMicrotask(() => setError(false));
    scene.resize(size.w, size.h);
    const sound = new BodySequenceAudio();
    const unlock = () => { sound.unlock(); onAudioBlocked?.(sound.blocked); };
    unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    const ro = new ResizeObserver(() => { size = rect(); scene.resize(size.w, size.h); });
    ro.observe(parent);

    let frame = 0;
    let prev = performance.now();
    const first = latest.current.state;
    let smooth = visualClockTarget(first, performance.now(), performance.now(), true);
    let lastKey = `${first.run}:${first.stage}`;
    let snap = { status: first.status, hold: !!first.hold, stepSeq: first.stepSeq, roundSeq: first.roundSeq, cue: first.cue?.n ?? 0, count: Math.ceil(Math.max(0, first.goAt - first.clock) / 1000), run: first.run, phase: first.phase, preview: -2 };
    let lastStats = 0, lastClockOut = 0, frames = 0, fpsAt = performance.now(), fps = 0;
    let lastBlocked = sound.blocked;

    const animate = (now: number) => {
      const { state: s, connected: conn, muted: mute } = latest.current;
      const dt = Math.min(0.1, (now - prev) / 1000);
      prev = now;
      const rec = received.current;
      const key = `${s.run}:${s.stage}`;
      const target = visualClockTarget(rec.state, rec.at, now, conn);
      if (key !== lastKey || Math.abs(target - smooth) > 900) smooth = target;
      else smooth += (target - smooth) * (1 - Math.exp(-dt * 9));
      if (key !== lastKey) lastKey = key;
      if (s.run !== snap.run) { sound.resetSpoken(); snap = { ...snap, run: s.run }; }

      // ---- audio / voice: presentation only, driven by what Control already decided ----
      const stage = STAGES[s.stage];
      sound.configure({ sound: s.config.sound && !mute && conn, music: s.config.music, volume: s.config.volume });
      const voiceOn = s.config.voice && s.config.sound && !mute;
      const g = guideOf(s.status === 'running' ? { ...s, clock: Math.max(s.clock, smooth) } : s);
      if (s.status === 'running' && snap.status !== 'running' && g.phase === 'countdown') {
        const memory = stage.rounds.some((r) => r.mode === 'remember');
        sound.say(`intro:${s.run}:${s.stage}`, memory ? INSTRUCTION_MEMORY_AR : s.stage === 0 ? INSTRUCTION_INTRO_AR : 'استعد', voiceOn);
        sound.sfx('start');
      }
      if (s.status === 'running') {
        const cnt = Math.ceil(Math.max(0, s.goAt - smooth) / 1000);
        if (cnt !== snap.count && cnt > 0 && cnt <= 3) sound.sfx('tick');
        if (cnt !== snap.count && cnt === 0 && snap.count > 0) sound.sfx('go');
        snap.count = cnt;
      } else snap.count = 0;
      if (g.phase === 'preview' && g.previewIndex !== snap.preview) { if (g.previewIndex >= 0) sound.sfx('preview'); snap.preview = g.previewIndex; }
      if (g.phase !== 'preview') snap.preview = -2;
      if (s.stepSeq !== snap.stepSeq) { sound.sfx(snap.hold ? 'holdDone' : 'step'); snap.stepSeq = s.stepSeq; }
      if (s.roundSeq !== snap.roundSeq) {
        if (s.roundSeq > snap.roundSeq && s.status !== 'stage-complete') {
          sound.sfx('sequence');
          if (s.stage > 0 && s.roundSeq === Math.floor(rounds(s).length / 2)) sound.say(`half:${s.run}:${s.stage}`, 'أحسنت! أنت في منتصف الطريق.', voiceOn);
        }
        snap.roundSeq = s.roundSeq;
      }
      if (!!s.hold !== snap.hold && s.hold) {
        const step = rounds(s)[s.hold.round]?.steps[s.hold.step];
        if (step?.move === 'stop') { sound.sfx('stop'); sound.say(`stop:${s.run}:${s.stage}`, 'قِف ثابتًا لحظة.', voiceOn); }
      }
      snap.hold = !!s.hold;
      if ((s.cue?.n ?? 0) !== snap.cue) {
        if (s.cue) {
          if (s.cue.kind === 'incorrect' || s.cue.kind === 'order') { sound.sfx('gentle'); sound.say(`gentle:${s.run}:${s.stage}`, 'لا بأس، نحاول مرة أخرى.', voiceOn); } else if (s.cue.kind !== 'skip') sound.sfx('replay');
        }
        snap.cue = s.cue?.n ?? 0;
      }
      if (s.status !== snap.status) {
        if (s.status === 'stage-complete') { sound.sfx('stage'); sound.say(`stage:${s.run}:${s.stage}`, `أحسنت! أكملت ${stage.nameAr}.`, voiceOn); }
        else if (s.status === 'ended' && snap.status !== 'ended') { sound.sfx('final'); sound.say(`final:${s.run}`, 'ما شاء الله! أتممت التحدي كله.', voiceOn); }
        else if (s.status === 'paused') sound.cancelSpeech();
        snap.status = s.status;
      }
      if (sound.blocked !== lastBlocked) { lastBlocked = sound.blocked; onAudioBlocked?.(sound.blocked); }

      scene.draw({ state: s, connected: conn, clock: smooth }, dt, now / 1000);

      frames++;
      if (now - fpsAt >= 1000) { fps = (frames * 1000) / (now - fpsAt); frames = 0; fpsAt = now; }
      if (now - lastClockOut > 120) { lastClockOut = now; onClock?.(smooth); el.dataset.vclock = String(Math.round(smooth)); }
      if (now - lastStats > 1000) {
        lastStats = now;
        el.dataset.metrics = JSON.stringify({ ...scene.stats(), fps: Math.round(fps * 10) / 10, clock: Math.round(smooth), pixelRatio: Math.round(scene.renderer.getPixelRatio() * 100) / 100 } satisfies CanvasMetrics);
        el.dataset.audio = JSON.stringify({ blocked: sound.blocked, played: sound.played, said: sound.lastSpoken });
        void summary;
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      sound.dispose();
      scene.dispose();
      el.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.quality, cfg.reducedEffects, cfg.reducedMotion, cfg.highContrast]);

  return error ? (
    <p role="alert" style={{ padding: 24 }}>تعذّر تشغيل العرض ثلاثي الأبعاد. جرّب متصفحًا يدعم WebGL.</p>
  ) : (
    <div ref={host} role="img" aria-label="ممرّات مضيئة على الأرض مع علامات القدمين اليمنى واليسرى وأسهم الاتجاه، وآلة تضيء كلما اكتمل ترتيب من الحركات" style={{ width: '100%', height: '100%' }} />
  );
}

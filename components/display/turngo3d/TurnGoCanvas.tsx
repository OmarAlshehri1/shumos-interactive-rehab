'use client';
import { useEffect, useRef, useState } from 'react';
import { guideOf } from '@/lib/turngo3d/captions';
import { schedule, stat, summary, type State } from '@/lib/turngo3d/engine';
import { STAGES } from '@/lib/turngo3d/stages';
import { createScene, type SceneStats } from './scene';
import { INTRO_LINE, TurnGoAudio } from './audio';

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

export interface TurnGoCanvasProps {
  state: State;
  connected: boolean;
  muted?: boolean;
  onAudioBlocked?: (blocked: boolean) => void;
  /** ~8 Hz: the smoothed visual clock, for the HUD's countdown / hold timers. */
  onClock?: (clock: number) => void;
}

export function TurnGoCanvas({ state, connected, muted = false, onAudioBlocked, onClock }: TurnGoCanvasProps) {
  const host = useRef<HTMLDivElement>(null);
  const received = useRef({ state, at: 0 });
  const latest = useRef({ state, connected, muted });
  const audio = useRef<TurnGoAudio | null>(null);
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
      scene = createScene(el, { quality: cfg.quality, reducedEffects: cfg.reducedEffects, reducedMotion: cfg.reducedMotion, highContrast: cfg.highContrast, coneStyle: cfg.coneStyle });
    } catch (e) {
      console.error('Turn & Go: 3D scene failed to start', e);
      el.remove();
      queueMicrotask(() => setError(true));
      return;
    }
    queueMicrotask(() => setError(false));
    scene.resize(size.w, size.h);
    const sound = new TurnGoAudio();
    audio.current = sound;
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
    let snap = { status: first.status, hold: !!first.hold, wait: first.wait?.kind ?? null, stars: summary(first).confirmed + summary(first).assisted, cue: first.cue?.n ?? 0, starSeq: first.starSeq, count: Math.ceil(Math.max(0, first.goAt - first.clock) / 1000), run: first.run };
    let lastStats = 0, lastClockOut = 0, frames = 0, fpsAt = performance.now(), fps = 0;
    let lastBlocked = sound.blocked;
    let lastTheme = '';

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
      if (stage.theme !== lastTheme) lastTheme = stage.theme;
      sound.configure({ sound: s.config.sound && !mute && conn, music: s.config.music, volume: s.config.volume, theme: stage.theme });
      const voiceOn = s.config.voice && s.config.sound && !mute;
      const sum = summary(s);
      const stars = sum.confirmed + sum.assisted;
      const g = guideOf(s);
      if (s.status === 'running' && snap.status !== 'running' && g.phase === 'countdown') {
        if (s.stage === 0 && sum.presented === stat(s).res.length) sound.say(`intro:${s.run}`, INTRO_LINE, voiceOn);
        else sound.say(`ready:${s.run}:${s.stage}`, 'استعد', voiceOn);
        sound.sfx('start');
      }
      if (s.status === 'running') {
        const cnt = Math.ceil(Math.max(0, s.goAt - smooth) / 1000);
        if (cnt !== snap.count && cnt > 0 && cnt <= 3) sound.sfx('tick');
        if (cnt !== snap.count && cnt === 0 && snap.count > 0) sound.sfx('go');
        snap.count = cnt;
      } else snap.count = 0;
      if (s.starSeq !== snap.starSeq && s.status !== 'stage-complete') {
        const total = stat(s).res.length;
        if (s.stage > 0 && !s.hold && stars === Math.floor(total / 2) && total >= 4) sound.say(`half:${s.run}:${s.stage}`, 'أحسنت! أنت في منتصف الطريق.', voiceOn);
        if (snap.hold) sound.sfx('holdDone'); else sound.sfx('star');
      }
      if (s.starSeq !== snap.starSeq && s.status === 'stage-complete') sound.sfx('star');
      snap.starSeq = s.starSeq;
      if (!!s.hold !== snap.hold && s.hold) { sound.sfx('holdStart'); sound.say(`stop:${s.run}:${s.stage}`, 'قِف مكانك لحظة.', voiceOn); }
      snap.hold = !!s.hold;
      const wk = s.wait?.kind ?? null;
      if (wk !== snap.wait) {
        if (wk) {
          sound.sfx(wk === 'gate' ? 'gate' : wk === 'switch' || wk === 'block' || wk === 'altStar' ? 'switch' : 'wait');
          if (wk === 'character' || wk === 'light') sound.say(`wait:${s.run}`, 'انتظر قليلًا.', voiceOn);
        } else if (snap.wait && s.status === 'running') sound.sfx('go');
        snap.wait = wk;
      }
      if ((s.cue?.n ?? 0) !== snap.cue) {
        if (s.cue) { sound.sfx(s.cue.kind === 'repeat' || s.cue.kind === 'back' ? 'repeat' : 'gentle'); if (s.cue.kind !== 'repeat' && s.cue.kind !== 'back') sound.say(`gentle:${s.run}:${s.stage}`, 'لا بأس، لنعد إلى المسار.', voiceOn); }
        snap.cue = s.cue?.n ?? 0;
      }
      if (s.status !== snap.status) {
        if (s.status === 'stage-complete') { sound.sfx('stage'); sound.say(`stage:${s.run}:${s.stage}`, `أحسنت! أكملت ${stage.nameAr}.`, voiceOn); }
        else if (s.status === 'ended' && snap.status !== 'ended') { sound.sfx('final'); sound.say(`final:${s.run}`, 'ما شاء الله! أتممت الرحلة كلها.', voiceOn); }
        else if (s.status === 'paused') sound.cancelSpeech();
        snap.status = s.status;
      }
      if (sound.blocked !== lastBlocked) { lastBlocked = sound.blocked; onAudioBlocked?.(sound.blocked); }

      scene.draw({ state: s, connected: conn, clock: smooth }, dt, now / 1000);
      void schedule;

      frames++;
      if (now - fpsAt >= 1000) { fps = (frames * 1000) / (now - fpsAt); frames = 0; fpsAt = now; }
      if (now - lastClockOut > 120) { lastClockOut = now; onClock?.(smooth); el.dataset.vclock = String(Math.round(smooth)); }
      if (now - lastStats > 1000) {
        lastStats = now;
        el.dataset.metrics = JSON.stringify({ ...scene.stats(), fps: Math.round(fps * 10) / 10, clock: Math.round(smooth), pixelRatio: Math.round(scene.renderer.getPixelRatio() * 100) / 100 } satisfies CanvasMetrics);
        el.dataset.audio = JSON.stringify({ blocked: sound.blocked, played: sound.played, said: sound.lastSpoken });
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
      audio.current = null;
      scene.dispose();
      el.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.quality, cfg.reducedEffects, cfg.reducedMotion, cfg.highContrast, cfg.coneStyle]);

  return error ? (
    <p role="alert" style={{ padding: 24 }}>تعذّر تشغيل العرض ثلاثي الأبعاد. جرّب متصفحًا يدعم WebGL.</p>
  ) : (
    <div ref={host} role="img" aria-label="مسار مضيء على الأرض حول الأقماع، مع أسهم وأنجم تدلّ على الطريق" style={{ width: '100%', height: '100%' }} />
  );
}

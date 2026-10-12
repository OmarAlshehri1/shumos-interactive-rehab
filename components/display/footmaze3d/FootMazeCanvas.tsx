'use client';
import { useEffect, useRef, useState } from 'react';
import { at, summary, stat, type State } from '@/lib/footmaze3d/engine';
import { STAGES } from '@/lib/footmaze3d/stages';
import { createScene, type SceneStats } from './scene';
import { INTRO_LINE, FootMazeAudio } from './audio';

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

export interface FootMazeCanvasProps {
  state: State;
  connected: boolean;
  muted?: boolean;
  onAudioBlocked?: (blocked: boolean) => void;
  /** ~8 Hz: the smoothed visual clock, for the HUD's countdown. */
  onClock?: (clock: number) => void;
}

export function FootMazeCanvas({ state, connected, muted = false, onAudioBlocked, onClock }: FootMazeCanvasProps) {
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
      console.error('Foot Maze: 3D scene failed to start', e);
      el.remove();
      queueMicrotask(() => setError(true));
      return;
    }
    queueMicrotask(() => setError(false));
    scene.resize(size.w, size.h);
    const sound = new FootMazeAudio();
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
    const sum0 = summary(first);
    let snap = { status: first.status, act: first.act?.id ?? '', cont: first.contAt, stars: sum0.confirmed + sum0.assisted, cue: first.cue?.n ?? 0, starSeq: first.starSeq, count: Math.ceil(Math.max(0, first.goAt - first.clock) / 1000), run: first.run };
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
      sound.configure({ sound: s.config.sound && !mute && conn, music: s.config.music, volume: s.config.volume, theme: stage.theme });
      const voiceOn = s.config.voice && s.config.sound && !mute;
      const sum = summary(s);
      const stars = sum.confirmed + sum.assisted;
      if (s.status === 'running' && snap.status !== 'running' && s.clock < s.goAt) {
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
      if (s.starSeq !== snap.starSeq) {
        const total = stat(s).res.length;
        if (s.status !== 'stage-complete' && s.stage > 0 && stars === Math.floor(total / 2) && total >= 5) sound.say(`half:${s.run}:${s.stage}`, 'أحسنت! أنت في منتصف الطريق.', voiceOn);
        sound.sfx('star');
        snap.starSeq = s.starSeq;
      }
      const actId = s.act?.id ?? '';
      if (actId !== snap.act) {
        if (s.act) {
          const k = s.act.kind;
          sound.sfx(k === 'gate' ? 'gate' : k === 'bridge' ? 'door' : k === 'switch' ? 'switch' : 'guard');
          if (k === 'guard' || k === 'swarm') sound.say(`wait:${s.run}`, 'انتظر قليلًا.', voiceOn);
        }
        snap.act = actId;
      }
      if (s.contAt !== snap.cont) { if (s.contAt >= 0 && s.status === 'running') sound.sfx('go'); snap.cont = s.contAt; }
      if ((s.cue?.n ?? 0) !== snap.cue) {
        if (s.cue) {
          if (s.cue.kind === 'good') sound.sfx('route');
          else if (s.cue.kind === 'repeat' || s.cue.kind === 'back') sound.sfx('repeat');
          else { sound.sfx('gentle'); sound.say(`gentle:${s.run}:${s.stage}`, 'لا بأس، لنعد ونجرّب طريقًا آخر.', voiceOn); }
        }
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
      scene.dispose();
      el.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.quality, cfg.reducedEffects, cfg.reducedMotion, cfg.highContrast]);

  void at;
  return error ? (
    <p role="alert" style={{ padding: 24 }}>تعذّر تشغيل العرض ثلاثي الأبعاد. جرّب متصفحًا يدعم WebGL.</p>
  ) : (
    <div ref={host} role="img" aria-label="متاهة مضيئة على الأرض بممرات ومفترقات وأنجم وحرّاس ودودين" style={{ width: '100%', height: '100%' }} />
  );
}

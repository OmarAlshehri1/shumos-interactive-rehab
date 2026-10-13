'use client';
import { useEffect, useRef, useState } from 'react';
import { done as doneOf, type State } from '@/lib/achievementcity/engine';
import { LEVELS, levelProgress } from '@/lib/achievementcity/milestones';
import { createScene, type SceneStats } from './scene';
import { CityAudio } from './audio';

export interface CanvasMetrics extends SceneStats { fps: number; pixelRatio: number; /** mean CPU ms spent in scene.draw per frame (JS + draw submission; GPU time is not included) */ frameMs: number }

export interface AchievementCityCanvasProps {
  state: State;
  connected: boolean;
  muted?: boolean;
  onAudioBlocked?: (blocked: boolean) => void;
  /** A milestone of the CURRENT level finished building (for the HUD toast). */
  onBuilt?: (id: string, index: number) => void;
}

export const INTRO_AR = 'كل ما تنجز تمرينك، بنبني جزءًا جديدًا من مدينتك!';

export function AchievementCityCanvas({ state, connected, muted = false, onAudioBlocked, onBuilt }: AchievementCityCanvasProps) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef({ state, connected, muted });
  const cb = useRef({ onAudioBlocked, onBuilt });
  const [error, setError] = useState(false);
  const cfg = state.config;

  useEffect(() => {
    latest.current = { state, connected, muted };
    cb.current = { onAudioBlocked, onBuilt };
  }, [state, connected, muted, onAudioBlocked, onBuilt]);

  useEffect(() => {
    const parent = host.current;
    if (!parent) return;
    const el = document.createElement('canvas');
    el.style.cssText = 'width:100%;height:100%;display:block';
    parent.appendChild(el);
    const rect = () => ({ w: Math.max(2, parent.clientWidth), h: Math.max(2, parent.clientHeight) });
    const sound = new CityAudio();
    let snap = { status: latest.current.state.status, seq: latest.current.state.seq, level: latest.current.state.level, run: latest.current.state.run, said: new Set<string>() };
    let scene: ReturnType<typeof createScene>;
    try {
      scene = createScene(el, { quality: cfg.quality, reducedEffects: cfg.reducedEffects, reducedMotion: cfg.reducedMotion, highContrast: cfg.highContrast, cinematic: cfg.cinematic }, (e) => {
        if (e.type === 'start') {
          if (e.level === latest.current.state.level && latest.current.state.status === 'running') sound.sfx('build');
        } else if (e.level === latest.current.state.level && latest.current.state.status !== 'ready') {
          sound.sfx('ding');
          cb.current.onBuilt?.(e.id, e.index);
        }
      });
    } catch (e) {
      console.error('Achievement City: 3D scene failed to start', e);
      el.remove();
      queueMicrotask(() => setError(true));
      return;
    }
    queueMicrotask(() => setError(false));
    let size = rect();
    scene.resize(size.w, size.h);
    const unlock = () => { sound.unlock(); cb.current.onAudioBlocked?.(sound.blocked); };
    unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    const ro = new ResizeObserver(() => { size = rect(); scene.resize(size.w, size.h); });
    ro.observe(parent);

    let frame = 0, prev = performance.now(), frames = 0, fpsAt = prev, fps = 0, lastStats = 0, lastBlocked = sound.blocked, drawMs = 0, drawN = 0;
    const animate = (now: number) => {
      const { state: s, connected: conn, muted: mute } = latest.current;
      const dt = Math.min(0.1, (now - prev) / 1000);
      prev = now;
      if (s.run !== snap.run) { sound.resetSpoken(); snap = { ...snap, run: s.run, said: new Set() }; }

      // ---- audio / voice: presentation only, driven by what Control already decided ----
      sound.configure({ sound: s.config.sound && !mute && conn, music: s.config.music, volume: s.config.volume });
      const voiceOn = s.config.voice && s.config.sound && !mute;
      if (s.status === 'running' && snap.status === 'ready') { sound.sfx('start'); sound.say(`intro:${s.run}`, INTRO_AR, voiceOn); }
      if (s.seq !== snap.seq && s.evt) {
        if (s.evt.kind === 'confirm' || s.evt.kind === 'assist') {
          sound.sfx('confirm');
          const d = doneOf(s);
          const lp = levelProgress(s.level, d, s.target);
          // encouragement only at halfway: never after every achievement
          if (s.target >= 6 && d === Math.ceil(s.target / 2) && lp.completed > 0) sound.say(`half:${s.run}:${s.level}`, 'أحسنت! أنت في منتصف الطريق.', voiceOn);
        } else if (s.evt.kind === 'undo') sound.sfx('undo');
      }
      if (s.status !== snap.status) {
        if (s.status === 'level-complete') {
          if (s.level === 2) { sound.sfx('final'); sound.say(`final:${s.run}`, 'ما شاء الله! أصبحت مدينتك كبيرة ومضيئة. أحسنت!', voiceOn); }
          else { sound.sfx('level'); sound.say(`lv:${s.run}:${s.level}`, `${LEVELS[s.level].doneAr} أحسنت!`, voiceOn); }
        } else if (s.status === 'paused') sound.cancelSpeech();
        snap.status = s.status;
      }
      snap.seq = s.seq;
      if (sound.blocked !== lastBlocked) { lastBlocked = sound.blocked; cb.current.onAudioBlocked?.(sound.blocked); }

      const t0 = performance.now();
      scene.draw({ state: s, connected: conn }, dt, now / 1000);
      drawMs += performance.now() - t0; drawN++;

      frames++;
      if (now - fpsAt >= 1000) { fps = (frames * 1000) / (now - fpsAt); frames = 0; fpsAt = now; }
      if (now - lastStats > 1000) {
        lastStats = now;
        el.dataset.metrics = JSON.stringify({ ...scene.stats(), fps: Math.round(fps * 10) / 10, pixelRatio: Math.round(scene.renderer.getPixelRatio() * 100) / 100, frameMs: Math.round((drawMs / Math.max(1, drawN)) * 100) / 100 } satisfies CanvasMetrics);
        drawMs = 0; drawN = 0;
        el.dataset.progress = JSON.stringify(scene.progress());
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
    // the scene is rebuilt only for options baked into the renderer; everything else is read live
  }, [cfg.quality, cfg.reducedEffects, cfg.reducedMotion, cfg.highContrast, cfg.cinematic]);

  return error ? (
    <p role="alert" style={{ padding: 24 }}>تعذّر تشغيل العرض ثلاثي الأبعاد. جرّب متصفحًا يدعم WebGL.</p>
  ) : (
    <div ref={host} role="img" aria-label="مدينة ثلاثية الأبعاد تكبر مع كل إنجاز: قرية خضراء ثم مدينة ثم مدينة كبرى مضيئة" style={{ width: '100%', height: '100%' }} />
  );
}

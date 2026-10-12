'use client';
import { useEffect, useRef, useState } from 'react';
import { speedOf } from '@/lib/rhythmsteps3d/config';
import { computeLayout } from '@/lib/rhythmsteps3d/layout';
import { travelMs, type State } from '@/lib/rhythmsteps3d/engine';
import { createArena, type Arena } from './scene';
import { RhythmAudio } from './audio';

export interface CanvasMetrics {
  calls: number;
  triangles: number;
  frameMs: number;
  fps: number;
  targets: number;
  bloom: boolean;
  pixelRatio: number;
  clock: number;
}

/**
 * The Display's visual clock. Control sends the authoritative clock every couple of seconds and whenever something
 * changes; in between this extrapolates with THIS device's own time (so clock differences between the iPad and the
 * projector laptop never matter) and eases onto each new update instead of jumping. Assisted flow never lets the visual
 * clock pass the line of the earliest unconfirmed target, exactly as the engine does.
 */
export function visualClockTarget(s: State, receivedAt: number, now: number, connected: boolean): number {
  const speed = speedOf(s.config);
  let target = s.clock;
  if (s.status === 'running' && connected) target += Math.min(2600, (now - receivedAt)) * speed;
  if (s.config.flow === 'assisted' && !s.steps.some((st) => st.out === 'pending' && st.holdAt >= 0)) {
    const p = s.steps.find((st) => st.out === 'pending');
    if (p) target = Math.min(target, Math.max(s.clock, p.arrival));
  }
  return target;
}

export interface RhythmCanvasProps {
  state: State;
  connected: boolean;
  onAudioBlocked?: (blocked: boolean) => void;
}

export function RhythmCanvas({ state, connected, onAudioBlocked }: RhythmCanvasProps) {
  const host = useRef<HTMLDivElement>(null);
  const received = useRef({ state, at: 0 });
  const latest = useRef({ state, connected });
  const audio = useRef<RhythmAudio | null>(null);
  const [error, setError] = useState(false);
  const quality = state.config.quality;
  const reduced = state.config.reducedEffects;
  const hc = state.config.highContrast;

  useEffect(() => {
    received.current = { state, at: performance.now() };
    latest.current = { state, connected };
  }, [state, connected]);


  useEffect(() => {
    const parent = host.current;
    if (!parent) return;
    // A fresh canvas per mount, so a forced context loss on cleanup can never hand a dead context to the next mount.
    const el = document.createElement('canvas');
    el.style.cssText = 'width:100%;height:100%;display:block';
    parent.appendChild(el);
    const rect = () => ({ w: Math.max(2, parent.clientWidth), h: Math.max(2, parent.clientHeight) });
    let arena: Arena;
    let size = rect();
    const first = latest.current.state;
    try {
      arena = createArena(el, { config: first.config, layout: computeLayout(first.config, size.w / size.h), stage: first.stage });
    } catch (e) {
      console.error('Rhythm Steps: 3D scene failed to start', e);
      el.remove();
      queueMicrotask(() => setError(true));
      return;
    }
    queueMicrotask(() => setError(false));
    arena.resize(size.w, size.h);
    const sound = new RhythmAudio();
    audio.current = sound;
    const unlock = () => {
      sound.unlock();
      onAudioBlocked?.(sound.blocked);
    };
    unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    const ro = new ResizeObserver(() => {
      size = rect();
      arena.resize(size.w, size.h);
    });
    ro.observe(parent);

    let frame = 0;
    let prev = performance.now();
    let smooth = visualClockTarget(first, performance.now(), performance.now(), true);
    let lastStageKey = `${first.run}:${first.stage}`;
    let lastStatus = first.status;
    const handled = new Set<string>(first.steps.filter((s) => s.out !== 'pending').map((s) => s.id));
    const spawned = new Set<string>(first.steps.filter((s) => s.arrival - travelMs(first.stage) <= first.clock).map((s) => s.id));
    let lastSpawnSfx = 0;
    let lastStats = 0;
    let lastBlocked = sound.blocked;
    let frames = 0;
    let fpsAt = performance.now();
    let fps = 0;
    let layoutKey = '';
    let layout = computeLayout(first.config, size.w / size.h);

    const animate = (now: number) => {
      const { state: s, connected: conn } = latest.current;
      const dt = Math.min(0.1, (now - prev) / 1000);
      prev = now;
      const rec = received.current;
      const speed = speedOf(s.config);
      const stageKey = `${s.run}:${s.stage}`;
      const target = visualClockTarget(rec.state, rec.at, now, conn);
      if (stageKey !== lastStageKey || Math.abs(target - smooth) > 900) smooth = target;
      else smooth += (target - smooth) * (1 - Math.exp(-dt * 9)) + (rec.state.status === 'running' && conn ? 0 : 0);
      if (stageKey !== lastStageKey) {
        lastStageKey = stageKey;
        for (const st of s.steps) if (st.out !== 'pending') handled.add(st.id);
        spawned.clear();
      }
      const running = s.status === 'running' && conn;
      const key = `${s.config.perspective}|${s.config.margin}|${s.config.targetSize}|${s.config.laneSpacing}|${s.config.nearY}|${s.config.laneSet}|${s.config.aspect}|${size.w}x${size.h}`;
      if (key !== layoutKey) {
        layoutKey = key;
        layout = computeLayout(s.config, size.w / size.h);
      }

      // one-shot effects from outcome changes (presentation only: Control decided the outcome)
      for (const st of s.steps) {
        if (st.out !== 'pending' && !handled.has(st.id)) {
          handled.add(st.id);
          if (st.out === 'confirmed' || st.out === 'assisted') {
            arena.hit(st, st.out === 'assisted');
            sound.sfx(st.kind === 'hold' ? 'hold' : st.targets.length > 1 ? 'dual' : st.out === 'assisted' ? 'assist' : 'hit');
          } else arena.soft(st);
        }
        if (!spawned.has(st.id) && st.out === 'pending' && st.arrival - travelMs(s.stage) <= smooth) {
          spawned.add(st.id);
          if (running && now - lastSpawnSfx > 250) {
            lastSpawnSfx = now;
            sound.sfx('spawn');
          }
        }
      }
      if (s.status !== lastStatus) {
        if (s.status === 'stage-complete') {
          arena.celebrate('stage');
          sound.sfx('stage');
        } else if (s.status === 'ended' && lastStatus !== 'ended') {
          arena.celebrate('final');
          sound.sfx('final');
        }
        lastStatus = s.status;
      }

      sound.update({ clock: smooth, speed, running, connected: conn, stage: s.stage, music: s.config.music, sfx: s.config.sfx, volume: s.config.volume });
      if (sound.blocked !== lastBlocked) {
        lastBlocked = sound.blocked;
        onAudioBlocked?.(sound.blocked);
      }

      arena.draw({ layout, config: s.config, clock: smooth, speed, stage: s.stage, steps: s.steps, running, status: s.status, connected: conn }, dt, now / 1000);

      frames++;
      if (frames % 4 === 0) el.dataset.vclock = String(Math.round(smooth));
      if (now - fpsAt >= 1000) {
        fps = (frames * 1000) / (now - fpsAt);
        frames = 0;
        fpsAt = now;
      }
      if (now - lastStats > 1000) {
        el.dataset.metrics = JSON.stringify({ ...arena.stats(), fps: Math.round(fps * 10) / 10, clock: Math.round(smooth) } satisfies CanvasMetrics);
        lastStats = now;
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
      arena.dispose();
      el.remove();
    };
    // the scene is rebuilt only when quality / effects mode changes; every other setting is read live
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quality, reduced, hc]);

  return error ? (
    <p role="alert" style={{ padding: 24 }}>تعذّر تشغيل العرض ثلاثي الأبعاد. جرّب متصفحًا يدعم WebGL.</p>
  ) : (
    <div ref={host} role="img" aria-label="ممرّ نيون بأربعة مسارات: أهداف ملوّنة تتجه نحو المربعات القريبة" style={{ width: '100%', height: '100%' }} />
  );
}

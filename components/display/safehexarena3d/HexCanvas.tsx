'use client';
import { useEffect, useRef, useState } from 'react';
import type { Config, TileState } from '@/lib/safehexarena3d/engine';
import type { Layout } from '@/lib/safehexarena3d/geometry';
import { createArena, type DrawInput } from './scene';

export interface HexCanvasProps {
  layout: Layout;
  states: readonly TileState[];
  /** Returns 0..1 progress through the warning, read every frame (so the amber ramp is smooth between publishes). */
  getProgress: () => number;
  childTile: number | null;
  allSafe: boolean;
  config: Config;
}

export function HexCanvas(props: HexCanvasProps) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  const [error, setError] = useState(false);
  useEffect(() => {
    latest.current = props;
  });
  const { layout, config } = props;
  const quality = config.quality;
  useEffect(() => {
    const parent = host.current;
    if (!parent) return;
    // The effect owns its canvas: a fresh element per mount, so a forced context loss on cleanup can never hand a
    // dead WebGL context to the next mount (React StrictMode mounts, cleans up and mounts again in development).
    const el = document.createElement('canvas');
    el.style.cssText = 'width:100%;height:100%;display:block';
    parent.appendChild(el);
    let arena: ReturnType<typeof createArena>;
    try {
      arena = createArena(el, layout, latest.current.config);
    } catch (e) {
      console.error('Safe Hex Arena: 3D scene failed to start', e);
      el.remove();
      queueMicrotask(() => setError(true));
      return;
    }
    queueMicrotask(() => setError(false));
    let frame = 0;
    let prev = performance.now();
    let lastStats = 0;
    const animate = (now: number) => {
      const p = latest.current;
      const input: DrawInput = { states: p.states, progress: p.getProgress(), childTile: p.childTile, allSafe: p.allSafe, config: p.config };
      arena.draw(input, Math.min(0.1, (now - prev) / 1000));
      if (now - lastStats > 1000) {
        el.dataset.metrics = JSON.stringify(arena.stats());
        lastStats = now;
      }
      prev = now;
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    (window as unknown as { __hexArena?: unknown }).__hexArena = { project: arena.project };
    return () => {
      cancelAnimationFrame(frame);
      arena.dispose();
      el.remove();
      delete (window as unknown as { __hexArena?: unknown }).__hexArena;
    };
  }, [layout, quality]);
  return error ? (
    <p role="alert">تعذّر تشغيل العرض ثلاثي الأبعاد. جرّب متصفحًا يدعم WebGL.</p>
  ) : (
    <div ref={host} role="img" aria-label="أرضية سداسية: البلاطات الزرقاء آمنة والبرتقالية تحذير" style={{ width: '100%', height: '100%' }} />
  );
}

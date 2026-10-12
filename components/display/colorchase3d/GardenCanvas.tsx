'use client';
import { useEffect, useRef, useState } from 'react';
import { createGarden, type GardenFrame, type GardenSpec } from './scene';

export interface GardenCanvasProps {
  spec: GardenSpec;
  /** Rebuilds the scene only when this changes (world, stage, geometry settings, graphics preset). */
  specKey: string;
  /** Read every animation frame, so effects and transitions stay smooth between published records. */
  getFrame: () => GardenFrame;
}

export function GardenCanvas(props: GardenCanvasProps) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  const [error, setError] = useState(false);
  useEffect(() => {
    latest.current = props;
  });
  const { specKey } = props;
  useEffect(() => {
    const parent = host.current;
    if (!parent) return;
    // The effect owns its canvas (a fresh element per mount), so a forced context loss on cleanup can never hand a dead
    // WebGL context to the next mount (React StrictMode mounts, cleans up and mounts again in development).
    const el = document.createElement('canvas');
    el.style.cssText = 'width:100%;height:100%;display:block';
    parent.appendChild(el);
    let garden: ReturnType<typeof createGarden>;
    try {
      garden = createGarden(el, latest.current.spec);
    } catch (e) {
      console.error('Color Chase 3D: scene failed to start', e);
      el.remove();
      queueMicrotask(() => setError(true));
      return;
    }
    queueMicrotask(() => setError(false));
    let frame = 0;
    let prev = performance.now();
    let lastStats = 0;
    const animate = (now: number) => {
      garden.draw(latest.current.getFrame(), Math.min(0.1, (now - prev) / 1000));
      if (now - lastStats > 1000) {
        el.dataset.metrics = JSON.stringify(garden.stats());
        lastStats = now;
      }
      prev = now;
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    (window as unknown as { __garden?: unknown }).__garden = { project: garden.project, stats: garden.stats };
    return () => {
      cancelAnimationFrame(frame);
      garden.dispose();
      el.remove();
      delete (window as unknown as { __garden?: unknown }).__garden;
    };
  }, [specKey]);
  return error ? (
    <p role="alert">تعذّر تشغيل العرض ثلاثي الأبعاد. جرّب متصفحًا يدعم WebGL.</p>
  ) : (
    <div ref={host} role="img" aria-label="حديقة سحرية فقدت ألوانها؛ المنطقة الملوّنة المضيئة هي الهدف" style={{ width: '100%', height: '100%' }} />
  );
}

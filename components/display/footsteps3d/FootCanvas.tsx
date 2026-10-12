'use client';
import { useEffect, useRef, useState } from 'react';
import { createForest, type ForestFrame, type ForestSpec } from './scene';

export interface FootCanvasProps {
  spec: ForestSpec;
  /** Rebuilds the scene only when this changes (world, stage, geometry settings, graphics preset). */
  specKey: string;
  /** Read every animation frame, so effects and timers stay smooth between published records. */
  getFrame: () => ForestFrame;
}

export function FootCanvas(props: FootCanvasProps) {
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
    let forest: ReturnType<typeof createForest>;
    try {
      forest = createForest(el, latest.current.spec);
    } catch (e) {
      console.error('Follow the Footsteps 3D: scene failed to start', e);
      el.remove();
      queueMicrotask(() => setError(true));
      return;
    }
    queueMicrotask(() => setError(false));
    let frame = 0;
    let prev = performance.now();
    let lastStats = 0;
    const animate = (now: number) => {
      forest.draw(latest.current.getFrame(), Math.min(0.1, (now - prev) / 1000));
      if (now - lastStats > 1000) {
        el.dataset.metrics = JSON.stringify(forest.stats());
        lastStats = now;
      }
      prev = now;
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    (window as unknown as { __forest?: unknown }).__forest = { project: forest.project };
    return () => {
      cancelAnimationFrame(frame);
      forest.dispose();
      el.remove();
      delete (window as unknown as { __forest?: unknown }).__forest;
    };
  }, [specKey]);
  return error ? (
    <p role="alert">تعذّر تشغيل العرض ثلاثي الأبعاد. جرّب متصفحًا يدعم WebGL.</p>
  ) : (
    <div ref={host} role="img" aria-label="غابة سحرية بأحجار للخطوات؛ الحجر المضيء بالذهب هو الهدف" style={{ width: '100%', height: '100%' }} />
  );
}

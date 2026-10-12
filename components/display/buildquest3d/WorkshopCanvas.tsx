"use client";
import { useEffect, useRef, useState } from "react";
import { Workshop } from "@/lib/buildquest3d/renderer";
import type { State } from "@/lib/buildquest3d/gameplay";
import type { Pointer } from "@/lib/buildquest3d/stages";
import styles from "./workshop.module.css";
export function WorkshopCanvas({
  state,
  onPointer,
}: {
  state: State;
  onPointer?: (p: Pointer, activate: boolean) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    current = useRef(state);
  const quality = state.config.quality;
  const [error, setError] = useState(false);
  useEffect(() => {
    current.current = state;
  }, [state]);
  useEffect(() => {
    if (!canvas.current) return;
    let world: Workshop;
    try {
      world = new Workshop(canvas.current, quality);
    } catch (error) {
      console.error("Build Quest WebGL initialization failed", error);
      queueMicrotask(() => setError(true));
      return;
    }
    let raf = 0,
      last = performance.now();
    const resize = new ResizeObserver(() => world.resize());
    resize.observe(canvas.current);
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      world.render(current.current, dt, now / 1000);
      if (canvas.current) {
        canvas.current.dataset.metrics = JSON.stringify(world.metrics);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      world.dispose();
    };
  }, [quality]);
  const move = (e: React.PointerEvent<HTMLCanvasElement>, activate = false) => {
    const r = e.currentTarget.getBoundingClientRect();
    onPointer?.(
      { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height },
      activate,
    );
  };
  return (
    <div className={styles.viewport}>
      {error ? (
        <div className={styles.overlay}>
          تعذّر تشغيل العرض ثلاثي الأبعاد. جرّب متصفحًا يدعم WebGL.
        </div>
      ) : (
        <canvas
          ref={canvas}
          aria-label="طاولة البناء ثلاثية الأبعاد، القطع على اليمين وأماكن البناء على اليسار"
          tabIndex={onPointer ? 0 : -1}
          style={{ touchAction: onPointer ? "none" : "auto" }}
          onPointerMove={(e) => move(e)}
          onPointerDown={(e) => {
            e.currentTarget.focus();
            e.currentTarget.setPointerCapture(e.pointerId);
            move(e, true);
          }}
        />
      )}
    </div>
  );
}

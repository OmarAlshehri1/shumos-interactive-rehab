"use client";

import { useEffect, useState } from "react";
import { PointerInterpolator, type RawPointerSample } from "@/lib/display/PointerInterpolator";

/**
 * Drives a PointerInterpolator (see its own doc comment for the smoothing
 * design) off requestAnimationFrame instead of the fixed-duration CSS
 * transition SensorHandCursor otherwise applies — replaces "retarget a
 * still-in-flight 45ms transition every ~30Hz hop" with "ease a little
 * closer to the latest known target every real frame," so the rendered hand
 * keeps moving smoothly between Firebase deliveries instead of visibly
 * pausing/hopping when delivery spacing is uneven (network jitter).
 *
 * DISPLAY-ONLY, VISUAL-ONLY: this hook only ever feeds SensorHandCursor's
 * render prop (see DisplayScreen.tsx). Nothing derived from it is used for
 * game/contact logic — that stays entirely on /control, driven by the raw,
 * uninterpolated pointer from SensorRuntimeProvider (see
 * useSensorPointerTargets.ts). This hook has no way to reach that code.
 */
export function useInterpolatedPointer(target: RawPointerSample | null): RawPointerSample | null {
  // A plain (never re-set) piece of state, not a ref: this project's lint rules disallow reading a ref's
  // current value during render, so the lazy-init-once pattern goes through useState's initializer instead.
  const [interpolator] = useState(() => new PointerInterpolator());

  const [rendered, setRendered] = useState<RawPointerSample | null>(() => {
    interpolator.setTarget(target);
    return interpolator.getRendered();
  });

  // Every new Firebase delivery updates the target immediately (latest wins).
  // Deliberately no setState here — the rAF loop below already runs every
  // frame and reads getRendered() after this, so it picks up the effect of a
  // new target (including an instant hide/reappear snap) within one frame
  // without this effect also triggering its own separate render.
  useEffect(() => {
    interpolator.setTarget(target);
  }, [interpolator, target]);

  useEffect(() => {
    let rafId: number;
    let lastFrameAtMs: number | null = null;

    const loop = (nowMs: number) => {
      const dtMs = lastFrameAtMs == null ? 16 : nowMs - lastFrameAtMs;
      lastFrameAtMs = nowMs;
      setRendered(interpolator.tick(dtMs));
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [interpolator]);

  return rendered;
}

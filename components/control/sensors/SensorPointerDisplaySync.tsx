"use client";

import { useEffect, useRef } from "react";
import { getStaffDb, isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { reportControllerPointer } from "@/lib/realtime/sessionRepository";
import { useSensorRuntime } from "./SensorRuntimeProvider";

/**
 * ~30Hz — well below the 50Hz BLE sample rate (this is the final filtered
 * normalized position, never raw telemetry). DISPLAY PERFORMANCE FIX: raised
 * from the previous 50ms/~20Hz — the Display side no longer relies on a
 * fixed CSS transition to bridge the gap between hops (see
 * useInterpolatedPointer.ts), so a tighter interval here mainly serves to
 * shrink the gap the interpolator has to smooth over, not to "arrive already
 * smooth." Still well short of the raw sensor rate — no reason to publish
 * every sample when the interpolator only needs a recent-enough target.
 */
const MIN_PUBLISH_INTERVAL_MS = 33;
/** Below this, a re-send would be visually meaningless — skips a write when the pointer is essentially still. */
const MIN_MOVEMENT = 0.003;

/**
 * DISPLAY REQUIREMENT: mirrors the shared RIGHT_HAND pointer onto
 * presence/display at a throttled rate so the child-facing /display can
 * render the SAME virtual hand the therapist sees on /control — see
 * lib/realtime/sessionRepository.ts's reportControllerPointer and
 * DisplayScreen.tsx's controllerPointer subscription.
 *
 * Mounted once, at the /control layout level (app/control/layout.tsx),
 * inside SensorRuntimeProvider — so it runs regardless of which game route
 * is open, the same "connect once, survives navigation" story as the
 * runtime itself. /display alone decides whether the CURRENT game is
 * sensor-compatible (lib/games/registry.ts's `sensorCompatible`) before
 * drawing anything with this; this component only ever reports "where is
 * the hand right now," never "should it be shown."
 *
 * No-op entirely in local/dev mode (isRealtimeEnabled() false) and
 * best-effort in production — a failed write (e.g. before staff auth has
 * settled) is silently swallowed, same as every other control->display
 * command in this file's siblings (reportDisplayFullscreen, etc.): losing
 * one throttled pointer update is never worth surfacing as an error.
 */
export function SensorPointerDisplaySync(): null {
  const { pointer, connected } = useSensorRuntime();
  const lastSentRef = useRef<{ visible: boolean; x: number; y: number } | null>(null);
  const lastSentAtRef = useRef(0);

  useEffect(() => {
    if (!isRealtimeEnabled()) return;
    const next = connected && pointer ? { visible: true, x: pointer.pointer.x, y: pointer.pointer.y } : { visible: false, x: 0, y: 0 };
    const last = lastSentRef.current;
    const sameAsLast =
      !!last && last.visible === next.visible && (!next.visible || (Math.abs(last.x - next.x) < MIN_MOVEMENT && Math.abs(last.y - next.y) < MIN_MOVEMENT));
    if (sameAsLast) return;
    const now = Date.now();
    if (last && last.visible === next.visible && now - lastSentAtRef.current < MIN_PUBLISH_INTERVAL_MS) return;
    lastSentRef.current = next;
    lastSentAtRef.current = now;
    void reportControllerPointer(getStaffDb(), next.visible ? { x: next.x, y: next.y, visible: true } : null).catch(() => {});
  }, [pointer, connected]);

  return null;
}

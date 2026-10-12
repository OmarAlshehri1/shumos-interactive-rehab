"use client";

import { useEffect, useState } from "react";
import { getDisplayDb } from "@/lib/realtime/firebaseClient";
import { subscribeToControllerPointer } from "@/lib/realtime/sessionRepository";
import { SensorHandCursor } from "@/components/control/sensors/SensorHandCursor";
import { useInterpolatedPointer } from "./useInterpolatedPointer";
import { useLocalPointerChannel } from "./useLocalPointerChannel";
import { LocalPointerDiagnosticsOverlay } from "./LocalPointerDiagnosticsOverlay";

/**
 * ISOLATION LEAF — this is the fix for "Display pointer is less smooth than
 * Control" that survived the first BroadcastChannel pass: every pointer
 * update (Firebase OR local, up to ~50Hz) used to set state directly inside
 * RealtimeDisplayScreen (see DisplayScreen.tsx's git history), which is the
 * parent of the ENTIRE active game's render tree — AnimatePresence, the
 * game's own SVG/animation-heavy scene, the persistent environment
 * background, all of it. Every hand movement was re-rendering all of that,
 * not just the 64px cursor. Owning the pointer subscriptions HERE instead
 * means a pointer update only ever re-renders this small leaf and the tiny
 * dev-only diagnostics overlay next to it — nothing else in the tree so
 * much as diffs.
 *
 * Source priority (local BroadcastChannel fast path, Firebase fallback) is
 * unchanged from before — see useLocalPointerChannel.ts and
 * lib/display/LocalPointerChannel.ts's doc comments for why a genuinely
 * separate Display device safely never leaves the Firebase path.
 */
export function SensorPointerLayer({ authenticated, gateVisible }: { authenticated: boolean; gateVisible: boolean }) {
  const [controllerPointer, setControllerPointer] = useState<{ x: number; y: number; visible: boolean } | null>(null);
  useEffect(() => {
    if (!authenticated) return;
    return subscribeToControllerPointer(getDisplayDb(), setControllerPointer);
  }, [authenticated]);

  // VISUAL SMOOTHING ONLY, Firebase path: eases the RENDERED position
  // between throttled Firebase deliveries — visibility below keeps reading
  // the raw pointer, never this smoothed value.
  const smoothedControllerPointer = useInterpolatedPointer(controllerPointer);

  // LOCAL FAST PATH (see lib/display/LocalPointerChannel.ts's doc comment):
  // used WHENEVER healthy (messages currently arriving). Fed to
  // SensorHandCursor RAW, never through useInterpolatedPointer — at a
  // genuine ~50Hz same-process delivery there is no network jitter to hide,
  // and smoothing it again would just add back the lag this path exists to
  // remove.
  const local = useLocalPointerChannel();
  const usingLocalPointer = local.healthy;
  const activePointer = usingLocalPointer ? local.pointer : controllerPointer;
  const renderedPointer = usingLocalPointer ? local.pointer : smoothedControllerPointer;
  const visible = gateVisible && !!activePointer?.visible;

  return (
    <>
      <SensorHandCursor pointer={renderedPointer} visible={visible} instant />
      <LocalPointerDiagnosticsOverlay local={local} usingLocal={usingLocalPointer} />
    </>
  );
}

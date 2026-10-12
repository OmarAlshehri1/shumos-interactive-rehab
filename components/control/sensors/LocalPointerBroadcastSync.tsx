"use client";

import { useEffect, useRef } from "react";
import { isBroadcastChannelSupported, LOCAL_POINTER_CHANNEL_NAME, type LocalPointerMessage } from "@/lib/display/LocalPointerChannel";
import { useSensorRuntime } from "./SensorRuntimeProvider";

/**
 * LOCAL FAST PATH (see lib/display/LocalPointerChannel.ts's doc comment):
 * mirrors the shared RIGHT_HAND pointer onto a same-origin BroadcastChannel
 * at the sensor's own cadence (~50Hz, whatever SensorRuntimeProvider's
 * onPointerChanged delivers) instead of Firebase's throttled ~30Hz — a
 * sibling of SensorPointerDisplaySync, not a replacement for it. That
 * Firebase path is untouched and stays the ONLY path for a genuinely
 * separate Display device (see useLocalPointerChannel.ts's receiving end).
 *
 * No throttle, no min-movement filter, unlike the Firebase sibling: a
 * same-process `postMessage` isn't a network write, so there is no cost
 * here worth trading freshness for — Control already renders this same
 * pointer un-throttled at full sensor rate with no ill effect (see
 * SensorHandLayer), this just mirrors that exact cadence onto the channel.
 *
 * Mounted once at the /control layout level (app/control/layout.tsx),
 * alongside SensorPointerDisplaySync, for the same "survives navigation
 * between game routes" reason.
 */
export function LocalPointerBroadcastSync(): null {
  const { pointer, connected } = useSensorRuntime();
  const channelRef = useRef<BroadcastChannel | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    if (!isBroadcastChannelSupported()) return;
    const channel = new BroadcastChannel(LOCAL_POINTER_CHANNEL_NAME);
    channelRef.current = channel;
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, []);

  useEffect(() => {
    const channel = channelRef.current;
    if (!channel) return;
    seqRef.current += 1;
    const message: LocalPointerMessage =
      connected && pointer
        ? { role: "RIGHT_HAND", x: pointer.pointer.x, y: pointer.pointer.y, visible: true, seq: seqRef.current, sentAtMs: Date.now() }
        : { role: "RIGHT_HAND", x: 0, y: 0, visible: false, seq: seqRef.current, sentAtMs: Date.now() };
    channel.postMessage(message);
  }, [pointer, connected]);

  return null;
}

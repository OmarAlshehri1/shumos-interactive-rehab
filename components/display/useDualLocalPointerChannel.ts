"use client";

import { useEffect, useRef, useState } from "react";
import { isBroadcastChannelSupported, LOCAL_POINTER_CHANNEL_NAME, type LocalPointerMessage } from "@/lib/display/LocalPointerChannel";
import { DualLocalPointerDemuxer, type DualPointerSnapshot } from "@/lib/display/DualLocalPointerDemuxer";

/** Independent per-hand staleness — a dead LEFT_HAND link must not report RIGHT_HAND unhealthy, and vice versa (see DualLocalPointerDemuxer's own "per hand, not globally" doc comment). Same generous margin as the single-hand hook's STALE_THRESHOLD_MS. */
const STALE_THRESHOLD_MS = 250;
const HEALTH_CHECK_INTERVAL_MS = 100;

export interface DualLocalPointerChannelState {
  readonly pointer: DualPointerSnapshot;
  readonly healthyRight: boolean;
  readonly healthyLeft: boolean;
}

const EMPTY_SNAPSHOT: DualPointerSnapshot = { right: null, left: null };

/**
 * Dual-hand counterpart of useLocalPointerChannel.ts — NOT wired into
 * DisplayScreen/SensorPointerLayer yet (tonight's dual-sensor brief,
 * section 15: "prepare", not "enable"). The existing single-hand hook stays
 * the one DisplayScreen actually renders through; swapping to this one is a
 * deliberate future integration step once a real second sensor publishes
 * onto this channel (see LocalPointerBroadcastSync.tsx — only RIGHT_HAND
 * publishes today).
 *
 * Uses the same rAF-paced "commit at most once per frame, always the
 * newest snapshot" pattern as useLocalPointerChannel for the same reason
 * (see that file's doc comment): avoids a full React commit on every
 * ~20ms BroadcastChannel message.
 */
export function useDualLocalPointerChannel(): DualLocalPointerChannelState {
  const [pointer, setPointer] = useState<DualPointerSnapshot>(EMPTY_SNAPSHOT);
  const [healthyRight, setHealthyRight] = useState(false);
  const [healthyLeft, setHealthyLeft] = useState(false);

  const demuxRef = useRef(new DualLocalPointerDemuxer());
  const dirtyRef = useRef(false);
  const lastReceivedPerfMsRef = useRef<{ RIGHT_HAND: number | null; LEFT_HAND: number | null }>({ RIGHT_HAND: null, LEFT_HAND: null });

  useEffect(() => {
    if (!isBroadcastChannelSupported()) return;
    const channel = new BroadcastChannel(LOCAL_POINTER_CHANNEL_NAME);

    channel.onmessage = (event: MessageEvent<LocalPointerMessage>) => {
      const message = event.data;
      if (!message || (message.role !== "RIGHT_HAND" && message.role !== "LEFT_HAND")) return;
      lastReceivedPerfMsRef.current[message.role] = performance.now();
      if (message.role === "RIGHT_HAND") setHealthyRight(true);
      else setHealthyLeft(true);
      if (demuxRef.current.accept(message)) dirtyRef.current = true;
    };

    let rafId = requestAnimationFrame(function tick() {
      if (dirtyRef.current) {
        dirtyRef.current = false;
        setPointer(demuxRef.current.snapshot());
      }
      rafId = requestAnimationFrame(tick);
    });

    const staleCheck = setInterval(() => {
      const now = performance.now();
      const last = lastReceivedPerfMsRef.current;
      setHealthyRight(last.RIGHT_HAND !== null && now - last.RIGHT_HAND <= STALE_THRESHOLD_MS);
      setHealthyLeft(last.LEFT_HAND !== null && now - last.LEFT_HAND <= STALE_THRESHOLD_MS);
    }, HEALTH_CHECK_INTERVAL_MS);

    return () => {
      clearInterval(staleCheck);
      cancelAnimationFrame(rafId);
      channel.close();
    };
  }, []);

  return { pointer, healthyRight, healthyLeft };
}

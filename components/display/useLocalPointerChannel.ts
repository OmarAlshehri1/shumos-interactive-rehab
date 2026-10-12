"use client";

import { useEffect, useRef, useState } from "react";
import { isBroadcastChannelSupported, LOCAL_POINTER_CHANNEL_NAME, type LocalPointerMessage } from "@/lib/display/LocalPointerChannel";
import type { RawPointerSample } from "@/lib/display/PointerInterpolator";

/** No message within this long => treat the local channel as dead and let DisplayScreen fall back to Firebase. Generous relative to the ~20ms (50Hz) publish interval so ordinary frame jitter never flaps the source. */
const STALE_THRESHOLD_MS = 250;
/** How often to re-check staleness — independent of message arrival, since "messages stopped arriving" is itself the signal a poll (not another message) has to catch. */
const HEALTH_CHECK_INTERVAL_MS = 100;
/** Rolling window for the receive/render-Hz estimates shown in dev diagnostics. */
const HZ_WINDOW_MS = 2000;

export interface LocalPointerDiagnostics {
  readonly seq: number | null;
  readonly sentAtMs: number | null;
  readonly receivedAtMs: number | null;
  readonly receiveHz: number | null;
  readonly renderHz: number | null;
  /** Age of the sample currently being shown, at the moment it was received off the channel. */
  readonly ageAtReceiveMs: number | null;
  /** Age of that SAME sample right now, recomputed on every render commit — grows between messages, resets on each new one. */
  readonly ageAtRenderMs: number | null;
  /** Count of messages that never got their own individual render commit: true out-of-order/duplicate rejects, plus messages superseded by a newer one before the next animation frame could commit them. Non-zero here is expected and fine — it's "latest sample wins" working as designed, not data loss. */
  readonly skippedCount: number;
}

export interface LocalPointerChannelState {
  readonly pointer: RawPointerSample | null;
  /** Whether messages are CURRENTLY arriving — never reflects the hand's own visibility. A genuinely separate Display device simply never receives anything, so this stays false forever and DisplayScreen falls back to Firebase unconditionally; see LocalPointerChannel.ts's doc comment. */
  readonly healthy: boolean;
  readonly diagnostics: LocalPointerDiagnostics;
}

const EMPTY_DIAGNOSTICS: LocalPointerDiagnostics = {
  seq: null,
  sentAtMs: null,
  receivedAtMs: null,
  receiveHz: null,
  renderHz: null,
  ageAtReceiveMs: null,
  ageAtRenderMs: null,
  skippedCount: 0,
};

/**
 * DISPLAY-SIDE LOCAL FAST PATH: subscribes to the same-Mac BroadcastChannel
 * LocalPointerBroadcastSync (Control side) publishes — see that file and
 * LocalPointerChannel.ts's doc comments.
 *
 * RENDER PACING — this is the fix for "Display pointer feels less smooth
 * than Control" even though the local channel itself was already healthy
 * and fresh: `onmessage` never calls setState directly. It only updates a
 * ref and marks it dirty; a single requestAnimationFrame loop is what
 * actually commits state, at most once per frame, always with whatever the
 * newest sample is at that moment ("latest sample wins," no queue, no
 * replay of anything older). Committing straight from onmessage (a raw DOM
 * callback, not a batched React event) used to trigger a full React commit
 * on every single ~20ms message; paired with this hook previously being
 * called directly inside RealtimeDisplayScreen (see DisplayScreen.tsx), that
 * meant the ENTIRE active game's render tree re-rendered up to 50 times/sec
 * on every hand movement. Pacing to rAF here, combined with this hook now
 * only ever being called from the small isolated SensorPointerLayer leaf,
 * fixes both halves of that at once.
 *
 * Rejects any message whose `seq` isn't strictly newer than the last
 * accepted one, so an out-of-order delivery can never pull the rendered
 * pointer backward.
 */
export function useLocalPointerChannel(): LocalPointerChannelState {
  const [pointer, setPointer] = useState<RawPointerSample | null>(null);
  const [healthy, setHealthy] = useState(false);
  const [diagnostics, setDiagnostics] = useState<LocalPointerDiagnostics>(EMPTY_DIAGNOSTICS);

  const lastSeqRef = useRef(-1);
  const lastReceivedPerfMsRef = useRef<number | null>(null);
  const recentReceiveTimesRef = useRef<number[]>([]);
  const recentRenderTimesRef = useRef<number[]>([]);
  const skippedCountRef = useRef(0);
  const dirtyRef = useRef(false);
  const latestRef = useRef<{
    pointer: RawPointerSample;
    seq: number;
    sentAtMs: number;
    receivedAtMs: number;
    receiveHz: number | null;
  } | null>(null);

  useEffect(() => {
    if (!isBroadcastChannelSupported()) return;
    const channel = new BroadcastChannel(LOCAL_POINTER_CHANNEL_NAME);

    channel.onmessage = (event: MessageEvent<LocalPointerMessage>) => {
      const message = event.data;
      if (!message || typeof message.seq !== "number" || message.seq <= lastSeqRef.current) {
        skippedCountRef.current += 1;
        return;
      }
      lastSeqRef.current = message.seq;
      // The previous sample was still sitting unrendered when this one arrived — it'll never get its own commit, only this newer one will.
      if (dirtyRef.current) skippedCountRef.current += 1;

      const nowPerf = performance.now();
      lastReceivedPerfMsRef.current = nowPerf;
      const recent = [...recentReceiveTimesRef.current, nowPerf].filter((time) => time >= nowPerf - HZ_WINDOW_MS);
      recentReceiveTimesRef.current = recent;
      const windowSeconds = recent.length > 1 ? (recent.at(-1)! - recent[0]) / 1000 : 0;

      latestRef.current = {
        pointer: message.visible ? { x: message.x, y: message.y, visible: true } : { x: 0, y: 0, visible: false },
        seq: message.seq,
        sentAtMs: message.sentAtMs,
        receivedAtMs: Date.now(),
        receiveHz: windowSeconds > 0 ? (recent.length - 1) / windowSeconds : null,
      };
      dirtyRef.current = true;
      setHealthy(true);
    };

    let rafId = requestAnimationFrame(function tick() {
      if (dirtyRef.current) {
        dirtyRef.current = false;
        const latest = latestRef.current;
        if (latest) {
          const nowPerf = performance.now();
          const recentRenders = [...recentRenderTimesRef.current, nowPerf].filter((time) => time >= nowPerf - HZ_WINDOW_MS);
          recentRenderTimesRef.current = recentRenders;
          const renderWindowSeconds = recentRenders.length > 1 ? (recentRenders.at(-1)! - recentRenders[0]) / 1000 : 0;

          setPointer(latest.pointer);
          setDiagnostics({
            seq: latest.seq,
            sentAtMs: latest.sentAtMs,
            receivedAtMs: latest.receivedAtMs,
            receiveHz: latest.receiveHz,
            renderHz: renderWindowSeconds > 0 ? (recentRenders.length - 1) / renderWindowSeconds : null,
            ageAtReceiveMs: Math.max(0, latest.receivedAtMs - latest.sentAtMs),
            ageAtRenderMs: Math.max(0, Date.now() - latest.sentAtMs),
            skippedCount: skippedCountRef.current,
          });
        }
      }
      rafId = requestAnimationFrame(tick);
    });

    const staleCheck = setInterval(() => {
      const last = lastReceivedPerfMsRef.current;
      if (last === null || performance.now() - last > STALE_THRESHOLD_MS) setHealthy(false);
    }, HEALTH_CHECK_INTERVAL_MS);

    return () => {
      clearInterval(staleCheck);
      cancelAnimationFrame(rafId);
      channel.close();
    };
  }, []);

  return { pointer, healthy, diagnostics };
}

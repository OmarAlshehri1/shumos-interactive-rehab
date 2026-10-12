"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { liveToMessages, type RunnerLiveSession } from "@/lib/runnerquest3d/live";
import type { DisplayState } from "@/lib/runnerquest3d/protocol";
import { DisplayReplica } from "@/lib/runnerquest3d/replica";
import { RunnerQuest3DView, type MotionSource } from "./RunnerQuest3DView";
import type { Quality } from "./scene/types";

/** A Firebase clock arrives about once a second, so project further than the local channel does. */
const LIVE_MAX_EXTRAPOLATION_MS = 2600;
/** Without a fresh sample for this long while "playing", the child sees the calm "waiting for the therapist" card. */
const SILENT_AFTER_MS = 6000;

/**
 * PRODUCTION (cross-device) Display for Runner Quest 3D. The existing DisplayScreen delivers the live
 * session record from Firebase (`session` prop); its two protocol messages go through the same
 * DisplayReplica the local channel uses (stale / duplicate / old-run protection, bounded projection).
 * Strictly read-only: it never selects, scores or writes.
 */
export function RunnerQuestLiveDisplay({ session, quality = "high" }: { session: RunnerLiveSession; quality?: Quality }) {
  const replica = useRef<DisplayReplica>(new DisplayReplica(LIVE_MAX_EXTRAPOLATION_MS));
  const lastSessionId = useRef<string | null>(null);
  const [state, setState] = useState<DisplayState | null>(null);
  const [silent, setSilent] = useState(false);

  useEffect(() => {
    const r = replica.current;
    if (lastSessionId.current !== session.sessionId) { r.clear(); lastSessionId.current = session.sessionId; }
    const { state: sm, clock } = liveToMessages(session);
    const now = performance.now();
    r.accept(sm, now);
    r.accept(clock, now);
    setState(r.state);
    setSilent(false);
  }, [session]);

  // Control gone (tab closed, network lost) while the runner is supposed to be moving.
  useEffect(() => {
    const id = window.setInterval(() => {
      const r = replica.current;
      setSilent(!!r.state?.running && r.isSilentFor(performance.now(), SILENT_AFTER_MS));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const source = useMemo<MotionSource>(() => ({
    distance: () => replica.current.distance(performance.now()),
    speed: () => replica.current.speed(performance.now()),
  }), []);

  return <RunnerQuest3DView state={state} silent={silent} source={source} quality={quality} autoQuality diagnostics={false} waitingText={null} />;
}

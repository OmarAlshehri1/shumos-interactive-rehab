"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bq3ToMessages, type Bq3LiveSession } from "@/lib/balloonquest/live";
import type { DisplayState } from "@/lib/balloonquest/protocol";
import { DisplayReplica } from "@/lib/balloonquest/replica";
import { BalloonQuest3DView } from "./BalloonQuest3DView";

/**
 * Production Display for the redesigned Balloon Quest. Receives the live
 * session record through the platform's existing Firebase subscription (the
 * `session` prop) and feeds the SAME two protocol messages the local channel
 * uses into a DisplayReplica, which extrapolates the authoritative simulation
 * clock. Read-only: it never selects, scores or writes.
 */
export function BalloonQuest3DLiveDisplay({ session, showSymbols = false }: { session: Bq3LiveSession; showSymbols?: boolean }) {
  const replica = useRef<DisplayReplica | null>(null);
  const lastSessionId = useRef<string | null>(null);
  const [state, setState] = useState<DisplayState | null>(null);

  useEffect(() => {
    if (!replica.current) replica.current = new DisplayReplica();
    const r = replica.current;
    // Ordering across sessions is Firebase's job (the platform guard resets on a new sessionId); the replica orders within one session.
    if (lastSessionId.current !== session.sessionId) {
      r.clear();
      lastSessionId.current = session.sessionId;
    }
    const { state: stateMessage, clock } = bq3ToMessages(session);
    const now = performance.now();
    r.accept(stateMessage, now);
    r.accept(clock, now);
    setState(r.state);
  }, [session]);

  const getSimTimeMs = useCallback(() => replica.current?.simTime(performance.now()) ?? 0, []);
  if (!state) return null;
  return <BalloonQuest3DView state={state} getSimTimeMs={getSimTimeMs} showSymbols={showSymbols} embedded />;
}

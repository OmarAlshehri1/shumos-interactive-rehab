"use client";

import { useEffect, useRef, useState } from "react";
import type { SessionState } from "@/lib/game";
import { applyLiveRecord, createInitialGuardState } from "@/lib/realtime/displayGuard";
import {
  registerDisplayPresence,
  subscribeToConnectionStatus,
  subscribeToLiveSession,
} from "@/lib/realtime/sessionRepository";
import type { ConnectionStatus } from "@/lib/realtime/types";
import { useFirebaseAuth } from "@/lib/realtime/useFirebaseAuth";

export interface IncorrectSignal {
  balloonId: string;
  token: number;
}

/**
 * TASK 6/8 REALTIME DISPLAY ADAPTER.
 *
 * Read-only by design: this file never calls publishSession — /display only
 * ever renders the canonical state /control publishes. It remains read-only
 * with respect to game state after Task 8 too — anonymous auth gives this
 * tab an identity, not any extra capability; Security Rules don't (and, with
 * only anonymous auth, structurally can't) distinguish "a display" from "a
 * controller" by role, only by which paths each piece of code chooses to
 * write to. See the Task 8 report's "Display" section for that honest limit.
 * components/display/DisplayScreen.tsx wires every scene's mutating
 * callback (onStart, onCountdownComplete, onSelectBalloon, onStageCompleteDone)
 * to no-ops when this adapter is active.
 *
 * TASK 8 — AUTH GATING: nothing here touches RTDB until useFirebaseAuth()
 * resolves to "authenticated". On auth failure, this hook simply never
 * reaches a real session — the caller (DisplayScreen) keeps showing the
 * calm waiting state, per "keep the presentation calm and fail gracefully."
 *
 * Correct-pop and stage-restart visuals need NO special handling here: they
 * were always derived by components/display/balloon/Balloon.tsx diffing
 * `balloon.isPopped` against its previous render, which works identically
 * whether that prop came from local React state or a Firebase snapshot.
 * Only an INCORRECT tap has no persistent per-balloon field to diff (only
 * the aggregate incorrectCount changes) — that's what `incorrectSignal`
 * below is for, sourced from the session record's `lastInteraction`.
 *
 * The actual stale/out-of-order and no-replay-on-reconnect logic lives in
 * lib/realtime/displayGuard.ts as a pure, unit-tested function — this hook
 * is just the React glue around it.
 */
export function useRealtimeDisplaySession() {
  const auth = useFirebaseAuth();
  const [session, setSession] = useState<SessionState | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [incorrectSignal, setIncorrectSignal] = useState<IncorrectSignal | null>(null);
  // TASK 9: the last "إعادة الاحتفال" token this display has been told to
  // play — null until the therapist ever taps it. SessionCompleteScene
  // re-keys off this to replay its entrance animation + re-fire the
  // session_complete voice/audio event; see displayGuard.ts for why a
  // reconnect never surfaces an already-seen token here.
  const [celebrationReplayToken, setCelebrationReplayToken] = useState<string | null>(null);
  const guardRef = useRef(createInitialGuardState());

  useEffect(() => {
    if (auth.status !== "authenticated") return;
    const unregisterPresence = registerDisplayPresence();
    const unsubscribeConnection = subscribeToConnectionStatus(setConnectionStatus);
    const unsubscribeSession = subscribeToLiveSession((record) => {
      const result = applyLiveRecord(guardRef.current, record);
      guardRef.current = result.state;
      if (!result.accept) return;

      setSession(record?.session ?? null);
      if (result.newIncorrectBalloonId) {
        setIncorrectSignal({ balloonId: result.newIncorrectBalloonId, token: Date.now() });
      }
      if (result.newCelebrationReplayToken) {
        setCelebrationReplayToken(result.newCelebrationReplayToken);
      }
    });

    return () => {
      unregisterPresence();
      unsubscribeConnection();
      unsubscribeSession();
    };
  }, [auth.status]);

  return { session, connectionStatus, incorrectSignal, celebrationReplayToken, authStatus: auth.status };
}

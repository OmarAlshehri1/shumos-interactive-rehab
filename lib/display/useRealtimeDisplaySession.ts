"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameId } from "@/lib/games/registry";
import { getDisplayDb } from "@/lib/realtime/firebaseClient";
import { applyLiveRecord, createInitialGuardState } from "@/lib/realtime/displayGuard";
import {
  fetchLiveSession,
  registerDisplayPresence,
  subscribeToConnectionStatus,
  subscribeToLiveSession,
} from "@/lib/realtime/sessionRepository";
import type { AnySessionState, ConnectionStatus, LiveSessionRecord } from "@/lib/realtime/types";
import { useFirebaseAuth } from "@/lib/realtime/useFirebaseAuth";
import { isBroadcastChannelSupported } from "./LocalPointerChannel";
import { isSessionWakeMessage, LOCAL_SESSION_WAKE_CHANNEL_NAME } from "./LocalSessionWakeChannel";
import { displaySession, InterruptedSessionHold, previewExpiresAt } from "./sessionPresentation";
import { displayServerNow } from "@/lib/realtime/displayAuthorization";
import { markDisplayStartup } from "./startupTiming";

export interface IncorrectSignal {
  balloonId: string;
  token: number;
}

/**
 * Bounded safety-net reconciliation cadence — see this hook's own doc
 * comment on `reconcile` for why this exists at all. One small RTDB read
 * every tick while a Display tab is open; negligible cost for a single
 * clinic session, and it's the ONE mechanism here that needs no external
 * trigger to work at all — the final backstop if a same-Mac wake message,
 * a focus/visibility event, AND the persistent listener all miss.
 */
const RECONCILE_POLL_MS = 4000;

/**
 * TASK 6/8 REALTIME DISPLAY ADAPTER.
 *
 * Read-only by design with respect to game state: this file never calls
 * publishSession — /display only ever renders the canonical state /control
 * publishes, and no scene here can mutate `session`/GameState. Anonymous
 * auth gives this tab an identity, not any extra capability; Security Rules
 * don't (and, with only anonymous auth, structurally can't) distinguish "a
 * display" from "a controller" by role, only by which paths each piece of
 * code chooses to write to. See the Task 8 report's "Display" section for
 * that honest limit. components/display/DisplayScreen.tsx wires onStart/
 * onSelectBalloon/onStageCompleteDone to no-ops when this adapter is
 * active — onCountdownComplete is the one deliberate exception (see
 * `revision` below): it reports a presentational completion signal on
 * presence/display, never the canonical session.
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
 *
 * PROJECTOR START/FOCUS FIX — "stuck on ابدأ" real-hardware bug: this used
 * to depend ENTIRELY on `subscribeToLiveSession`'s persistent onValue()
 * listener delivering every real change live. That listener is a long-lived
 * connection; an UNFOCUSED (not hidden/minimized — plainly visible on an
 * external projector, but not the OS-focused window) tab's background JS
 * and network task scheduling can be throttled by the browser enough to
 * silently stall its delivery, with Firebase never reporting a disconnect
 * (`connectionStatus` stays "connected" throughout — this is not a real
 * network drop, so nothing here would previously notice or recover). The
 * only thing that ever unstuck it before was a full page reload, which
 * forces a fresh subscription (and this hook's own `subscribeWithInitialGet`
 * one-shot get()) — matching exactly the "click around / refresh / retry"
 * workaround reported.
 *
 * `reconcile` below re-fetches the CURRENT canonical record with a plain
 * one-shot get() (bypassing whatever's stuck in the persistent listener's
 * OWN delivery path entirely) and applies it through the exact same guard
 * every other delivery path already uses — so it can only ever catch this
 * display up to the truth, never invent a second source of it, and it's
 * always safe to over-call. Three independent triggers call it, layered
 * so the common case resolves almost instantly and the worst case is still
 * bounded:
 *   1. a same-Mac BroadcastChannel "wake" nudge Control posts right after a
 *      real publish (see LocalSessionWakeChannel.ts) — normally the FIRST
 *      to fire, well under a second;
 *   2. this tab becoming visible/focused again — also covers a genuinely
 *      separate-device projector, where (1) never arrives at all;
 *   3. a bounded periodic poll (RECONCILE_POLL_MS) — the final backstop,
 *      independent of any single event ever having been observed at all.
 * None of this pauses, tears down, or recreates the persistent listener
 * itself on blur/hidden — losing focus must never mean disconnected.
 */
export function useRealtimeDisplaySession() {
  const auth = useFirebaseAuth();
  const [session, setSession] = useState<AnySessionState | null>(null);
  // RELIABILITY FIX — idle-overlay bleed-through: before the first RTDB
  // snapshot resolves, `session`/`gameId` are still their initial `null`, so
  // DisplayScreen's game resolver briefly (mis)reads that as "no active
  // game" and starts fading in the waiting world — even when a session
  // (found during QA: SESSION_COMPLETE) is actually already live. Moments
  // later the real snapshot arrives and the game scene starts fading in too,
  // and since AnimatePresence's sync crossfade gives neither layer an
  // explicit z-index, plain paint order decides which one is visibly on top
  // for that ~1.1s window — sometimes stranding the idle overlay above the
  // real scene instead of hiding it. DisplayScreen waits for this flag
  // before mounting either crossfade layer, so the very first paint already
  // reflects the true canonical state.
  const [hasLoadedInitialSession, setHasLoadedInitialSession] = useState(false);
  /** MULTI-GAME PLATFORM: null whenever there's no session, OR the session's gameId is missing/unsupported/malformed — see LiveSessionRecord.gameId's doc comment. The display's game resolver (gameDisplayRegistry.tsx) treats both exactly the same: show the Shumos waiting world. */
  const [gameId, setGameId] = useState<GameId | null>(null);
  /** BUG FIX — "ابدأ" stall: the CURRENT record's own revision number — DisplayScreen.tsx's onCountdownComplete reports it back (see reportCountdownComplete) so the controller can match its wait to exactly the COUNTDOWN publish that's actually on screen right now, never a stale one. */
  const [revision, setRevision] = useState<number | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [incorrectSignal, setIncorrectSignal] = useState<IncorrectSignal | null>(null);
  // TASK 9: the last "إعادة الاحتفال" token this display has been told to
  // play — null until the therapist ever taps it. SessionCompleteScene
  // re-keys off this to replay its entrance animation + re-fire the
  // session_complete voice/audio event; see displayGuard.ts for why a
  // reconnect never surfaces an already-seen token here.
  const [celebrationReplayToken, setCelebrationReplayToken] = useState<string | null>(null);
  const guardRef = useRef(createInitialGuardState());
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const holdRef = useRef(new InterruptedSessionHold());

  const applyRecord = useCallback((record: LiveSessionRecord | null) => {
    const result = applyLiveRecord(guardRef.current, record);
    guardRef.current = result.state;
    if (!result.accept) return;

    clearTimeout(previewTimerRef.current);
    const present = () => {
      const now = displayServerNow();
      const unexpired = displaySession(record, now);
      const visible = unexpired && !holdRef.current.holds(unexpired, now) ? unexpired : null;
      setSession(visible?.session ?? null);
      setGameId(visible?.gameId ?? null);
      setRevision(visible?.revision ?? null);
    };
    present();
    const expiry = previewExpiresAt(record);
    if (expiry !== null && expiry > displayServerNow()) {
      previewTimerRef.current = setTimeout(present, expiry - displayServerNow());
    }
    markDisplayStartup("session-ready");
    if (result.newIncorrectBalloonId) {
      setIncorrectSignal({ balloonId: result.newIncorrectBalloonId, token: Date.now() });
    }
    if (result.newCelebrationReplayToken) {
      setCelebrationReplayToken(result.newCelebrationReplayToken);
    }
    setHasLoadedInitialSession(true);
  }, []);

  useEffect(() => {
    if (auth.status !== "authenticated") {
      guardRef.current = createInitialGuardState();
      holdRef.current.reset();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Clear previously authorized content immediately on revocation.
      setSession(null); setGameId(null); setRevision(null);
      setIncorrectSignal(null); setCelebrationReplayToken(null);
      setHasLoadedInitialSession(false);
      return;
    }
    const db = getDisplayDb();
    markDisplayStartup("subscriptions-start");
    const unregisterPresence = registerDisplayPresence(db);
    const unsubscribeConnection = subscribeToConnectionStatus(db, setConnectionStatus);
    const unsubscribeSession = subscribeToLiveSession(db, (record) => {
      if (process.env.NODE_ENV !== "production") {
        console.debug(`[DISPLAY SESSION] onValue gameState=${record?.session.gameState ?? "none"} revision=${record?.revision ?? "none"}`);
      }
      applyRecord(record);
    });

    let disposed = false;
    let reconcileReason = "";
    const reconcile = (reason: string) => {
      reconcileReason = reason;
      void fetchLiveSession(db)
        .then((record) => {
          if (process.env.NODE_ENV !== "production") {
            console.debug(`[DISPLAY RECONCILE] reason=${reconcileReason} gameState=${record?.session.gameState ?? "none"} revision=${record?.revision ?? "none"}`);
          }
          if (!disposed) applyRecord(record);
        })
        .catch(() => {});
    };

    let wakeChannel: BroadcastChannel | null = null;
    if (isBroadcastChannelSupported()) {
      wakeChannel = new BroadcastChannel(LOCAL_SESSION_WAKE_CHANNEL_NAME);
      wakeChannel.onmessage = (event) => {
        if (isSessionWakeMessage(event.data)) reconcile("local-wake");
      };
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") reconcile("visibilitychange");
    };
    const onFocus = () => reconcile("focus");
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);

    const pollTimer = setInterval(() => reconcile("poll"), RECONCILE_POLL_MS);

    return () => {
      disposed = true;
      clearTimeout(previewTimerRef.current);
      unregisterPresence();
      unsubscribeConnection();
      unsubscribeSession();
      wakeChannel?.close();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      clearInterval(pollTimer);
    };
  }, [auth.status, applyRecord]);

  return { session, gameId, revision, connectionStatus, incorrectSignal, celebrationReplayToken, authStatus: auth.status, hasLoadedInitialSession };
}

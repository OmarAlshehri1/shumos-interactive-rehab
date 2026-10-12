"use client";

import { useEffect, useMemo } from "react";
import { isBroadcastChannelSupported } from "@/lib/display/LocalPointerChannel";
import { isRelevantGameFeedbackMessage, LOCAL_GAME_FEEDBACK_CHANNEL_NAME } from "@/lib/display/LocalGameFeedbackChannel";
import { LocalGameFeedbackStore } from "@/lib/display/LocalGameFeedbackStore";
import type { GameId } from "@/lib/games/registry";

/**
 * Safety-net expiry for an entry nothing ever reconciled (e.g. its message
 * arrived for a target the display-side consumer never mounted/observed).
 * Generous: reconciliation (see `reconcile` below) is what normally clears
 * an entry, almost always within a second: this is only cleanup, not part
 * of the ordinary dedup story.
 */
const ORPHAN_TTL_MS = 8000;
const SWEEP_INTERVAL_MS = 2000;

/**
 * DISPLAY-SIDE LOCAL GAME-FEEDBACK CONSUMER — subscribes to the same-Mac
 * BroadcastChannel `publishLocalGameFeedback` (Control side) posts to, and
 * feeds a fresh `LocalGameFeedbackStore` (see its own doc comment) scoped to
 * exactly this (gameId, sessionId) pair.
 *
 * RETURNS THE STORE INSTANCE ITSELF, not a derived `{isLocallyAccepted,
 * reconcile}` object — see LocalGameFeedbackStore.ts's doc comment for why
 * an earlier version of that indirection silently broke React Context
 * propagation. A consumer (Balloon.tsx) subscribes to the returned store
 * directly via `useSyncExternalStore`, so THIS hook, and the Provider that
 * calls it (LocalGameFeedbackProvider.tsx), never need to re-render at all
 * when a local action arrives — only the specific balloon does.
 *
 * `useMemo` keyed on (gameId, sessionId) is what gives every new
 * game/session a fresh, empty store — no manual reset logic needed, and
 * nothing here ever touches a ref during render (this codebase's stricter
 * react-hooks/refs rule disallows that).
 */
export function useLocalGameFeedback(gameId: GameId | null, sessionId: string | null): LocalGameFeedbackStore {
  // gameId/sessionId are deliberately in the dep array without being read
  // inside the factory: their only job is to key the memo, so a NEW scope
  // gets a brand-new, empty store instead of the previous scope's leftovers
  // — the exhaustive-deps rule can't see that intent, only that the factory
  // body doesn't reference them.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const store = useMemo(() => new LocalGameFeedbackStore(), [gameId, sessionId]);

  useEffect(() => {
    if (!isBroadcastChannelSupported() || !gameId || !sessionId) return;
    const channel = new BroadcastChannel(LOCAL_GAME_FEEDBACK_CHANNEL_NAME);

    channel.onmessage = (event: MessageEvent<unknown>) => {
      const data = event.data;
      const matched = isRelevantGameFeedbackMessage(data, gameId, sessionId);
      if (process.env.NODE_ENV !== "production") {
        const d = data as { targetId?: unknown; sentAtMs?: unknown; gameId?: unknown; sessionId?: unknown } | null;
        const reason = matched
          ? "ok"
          : !d || typeof d !== "object"
            ? "malformed payload"
            : d.gameId !== gameId
              ? `gameId mismatch (got ${String(d.gameId)}, expected ${gameId})`
              : d.sessionId !== sessionId
                ? `sessionId mismatch (got ${String(d.sessionId)}, expected ${sessionId})`
                : "missing/invalid targetId";
        const latency = matched && typeof d?.sentAtMs === "number" ? Date.now() - d.sentAtMs : null;
        console.debug(
          `[LOCAL ACTION RECEIVED] balloon=${matched ? data.targetId : (d?.targetId ?? "?")} matched=${matched ? "yes" : "no"} reason=${reason}${latency != null ? ` latency=${latency}ms` : ""}`,
        );
      }
      if (!matched) return;
      store.accept(data.targetId, Date.now());
    };

    const sweep = setInterval(() => {
      store.sweepExpired(Date.now(), ORPHAN_TTL_MS);
    }, SWEEP_INTERVAL_MS);

    return () => {
      clearInterval(sweep);
      channel.close();
    };
  }, [gameId, sessionId, store]);

  return store;
}

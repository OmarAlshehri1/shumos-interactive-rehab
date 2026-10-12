"use client";

import { createContext, useContext } from "react";
import type { GameId } from "@/lib/games/registry";
import { LocalGameFeedbackStore } from "@/lib/display/LocalGameFeedbackStore";
import { useLocalGameFeedback } from "./useLocalGameFeedback";

/** Never mutated (nothing ever calls accept() on it), so it never notifies — the correct "nothing is locally accepted" behavior for local-demo mode (no provider mounted) or any consumer read before a provider exists. One shared instance is enough since it's permanently empty. */
const EMPTY_STORE = new LocalGameFeedbackStore();

const LocalGameFeedbackContext = createContext<LocalGameFeedbackStore | null>(null);

/**
 * Mounted once per active game (see DisplayScreen.tsx), scoped to the
 * CURRENT (gameId, sessionId) — see useLocalGameFeedback.ts. Exposes the
 * STORE INSTANCE via context (not a derived state object — see
 * LocalGameFeedbackStore.ts's doc comment for why that distinction matters)
 * so a deeply-nested per-target leaf component (e.g. Balloon.tsx) can
 * subscribe to it directly via `useSyncExternalStore`, without gameId/
 * sessionId or any local-feedback state threaded down through every
 * intermediate scene/field component, and — critically — without this
 * Provider or DisplayScreen ever needing to re-render when a local action
 * arrives.
 */
export function LocalGameFeedbackProvider({
  gameId,
  sessionId,
  children,
}: {
  gameId: GameId | null;
  sessionId: string | null;
  children: React.ReactNode;
}) {
  const store = useLocalGameFeedback(gameId, sessionId);
  return <LocalGameFeedbackContext.Provider value={store}>{children}</LocalGameFeedbackContext.Provider>;
}

export function useLocalGameFeedbackContext(): LocalGameFeedbackStore {
  return useContext(LocalGameFeedbackContext) ?? EMPTY_STORE;
}

import type { ComponentType } from "react";
import type { GameId } from "@/lib/games/registry";
import { BalloonQuestDisplay, type BalloonQuestDisplayProps } from "./games/BalloonQuestDisplay";

/**
 * DISPLAY GAME RESOLVER — the typed boundary between a canonical session's
 * `gameId` (see lib/realtime/types.ts) and the child-facing display module
 * that actually renders it. DisplayScreen.tsx looks up `gameId` here; a
 * missing/unregistered id (see LiveSessionRecord.gameId's doc comment)
 * simply has no entry, and the caller falls back to the Shumos waiting
 * world — never a guess, never a crash.
 *
 * Deliberately just a small typed map, not a plugin framework: every
 * current and near-future game display module happens to need the same
 * prop shape (BalloonQuestDisplayProps — session + the event/callback
 * wiring DisplayScreen.tsx's adapters already supply), so one shared prop
 * type is enough for now. A second, genuinely different game is the right
 * time to reconsider that, not before.
 */
export const GAME_DISPLAY_MODULES: Record<GameId, ComponentType<BalloonQuestDisplayProps>> = {
  "balloon-quest": BalloonQuestDisplay,
};

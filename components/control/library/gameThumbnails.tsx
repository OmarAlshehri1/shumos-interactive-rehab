import type { ComponentType } from "react";
import type { GameId } from "@/lib/games/registry";
import { BalloonQuestThumbnail } from "./BalloonQuestThumbnail";

/**
 * Kept separate from lib/games/registry.ts on purpose: the registry is
 * plain, serializable data (id/name/description/route), while a thumbnail
 * is a real React component built from this game's visual language. Adding
 * a game means adding one entry here alongside its registry entry — see
 * registry.ts's doc comment for the full "adding a game" checklist.
 */
export const GAME_THUMBNAILS: Record<GameId, ComponentType> = {
  "balloon-quest": BalloonQuestThumbnail,
};

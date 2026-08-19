import type { ComponentType } from "react";
import type { GameId } from "@/lib/games/registry";
import { BalloonQuestThumbnail } from "./BalloonQuestThumbnail";
import { FollowTheFootstepsThumbnail } from "./FollowTheFootstepsThumbnail";
import { BubblePopWallThumbnail } from "./BubblePopWallThumbnail";
import { FeedTheAnimalsThumbnail } from "./FeedTheAnimalsThumbnail";
import { SpacePilotThumbnail } from "./SpacePilotThumbnail";
import { ColorChaseThumbnail } from "./ColorChaseThumbnail";

/**
 * Kept separate from lib/games/registry.ts on purpose: the registry is
 * plain, serializable data (id/name/description/route), while a thumbnail
 * is a real React component built from this game's visual language. Adding
 * a game means adding one entry here alongside its registry entry — see
 * registry.ts's doc comment for the full "adding a game" checklist.
 */
export const GAME_THUMBNAILS: Record<GameId, ComponentType> = {
  "balloon-quest": BalloonQuestThumbnail,
  "follow-the-footsteps": FollowTheFootstepsThumbnail,
  "bubble-pop-wall": BubblePopWallThumbnail,
  "feed-the-animals": FeedTheAnimalsThumbnail,
  "space-pilot": SpacePilotThumbnail,
  "color-chase": ColorChaseThumbnail,
};

import {BridgeThumbnail} from '@/components/balancebridge3d/BridgeThumbnail';
import {CastleThumbnail} from '@/components/castlelegends3d/CastleThumbnail';
import { HarvestThumbnail } from '../harvestvalley3d/HarvestThumbnail';
import { BloomThumbnail } from '../bloomingworld3d/BloomThumbnail';
import { FireRescueThumbnail } from '../firerescue3d/FireRescueThumbnail';
import { PearlVoyageThumbnail } from '../pearlvoyage3d/PearlVoyageThumbnail';
import { MirrorThumbnail } from '../mirrorquest3d/MirrorThumbnail';
import { HexThumbnail } from '../safehexarena3d/HexThumbnail';
import { TurnGoThumbnail } from '../turngo3d/TurnGoThumbnail';
import { RhythmThumbnail } from '../rhythmsteps3d/RhythmThumbnail';
import { BodySequenceThumbnail } from '../bodysequence3d/BodySequenceThumbnail';
import { AchievementCityThumbnail } from '../achievementcity3d/AchievementCityThumbnail';
import { OceanWondersThumbnail } from '../oceanwonders3d/OceanWondersThumbnail';
import { FootstepsForestThumbnail } from '../footsteps3d/FootstepsForestThumbnail';
import { FOOTSTEPS_3D_ENABLED } from '@/lib/footsteps3d/registration';
import { ColorChaseGardenThumbnail } from '../colorchase3d/ColorChaseGardenThumbnail';
import { COLOR_CHASE_3D_ENABLED } from '@/lib/colorchase3d/registration';
import type { ComponentType } from "react";
import type { GameId, LocalGameId } from "@/lib/games/registry";
import { BalloonQuestThumbnail } from "./BalloonQuestThumbnail";
import { FollowTheFootstepsThumbnail } from "./FollowTheFootstepsThumbnail";
import { BubblePopWallThumbnail } from "./BubblePopWallThumbnail";
import { SpacePilotThumbnail } from "./SpacePilotThumbnail";
import { ColorChaseThumbnail } from "./ColorChaseThumbnail";
import { SpacePilot3DThumbnail } from '../spacepilot3d/SpacePilot3DThumbnail';
import { SPACE_PILOT_3D_ENABLED } from '@/lib/spacepilot3d/releasePolicy';
import { RunnerQuestThumbnail } from '../runnerquest3d/RunnerQuestThumbnail';
import { BuildQuestThumbnail } from '../buildquest3d/BuildQuestThumbnail';
import { FootMazeThumbnail } from '../footmaze3d/FootMazeThumbnail';

/**
 * Kept separate from lib/games/registry.ts on purpose: the registry is
 * plain, serializable data (id/name/description/route), while a thumbnail
 * is a real React component built from this game's visual language. Adding
 * a game means adding one entry here alongside its registry entry — see
 * registry.ts's doc comment for the full "adding a game" checklist.
 */
export const GAME_THUMBNAILS: Record<GameId | LocalGameId, ComponentType> = {
  "balance-bridge-3d": BridgeThumbnail,
  "shumos-castle-legends-3d": CastleThumbnail,
  "harvest-valley-3d": HarvestThumbnail,
  "blooming-world-3d": BloomThumbnail,
  "fire-rescue-3d": FireRescueThumbnail,
  "pearl-voyage-3d": PearlVoyageThumbnail,
  "balloon-quest": BalloonQuestThumbnail,
  "follow-the-footsteps": FOOTSTEPS_3D_ENABLED ? FootstepsForestThumbnail : FollowTheFootstepsThumbnail,
  "bubble-pop-wall": BubblePopWallThumbnail,
  "space-pilot": SPACE_PILOT_3D_ENABLED ? SpacePilot3DThumbnail : SpacePilotThumbnail,
  "color-chase": COLOR_CHASE_3D_ENABLED ? ColorChaseGardenThumbnail : ColorChaseThumbnail,
  "runner-quest-3d": RunnerQuestThumbnail,
  "build-quest-3d": BuildQuestThumbnail,
  "mirror-quest-3d": MirrorThumbnail,
  "foot-maze-3d": FootMazeThumbnail,
  "safe-hex-arena-3d": HexThumbnail,
  "turn-and-go-3d": TurnGoThumbnail,
  "rhythm-steps-3d": RhythmThumbnail,
  "body-sequence-3d": BodySequenceThumbnail,
  "achievement-city-3d": AchievementCityThumbnail,
  "ocean-wonders-3d": OceanWondersThumbnail,
};

import {CASTLE_REGISTRATION} from "@/lib/castlelegends3d/registration";
import {BODY_SEQUENCE_REGISTRATION} from "@/lib/bodysequence3d/registration";
import {ACHIEVEMENT_CITY_REGISTRATION} from "@/lib/achievementcity/registration";
import {RHYTHM_STEPS_REGISTRATION} from "@/lib/rhythmsteps3d/registration";
import {FOOT_MAZE_REGISTRATION} from "@/lib/footmaze3d/registration";
import {TURN_AND_GO_REGISTRATION} from "@/lib/turngo3d/registration";
import {BALANCE_BRIDGE_REGISTRATION} from '@/lib/balancebridge3d/registration';
import { HARVEST_VALLEY_REGISTRATION } from '@/lib/harvestvalley3d/registration';
import { BLOOMING_WORLD_REGISTRATION } from '@/lib/bloomingworld3d/registration';
import { FIRE_RESCUE_REGISTRATION } from '@/lib/firerescue3d/registration';
import { PEARL_VOYAGE_REGISTRATION } from '@/lib/pearlvoyage3d/registration';
import { getGameById, type GameId, type LocalGameId } from "@/lib/games/registry";
import { RETIRED_FEED_ANIMALS_ID, RETIRED_FEED_ANIMALS_NAME_AR } from "./retiredFeedAnimals";

/** Historical IDs are deliberately separate from launchable games. */
export type HistoricalGameId = GameId | LocalGameId | typeof RETIRED_FEED_ANIMALS_ID;
export function getHistoricalGameNameAr(id: HistoricalGameId): string {
  if (id === "turn-and-go-3d") return TURN_AND_GO_REGISTRATION.nameAr;
  if (id === "foot-maze-3d") return FOOT_MAZE_REGISTRATION.nameAr;
  if (id === "rhythm-steps-3d") return RHYTHM_STEPS_REGISTRATION.nameAr;
  if (id === "body-sequence-3d") return BODY_SEQUENCE_REGISTRATION.nameAr;
  if (id === "achievement-city-3d") return ACHIEVEMENT_CITY_REGISTRATION.nameAr;
  if (id === "shumos-castle-legends-3d") return CASTLE_REGISTRATION.nameAr;
  if (id === "balance-bridge-3d") return BALANCE_BRIDGE_REGISTRATION.nameAr;
  if (id === 'harvest-valley-3d') return HARVEST_VALLEY_REGISTRATION.nameAr;
  if (id === 'blooming-world-3d') return BLOOMING_WORLD_REGISTRATION.nameAr;
  if (id === 'fire-rescue-3d') return FIRE_RESCUE_REGISTRATION.nameAr;
  if (id === 'pearl-voyage-3d') return PEARL_VOYAGE_REGISTRATION.nameAr;
  return id === RETIRED_FEED_ANIMALS_ID ? RETIRED_FEED_ANIMALS_NAME_AR : getGameById(id)?.nameAr ?? id;
}

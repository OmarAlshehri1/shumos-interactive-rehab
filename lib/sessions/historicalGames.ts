import { HARVEST_VALLEY_REGISTRATION } from '@/lib/harvestvalley3d/registration';
import { BLOOMING_WORLD_REGISTRATION } from '@/lib/bloomingworld3d/registration';
import { FIRE_RESCUE_REGISTRATION } from '@/lib/firerescue3d/registration';
import { PEARL_VOYAGE_REGISTRATION } from '@/lib/pearlvoyage3d/registration';
import { getGameById, type GameId, type LocalGameId } from "@/lib/games/registry";
import { RETIRED_FEED_ANIMALS_ID, RETIRED_FEED_ANIMALS_NAME_AR } from "./retiredFeedAnimals";

/** Historical IDs are deliberately separate from launchable games. */
export type HistoricalGameId = GameId | LocalGameId | typeof RETIRED_FEED_ANIMALS_ID;
export function getHistoricalGameNameAr(id: HistoricalGameId): string {
  if (id === 'harvest-valley-3d') return HARVEST_VALLEY_REGISTRATION.nameAr;
  if (id === 'blooming-world-3d') return BLOOMING_WORLD_REGISTRATION.nameAr;
  if (id === 'fire-rescue-3d') return FIRE_RESCUE_REGISTRATION.nameAr;
  if (id === 'pearl-voyage-3d') return PEARL_VOYAGE_REGISTRATION.nameAr;
  return id === RETIRED_FEED_ANIMALS_ID ? RETIRED_FEED_ANIMALS_NAME_AR : getGameById(id)?.nameAr ?? id;
}

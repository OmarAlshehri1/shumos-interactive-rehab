import type { GameDefinition } from "@/lib/games/registry";
import { DEVICE_GAMES, type RequestedInput } from "./capabilities";
export type LibraryFilter = "ALL" | Exclude<RequestedInput, "MANUAL">;
export const LIBRARY_FILTERS: readonly {
  id: LibraryFilter;
  label: string;
  icon: string;
}[] = [
  { id: "ALL", label: "الكل", icon: "all" },
  { id: "HAND", label: "حساسات اليد", icon: "hand" },
  { id: "FOOT", label: "حساسات القدم", icon: "foot" },
  { id: "JOYSTICK", label: "عصي التحكم", icon: "controller" },
  { id: "DRIVING", label: "المقود والدواسات", icon: "wheel" },
];
export function libraryFilter(raw: string | null): LibraryFilter {
  return LIBRARY_FILTERS.some((f) => f.id === raw)
    ? (raw as LibraryFilter)
    : "ALL";
}
/** Registry order and canonical capability membership remain the only source of games. */
export function filteredGames(
  games: readonly GameDefinition[],
  filter: LibraryFilter,
): GameDefinition[] {
  const unique = [...new Map(games.map((g) => [g.id, g])).values()];
  return filter === "ALL"
    ? unique
    : unique.filter((g) => DEVICE_GAMES[filter].includes(g.id));
}

import { isLaunchableGame } from "@/lib/games/registry";
import type { GameDefinition } from "@/lib/games/registry";
import { ACTIVITY_CATEGORY_GAMES, DEVICE_GAMES, type RequestedInput } from "./capabilities";
/** Device filters plus the activity category filter. A category describes what a game IS and never implies a sensor. */
export type LibraryFilter = Exclude<RequestedInput, "MANUAL"> | "INTERACTIVE_REWARDS";
export const LIBRARY_FILTERS: readonly {
  id: LibraryFilter;
  label: string;
  icon: string;
}[] = [
  { id: "HAND", label: "حساسات اليد", icon: "hand" },
  { id: "FOOT", label: "حساسات القدم", icon: "foot" },
  { id: "JOYSTICK", label: "عصي التحكم", icon: "controller" },
  { id: "DRIVING", label: "المقود والدواسات", icon: "wheel" },
  { id: "INTERACTIVE_REWARDS", label: "ألعاب التحفيز التفاعلي", icon: "sparkles" },
];
export function libraryFilter(raw: string | null): LibraryFilter {
  return LIBRARY_FILTERS.some((f) => f.id === raw)
    ? (raw as LibraryFilter)
    : "HAND";
}
/** Registry order and canonical capability membership remain the only source of games. */
export function filteredGames(
  games: readonly GameDefinition[],
  filter: LibraryFilter | "ALL",
): GameDefinition[] {
  const unique = [...new Map(games.filter(isLaunchableGame).map((g) => [g.id, g])).values()];
  if (filter === "ALL") return unique;
  const members: readonly string[] = filter === "INTERACTIVE_REWARDS" ? ACTIVITY_CATEGORY_GAMES.INTERACTIVE_REWARDS : DEVICE_GAMES[filter];
  return unique.filter((g) => members.includes(g.id));
}

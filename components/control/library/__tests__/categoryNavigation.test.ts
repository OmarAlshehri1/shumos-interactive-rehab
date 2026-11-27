import { afterAll, expect, it, vi } from "vitest";
vi.hoisted(() => vi.stubEnv("NODE_ENV", "production"));
afterAll(() => vi.unstubAllEnvs());
import { GAME_REGISTRY, LAUNCHABLE_GAMES } from "@/lib/games/registry";
import { LIBRARY_FILTERS, filteredGames, libraryFilter } from "@/lib/games/library/filters";
import { librarySections, categorySections } from "../presentation";
it("defaults absent, obsolete All and invalid queries to the hand category", () => {
  for(const value of [null,"ALL","__proto__","invalid"])expect(libraryFilter(value)).toBe("HAND");
  expect(LIBRARY_FILTERS.map(f=>f.id)).toEqual(["HAND","FOOT","JOYSTICK","DRIVING","INTERACTIVE_REWARDS"]);
});
it("keeps 21 launchable games discoverable and 22 engines registered through categories without a combined view", () => {
  expect(GAME_REGISTRY).toHaveLength(22);
  const sections=[...librarySections(GAME_REGISTRY),...categorySections(GAME_REGISTRY)];
  const discovered=new Set(LIBRARY_FILTERS.flatMap(f=>filteredGames(GAME_REGISTRY,f.id).map(g=>g.id)));
  expect(LAUNCHABLE_GAMES).toHaveLength(21);
  expect(discovered.has("bubble-pop-wall")).toBe(false);
  expect([...discovered].sort()).toEqual(LAUNCHABLE_GAMES.map(g=>g.id).sort());
  for(const filter of LIBRARY_FILTERS) expect(sections.filter(s=>s.input===filter.id)).toHaveLength(1);
});

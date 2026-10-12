import { afterEach, describe, expect, it, vi } from "vitest";

const load = async (flag: string | undefined) => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv("NEXT_PUBLIC_BALANCE_BRIDGE_3D", "false");
  if (flag !== undefined) vi.stubEnv("NEXT_PUBLIC_RUNNER_QUEST_3D", flag);
  return import("@/lib/games/registry");
};
afterEach(() => vi.unstubAllEnvs());

describe("library registry", () => {
  it("flag on: exactly one Runner Quest entry, correct route, all other games preserved", async () => {
    const { GAME_REGISTRY } = await load("1");
    expect(GAME_REGISTRY.filter((g) => g.id === "runner-quest-3d")).toHaveLength(1);
    const rq = GAME_REGISTRY.find((g) => g.id === "runner-quest-3d")!;
    expect(rq).toMatchObject({ nameAr: "مغامرة العدّاء", nameEn: "Runner Quest 3D", route: "/control/runner-quest-3d" });
    for (const id of ["balloon-quest", "follow-the-footsteps", "bubble-pop-wall", "space-pilot", "color-chase"]) expect(GAME_REGISTRY.some((g) => g.id === id)).toBe(true);
    expect(new Set(GAME_REGISTRY.map((g) => g.id)).size).toBe(GAME_REGISTRY.length);
  });
  it("flag off: no entry and the base games and Castle Legends remain", async () => {
    const { GAME_REGISTRY } = await load(undefined);
    expect(GAME_REGISTRY.some((g) => g.id === "runner-quest-3d")).toBe(false);
    expect(GAME_REGISTRY).toHaveLength(6);
  });
  it("every registry entry has a thumbnail", async () => {
    const { GAME_REGISTRY } = await load("1");
    const { GAME_THUMBNAILS } = await import("@/components/control/library/gameThumbnails");
    for (const g of GAME_REGISTRY) expect(GAME_THUMBNAILS[g.id], g.id).toBeTruthy();
  });
});

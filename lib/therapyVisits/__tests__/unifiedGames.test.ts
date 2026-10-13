import { afterEach, describe, expect, it, vi } from "vitest";
const ids = [
  "shumos-castle-legends-3d",
  "balance-bridge-3d",
  "turn-and-go-3d",
  "foot-maze-3d",
  "rhythm-steps-3d",
  "body-sequence-3d",
  "achievement-city-3d",
  "ocean-wonders-3d",
] as const;
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
describe("unified canonical games and archived history", () => {
  it("registers all 21 once and supplies each shared Display module", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.resetModules();
    const { GAME_REGISTRY } = await import("@/lib/games/registry");
    const { GAME_DISPLAY_MODULES } =
      await import("@/components/display/gameDisplayRegistry");
    expect(GAME_REGISTRY).toHaveLength(21);
    expect(new Set(GAME_REGISTRY.map((g) => g.id)).size).toBe(21);
    for (const game of GAME_REGISTRY)
      expect(GAME_DISPLAY_MODULES[game.id], game.id).toBeDefined();
  }, 20000);
  it("preserves Arabic historical identities when optional games are disabled", async () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const key of [
      "BALANCE_BRIDGE",
      "TURN_AND_GO",
      "FOOT_MAZE",
      "RHYTHM_STEPS",
      "BODY_SEQUENCE",
      "ACHIEVEMENT_CITY",
      "OCEAN_WONDERS",
    ])
      vi.stubEnv(`NEXT_PUBLIC_${key}_3D`, "false");
    vi.resetModules();
    const { getHistoricalGameNameAr } =
      await import("@/lib/sessions/historicalGames");
    for (const id of ids) expect(getHistoricalGameNameAr(id)).not.toBe(id);
    expect(getHistoricalGameNameAr("feed-the-animals")).toContain("الحيوانات");
  });
});

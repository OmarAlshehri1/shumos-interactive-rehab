import { describe, expect, it } from "vitest";
import { GAME_DISPLAY_MODULES } from "@/components/display/gameDisplayRegistry";
import { GAME_THUMBNAILS } from "@/components/control/library/gameThumbnails";
import { GAME_REGISTRY, getGameById } from "../registry";
import { existsSync } from "node:fs";
import { join } from "node:path";

describe("Color Chase platform registration", () => {
  it("is a FLOOR activity with a control route, thumbnail, and display module", () => {
    expect(getGameById("color-chase")).toMatchObject({ nameAr: "مطاردة الألوان", nameEn: "Color Chase", surfaceType: "FLOOR", route: "/control/color-chase" });
    expect(GAME_THUMBNAILS["color-chase"]).toBeTypeOf("function");
    expect(GAME_DISPLAY_MODULES["color-chase"]).toBeTypeOf("function");
  });

  it("keeps every registered activity in exactly one implemented projection group, including BOTH", () => {
    const floor = GAME_REGISTRY.filter((game) => game.surfaceType === "FLOOR");
    const wall = GAME_REGISTRY.filter((game) => game.surfaceType === "WALL");
    const both = GAME_REGISTRY.filter((game) => game.surfaceType === "BOTH");
    expect([...floor, ...wall, ...both]).toHaveLength(GAME_REGISTRY.length);
    expect(new Set([...floor, ...wall, ...both].map((game) => game.id)).size).toBe(GAME_REGISTRY.length);
    for (const game of GAME_REGISTRY) expect(existsSync(join(process.cwd(), "app", game.route, "page.tsx"))).toBe(true);
  });
});

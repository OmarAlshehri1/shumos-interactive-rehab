import { describe, expect, it } from "vitest";
import { createQuickSessionLaunch, gamesForQuickSessionSurface } from "@/lib/control/quickSession";

describe("Quick Session", () => {
  it("filters strictly by the selected projector surface", () => {
    expect(gamesForQuickSessionSurface("FLOOR").every((game) => game.surfaceType === "FLOOR")).toBe(true);
    expect(gamesForQuickSessionSurface("WALL").every((game) => game.surfaceType === "WALL")).toBe(true);
    expect(gamesForQuickSessionSurface("FLOOR").some((game) => game.id === "color-chase")).toBe(true);
    expect(gamesForQuickSessionSurface("WALL").some((game) => game.id === "bubble-pop-wall")).toBe(true);
  });

  it("creates a walk-in launch with patientId=null and no patient write", () => {
    const game = gamesForQuickSessionSurface("FLOOR")[0];
    expect(createQuickSessionLaunch("  ليان  ", game)).toMatchObject({ childFirstName: "ليان", patientId: null, game });
  });
});

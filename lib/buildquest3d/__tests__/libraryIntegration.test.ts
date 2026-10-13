import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { BUILD_QUEST_REGISTRATION, isBuildQuestControl } from "../registration";

const { pathname } = vi.hoisted(() => ({ pathname: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: pathname }));
import { BuildQuestLocalOnlyBoundary } from "@/components/control/buildquest3d/BuildQuestLocalOnlyBoundary";

beforeEach(() => { vi.resetModules(); });
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("local library integration", () => {
  it("lists one complete Arabic card, retaining existing games and a real thumbnail", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_BUILD_QUEST_3D_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_DATABASE_URL", "https://configured.example");
    const { GAME_REGISTRY } = await import("@/lib/games/registry");
    const { GAME_THUMBNAILS } = await import("@/components/control/library/gameThumbnails");
    const games = GAME_REGISTRY.filter(g => g.id === "build-quest-3d");
    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({ nameAr: "عالم البناء", route: "/control/build-quest-3d", sensorCompatible: true });
    expect(games[0].shortDescriptionAr).toContain("بانتظار الاختبار الفعلي");
    expect(GAME_THUMBNAILS["build-quest-3d"].name).toBe("BuildQuestThumbnail");
    for (const id of ["balloon-quest", "space-pilot", "runner-quest-3d"]) expect(GAME_REGISTRY.some(g => g.id === id)).toBe(true);
    expect(BUILD_QUEST_REGISTRATION.supportedInputs).toHaveLength(3);
  });

  it.each([ ["development", "false"], ["production", "false"] ])("hides the card for %s/%s", async (environment, flag) => {
    vi.stubEnv("NODE_ENV", environment);
    vi.stubEnv("NEXT_PUBLIC_BUILD_QUEST_3D_ENABLED", flag);
    const { GAME_REGISTRY } = await import("@/lib/games/registry");
    expect(GAME_REGISTRY.some(g => g.id === "build-quest-3d")).toBe(false);
  });

  it("does not mount cloud publishing children on Build Quest, and preserves other routes", () => {
    const mount = vi.fn(() => createElement("span", null, "cloud publisher"));
    pathname.mockReturnValue("/control/build-quest-3d");
    expect(renderToStaticMarkup(createElement(BuildQuestLocalOnlyBoundary, null, createElement(mount)))).toBe("");
    expect(mount).not.toHaveBeenCalled();
    for (const route of ["/control/balloon-quest", "/control/runner-quest-3d", "/control/activities", "/control/space-pilot", null]) {
      pathname.mockReturnValue(route);
      expect(renderToStaticMarkup(createElement(BuildQuestLocalOnlyBoundary, null, createElement(mount)))).toContain("cloud publisher");
      expect(isBuildQuestControl(route)).toBe(false);
    }
  });

  it("keeps auth, local pointer publishing and the previous Space Pilot boundary in the layout", () => {
    const layout = readFileSync("app/control/layout.tsx", "utf8");
    expect(layout).toContain("<StaffAuthGate><GameSafetyProvider><VisitProvider><LibraryLaunchBoundary><ControlGameFrame>{children}</ControlGameFrame></LibraryLaunchBoundary><VisitWorkspace /></VisitProvider></GameSafetyProvider></StaffAuthGate>");
    expect(layout).toContain("<LocalPointerBroadcastSync />");
    expect(layout).toContain("<BuildQuestLocalOnlyBoundary><PrototypeLocalOnlyBoundary><SensorPointerDisplaySync /></PrototypeLocalOnlyBoundary></BuildQuestLocalOnlyBoundary>");
  });
});

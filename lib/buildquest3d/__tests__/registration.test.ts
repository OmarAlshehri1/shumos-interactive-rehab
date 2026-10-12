import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { BUILD_QUEST_REGISTRATION, buildQuestAvailable } from "../registration";
describe("safe isolated local registration", () => {
  it("uses explicit Arabic and English identity and real routes", () => {
    expect(BUILD_QUEST_REGISTRATION.id).toBe("build-quest-3d");
    expect(BUILD_QUEST_REGISTRATION.nameAr).toBe("عالم البناء");
    expect(BUILD_QUEST_REGISTRATION.nameEn).toBe("Build Quest 3D");
    for (const route of [
      BUILD_QUEST_REGISTRATION.route,
      BUILD_QUEST_REGISTRATION.displayRoute,
    ])
      expect(readFileSync(`app${route}/page.tsx`, "utf8")).toContain(
        "buildQuestAvailable",
      );
  });
  it("is enabled locally regardless of Firebase, with explicit production opt-in and rollback", () => {
    expect(buildQuestAvailable("development", undefined)).toBe(true);
    expect(buildQuestAvailable("development", "true")).toBe(true);
    expect(buildQuestAvailable("production", "true")).toBe(true);
    expect(buildQuestAvailable("production", undefined)).toBe(false);
    expect(buildQuestAvailable("production", "false")).toBe(false);
    expect(buildQuestAvailable("development", "false")).toBe(false);
  });
  it("inherits existing staff gate and has no Firebase/game-driver imports", () => {
    expect(readFileSync("app/control/layout.tsx", "utf8")).toContain(
      "<StaffAuthGate><LibraryLaunchBoundary>{children}</LibraryLaunchBoundary></StaffAuthGate>",
    );
    for (const file of [
      "gameplay.ts",
      "protocol.ts",
      "sensorInput.ts",
      "renderer.ts",
    ]) {
      const source = readFileSync(`lib/buildquest3d/${file}`, "utf8");
      expect(source).not.toMatch(
        /from ['"].*(firebase|Wt901Ble|spacepilot|balloonquest)/i,
      );
    }
  });
});

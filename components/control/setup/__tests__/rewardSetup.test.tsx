import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/realtime/firebaseClient", () => ({ isRealtimeEnabled: () => true }));
vi.mock("@/components/control/library/launch/LibraryLaunchBoundary", () => ({ useLibraryLaunchAdapter: () => {} }));
vi.mock("@/lib/achievementcity/useSession", async () => {
  const { createState } = await import("@/lib/achievementcity/engine");
  return { useAchievementCitySession: () => ({ state: createState("ui"), send: () => {}, connected: true, blocked: false, history: "walk-in", pad: { status: "unavailable", mapping: { button: 0 } } }) };
});
vi.mock("@/lib/achievementforest/useSession", async () => {
  const { createState } = await import("@/lib/achievementforest/engine");
  return { useAchievementForestSession: () => ({ state: createState("ui"), send: () => {}, connected: true, blocked: false, history: "walk-in", pad: { status: "unavailable", mapping: { button: 0 } } }) };
});
vi.mock("@/lib/oceanwonders/useSession", async () => {
  const { createState } = await import("@/lib/oceanwonders/engine");
  return { useOceanWondersSession: () => ({ state: createState("ui"), send: () => {}, connected: true, blocked: false, history: "walk-in", pad: { status: "unavailable", mapping: { button: 0 } } }) };
});
import { AchievementCityControl } from "@/components/control/achievementcity3d/AchievementCityControl";
import { AchievementForestControl } from "@/components/control/achievementforest3d/AchievementForestControl";
import { OceanWondersControl } from "@/components/control/oceanwonders3d/OceanWondersControl";
describe("reward setup presentation", () => {
  for (const [Control, prefix] of [[AchievementCityControl, "ac"], [AchievementForestControl, "af"], [OceanWondersControl, "ow"]] as const)
    it(`${prefix}: retains exactly three native levels and settings with no subordinate stages`, () => {
      const html = renderToStaticMarkup(<Control />);
      for (const level of [0, 1, 2]) expect(html).toContain(`data-testid="${prefix}-level-${level}"`);
      expect(html.match(new RegExp(`data-testid="${prefix}-level-`, "g"))).toHaveLength(3);
      expect(html).toContain(`data-testid="${prefix}-start"`);
      expect(html).toContain(`data-testid="${prefix}-exercise"`);
      expect(html).toContain('data-setup-kind="levels"');
      expect(html).not.toContain("data-stage-choice");
      expect(html).not.toContain("المرحلة");
    });
});

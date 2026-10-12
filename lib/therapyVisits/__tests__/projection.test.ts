import { describe, it, expect } from "vitest";
import {
  defaultProjection,
  validProjectionProfile,
} from "@/lib/projection/calibration";
import { gameSkillTags } from "@/lib/games/library/skillTags";
import { GAME_REGISTRY } from "@/lib/games/registry";
describe("calibration profiles and activity metadata", () => {
  it("round trips measured and unmeasured wall/floor profiles", () => {
    const p = defaultProjection();
    expect(validProjectionProfile(p)).toBe(true);
    expect(
      validProjectionProfile({
        ...p,
        surface: "WALL",
        rotation: 270,
        measuredWidthCm: 200,
      }),
    ).toBe(true);
    for (const patch of [
      { rotation: 45 },
      { targetPercent: 30 },
      { safeInsetPercent: 0 },
      { measuredWidthCm: -1 },
      { name: "" },
      { surface: "OTHER" },
      { spacingPercent: NaN },
    ])
      expect(validProjectionProfile({ ...p, ...patch })).toBe(false);
  });
  it("keeps explicit categories separate from sensor compatibility", () => {
    const footsteps = GAME_REGISTRY.find(
      (g) => g.id === "follow-the-footsteps",
    )!;
    expect(gameSkillTags(footsteps)).toEqual(["حركة القدمين والمشي"]);
    expect(
      gameSkillTags({ ...footsteps, activitySkills: ["reaching"] }),
    ).toEqual(["حركة اليدين والوصول"]);
  });
});

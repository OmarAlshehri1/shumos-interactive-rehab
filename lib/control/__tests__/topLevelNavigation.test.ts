import { describe, expect, it } from "vitest";
import { shouldShowLogout } from "@/lib/control/topLevelNavigation";

describe("logout visibility", () => {
  it("is limited to top-level therapist pages", () => {
    expect(shouldShowLogout("/control")).toBe(true);
    expect(shouldShowLogout("/control/activities")).toBe(true);
    expect(shouldShowLogout("/control/patients")).toBe(true);
    expect(shouldShowLogout("/control/quick-session")).toBe(true);
  });

  it("is hidden throughout every game workflow route", () => {
    for (const id of ["balloon-quest", "follow-the-footsteps", "bubble-pop-wall", "space-pilot", "color-chase"]) {
      expect(shouldShowLogout(`/control/${id}`)).toBe(false);
    }
    expect(shouldShowLogout("/control/patients/patient-1")).toBe(false);
  });
});

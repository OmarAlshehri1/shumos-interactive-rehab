import { describe, expect, it } from "vitest";
import { LEFT_HAND_ENROLLMENT_PHASES } from "../LeftHandEnrollmentPhases";

describe("LEFT_HAND_ENROLLMENT_PHASES", () => {
  it("has no duplicate phase ids across the combined MOTION_DIAGNOSTIC/twist-invariance/edge-reversal/new phases", () => {
    const ids = LEFT_HAND_ENROLLMENT_PHASES.map((phase) => phase.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every phase has a non-empty Arabic title and instruction", () => {
    for (const phase of LEFT_HAND_ENROLLMENT_PHASES) {
      expect(phase.titleAr.length).toBeGreaterThan(0);
      expect(phase.instructionAr.length).toBeGreaterThan(0);
    }
  });

  it("covers every category tonight's dual-sensor brief lists (up/down/left/right/diagonal/hold/tiny/shake/wrist-roll x3/edge-reversal)", () => {
    const ids: Set<string> = new Set(LEFT_HAND_ENROLLMENT_PHASES.map((phase): string => phase.id));
    for (const required of ["up", "down", "left", "right", "diagonal", "hold_naturally", "tiny", "small_natural_shake", "neutral_up", "twist_45_up", "twist_90_up", "edge_right_reverse_left"]) {
      expect(ids.has(required)).toBe(true);
    }
  });
});

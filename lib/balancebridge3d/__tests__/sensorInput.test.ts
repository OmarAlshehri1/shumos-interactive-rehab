import { it, expect } from "vitest";
import { PhysicalRole } from "@/lib/physicalInput/types";
import { FootHints } from "../sensorInput";
it("only selected fresh FOOT roles provide hints; stale, hand and disconnected signals cannot produce success", () => {
  const hints = new FootHints(),
    sample = {
      timestampMs: 1000,
      gyroscopeDps: [20, 0, 0] as const,
      accelerationG: [0, 0, 1] as const,
      anglesDeg: [0, 0, 0] as const,
    };
  expect(
    hints.observe(PhysicalRole.RIGHT_HAND, sample, "RIGHT_FOOT", 1100),
  ).toBe("unavailable");
  expect(
    hints.observe(PhysicalRole.LEFT_FOOT, sample, "RIGHT_FOOT", 1100),
  ).toBe("unavailable");
  expect(
    hints.observe(PhysicalRole.RIGHT_FOOT, sample, "RIGHT_FOOT", 1100),
  ).toBe("movement");
  expect(hints.current(PhysicalRole.RIGHT_FOOT, 1600)).toBe("unavailable");
  expect(
    hints.observe(
      PhysicalRole.RIGHT_FOOT,
      { ...sample, timestampMs: NaN },
      "RIGHT_FOOT",
      1100,
    ),
  ).toBe("unavailable");
  hints.clear(PhysicalRole.RIGHT_FOOT);
  expect(hints.current(PhysicalRole.RIGHT_FOOT, 1100)).toBe("unavailable");
});

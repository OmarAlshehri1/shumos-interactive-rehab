import { describe, expect, it } from "vitest";
import { formatAccuracyPercent, formatDurationClock, formatReactionTimeSeconds } from "@/components/display/copy";
import { formatSessionDate, formatSessionTime } from "../formatSessionDate";

describe("historical metric presentation safety", () => {
  it("never renders JavaScript sentinel text for invalid numerics", () => {
    const values = [
      formatAccuracyPercent(Number.NaN),
      formatAccuracyPercent(Number.POSITIVE_INFINITY),
      formatDurationClock(-1),
      formatDurationClock(Number.NaN),
      formatReactionTimeSeconds(Number.NEGATIVE_INFINITY),
      formatSessionDate(Number.NaN),
      formatSessionTime(Number.POSITIVE_INFINITY),
    ];
    expect(values).toEqual(Array(values.length).fill("—"));
    expect(values.join(" ")).not.toMatch(/NaN|Infinity|undefined|null|Invalid Date/);
  });

  it("distinguishes a real zero from unavailable data", () => {
    expect(formatAccuracyPercent(0)).toBe("0%");
    expect(formatAccuracyPercent(null)).toBe("—");
    expect(formatDurationClock(0)).toBe("00:00");
    expect(formatDurationClock(undefined)).toBe("—");
    expect(formatReactionTimeSeconds(0)).toBe("0.0 ث");
  });
});

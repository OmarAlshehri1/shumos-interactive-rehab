import { describe, expect, it } from "vitest";
import { createMotionVectorFilter, type MotionFilterMode } from "../MotionFilters";

const MODES: readonly MotionFilterMode[] = ["LIGHT_EMA", "ADAPTIVE_EMA", "ONE_EURO"];

describe("motion filter A/B/C candidates", () => {
  for (const mode of MODES) {
    it(`${mode} preserves continuous bounded movement`, () => {
      const filter = createMotionVectorFilter(mode);
      filter.reset({ x: 0.5, y: 0.5, rotationDeg: 0 });
      const tiny = filter.filter(
        { x: 0.51, y: 0.49, rotationDeg: 1 },
        { timestampMs: 100, gyroMagnitudeDps: 2, smoothing: 0.5 },
      );
      const diagonal = filter.filter(
        { x: 0.8, y: 0.2, rotationDeg: 20 },
        { timestampMs: 120, gyroMagnitudeDps: 180, smoothing: 0.5 },
      );
      expect(tiny.x).toBeGreaterThan(0.5);
      expect(tiny.y).toBeLessThan(0.5);
      expect(diagonal.x).toBeGreaterThan(tiny.x);
      expect(diagonal.y).toBeLessThan(tiny.y);
      expect([diagonal.x, diagonal.y, diagonal.rotationDeg].every(Number.isFinite)).toBe(true);
    });
  }
});

import { describe, expect, it } from "vitest";
import { BASE_VIEW_HEIGHT, cameraZ, frustumFor, gridCell, padRadius, playfieldWidth, regionSpacing, regionX, ROW_SPACING, rowZ } from "../floorLayout";
import type { FloorCalibration, Level3 } from "../types";

const L3: Level3[] = ["low", "normal", "high"];
const cal = (over: Partial<FloorCalibration> = {}) => ({ pad: "normal" as Level3, range: "normal" as Level3, margin: 0.05, widthCm: 0, ...over });

describe("FLOOR layout", () => {
  it("regions never overlap and every preset is a large target", () => {
    for (const pad of L3) for (const range of L3) {
      const c = cal({ pad, range });
      expect(regionSpacing(c)).toBeGreaterThan(2 * padRadius(c));
      expect(padRadius(c)).toBeGreaterThanOrEqual(1.3);
      expect(regionX(-1, c)).toBe(-regionX(1, c));
      expect(regionX(0, c)).toBe(0);
    }
  });
  it("range widens spacing monotonically; pad size grows monotonically", () => {
    const sp = L3.map((range) => regionSpacing(cal({ range })));
    expect(sp[0]).toBeLessThan(sp[1]); expect(sp[1]).toBeLessThan(sp[2]);
    const r = L3.map((pad) => padRadius(cal({ pad })));
    expect(r[0]).toBeLessThan(r[1]); expect(r[1]).toBeLessThan(r[2]);
  });
  it("the frustum is never stretched and always holds the three regions inside the safe area", () => {
    for (const aspect of [4 / 3, 16 / 10, 16 / 9, 21 / 9, 1, 0.75]) for (const pad of L3) for (const range of L3) for (const margin of [0, 0.05, 0.15]) {
      const c = cal({ pad, range, margin });
      const f = frustumFor(aspect, c);
      expect(f.width / f.height).toBeCloseTo(aspect, 6);
      expect(f.safe.width / f.safe.height).toBeCloseTo(aspect, 6);
      expect(f.safe.width).toBeGreaterThanOrEqual(playfieldWidth(c) - 1e-9);
      expect(f.safe.height).toBeGreaterThanOrEqual(BASE_VIEW_HEIGHT - 1e-9);
      expect(f.height).toBeGreaterThanOrEqual(f.safe.height);
    }
  });
  it("a larger margin enlarges the view around the same safe area", () => {
    const a = frustumFor(16 / 9, cal({ margin: 0 })), b = frustumFor(16 / 9, cal({ margin: 0.15 }));
    expect(a.safe.height).toBe(b.safe.height);
    expect(b.height).toBeGreaterThan(a.height);
  });
  it("falls back safely on a nonsense aspect", () => {
    expect(frustumFor(Number.NaN, cal()).width / frustumFor(Number.NaN, cal()).height).toBeCloseTo(16 / 9, 6);
    expect(frustumFor(0, cal()).height).toBeGreaterThan(0);
  });
  it("the path runs up the screen and the camera keeps the current row low with the road ahead visible", () => {
    expect(rowZ(0)).toBe(0);
    expect(rowZ(3)).toBe(-3 * ROW_SPACING);
    const f = frustumFor(16 / 9, cal());
    const cz = cameraZ(2, f);
    const bottom = cz + f.height / 2, top = cz - f.height / 2;
    expect(rowZ(2)).toBeLessThan(bottom);
    expect(rowZ(2)).toBeGreaterThan(top);
    expect(rowZ(3)).toBeGreaterThan(top); // the next waypoint is on screen
  });
  it("grid cells are 50 cm when a projected width is entered, otherwise ten columns", () => {
    const f = frustumFor(16 / 9, cal());
    expect(gridCell(f, { widthCm: 0 })).toBeCloseTo(f.width / 10, 9);
    expect(gridCell(f, { widthCm: 250 })).toBeCloseTo(f.width / 5, 9);
  });
});

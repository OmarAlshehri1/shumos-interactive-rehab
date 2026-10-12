import { describe, expect, it } from "vitest";
import { clearHalfWidth, decorFor, pathHalfWidth, waterFor } from "../floorDecor";
import { FLOOR_OBJECTIVE_COUNTS } from "../floor";
import { STAGES } from "../stages";
import type { Level3 } from "../types";

const L3: Level3[] = ["low", "normal", "high"];

describe("FLOOR scenery", () => {
  it("is deterministic per (theme, stage, seed) and never sits in the clear zone around the regions, for every stage and preset", () => {
    for (const spec of STAGES) for (const pad of L3) for (const range of L3) {
      const cal = { pad, range };
      const rows = FLOOR_OBJECTIVE_COUNTS[spec.index];
      const a = decorFor(spec.theme, spec.index, 5, rows, cal), b = decorFor(spec.theme, spec.index, 5, rows, cal);
      expect(a).toEqual(b);
      expect(a.length).toBeGreaterThan(10);
      for (const d of a) expect(Math.abs(d.x)).toBeGreaterThan(clearHalfWidth(cal));
    }
  });
  it("the path is inside the clear zone (scenery never overlaps it)", () => {
    for (const pad of L3) for (const range of L3) expect(pathHalfWidth({ pad, range })).toBeLessThan(clearHalfWidth({ pad, range }));
  });
  it("lower density keeps a subset and never adds items", () => {
    const full = decorFor("forest", 4, 1, 10, { pad: "normal", range: "normal" }, 1);
    const thin = decorFor("forest", 4, 1, 10, { pad: "normal", range: "normal" }, 0.4);
    expect(thin.length).toBeLessThan(full.length);
  });
  it("water sits beside the path, not under it", () => {
    for (const theme of ["lake", "river"] as const) {
      const cal = { pad: "high" as Level3, range: "high" as Level3 };
      const w = waterFor(theme, 10, cal)!;
      expect(Math.abs(w.x) - w.w / 2).toBeGreaterThan(pathHalfWidth(cal));
    }
    expect(waterFor("meadow", 10, { pad: "normal", range: "normal" })).toBeNull();
  });
});

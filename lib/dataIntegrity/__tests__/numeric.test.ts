import { describe, expect, it } from "vitest";
import {
  assertFirebaseSafeValue,
  averageFinite,
  finiteCount,
  safeElapsedMs,
  safeRatio,
  sumFinite,
  weightedAverageFinite,
} from "../numeric";

describe("numeric data-integrity invariants", () => {
  it("never produces a ratio for an unknown or zero denominator", () => {
    expect(safeRatio(0, 0)).toBeNull();
    expect(safeRatio(undefined, 4)).toBeNull();
    expect(safeRatio(0, 4)).toBe(0);
    expect(safeRatio(3, 4)).toBe(.75);
  });

  it("rejects malformed counts and partial sums instead of coercing them", () => {
    expect(finiteCount(-1)).toBeNull();
    expect(finiteCount(1.5)).toBeNull();
    expect(finiteCount(Number.NaN)).toBeNull();
    expect(sumFinite([1, undefined, 2])).toBeNull();
    expect(averageFinite([])).toBeNull();
  });

  it("calculates weighted response time from actual observations", () => {
    expect(weightedAverageFinite([{ value: 1000, weight: 1 }, { value: 3000, weight: 3 }])).toBe(2500);
    expect(weightedAverageFinite([])).toBeNull();
  });

  it("rejects negative, backwards, over-paused, and non-finite elapsed time", () => {
    expect(safeElapsedMs(5000, 1000, 1000)).toBe(3000);
    expect(safeElapsedMs(1000, 5000)).toBeNull();
    expect(safeElapsedMs(5000, 1000, 5000)).toBeNull();
    expect(safeElapsedMs(Number.NaN, 1000)).toBeNull();
  });

  it("blocks undefined and all non-finite Firebase writes", () => {
    expect(() => assertFirebaseSafeValue({ metric: Number.NaN })).toThrow("non-finite");
    expect(() => assertFirebaseSafeValue({ metric: Number.POSITIVE_INFINITY })).toThrow("non-finite");
    expect(() => assertFirebaseSafeValue({ nested: { missing: undefined } })).toThrow("undefined");
    expect(() => assertFirebaseSafeValue({ valid: 0, absent: null, serverValue: { ".sv": "timestamp" } })).not.toThrow();
  });
});

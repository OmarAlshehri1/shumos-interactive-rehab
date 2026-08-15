import { describe, expect, it } from "vitest";
import { createRng, nextInt, pick } from "../rng";

describe("createRng", () => {
  it("produces an identical sequence for the same seed", () => {
    const a = createRng("seed-x");
    const b = createRng("seed-x");
    const sequenceA = Array.from({ length: 10 }, () => a());
    const sequenceB = Array.from({ length: 10 }, () => b());
    expect(sequenceA).toEqual(sequenceB);
  });

  it("produces a different sequence for a different seed", () => {
    const a = createRng("seed-x");
    const b = createRng("seed-y");
    const sequenceA = Array.from({ length: 10 }, () => a());
    const sequenceB = Array.from({ length: 10 }, () => b());
    expect(sequenceA).not.toEqual(sequenceB);
  });

  it("stays within [0, 1)", () => {
    const rng = createRng("bounds-check");
    for (let i = 0; i < 1000; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("nextInt", () => {
  it("is inclusive of both bounds", () => {
    const rng = createRng("int-check");
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(nextInt(rng, 1, 3));
    expect(seen).toEqual(new Set([1, 2, 3]));
  });
});

describe("pick", () => {
  it("only returns elements from the given array", () => {
    const rng = createRng("pick-check");
    const items = ["a", "b", "c"];
    for (let i = 0; i < 50; i++) {
      expect(items).toContain(pick(rng, items));
    }
  });
});

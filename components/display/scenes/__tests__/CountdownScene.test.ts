import { describe, expect, it } from "vitest";
import { resolveMinTickMs, TICK_DURATION_MS } from "../CountdownScene";

describe("resolveMinTickMs", () => {
  it("gives each of the 4 countdown ticks its own minimum audible duration", () => {
    expect(resolveMinTickMs(0)).toBe(1100); // "ثلاثة" — the longest word, held the longest
    expect(resolveMinTickMs(1)).toBe(1000); // "اثنان"
    expect(resolveMinTickMs(2)).toBe(900); // "واحد"
    expect(resolveMinTickMs(3)).toBe(900); // "ابدأ!"
  });

  it("falls back to the last entry for an out-of-range index rather than throwing", () => {
    expect(resolveMinTickMs(4)).toBe(900);
    expect(resolveMinTickMs(99)).toBe(900);
  });

  it("stays below the outer safety ceiling, so a floor can never itself stall the countdown", () => {
    for (let i = 0; i < 4; i++) {
      expect(resolveMinTickMs(i)).toBeLessThan(TICK_DURATION_MS);
    }
  });
});

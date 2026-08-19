import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Color Chase additive Firebase validation", () => {
  it("allows the game id for live and immutable history records with danger metrics", () => {
    const rules = readFileSync("database.rules.json", "utf8");
    expect(() => JSON.parse(rules)).not.toThrow();
    expect(rules.match(/color-chase/g)?.length).toBeGreaterThanOrEqual(3);
    expect(rules).toContain("totalDangerPresses");
    expect(rules).toContain("!data.exists()");
  });
});

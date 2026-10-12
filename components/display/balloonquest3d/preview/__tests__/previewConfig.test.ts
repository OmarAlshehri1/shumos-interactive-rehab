import { describe, expect, it } from "vitest";
import { PREVIEW_COLORS, PREVIEW_MODES, parsePreviewMode } from "../previewConfig";

describe("Balloon Quest 3D preview config", () => {
  it("uses 3 / 5 / 7 colors per mode", () => {
    expect(PREVIEW_MODES.easy.palette).toHaveLength(3);
    expect(PREVIEW_MODES.medium.palette).toHaveLength(5);
    expect(PREVIEW_MODES.advanced.palette).toHaveLength(7);
  });

  it("Advanced is exactly black, white, green, blue, yellow, red, purple", () => {
    expect([...PREVIEW_MODES.advanced.palette].sort()).toEqual(["black", "blue", "green", "purple", "red", "white", "yellow"]);
    expect(Object.keys(PREVIEW_COLORS)).not.toContain("cyan");
    expect(Object.keys(PREVIEW_COLORS)).not.toContain("orange");
  });

  it("each palette has unique colors and unique symbol cues", () => {
    for (const mode of Object.values(PREVIEW_MODES)) {
      expect(new Set(mode.palette).size).toBe(mode.palette.length);
      expect(new Set(mode.palette.map((c) => PREVIEW_COLORS[c].symbol)).size).toBe(mode.palette.length);
    }
  });

  it("black and white have strong outlines; black also has a light halo", () => {
    expect(PREVIEW_COLORS.black.halo).toBeTruthy();
    expect(PREVIEW_COLORS.white.outlineWidth).toBeGreaterThanOrEqual(2);
    expect(PREVIEW_COLORS.black.outlineWidth).toBeGreaterThanOrEqual(2);
  });

  it("only the rising modes move; balloons shrink slightly from B2 but stay large", () => {
    expect(PREVIEW_MODES.easy.rising).toBe(false);
    expect(PREVIEW_MODES.medium.rising && PREVIEW_MODES.advanced.rising).toBe(true);
    expect(PREVIEW_MODES.easy.sizeCqh).toBeLessThan(24);
    expect(PREVIEW_MODES.medium.sizeCqh).toBeLessThan(19);
    expect(PREVIEW_MODES.advanced.sizeCqh).toBeLessThan(16);
    for (const m of Object.values(PREVIEW_MODES)) expect(m.sizeCqh).toBeGreaterThanOrEqual(14);
  });

  it("parses the mode query value safely", () => {
    expect(parsePreviewMode("advanced")).toBe("advanced");
    expect(parsePreviewMode("nonsense")).toBe("easy");
    expect(parsePreviewMode(undefined)).toBe("easy");
  });
});

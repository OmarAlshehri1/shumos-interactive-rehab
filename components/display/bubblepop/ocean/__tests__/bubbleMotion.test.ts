import { describe, expect, it } from "vitest";
import { BubbleMoveDirection } from "@/lib/bubblepop";
import { bubbleMotionPhase, bubbleMotionX, elapsedActiveMs, OCEAN_X_MARGIN } from "../bubbleMotion";

describe("elapsedActiveMs", () => {
  it("computes elapsed time since the mission started, excluding paused time", () => {
    expect(elapsedActiveMs(5000, 1000, 500, null)).toBe(3500);
  });

  it("freezes at the pausedAt timestamp regardless of how much later `now` is (task section 16)", () => {
    const elapsedWhilePaused = elapsedActiveMs(999999, 1000, 0, 2000);
    expect(elapsedWhilePaused).toBe(1000);
    expect(elapsedActiveMs(5_000_000, 1000, 0, 2000)).toBe(elapsedWhilePaused);
  });

  it("never returns a negative value", () => {
    expect(elapsedActiveMs(1000, 5000, 0, null)).toBe(0);
  });
});

describe("bubbleMotionPhase — no speed failure (task section 6)", () => {
  it("wraps continuously past a full travelMs instead of stopping at the edge", () => {
    const travelMs = 1000;
    expect(bubbleMotionPhase(travelMs, 0)).toBeCloseTo(0);
    expect(bubbleMotionPhase(travelMs, 500)).toBeCloseTo(0.5);
    expect(bubbleMotionPhase(travelMs, 1000)).toBeCloseTo(0);
    expect(bubbleMotionPhase(travelMs, 1500)).toBeCloseTo(0.5);
    expect(bubbleMotionPhase(travelMs, 10_500)).toBeCloseTo(0.5);
  });
});

describe("bubbleMotionX — movement direction", () => {
  const travelMs = 1000;

  it("RIGHT_TO_LEFT starts near the right edge and decreases toward the left edge", () => {
    const start = bubbleMotionX(BubbleMoveDirection.RIGHT_TO_LEFT, travelMs, 0);
    const mid = bubbleMotionX(BubbleMoveDirection.RIGHT_TO_LEFT, travelMs, 500);
    expect(start).toBeCloseTo(1 - OCEAN_X_MARGIN);
    expect(mid).toBeLessThan(start);
  });

  it("LEFT_TO_RIGHT starts near the left edge and increases toward the right edge", () => {
    const start = bubbleMotionX(BubbleMoveDirection.LEFT_TO_RIGHT, travelMs, 0);
    const mid = bubbleMotionX(BubbleMoveDirection.LEFT_TO_RIGHT, travelMs, 500);
    expect(start).toBeCloseTo(OCEAN_X_MARGIN);
    expect(mid).toBeGreaterThan(start);
  });

  it("never leaves the safe [OCEAN_X_MARGIN, 1 - OCEAN_X_MARGIN] band", () => {
    for (let t = 0; t <= 4000; t += 137) {
      for (const direction of [BubbleMoveDirection.RIGHT_TO_LEFT, BubbleMoveDirection.LEFT_TO_RIGHT]) {
        const x = bubbleMotionX(direction, travelMs, t);
        expect(x).toBeGreaterThanOrEqual(OCEAN_X_MARGIN - 1e-9);
        expect(x).toBeLessThanOrEqual(1 - OCEAN_X_MARGIN + 1e-9);
      }
    }
  });
});

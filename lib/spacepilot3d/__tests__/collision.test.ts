import { describe, expect, it } from "vitest";
import { segmentDistanceSquared, sweptShipIntersection, type ShipCapsule } from "../collision";

const point: ShipCapsule = { ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, radius: 0 };

describe("continuous sphere / compound capsule collision", () => {
  it("handles crossing, parallel, endpoint and degenerate segments", () => {
    expect(segmentDistanceSquared(-5, 0, 0, 5, 0, 0, point)).toBe(0);
    expect(segmentDistanceSquared(0, 3, 0, 0, 3, 0, point)).toBe(9);
    const axis = { ...point, az: -1, bz: 1 };
    expect(segmentDistanceSquared(0, 2, -3, 0, 2, 3, axis)).toBe(4);
    expect(segmentDistanceSquared(0, 0, 3, 0, 0, 4, axis)).toBe(4);
    expect(segmentDistanceSquared(-2, 0, 0, 2, 0, 0, axis)).toBe(0);
  });

  it("includes exact hull contact and excludes a small separation", () => {
    expect(sweptShipIntersection(0, 0.95, -1, -1, 0.5, 0, 0, 0, 0)).toBe(true);
    expect(sweptShipIntersection(0, 0.9501, -1, -1, 0.5, 0, 0, 0, 0)).toBe(false);
  });

  it("detects wing and engine contact without using an oversized ship sphere", () => {
    expect(sweptShipIntersection(2.1, -0.08, 0.8, 0.8, 0.1, 0, 0, 0, 0)).toBe(true);
    expect(sweptShipIntersection(2.1, 0.5, 0.8, 0.8, 0.1, 0, 0, 0, 0)).toBe(false);
    expect(sweptShipIntersection(0.95, 0, 1.3, 1.3, 0.1, 0, 0, 0, 0)).toBe(true);
    expect(sweptShipIntersection(0, 0, 3, 3, 0.1, 0, 0, 0, 0)).toBe(false); // exhaust
  });

  it("catches tunneling in both object and spacecraft motion", () => {
    expect(sweptShipIntersection(0, 0, -20, 20, 0.5, 0, 0, 0, 0)).toBe(true);
    expect(sweptShipIntersection(0, 0, 0, 0, 0.5, -4.8, 0, 4.8, 0)).toBe(true);
    expect(sweptShipIntersection(0, 0, -20, 20, 0.5, -4.8, 2.8, 4.8, 2.8)).toBe(false);
  });

  it("rejects distant and clearly avoided objects", () => {
    expect(sweptShipIntersection(0, 0, -80, -60, 1, 0, 0, 0, 0)).toBe(false);
    expect(sweptShipIntersection(0, 2.8, -5, 5, 1, 0, 0, 0, 0)).toBe(false);
  });
});

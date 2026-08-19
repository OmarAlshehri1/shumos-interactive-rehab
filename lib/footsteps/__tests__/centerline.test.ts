import { describe, expect, it } from "vitest";
import { buildArcLengthTable, buildWaypointCenterline, perpendicularOffset, sampleAtDistance, scaleWaypointsFrom } from "../centerline";

describe("buildWaypointCenterline", () => {
  it("passes exactly through every waypoint at its own even-progress point", () => {
    const waypoints = [
      { x: 0.5, y: 0.8 },
      { x: 0.3, y: 0.5 },
      { x: 0.7, y: 0.3 },
      { x: 0.5, y: 0.1 },
    ];
    const resolution = 300; // divisible by (waypoints.length - 1) = 3
    const points = buildWaypointCenterline(waypoints, resolution);
    const segments = waypoints.length - 1;
    for (let i = 0; i < waypoints.length; i++) {
      const index = Math.round((i / segments) * resolution);
      expect(points[index].x).toBeCloseTo(waypoints[i].x, 6);
      expect(points[index].y).toBeCloseTo(waypoints[i].y, 6);
    }
  });

  it("is continuous — a tiny progress step never causes a large position jump (smooth, not a hard corner)", () => {
    const waypoints = [
      { x: 0.5, y: 0.8 },
      { x: 0.2, y: 0.6 },
      { x: 0.8, y: 0.4 },
      { x: 0.3, y: 0.2 },
      { x: 0.5, y: 0.1 },
    ];
    const points = buildWaypointCenterline(waypoints, 400);
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      expect(Math.hypot(dx, dy)).toBeLessThan(0.02);
    }
  });

  it("two waypoints produce a straight line", () => {
    const points = buildWaypointCenterline([
      { x: 0.5, y: 0.8 },
      { x: 0.5, y: 0.2 },
    ]);
    for (const point of points) expect(point.x).toBeCloseTo(0.5, 9);
  });

  it("a closed-ish loop of waypoints never collapses to a single point (genuine 2D shape, not a 1D wiggle)", () => {
    const center = { x: 0.5, y: 0.5 };
    const waypoints = Array.from({ length: 9 }, (_, i) => {
      const angle = (i / 8) * Math.PI * 2;
      return { x: center.x + 0.3 * Math.cos(angle), y: center.y + 0.28 * Math.sin(angle) };
    });
    const points = buildWaypointCenterline(waypoints, 360);
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.5);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.5);
  });

  it("empty/degenerate input never throws and never produces NaN", () => {
    expect(buildWaypointCenterline([])).toEqual([]);
    const single = buildWaypointCenterline([{ x: 0.5, y: 0.5 }]);
    expect(single.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });
});

describe("scaleWaypointsFrom", () => {
  it("leaves the origin point itself unchanged", () => {
    const origin = { x: 0.5, y: 0.8 };
    const scaled = scaleWaypointsFrom([origin, { x: 0.2, y: 0.4 }], origin, 2.5);
    expect(scaled[0]).toEqual(origin);
  });

  it("scale=1 is a no-op", () => {
    const waypoints = [
      { x: 0.5, y: 0.8 },
      { x: 0.3, y: 0.4 },
    ];
    expect(scaleWaypointsFrom(waypoints, waypoints[0], 1)).toEqual(waypoints);
  });

  it("scaling by 2x doubles every point's distance from the origin, preserving direction", () => {
    const origin = { x: 0.5, y: 0.8 };
    const point = { x: 0.3, y: 0.5 };
    const [, scaled] = scaleWaypointsFrom([origin, point], origin, 2);
    expect(scaled.x - origin.x).toBeCloseTo((point.x - origin.x) * 2, 9);
    expect(scaled.y - origin.y).toBeCloseTo((point.y - origin.y) * 2, 9);
  });

  it("preserves the silhouette — the arc length of a scaled curve scales by the same factor", () => {
    const waypoints = [
      { x: 0.5, y: 0.8 },
      { x: 0.2, y: 0.6 },
      { x: 0.7, y: 0.35 },
      { x: 0.4, y: 0.15 },
    ];
    const baseLength = buildArcLengthTable(buildWaypointCenterline(waypoints)).totalLength;
    const scaledLength = buildArcLengthTable(buildWaypointCenterline(scaleWaypointsFrom(waypoints, waypoints[0], 1.6))).totalLength;
    expect(scaledLength).toBeCloseTo(baseLength * 1.6, 2);
  });
});

describe("arc-length sampling — the core fix: distance-based placement, not t-based", () => {
  it("arc length between two DISTANCES is exact by construction, regardless of curve shape", () => {
    const waypoints = [
      { x: 0.5, y: 0.8 },
      { x: 0.18, y: 0.55 },
      { x: 0.75, y: 0.4 },
      { x: 0.3, y: 0.2 },
      { x: 0.55, y: 0.1 },
    ];
    const table = buildArcLengthTable(buildWaypointCenterline(waypoints, 400));
    const step = table.totalLength / 6;
    for (let i = 0; i <= 6; i++) {
      expect(i * step).toBeLessThanOrEqual(table.totalLength + 1e-9);
    }
  });

  it("for a GENTLE curve (the smoothness real stages design toward), consecutive samples' straight-line distance closely matches the arc-length step — chord ≈ arc only once curvature is genuinely gentle", () => {
    const waypoints = [
      { x: 0.5, y: 0.8 },
      { x: 0.42, y: 0.6 },
      { x: 0.55, y: 0.4 },
      { x: 0.48, y: 0.2 },
    ];
    const table = buildArcLengthTable(buildWaypointCenterline(waypoints, 400));
    const step = table.totalLength / 6;
    const samples = Array.from({ length: 7 }, (_, i) => sampleAtDistance(table, i * step));

    for (let i = 1; i < samples.length; i++) {
      const dx = samples[i].position.x - samples[i - 1].position.x;
      const dy = samples[i].position.y - samples[i - 1].position.y;
      expect(Math.hypot(dx, dy)).toBeCloseTo(step, 2);
    }
  });

  it("clamps a distance beyond totalLength to the curve's actual endpoint (never NaN, never overshoots the curve)", () => {
    const points = buildWaypointCenterline([
      { x: 0.5, y: 0.8 },
      { x: 0.6, y: 0.5 },
    ]);
    const table = buildArcLengthTable(points);
    const sample = sampleAtDistance(table, table.totalLength + 5);
    expect(sample.position).toEqual(points[points.length - 1]);
  });

  it("heading points roughly toward smaller y for a mostly-forward curve", () => {
    const points = buildWaypointCenterline([
      { x: 0.5, y: 0.8 },
      { x: 0.52, y: 0.5 },
      { x: 0.5, y: 0.2 },
    ]);
    const table = buildArcLengthTable(points);
    const sample = sampleAtDistance(table, table.totalLength / 2);
    expect(Math.abs(sample.headingDeg)).toBeLessThan(45);
  });
});

describe("perpendicularOffset", () => {
  it("returns a vector of exactly the requested magnitude", () => {
    const offset = perpendicularOffset(30, 0.05, 1);
    expect(Math.hypot(offset.x, offset.y)).toBeCloseTo(0.05, 6);
  });

  it("opposite signs produce opposite (mirrored) vectors", () => {
    const left = perpendicularOffset(15, 0.04, -1);
    const right = perpendicularOffset(15, 0.04, 1);
    expect(left.x).toBeCloseTo(-right.x, 9);
    expect(left.y).toBeCloseTo(-right.y, 9);
  });

  it("is perpendicular to the direction of travel (dot product ~0)", () => {
    const headingDeg = 22;
    const travel = { x: Math.sin((headingDeg * Math.PI) / 180), y: -Math.cos((headingDeg * Math.PI) / 180) };
    const offset = perpendicularOffset(headingDeg, 0.05, 1);
    const dot = travel.x * offset.x + travel.y * offset.y;
    expect(Math.abs(dot)).toBeLessThan(1e-9);
  });
});

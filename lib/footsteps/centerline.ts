/**
 * WAYPOINT-DRIVEN ROUTE ARCHITECTURE — the journey is DRAWN FIRST as a
 * smooth, continuous centerline curve through hand-authored 2D waypoints
 * (lib/footsteps's own per-stage JourneyPlan.waypoints — real "start ->
 * turn here -> loop around here -> destination" route design, never an
 * algorithm inventing the shape); footprints/checkpoints/obstacles are
 * placed onto that finished curve afterward by walking along its actual arc
 * length (see pathGenerator.ts), so two points placed N distance apart
 * along the curve are genuinely N apart on screen regardless of how the
 * curve bends.
 *
 * (An earlier version of this file drove the curve from a single "lateral
 * lean vs. linear-forward-progress" model — good for spacing correctness,
 * but structurally incapable of a real loop/U-turn/zigzag, since y could
 * only ever decrease. Full 2D waypoints replace that: any shape a real
 * child could walk is expressible.)
 *
 * No React/browser dependency — pure math, independently unit-testable
 * (see __tests__/centerline.test.ts).
 */

export interface CenterlinePoint {
  x: number;
  y: number;
}

const DEFAULT_RESOLUTION = 300;

function lerpPoint(a: CenterlinePoint, b: CenterlinePoint, t: number): CenterlinePoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** sqrt(distance) "knot spacing" between two consecutive control points — the centripetal parametrization's own weighting (alpha = 0.5), floored above zero so two coincident points never collapse the interpolation into a division by zero. */
function centripetalKnotDelta(a: CenterlinePoint, b: CenterlinePoint): number {
  return Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y)) || 1e-6;
}

/**
 * CENTRIPETAL Catmull-Rom (Barry-Goldman), evaluated at local segment
 * parameter u in [0, 1] between p1 and p2. Unlike the simpler UNIFORM
 * Catmull-Rom (which parametrizes purely by control-point INDEX, ignoring
 * how far apart they actually are), centripetal weights each segment by the
 * square root of its own real distance — the standard, well-documented fix
 * for the "overshoot/cusp past a sharply-turning waypoint" artifact uniform
 * Catmull-Rom produces (confirmed numerically here: an early version of this
 * function sent the curve visibly PAST a waypoint before turning back
 * toward it, right where an authored route turned sharply away from the
 * Start Zone's own straight-ahead direction). Still C1-continuous — the
 * route never has an actual corner — just without the overshoot.
 */
function centripetalCatmullRom(p0: CenterlinePoint, p1: CenterlinePoint, p2: CenterlinePoint, p3: CenterlinePoint, u: number): CenterlinePoint {
  const t0 = 0;
  const t1 = t0 + centripetalKnotDelta(p0, p1);
  const t2 = t1 + centripetalKnotDelta(p1, p2);
  const t3 = t2 + centripetalKnotDelta(p2, p3);
  const t = t1 + u * (t2 - t1);

  const a1 = lerpPoint(p0, p1, (t - t0) / (t1 - t0));
  const a2 = lerpPoint(p1, p2, (t - t1) / (t2 - t1));
  const a3 = lerpPoint(p2, p3, (t - t2) / (t3 - t2));
  const b1 = lerpPoint(a1, a2, (t - t0) / (t2 - t0));
  const b2 = lerpPoint(a2, a3, (t - t1) / (t3 - t1));
  return lerpPoint(b1, b2, (t - t1) / (t2 - t1));
}

/**
 * Builds a fine polyline approximating a smooth 2D centripetal Catmull-Rom
 * curve through `waypoints`, in order — the actual authored route shape
 * (straight, turn, loop, snake, whatever the stage designs), never a
 * generated/guessed one. Endpoints are clamped (duplicated) so the curve
 * doesn't overshoot before the first or after the last waypoint. At least 2
 * waypoints are required; 1 degenerates to a stationary point.
 */
export function buildWaypointCenterline(waypoints: readonly CenterlinePoint[], resolution: number = DEFAULT_RESOLUTION): CenterlinePoint[] {
  if (waypoints.length === 0) return [];
  if (waypoints.length === 1) return [waypoints[0], waypoints[0]];

  const segments = waypoints.length - 1;
  const points: CenterlinePoint[] = [];
  for (let i = 0; i <= resolution; i++) {
    const t = i / resolution;
    const scaled = t * segments;
    const seg = Math.min(Math.floor(scaled), segments - 1);
    const localU = scaled - seg;

    const p0 = waypoints[Math.max(0, seg - 1)];
    const p1 = waypoints[seg];
    const p2 = waypoints[seg + 1];
    const p3 = waypoints[Math.min(waypoints.length - 1, seg + 2)];

    points.push(centripetalCatmullRom(p0, p1, p2, p3, localU));
  }
  return points;
}

/**
 * Uniformly scales a set of waypoints toward/away from `origin` (typically
 * the route's own start point) by `scale` — used to stretch/shrink an
 * authored shape's overall size just enough that its real arc length
 * matches this stage's intended total walking distance (stepCount x
 * spacing), while preserving the authored proportions/silhouette exactly.
 */
export function scaleWaypointsFrom(waypoints: readonly CenterlinePoint[], origin: CenterlinePoint, scale: number): CenterlinePoint[] {
  return waypoints.map((p) => ({ x: origin.x + (p.x - origin.x) * scale, y: origin.y + (p.y - origin.y) * scale }));
}

export interface ArcLengthTable {
  points: readonly CenterlinePoint[];
  /** cumulative[i] = arc length from points[0] to points[i]. Same length as points. */
  cumulative: readonly number[];
  totalLength: number;
}

/** Precomputes cumulative arc length along a polyline — the basis for placing anything a specific WALKING DISTANCE from the start, rather than at an arbitrary parametric position. */
export function buildArcLengthTable(points: readonly CenterlinePoint[]): ArcLengthTable {
  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    cumulative.push(cumulative[i - 1] + Math.hypot(dx, dy));
  }
  return { points, cumulative, totalLength: cumulative[cumulative.length - 1] ?? 0 };
}

export interface CenterlineSample {
  position: CenterlinePoint;
  /** Direction of travel in degrees, 0 = straight ahead (toward smaller y), positive = toward larger x. Matches pathGenerator.ts's existing footRotation convention. */
  headingDeg: number;
}

/**
 * Finds the point (and direction of travel) at a given walked DISTANCE along
 * the table's polyline, linearly interpolating between the two bracketing
 * samples for sub-segment precision. Distance is clamped into
 * [0, totalLength] — a caller asking for slightly more than the curve
 * actually has (float rounding) still gets a sensible answer, never NaN.
 */
export function sampleAtDistance(table: ArcLengthTable, distance: number): CenterlineSample {
  const { points, cumulative, totalLength } = table;
  const target = Math.min(Math.max(distance, 0), totalLength);

  // Binary search for the last cumulative entry <= target.
  let lo = 0;
  let hi = cumulative.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cumulative[mid] <= target) lo = mid;
    else hi = mid - 1;
  }
  const i = Math.min(lo, points.length - 2 < 0 ? 0 : points.length - 2);
  const segStart = cumulative[i];
  const segEnd = cumulative[i + 1] ?? segStart;
  const segLength = segEnd - segStart;
  const localT = segLength > 1e-9 ? (target - segStart) / segLength : 0;

  const a = points[i];
  const b = points[i + 1] ?? a;
  const position: CenterlinePoint = { x: a.x + (b.x - a.x) * localT, y: a.y + (b.y - a.y) * localT };

  const dx = b.x - a.x;
  const dy = b.y - a.y; // negative: travelling toward smaller y (forward/away from the child)
  const headingDeg = dx === 0 && dy === 0 ? 0 : (Math.atan2(dx, -dy) * 180) / Math.PI;

  return { position, headingDeg };
}

/** Unit vector perpendicular to a heading (degrees, same convention as sampleAtDistance) — used to offset a footprint slightly to its own side of the centerline without changing the route itself. */
export function perpendicularOffset(headingDeg: number, distance: number, sign: -1 | 1): CenterlinePoint {
  const headingRad = (headingDeg * Math.PI) / 180;
  // Direction of travel unit vector: (sin(heading), -cos(heading)) per the atan2(dx, -dy) convention above.
  const travelX = Math.sin(headingRad);
  const travelY = -Math.cos(headingRad);
  // Rotate travel vector 90° to get the perpendicular (side) direction.
  const perpX = -travelY * sign;
  const perpY = travelX * sign;
  return { x: perpX * distance, y: perpY * distance };
}

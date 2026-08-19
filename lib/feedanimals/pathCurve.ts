/**
 * SAFARI ANIMAL ADVENTURE — trimmed, feed-animals-local copy of Follow the
 * Footsteps' lib/footsteps/centerline.ts (same "each game owns its own
 * domain, duplicated rather than cross-imported" convention every other
 * shared-shape utility in this codebase already follows — see e.g.
 * components/display/bubblepop/bubbleColors.ts's doc comment). Only the
 * pieces Stage 1's single hand-authored path actually needs: build a smooth
 * centripetal Catmull-Rom curve through waypoints, then sample a
 * position/heading at a given walked distance along it. No PathWidth
 * rescaling, no perpendicular foot-offset — this game's path is one fixed
 * hand-authored shape, not a procedurally-generated-then-corrected one.
 */

export interface CenterlinePoint {
  x: number;
  y: number;
}

const DEFAULT_RESOLUTION = 300;

function lerpPoint(a: CenterlinePoint, b: CenterlinePoint, t: number): CenterlinePoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function centripetalKnotDelta(a: CenterlinePoint, b: CenterlinePoint): number {
  return Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y)) || 1e-6;
}

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

/** Builds a fine polyline approximating a smooth 2D centripetal Catmull-Rom curve through `waypoints`, in order — the real authored trail shape, never a generated/guessed one. At least 2 waypoints required. */
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

export interface ArcLengthTable {
  points: readonly CenterlinePoint[];
  cumulative: readonly number[];
  totalLength: number;
}

/** Precomputes cumulative arc length along a polyline — the basis for placing the monkey at a given WALKED DISTANCE rather than an arbitrary parametric position. */
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
  /** Direction of travel in degrees, 0 = straight ahead (toward smaller y), positive = toward larger x. */
  headingDeg: number;
}

/** Finds the point (and direction of travel) at a given walked DISTANCE along the table's polyline, linearly interpolating for sub-segment precision. Distance is clamped into [0, totalLength]. */
export function sampleAtDistance(table: ArcLengthTable, distance: number): CenterlineSample {
  const { points, cumulative, totalLength } = table;
  const target = Math.min(Math.max(distance, 0), totalLength);

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
  const dy = b.y - a.y;
  const headingDeg = dx === 0 && dy === 0 ? 0 : (Math.atan2(dx, -dy) * 180) / Math.PI;

  return { position, headingDeg };
}

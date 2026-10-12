/**
 * Hex layouts shared by the therapist map (SVG) and the child Display (Three.js).
 *
 * A layout is a list of rows (tile counts), pointy-top hexagons of circumradius 1, +x right, +y down on screen (the
 * Display maps y to scene z, looking straight down). Tile identity is the row-major index. Both surfaces get the
 * SAME layout from `getLayout(tiles, aspect)`, a pure function of the tile count and the projection aspect ratio, so
 * tile N is always in the same place on both devices.
 *
 * The shape (for example 5+4 tiles in two rows, or 4x4) is chosen to fit the projected floor's aspect ratio, so the
 * hexagons can be as large as the floor allows. Adjacency comes from true centre distances, never from a table.
 */
export const SQRT3 = Math.sqrt(3);
/** Tile counts the game uses: STANDARD 9/12/16, EXTRA_LARGE 6/9/12, COMPACT 12/16/20. */
export const TILE_COUNTS = [6, 9, 12, 16, 20] as const;
export type TileCount = (typeof TILE_COUNTS)[number];

export interface Point {
  x: number;
  y: number;
}

export interface Layout {
  tiles: number;
  /** Tiles per row, top to bottom. */
  rows: readonly number[];
  centers: readonly Point[];
  neighbors: readonly (readonly number[])[];
  /** Extent of the drawn hexagons (circumradius 1) around all centres. */
  bounds: { minX: number; maxX: number; minY: number; maxY: number; width: number; height: number };
}

/** Corner points of one hexagon (circumradius `r`) around its centre. */
export function hexCorners(center: Point, r = 1): Point[] {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return { x: center.x + r * Math.cos(a), y: center.y + r * Math.sin(a) };
  });
}

/** Builds a layout from row lengths. Rows are centred; adjacent rows are staggered by half a tile. */
export function buildLayout(rows: readonly number[]): Layout {
  const maxLen = Math.max(...rows);
  const centers: Point[] = [];
  rows.forEach((len, r) => {
    // start offset in half tiles: centres the row, and staggers equal-length neighbours
    const start = maxLen - len + (rows.every((l) => l === rows[0]) ? r % 2 : 0);
    for (let c = 0; c < len; c++) centers.push({ x: SQRT3 * (start / 2 + c), y: 1.5 * r });
  });
  const neighbors = centers.map((a, i) =>
    centers.flatMap((b, j) => (j !== i && Math.abs(Math.hypot(a.x - b.x, a.y - b.y) - SQRT3) < 1e-6 ? [j] : [])),
  );
  const xs = centers.map((p) => p.x);
  const ys = centers.map((p) => p.y);
  const minX = Math.min(...xs) - SQRT3 / 2;
  const maxX = Math.max(...xs) + SQRT3 / 2;
  const minY = Math.min(...ys) - 1;
  const maxY = Math.max(...ys) + 1;
  return { tiles: centers.length, rows, centers, neighbors, bounds: { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY } };
}

/**
 * Candidate row shapes for n tiles: equal rows, or rows alternating between c and c-1 tiles.
 * A shape is kept only if it is safe for the game: connected, and with any single tile warned the remaining tiles are
 * still connected and every warned tile still touches a safe one (so the single-tile fallback of the round generator
 * is always valid and no tile is ever a trap).
 */
export function candidateShapes(n: number): number[][] {
  const shapes: number[][] = [];
  const add = (rows: number[]) => {
    if (rows.length >= 2 && rows.reduce((a, b) => a + b, 0) === n && !shapes.some((s) => s.join() === rows.join())) shapes.push(rows);
  };
  for (let r = 2; r <= 6; r++) {
    for (let c = 2; c <= n; c++) {
      add(Array(r).fill(c));
      add(Array.from({ length: r }, (_, i) => (i % 2 === 0 ? c : c - 1)));
      add(Array.from({ length: r }, (_, i) => (i % 2 === 0 ? c - 1 : c)));
    }
  }
  return shapes.filter((rows) => rows.every((l) => l >= 2) && singleWarnAlwaysSafe(buildLayout(rows)));
}

function connected(layout: Layout, removed: ReadonlySet<number>): boolean {
  const alive: number[] = [];
  for (let t = 0; t < layout.tiles; t++) if (!removed.has(t)) alive.push(t);
  if (!alive.length) return false;
  const seen = new Set<number>([alive[0]]);
  const stack = [alive[0]];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const n of layout.neighbors[cur]) if (!removed.has(n) && !seen.has(n)) { seen.add(n); stack.push(n); }
  }
  return seen.size === alive.length;
}

function singleWarnAlwaysSafe(layout: Layout): boolean {
  if (!connected(layout, new Set())) return false;
  for (let t = 0; t < layout.tiles; t++) {
    if (!layout.neighbors[t].length || !connected(layout, new Set([t]))) return false;
  }
  return true;
}

export interface FitInput {
  /** Width / height of the projected floor (or screen). */
  aspect: number;
  /** Safe margin around the arena, percent of each side (0..15). */
  margin: number;
  /** Arena scale, percent (70..110). */
  scale: number;
}

/** How big the layout gets on a floor of this aspect: the limiting fraction of the screen, in world units per screen unit. */
export function fitFor(layout: Layout, { aspect, margin, scale }: FitInput) {
  const f = Math.max(0.2, (1 - (2 * margin) / 100) * (scale / 100));
  // visible world height (units) so the arena fills fraction f of the limiting side
  const halfH = Math.max(layout.bounds.height / (2 * f), layout.bounds.width / (2 * f * aspect));
  const viewH = 2 * halfH;
  const viewW = viewH * aspect;
  const widthFill = layout.bounds.width / viewW;
  const heightFill = layout.bounds.height / viewH;
  const usable = (1 - (2 * margin) / 100) * (scale / 100);
  return {
    viewW,
    viewH,
    halfH,
    widthFill,
    heightFill,
    /** Arena bounding box as a fraction of the whole projected area. */
    screenCoverage: widthFill * heightFill,
    /** Arena bounding box as a fraction of the usable area (screen minus margins, times scale). */
    usableCoverage: (widthFill * heightFill) / (usable * usable),
    /** Fraction of the screen height one hexagon cell (flat-to-flat, point-to-point) takes. */
    cellPointToPointFrac: 2 / viewH,
    cellFlatToFlatFrac: SQRT3 / viewW,
  };
}

const layoutCache = new Map<string, Layout>();

/** The layout both devices use for `tiles` tiles on a floor of `aspect`: the candidate with the largest hexagons. */
export function getLayout(tiles: number, aspect: number): Layout {
  const a = Math.round(Math.max(0.6, Math.min(3, aspect)) * 1000) / 1000;
  const key = `${tiles}:${a}`;
  const hit = layoutCache.get(key);
  if (hit) return hit;
  let best: Layout | null = null;
  let bestScale = -1;
  for (const rows of candidateShapes(tiles)) {
    const layout = buildLayout(rows);
    // hexagon size is proportional to this: the larger it is, the larger every tile is on screen
    const s = Math.min(a / layout.bounds.width, 1 / layout.bounds.height);
    if (s > bestScale + 1e-9) { bestScale = s; best = layout; }
  }
  if (!best) throw new Error(`No safe layout for ${tiles} tiles`);
  layoutCache.set(key, best);
  return best;
}

export const ASPECT_PRESETS = { '16:9': 16 / 9, '16:10': 16 / 10, '4:3': 4 / 3, '21:9': 21 / 9 } as const;
export type AspectPreset = keyof typeof ASPECT_PRESETS;

export interface FloorCalibration {
  /** Therapist-entered projected floor size in centimetres, or 0 when not entered. */
  floorWidthCm: number;
  floorHeightCm: number;
}

/**
 * Estimated physical size of the drawn hexagons, from the projected floor size the therapist entered.
 * This is an ESTIMATE from entered numbers, never a verified measurement.
 */
export function physicalEstimate(layout: Layout, fit: ReturnType<typeof fitFor>, cal: FloorCalibration) {
  if (!(cal.floorWidthCm > 0 && cal.floorHeightCm > 0)) return null;
  const cmPerUnitX = cal.floorWidthCm / fit.viewW;
  const cmPerUnitY = cal.floorHeightCm / fit.viewH;
  const cmPerUnit = (cmPerUnitX + cmPerUnitY) / 2;
  const cell = SQRT3 * cmPerUnit; // flat-to-flat of one cell
  const BODY = 0.93; // drawn tile body radius relative to the cell
  return {
    cellFlatToFlatCm: cell,
    tileFlatToFlatCm: cell * BODY,
    tilePointToPointCm: 2 * BODY * cmPerUnit,
    gapCm: cell * (1 - BODY),
    arenaWidthCm: layout.bounds.width * cmPerUnit,
    arenaHeightCm: layout.bounds.height * cmPerUnit,
    /** Both axes should agree when the entered floor size has the same aspect as the display; otherwise tiles are stretched. */
    axisMismatchPct: (Math.abs(cmPerUnitX - cmPerUnitY) / cmPerUnit) * 100,
  };
}

/**
 * The floor world of Follow the Footsteps 3D and its stepping-stone paths.
 *
 * The child Display is a top-down view of a flat floor. World units: the floor is `WORLD_H` tall and `WORLD_H * aspect`
 * wide, x to the right, y DOWN on screen (the Display maps y to scene z). Control and Display call the SAME
 * `buildPath(...)` with the same shared state, so stone N is in the same place on both. Everything is a pure function of
 * (stage, seed, config), so a reload reproduces the identical path.
 */
import { hashSeed, mulberry32 } from './rng';

export const WORLD_H = 10;
/** One step never exceeds this share of the floor height (about 70 cm on a 180 cm tall floor). */
export const MAX_SPACING_FRAC = 0.4;
/** Stone radius never exceeds this share of the floor height. */
export const MAX_RADIUS_FRAC = 0.2;

export type PatternKind = 'hops' | 'straight' | 'zigzag' | 'alternate' | 'curve' | 'varied' | 'memory' | 'combined';
export type Foot = 'LEFT' | 'RIGHT';

export interface Point {
  x: number;
  y: number;
}

export interface Stone extends Point {
  index: number;
  /** Foot cue for the alternating-feet stage, otherwise null (a neutral "step here" footprint). */
  foot: Foot | null;
  /** Decorative irregularity seed for the outline (never affects gameplay). */
  shape: number;
}

export interface PathInput {
  stage: number;
  seed: number;
  aspect: number;
  /** Safe margin around the usable floor area, percent of each side (0..15). */
  margin: number;
  /** Stone size multiplier, percent (70..120). */
  stoneScale: number;
  /** Distance between consecutive stones as a share of the largest comfortable distance, percent (60..100). */
  spacing: number;
  /** How much of the usable floor the whole path may span, percent (50..100). */
  reach: number;
}

export interface FloorPath {
  worldW: number;
  worldH: number;
  /** Usable rectangle (inside the safe margins) where stones may be. */
  usable: { x0: number; y0: number; x1: number; y1: number };
  stones: Stone[];
  radius: number;
  /** Smallest distance between two stone centres. */
  minDistance: number;
  /** Largest distance between consecutive stones. */
  maxStep: number;
  pattern: PatternKind;
}

export const PATTERNS: readonly PatternKind[] = ['hops', 'straight', 'zigzag', 'alternate', 'curve', 'varied', 'memory', 'combined'];

/** Unit-spacing points along +x for each pattern. `rng` only varies orientation and the random walk. */
function unitPoints(kind: PatternKind, n: number, rng: () => number): Point[] {
  const pts: Point[] = [];
  switch (kind) {
    case 'hops':
      return [{ x: 0, y: 0 }, { x: 1, y: 0.2 }, { x: 1.1, y: 1.2 }, { x: 0.1, y: 1.4 }].slice(0, n);
    case 'straight':
      for (let i = 0; i < n; i++) pts.push({ x: i, y: 0 });
      return pts;
    case 'zigzag':
      for (let i = 0; i < n; i++) pts.push({ x: 0.9 * i, y: i % 2 ? 0.5 : -0.5 });
      return pts;
    case 'alternate':
      for (let i = 0; i < n; i++) pts.push({ x: 0.85 * i, y: i % 2 ? 0.32 : -0.32 });
      return pts;
    case 'curve':
      for (let i = 0; i < n; i++) pts.push({ x: 0.95 * i, y: 0.9 * Math.sin(i * 0.55) });
      return pts;
    case 'memory': {
      // pairs of stones: each pair is a short zigzag, pairs advance along the path
      for (let k = 0; k < Math.ceil(n / 2); k++) {
        pts.push({ x: k * 2.0, y: -0.5 });
        if (pts.length < n) pts.push({ x: k * 2.0 + 0.95, y: 0.5 });
      }
      return pts.slice(0, n);
    }
    case 'combined': {
      // straight, then a gentle curve, then a zigzag: patterns the child has already met
      const straight = Math.max(2, Math.floor(n * 0.3));
      const curve = Math.max(3, Math.floor(n * 0.4));
      for (let i = 0; i < straight; i++) pts.push({ x: i, y: 0 });
      for (let j = 1; j <= curve; j++) pts.push({ x: straight - 1 + 0.95 * j, y: 0.9 * Math.sin(j * 0.55) });
      const last = pts[pts.length - 1];
      for (let k = 1; pts.length < n; k++) pts.push({ x: last.x + 0.9 * k, y: last.y + (k % 2 ? 0.5 : -0.5) });
      return pts.slice(0, n);
    }
    case 'varied': {
      // a weaving walk that keeps heading to the right, with turns of at most 35 degrees per step
      let heading = 0;
      let p: Point = { x: 0, y: 0 };
      pts.push(p);
      for (let i = 1; i < n; i++) {
        heading = Math.max(-0.85, Math.min(0.85, heading + (rng() - 0.5) * 1.2));
        const len = 0.95 + rng() * 0.15;
        p = { x: p.x + Math.cos(heading) * len, y: p.y + Math.sin(heading) * len };
        pts.push(p);
      }
      return pts;
    }
  }
}

function minPairDistance(pts: readonly Point[]): number {
  let m = Infinity;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) m = Math.min(m, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
  return m;
}

/** Builds the path of a stage for the given floor, margins and therapist settings. Deterministic. */
export function buildPath(pattern: PatternKind, steps: number, input: PathInput): FloorPath {
  const worldH = WORLD_H;
  const worldW = WORLD_H * input.aspect;
  const m = input.margin / 100;
  const usable = { x0: worldW * m, y0: worldH * m, x1: worldW * (1 - m), y1: worldH * (1 - m) };
  const uW = usable.x1 - usable.x0;
  const uH = usable.y1 - usable.y0;

  // random walks are retried until no two stones crowd each other
  let unit: Point[] = [];
  let flip = 1;
  for (let attempt = 0; attempt < 40; attempt++) {
    const rng = mulberry32(hashSeed(input.seed, input.stage, attempt));
    flip = rng() < 0.5 ? -1 : 1;
    unit = unitPoints(pattern, steps, rng);
    if (pattern !== 'varied' || minPairDistance(unit) >= 0.9) break;
  }
  unit = unit.map((p) => ({ x: p.x, y: p.y * flip }));
  const xs = unit.map((p) => p.x);
  const ys = unit.map((p) => p.y);
  const bw = Math.max(...xs) - Math.min(...xs);
  const bh = Math.max(...ys) - Math.min(...ys);
  const ss = input.stoneScale / 100;

  // largest scale at which the path plus the stone radius (0.45 of the spacing) fits the usable area
  const fitW = uW / (bw + 2 * 0.45 * ss);
  const fitH = uH / (bh + 2 * 0.45 * ss);
  // the longest consecutive step of the pattern (diagonal steps are longer than the unit spacing) never exceeds the cap
  let unitMaxStep = 1;
  for (let i = 1; i < unit.length; i++) unitMaxStep = Math.max(unitMaxStep, Math.hypot(unit[i].x - unit[i - 1].x, unit[i].y - unit[i - 1].y));
  const sFit = Math.min(fitW, fitH, (MAX_SPACING_FRAC * worldH) / unitMaxStep);
  const s = sFit * Math.min(input.spacing / 100, input.reach / 100);

  const cx = (usable.x0 + usable.x1) / 2;
  const cy = (usable.y0 + usable.y1) / 2;
  const mx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const my = (Math.max(...ys) + Math.min(...ys)) / 2;
  const stones: Stone[] = unit.map((p, i) => ({
    index: i,
    x: cx + (p.x - mx) * s,
    y: cy + (p.y - my) * s,
    foot: pattern === 'alternate' ? (i % 2 === 0 ? 'RIGHT' : 'LEFT') : null,
    shape: hashSeed(input.seed, input.stage, i, 7) % 1000,
  }));
  const minDistance = minPairDistance(stones);
  const radius = Math.min(0.45 * sFit * ss, 0.44 * minDistance, MAX_RADIUS_FRAC * worldH);
  let maxStep = 0;
  for (let i = 1; i < stones.length; i++) maxStep = Math.max(maxStep, Math.hypot(stones[i].x - stones[i - 1].x, stones[i].y - stones[i - 1].y));
  return { worldW, worldH, usable, stones, radius, minDistance, maxStep, pattern };
}

export interface PathIssue {
  kind: 'outside' | 'overlap' | 'too-far' | 'too-near' | 'count';
  index?: number;
}

/**
 * The safety contract of a path (checked for every stage in the tests, and again when a record is validated):
 * every stone circle lies inside the usable area, no two stones overlap, no step is a long-distance relocation,
 * and consecutive stones are never so close that they merge.
 */
export function checkPath(path: FloorPath, expectedSteps: number): PathIssue[] {
  const issues: PathIssue[] = [];
  if (path.stones.length !== expectedSteps) issues.push({ kind: 'count' });
  const { usable, radius } = path;
  for (const s of path.stones) {
    if (s.x - radius < usable.x0 - 1e-6 || s.x + radius > usable.x1 + 1e-6 || s.y - radius < usable.y0 - 1e-6 || s.y + radius > usable.y1 + 1e-6) issues.push({ kind: 'outside', index: s.index });
  }
  for (let i = 0; i < path.stones.length; i++) {
    for (let j = i + 1; j < path.stones.length; j++) {
      if (Math.hypot(path.stones[i].x - path.stones[j].x, path.stones[i].y - path.stones[j].y) < 2 * radius * 1.04) issues.push({ kind: 'overlap', index: i });
    }
  }
  for (let i = 1; i < path.stones.length; i++) {
    const d = Math.hypot(path.stones[i].x - path.stones[i - 1].x, path.stones[i].y - path.stones[i - 1].y);
    if (d > MAX_SPACING_FRAC * path.worldH * 1.001) issues.push({ kind: 'too-far', index: i });
    if (d < 2 * radius * 1.04) issues.push({ kind: 'too-near', index: i });
  }
  return issues;
}

/** Physical estimate from the projected floor size the therapist entered. An ESTIMATE, never a verified measurement. */
export function physicalEstimate(path: FloorPath, floorWidthCm: number, floorHeightCm: number) {
  if (!(floorWidthCm > 0 && floorHeightCm > 0)) return null;
  const cmX = floorWidthCm / path.worldW;
  const cmY = floorHeightCm / path.worldH;
  const cm = (cmX + cmY) / 2;
  return {
    stoneDiameterCm: 2 * path.radius * cm,
    stepDistanceCm: path.maxStep * cm,
    gapCm: (path.minDistance - 2 * path.radius) * cm,
    pathWidthCm: (Math.max(...path.stones.map((s) => s.x)) - Math.min(...path.stones.map((s) => s.x)) + 2 * path.radius) * cm,
    pathHeightCm: (Math.max(...path.stones.map((s) => s.y)) - Math.min(...path.stones.map((s) => s.y)) + 2 * path.radius) * cm,
    /** Non-zero when the entered floor has a different shape than the projector image: stones would look stretched. */
    axisMismatchPct: (Math.abs(cmX - cmY) / cm) * 100,
  };
}

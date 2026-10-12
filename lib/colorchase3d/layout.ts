/**
 * The floor layout of the color zones.
 *
 * The Display is a top-down view of a flat floor. World units: the floor is `WORLD_H` tall and `WORLD_H * aspect` wide,
 * x to the right, y DOWN on screen. Control and Display call the SAME `buildLayout(...)` with the same shared state, so zone
 * N is in the same place on both. Everything is a pure function of (layout kind, count, config), so a reload reproduces it.
 *
 * Safety rules the layout always enforces (see `checkLayout`): every zone lies fully inside the safe projection area,
 * no two zones overlap (a clear gap remains), and no two zones are further apart than a comfortable reach.
 */
import type { ColorId } from './colors';
import { hashSeed, mulberry32 } from './rng';
import type { LayoutKind } from './stages';

export const WORLD_H = 10;
/** The largest distance between any two zone centres, as a share of the floor height (about 1.4 m on a 180 cm floor: a few small steps). */
export const MAX_PAIR_FRAC = 0.8;
/** A winding garden path is longer end to end, but each step along it stays short. */
export const MAX_PATH_PAIR_FRAC = 1.1;
export const MAX_PATH_STEP_FRAC = 0.45;
export const maxPairFrac = (kind: LayoutKind) => (kind === 'path' ? MAX_PATH_PAIR_FRAC : MAX_PAIR_FRAC);
/** Clear gap between neighbouring zones: centre distance is at least this many radii times two. */
export const GAP_FACTOR = 1.2;
const BASE_RADIUS: Record<number, number> = { 2: 2.2, 3: 1.95, 4: 1.7, 5: 1.5 };

export interface Pt {
  x: number;
  y: number;
}

export interface LayoutInput {
  aspect: number;
  margin: number;
  zoneScale: number;
  spacing: number;
  reach: number;
}

export interface Layout {
  worldW: number;
  worldH: number;
  usable: { x0: number; y0: number; x1: number; y1: number };
  slots: Pt[];
  radius: number;
  minDistance: number;
  maxDistance: number;
  kind: LayoutKind;
}

function unitPoints(kind: LayoutKind, n: number): Pt[] {
  if (n <= 2) return [{ x: -1, y: 0 }, { x: 1, y: 0 }];
  if (kind === 'path') {
    return Array.from({ length: n }, (_, i) => ({ x: -1.9 + (3.8 * i) / (n - 1), y: i % 2 ? -0.5 : 0.5 }));
  }
  if (n === 3) return [{ x: -1.25, y: 0.35 }, { x: 0, y: -0.45 }, { x: 1.25, y: 0.35 }];
  if (n === 4) return [{ x: 0, y: -1 }, { x: 1.4, y: 0 }, { x: 0, y: 1 }, { x: -1.4, y: 0 }];
  return Array.from({ length: n }, (_, k) => {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / n;
    return { x: Math.cos(a) * 1.3, y: Math.sin(a) * 0.95 };
  });
}

function pairStats(pts: Pt[]) {
  let min = Infinity, max = 0;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
    min = Math.min(min, d);
    max = Math.max(max, d);
  }
  return { min, max };
}

export function buildLayout(kind: LayoutKind, count: number, input: LayoutInput): Layout {
  const n = Math.max(2, Math.min(5, count));
  const worldH = WORLD_H;
  const worldW = WORLD_H * input.aspect;
  const m = input.margin / 100;
  const usable = { x0: worldW * m, y0: worldH * m, x1: worldW * (1 - m), y1: worldH * (1 - m) };
  const uW = usable.x1 - usable.x0, uH = usable.y1 - usable.y0;
  const unit = unitPoints(kind, n);
  const xs = unit.map((p) => p.x), ys = unit.map((p) => p.y);
  const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
  const { min: dmin, max: dmax } = pairStats(unit);
  const maxPair = maxPairFrac(kind) * worldH;
  let unitStep = 1;
  if (kind === 'path' && n > 2) for (let i = 1; i < unit.length; i++) unitStep = Math.max(unitStep, Math.hypot(unit[i].x - unit[i - 1].x, unit[i].y - unit[i - 1].y));

  let r = BASE_RADIUS[n] * (input.zoneScale / 100);
  r = Math.min(r, (Math.min(uW, uH) / 2) * 0.98);
  let sMax = 0, sMin = 0;
  for (let i = 0; i < 40; i++) {
    sMax = Math.min((uW - 2 * r) / Math.max(bw, 0.001), (uH - 2 * r) / Math.max(bh, 0.001), maxPair / dmax, kind === 'path' && n > 2 ? (MAX_PATH_STEP_FRAC * worldH) / unitStep : Infinity);
    sMin = (2 * r * GAP_FACTOR) / dmin;
    if (sMin <= sMax) break;
    r *= 0.96;
  }
  // the therapist's spacing / reach sliders move the zones between the smallest clear gap and the widest comfortable spread
  const t = Math.min(input.spacing, input.reach) / 100;
  const frac = Math.max(0, Math.min(1, (t - 0.5) / 0.5));
  const s = Math.max(0.0001, sMin + (sMax - sMin) * (0.35 + 0.65 * frac));
  const cx = (usable.x0 + usable.x1) / 2, cy = (usable.y0 + usable.y1) / 2;
  const mx = (Math.max(...xs) + Math.min(...xs)) / 2, my = (Math.max(...ys) + Math.min(...ys)) / 2;
  const slots = unit.map((p) => ({ x: cx + (p.x - mx) * s, y: cy + (p.y - my) * s }));
  const st = pairStats(slots);
  return { worldW, worldH, usable, slots, radius: r, minDistance: st.min, maxDistance: st.max, kind };
}

/** Empty list = the layout is safe. */
export function checkLayout(l: Layout): string[] {
  const out: string[] = [];
  const e = 1e-6;
  for (const p of l.slots) {
    if (p.x - l.radius < l.usable.x0 - e || p.x + l.radius > l.usable.x1 + e || p.y - l.radius < l.usable.y0 - e || p.y + l.radius > l.usable.y1 + e) out.push('outside-safe-area');
  }
  if (l.slots.length > 1 && l.minDistance < 2 * l.radius * 1.15) out.push('overlap');
  if (l.maxDistance > maxPairFrac(l.kind) * l.worldH + 1e-6) out.push('too-far');
  if (l.kind === 'path' && l.slots.length > 2) {
    for (let i = 1; i < l.slots.length; i++) if (Math.hypot(l.slots[i].x - l.slots[i - 1].x, l.slots[i].y - l.slots[i - 1].y) > MAX_PATH_STEP_FRAC * l.worldH + 1e-6) out.push('step-too-far');
  }
  return [...new Set(out)];
}

/** Which color sits in which slot for a round. Zones trade places only between rounds; round 0 is the stage's own order. */
export function assignment(stage: number, seed: number, round: number, colors: readonly ColorId[], shuffle: boolean): ColorId[] {
  if (!shuffle || round === 0) return [...colors];
  const permute = (r: number) => {
    const out = [...colors];
    const rng = mulberry32(hashSeed(seed, stage, r));
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  const prev = assignment(stage, seed, round - 1, colors, shuffle);
  let cur = permute(round);
  // the zones must visibly trade places: if the shuffle landed on the previous arrangement, rotate by one
  if (cur.every((c, i) => c === prev[i])) cur = cur.map((_, i) => cur[(i + 1) % cur.length]);
  return cur;
}

/** Therapist-facing physical estimate; only as good as the centimetres entered. */
export function physicalEstimate(l: Layout, widthCm: number, heightCm: number) {
  if (!(widthCm > 0 && heightCm > 0)) return null;
  const cmX = widthCm / l.worldW, cmY = heightCm / l.worldH;
  const cm = (cmX + cmY) / 2;
  return {
    zoneDiameterCm: 2 * l.radius * cm,
    minGapCm: Math.max(0, (l.minDistance - 2 * l.radius) * cm),
    maxDistanceCm: l.maxDistance * cm,
    spanWidthCm: (Math.max(...l.slots.map((p) => p.x)) - Math.min(...l.slots.map((p) => p.x)) + 2 * l.radius) * cmX,
    spanHeightCm: (Math.max(...l.slots.map((p) => p.y)) - Math.min(...l.slots.map((p) => p.y)) + 2 * l.radius) * cmY,
    axisMismatchPct: (Math.abs(cmX - cmY) / Math.max(cmX, cmY)) * 100,
  };
}

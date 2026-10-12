/**
 * Stage geometry. The stage is a 16:9 surface. Positions use the same units
 * as the CSS: x in cqw (percent of width), y in cqh (percent of height).
 * Hit testing converts everything to ONE isotropic unit (cqh) so a circle is a
 * circle: x_iso = x_cqw * 16 / 9.
 */
import { hashSeed, mulberry32 } from "./rng";
import type { Balloon, ResolvedStage, Slot } from "./types";
import { LAYOUT_TUNING } from "./stages";

export const ASPECT = 16 / 9;
export const START_Y = 112; // cqh — top edge of a freshly spawned balloon, fully below the stage
export const END_Y = -40; // cqh — fully above the stage for every size
export const TRAVEL_CQH = START_Y - END_Y;
export const GAP_X = 2.5; // cqw
export const GAP_Y = 3; // cqh

/** SVG aspect: 100 x 150, body centre at 58/100 of the width from the top edge. */
export const widthCqw = (sizeCqh: number) => sizeCqh / ASPECT;
export const heightCqh = (sizeCqh: number) => sizeCqh * 1.5;
export const BODY_CENTRE_FROM_TOP = 0.58; // x sizeCqh
export const BODY_RADIUS = 0.5; // x sizeCqh

export interface Circle {
  /** Isotropic (cqh) coordinates. */
  cx: number;
  cy: number;
  r: number;
}

export const toIso = (xCqw: number) => xCqw * ASPECT;
/** Normalised pointer (0..1 of the stage) to isotropic coordinates. */
export const pointerToIso = (nx: number, ny: number) => ({ x: nx * 100 * ASPECT, y: ny * 100 });

export function riseSpeedCqhPerSec(spec: Pick<ResolvedStage, "riseSeconds">): number {
  return TRAVEL_CQH / spec.riseSeconds;
}

/** Top edge (cqh) of a balloon at simulation time `t`. Pure function of the clock for rising balloons. */
export function balloonTop(b: Pick<Balloon, "topY" | "spawnedAtMs">, spec: ResolvedStage, t: number): number {
  if (spec.motion === "static") return b.topY;
  return START_Y - ((t - b.spawnedAtMs) / 1000) * riseSpeedCqhPerSec(spec);
}

export function balloonBody(b: Pick<Balloon, "x" | "topY" | "spawnedAtMs">, spec: ResolvedStage, t: number, tolerance = 0): Circle {
  const top = balloonTop(b, spec, t);
  return { cx: toIso(b.x), cy: top + BODY_CENTRE_FROM_TOP * spec.sizeCqh, r: BODY_RADIUS * spec.sizeCqh * (1 + tolerance) };
}

/** A balloon can be touched only while its body is on the visible stage. */
export function isOnStage(b: Pick<Balloon, "x" | "topY" | "spawnedAtMs">, spec: ResolvedStage, t: number): boolean {
  const c = balloonBody(b, spec, t);
  return c.cy >= 3 && c.cy <= 97 && b.x >= 3 && b.x <= 97;
}

export function circleContains(c: Circle, px: number, py: number): boolean {
  return Math.hypot(px - c.cx, py - c.cy) <= c.r;
}

function placeSlotsOnce(seed: number, count: number, sizeCqh: number, layout: ResolvedStage["layout"]): Slot[] {
  const rng = mulberry32(seed);
  const t = LAYOUT_TUNING[layout];
  const w = widthCqw(sizeCqh);
  const h = heightCqh(sizeCqh);
  const xMin = t.xMargin + w / 2;
  const xMax = 100 - t.xMargin - w / 2;
  const yMin = t.yTop + h / 2;
  const yMax = t.yBottom - h / 2;
  // Balloons are tall, so the area holds a few loose rows. Positions vary
  // within and between rows; the row spacing guarantees no vertical overlap.
  const span = Math.max(0, yMax - yMin);
  const rows = Math.max(1, Math.floor(span / (h + GAP_Y)) + 1);
  const spacing = rows > 1 ? span / (rows - 1) : 0;
  const jitter = rows > 1 ? Math.min(6, Math.max(0, (spacing - (h + GAP_Y)) / 2)) : Math.min(6, span / 2);
  const slots: Slot[] = [];
  for (let i = 0; i < count; i++) {
    let best: Slot | null = null;
    let bestScore = -1;
    for (let attempt = 0; attempt < 80; attempt++) {
      const row = Math.floor(rng() * rows);
      const centre = rows > 1 ? yMin + row * spacing : (yMin + yMax) / 2;
      const cand = { x: xMin + rng() * Math.max(0, xMax - xMin), y: Math.min(yMax, Math.max(yMin, centre + (rng() * 2 - 1) * jitter)) }; // clamped: never outside the safe area
      let score = Infinity;
      let clash = false;
      for (const s of slots) {
        const dx = Math.abs(s.x - cand.x);
        const dy = Math.abs(s.y - cand.y);
        if (dx < w + GAP_X && dy < h + GAP_Y) {
          clash = true;
          break;
        }
        score = Math.min(score, Math.hypot(dx / (w + GAP_X), dy / (h + GAP_Y)));
      }
      if (!clash && score > bestScore) {
        best = cand;
        bestScore = score;
      }
    }
    if (!best) break;
    slots.push(best);
  }
  return slots;
}

/** Seeded, non-overlapping static slots; retries nearby seeds until `count` fit. */
export function placeSlots(seed: number, count: number, sizeCqh: number, layout: ResolvedStage["layout"]): Slot[] {
  let best: Slot[] = [];
  for (let k = 0; k < 24; k++) {
    const slots = placeSlotsOnce(hashSeed(seed, k), count, sizeCqh, layout);
    if (slots.length === count) return slots;
    if (slots.length > best.length) best = slots;
  }
  return best;
}

/** Centre of the whole svg box (balloon + string) -> top edge. */
export const topFromSlot = (slot: Slot, sizeCqh: number) => slot.y - heightCqh(sizeCqh) / 2;

/**
 * FLOOR / WALL coordinate mapping. Pointers arrive normalised to the PROJECTED
 * IMAGE (x right, y down, 0..1). For a wall that is the child's view. For a
 * floor projection the image's bottom edge is the edge nearest the child; if
 * an installation projects the image rotated or mirrored relative to that,
 * `FloorOrientation` states it explicitly and this maps source -> image.
 */
export type FloorOrientation = { rotateQuarterTurns: 0 | 1 | 2 | 3; mirrorX: boolean };
export const IDENTITY_ORIENTATION: FloorOrientation = { rotateQuarterTurns: 0, mirrorX: false };

export function mapToImage(p: { x: number; y: number }, o: FloorOrientation = IDENTITY_ORIENTATION): { x: number; y: number } {
  let { x, y } = p;
  if (o.mirrorX) x = 1 - x;
  for (let i = 0; i < o.rotateQuarterTurns; i++) [x, y] = [1 - y, x];
  return { x, y };
}

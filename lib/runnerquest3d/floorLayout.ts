/**
 * FLOOR projection geometry. Pure and renderer-free so aspect ratio, safe margins, target sizes and region spacing
 * can be unit-tested. World units are arbitrary; 1 unit ~ one comfortable stride at typical projector scale. The
 * Display scales the whole frustum to the canvas, so the physical size on the floor is decided by the projector
 * installation, not by this file (no physical calibration is claimed).
 */
import type { FloorCalibration, Lane, Level3 } from "./types";

/** Radius of one floor region. All presets are large; nothing is ever small. */
export const PAD_RADIUS: Record<Level3, number> = { low: 1.35, normal: 1.65, high: 2.0 };
/** Clear gap between two neighbouring regions: the therapist's "movement range". */
export const PAD_GAP: Record<Level3, number> = { low: 0.5, normal: 1.2, high: 2.2 };
/** Distance along the path between two waypoints. */
export const ROW_SPACING = 5.6;
/** Preferred visible height of the playfield, world units. */
export const BASE_VIEW_HEIGHT = 11.5;
/** Where the current waypoint sits in the view: 0 = bottom edge, 1 = top edge. */
export const CURRENT_ROW_POSITION = 0.3;

export const padRadius = (cal: Pick<FloorCalibration, "pad">): number => PAD_RADIUS[cal.pad];
/** Centre-to-centre distance between neighbouring regions. */
export const regionSpacing = (cal: Pick<FloorCalibration, "pad" | "range">): number => 2 * PAD_RADIUS[cal.pad] + PAD_GAP[cal.range];
export const regionX = (region: Lane, cal: Pick<FloorCalibration, "pad" | "range">): number => region * regionSpacing(cal);
/** Width the three regions occupy, edge to edge. */
export const playfieldWidth = (cal: Pick<FloorCalibration, "pad" | "range">): number => 2 * regionSpacing(cal) + 2 * PAD_RADIUS[cal.pad];

export interface Frustum {
  /** Full visible width/height in world units (after safe margins). */
  width: number;
  height: number;
  /** Visible area that must stay free of anything the child needs: inside the safe margin. */
  safe: { width: number; height: number };
}

/**
 * Orthographic frustum for a canvas of `aspect` (width / height). It is NEVER stretched: width = height * aspect.
 * The playfield (three regions) plus the safe margin on both sides always fits, however narrow the projector's aspect.
 */
export function frustumFor(aspect: number, cal: Pick<FloorCalibration, "pad" | "range" | "margin">): Frustum {
  const a = Number.isFinite(aspect) && aspect > 0.2 ? aspect : 16 / 9;
  const keep = Math.max(0.5, 1 - 2 * cal.margin); // share of the canvas that is "safe"
  const needW = playfieldWidth(cal) + 1.2;
  const safeHeight = Math.max(BASE_VIEW_HEIGHT, needW / a); // the safe area has the canvas aspect and always holds the three regions
  const height = safeHeight / keep; // the full view adds the margin around it
  return { width: height * a, height, safe: { width: safeHeight * a, height: safeHeight } };
}

/** World z of waypoint `i` (the path runs toward -z, which is up on screen). */
export const rowZ = (i: number): number => 0 - i * ROW_SPACING;

/** World z the camera centres on for a (possibly fractional) progress index: the current row sits low, the road ahead stays visible. */
export function cameraZ(progress: number, frustum: Pick<Frustum, "height">): number {
  return rowZ(progress) - (0.5 - CURRENT_ROW_POSITION) * frustum.height;
}

/** Grid spacing in world units. With a measured projected width the cells are 50 cm; otherwise ten columns. */
export function gridCell(frustum: Pick<Frustum, "width">, cal: Pick<FloorCalibration, "widthCm">): number {
  return cal.widthCm > 0 ? (frustum.width * (50 / cal.widthCm)) : frustum.width / 10;
}

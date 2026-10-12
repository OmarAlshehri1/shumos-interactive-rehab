/**
 * Deterministic scenery placement for the FLOOR journey (pure, renderer-free).
 * Everything here is purely decorative and is placed OUTSIDE the clear zone around the three regions and the path,
 * so nothing the child should look at or step toward is ever hidden behind (or confused with) scenery.
 */
import { hashSeed, mulberry32 } from "./rng";
import { padRadius, playfieldWidth, ROW_SPACING } from "./floorLayout";
import type { FloorCalibration, StageSpec } from "./types";

export type DecorKind = "tree" | "pine" | "bush" | "flower" | "rock" | "lantern" | "banner" | "snow";
export interface DecorItem { kind: DecorKind; x: number; z: number; s: number; tint: number }

/** Extra clear space beyond the outer edge of the left/right regions. */
export const CLEAR_MARGIN = 2.6;

/** Half-width of the area that must stay free of scenery: regions + their rims + margin. */
export const clearHalfWidth = (cal: Pick<FloorCalibration, "pad" | "range">): number => playfieldWidth(cal) / 2 + CLEAR_MARGIN;

const COUNTS: Record<StageSpec["theme"], Partial<Record<DecorKind, number>>> = {
  meadow: { tree: 10, bush: 12, flower: 40, rock: 3 },
  garden: { tree: 9, bush: 18, flower: 60, rock: 2 },
  trail: { tree: 11, bush: 10, flower: 28, rock: 8 },
  lake: { tree: 8, bush: 10, flower: 30, rock: 5 },
  forest: { tree: 12, pine: 18, bush: 12, flower: 14, rock: 4 },
  sunset: { tree: 9, bush: 10, flower: 32, rock: 5, lantern: 6 },
  summit: { pine: 10, rock: 18, snow: 10, bush: 4, flower: 10 },
  river: { tree: 9, bush: 12, flower: 34, rock: 5 },
  festival: { tree: 8, bush: 12, flower: 40, lantern: 14, banner: 10, rock: 2 },
};

/**
 * `totalRows` waypoints plus the start plaza and destination: scenery spans the whole route. `density` (0.4 - 1) thins
 * the scenery on low quality settings without changing where the remaining items sit.
 */
export function decorFor(theme: StageSpec["theme"], stageIndex: number, seed: number, totalRows: number, cal: Pick<FloorCalibration, "pad" | "range">, density = 1): DecorItem[] {
  const rnd = mulberry32(hashSeed("rq3f-deco", stageIndex, seed));
  const clear = clearHalfWidth(cal);
  const zNear = 14, zFar = -(totalRows * ROW_SPACING) - 18;
  const span = zNear - zFar;
  const out: DecorItem[] = [];
  const per = COUNTS[theme];
  for (const kind of Object.keys(per) as DecorKind[]) {
    // counts are per ~10 rows of route so longer stages stay evenly dressed
    const n = Math.round(((per[kind] ?? 0) * span) / (10 * ROW_SPACING) * density);
    for (let i = 0; i < n; i++) {
      const side = rnd() < 0.5 ? -1 : 1;
      const reach = kind === "tree" || kind === "pine" ? 1.2 + rnd() * 9 : kind === "lantern" || kind === "banner" ? 0.2 + rnd() * 1.4 : 0.3 + rnd() * 7.5;
      const radius = kind === "tree" || kind === "pine" ? 1.7 : 0.9;
      const x = side * (clear + radius * 0.9 + reach);
      out.push({ kind, x, z: zFar + rnd() * span, s: 0.75 + rnd() * 0.7, tint: rnd() });
    }
  }
  return out;
}

/** Pond (lake) / river centre and size, outside the clear zone. null when the theme has none. */
export function waterFor(theme: StageSpec["theme"], totalRows: number, cal: Pick<FloorCalibration, "pad" | "range">): { x: number; z: number; w: number; d: number; round: boolean } | null {
  const clear = clearHalfWidth(cal);
  const length = totalRows * ROW_SPACING + 32;
  if (theme === "lake") return { x: -(clear + 5.5), z: -(totalRows * ROW_SPACING) / 2, w: 7, d: Math.min(26, length * 0.4), round: true };
  if (theme === "river") return { x: clear + 4.2, z: -(totalRows * ROW_SPACING) / 2 + 2, w: 4.4, d: length, round: false };
  return null;
}

export const PATH_EXTRA = 1.1;
/** Half-width of the stone path under the regions. */
export const pathHalfWidth = (cal: Pick<FloorCalibration, "pad" | "range">): number => playfieldWidth(cal) / 2 + PATH_EXTRA + padRadius({ pad: cal.pad }) * 0.1;

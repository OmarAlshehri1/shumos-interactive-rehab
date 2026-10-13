/** Footprints (x, z, radius) kept clear of the background forest, and shared road polylines. */
export const FOOTPRINTS: [number, number, number][] = [
  // village
  [-36, 22, 6], [-18, 26, 6], [-50, 2, 14], [-38, -6, 7], [-46, 18, 5], [-10, 24, 9], [-28, 36, 8], [-22, 14, 9], [-48, 28, 5], [-44, 38, 5], [-8, 38, 5],
  // city
  [-14, -24, 24], [52, -12, 34], [-70, -26, 38], [66, 36, 26], [30, 10, 10], [-88, 14, 28], [40, 24, 12], [-20, -6, 8],
];
export const nearFootprint = (x: number, z: number, pad = 0) => FOOTPRINTS.some(([fx, fz, r]) => Math.hypot(x - fx, z - fz) < r + pad);
/** Inside any building plateau the background forest is kept out entirely (the builders plant their own trees). */
export const inBuildZone = (x: number, z: number, flats: Record<string, { cx: number; cz: number; rx: number; rz: number }>, pad = 0) =>
  Object.values(flats).some((f) => Math.abs(x - f.cx) < f.rx + pad && Math.abs(z - f.cz) < f.rz + pad);

export const VILLAGE_PATH: [number, number][] = [[-36, 27], [-30, 24], [-24, 20], [-21, 14], [-14, 13], [-5, 12.5], [6, 12]];

export interface RoadDef { id: string; pts: [number, number][]; width: number; gate: string; traffic: boolean }
/** Major roads. `gate` is the milestone that builds them; traffic drives on them once they exist. */
export const CITY_ROADS: RoadDef[] = [
  { id: 'main-w', pts: [[-8, 13], [-2, 12.5], [6, 12], [11, 11]], width: 5, gate: 'roads', traffic: true },
  { id: 'main-e', pts: [[39, 10], [42, 4], [46, 0], [60, 0], [78, 0]], width: 5, gate: 'roads', traffic: true },
  { id: 'spine', pts: [[-8, 13], [-10, 2], [-10, -8], [-12, -18], [-14, -25]], width: 4.6, gate: 'roads', traffic: true },
  { id: 'mid-ew', pts: [[-44, -25], [-30, -25], [-14, -25], [0, -25], [8, -25]], width: 5, gate: 'roads', traffic: true },
  { id: 'dt-h2', pts: [[28, -24], [48, -24], [78, -24]], width: 5, gate: 'roads', traffic: true },
  { id: 'dt-v1', pts: [[44, -30], [44, -12], [44, 4]], width: 5, gate: 'roads', traffic: true },
  { id: 'dt-v2', pts: [[66, -30], [66, -12], [66, 0], [66, 14], [68, 28], [66, 42]], width: 5, gate: 'roads', traffic: true },
  { id: 'air', pts: [[-44, -25], [-52, -22], [-58, -19]], width: 5, gate: 'roads', traffic: false },
  { id: 'west', pts: [[-60, 14], [-74, 14], [-88, 14], [-102, 14]], width: 5, gate: 'roads', traffic: true },
];

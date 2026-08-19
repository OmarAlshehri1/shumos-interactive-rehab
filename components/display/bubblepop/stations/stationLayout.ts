/**
 * Shared station screen-position formula (task section 2's "large, evenly
 * spaced layout") — used by EnergyPulse to know where a station visually
 * sits so the pulse launches from the right spot. StationDock itself lays
 * out with a plain centered flex row; this mirrors that same centered,
 * evenly-spaced geometry as normalized [0,1] coordinates.
 */
const STATION_SPREAD = 0.6;

export function stationScreenX(index: number, count: number): number {
  if (count <= 1) return 0.5;
  return 0.5 - STATION_SPREAD / 2 + STATION_SPREAD * (index / (count - 1));
}

/** Normalized y — the station dock sits near the bottom of the wall (task section 2). */
export const STATION_SCREEN_Y = 0.9;

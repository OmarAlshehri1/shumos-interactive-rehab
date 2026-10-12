import type { Config } from './config';

/**
 * Compatibility reader for the SHARED projection profile (`shumos.projection.profiles.v1`, written by the platform's
 * calibration screen into the Control browser's localStorage). The shared module is not part of this branch's base, so
 * the key and the validation are mirrored here, structurally identical to lib/projection/calibration.ts. On merge, import
 * `PROFILE_KEY` / `validProjectionProfile` from there instead and delete the mirror (see docs/bodysequence3d/FINAL_REPORT.md).
 *
 * A profile is a SOFTWARE layout record (orientation, safe inset, optional measured size). It is never proof that the
 * picture is aligned with the real floor: the therapist still matches the lanes to the physical floor by eye.
 */
export const PROFILE_KEY = 'shumos.projection.profiles.v1';

export interface ProjectionProfileLike {
  version: 1;
  id: string;
  name: string;
  surface: 'WALL' | 'FLOOR';
  rotation: 0 | 90 | 180 | 270;
  targetPercent: number;
  spacingPercent: number;
  safeInsetPercent: number;
  measuredWidthCm: number | null;
  measuredHeightCm: number | null;
  updatedAt: number;
}

export function validProfile(raw: unknown): raw is ProjectionProfileLike {
  const p = raw as ProjectionProfileLike;
  const fin = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  return (
    !!p && p.version === 1 && typeof p.id === 'string' && p.id.length > 0 && p.id.length <= 100 && typeof p.name === 'string' && p.name.trim().length > 0 && p.name.length <= 100 &&
    (p.surface === 'WALL' || p.surface === 'FLOOR') && [0, 90, 180, 270].includes(p.rotation) &&
    fin(p.targetPercent) && fin(p.spacingPercent) && fin(p.safeInsetPercent) && p.safeInsetPercent >= 3 && p.safeInsetPercent <= 20 &&
    [p.measuredWidthCm, p.measuredHeightCm].every((v) => v === null || (fin(v) && (v as number) > 0 && (v as number) <= 2000)) && fin(p.updatedAt)
  );
}

/** FLOOR profiles saved in this browser (never throws: storage may be blocked). */
export function loadFloorProfiles(): ProjectionProfileLike[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(PROFILE_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter(validProfile).filter((p) => p.surface === 'FLOOR') : [];
  } catch {
    return [];
  }
}

export function configFromProfile(p: ProjectionProfileLike): Config['proj'] {
  return { name: p.name.slice(0, 60), rot: p.rotation, inset: p.safeInsetPercent, wCm: p.measuredWidthCm, hCm: p.measuredHeightCm };
}

/** Approximate real size of one lane-field unit (16 units across the picture), only when the projection was actually measured. */
export function cmPerUnit(proj: Config['proj']): number | null {
  return proj.wCm ? proj.wCm / 16 : null;
}

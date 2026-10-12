import type { Config } from './config';

import { PROFILE_KEY, validProjectionProfile } from '@/lib/projection/calibration';
import type { ProjectionProfile } from '@/lib/projection/calibration';
export { PROFILE_KEY };
export type ProjectionProfileLike = ProjectionProfile;
export const validProfile = validProjectionProfile;

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

/** Approximate real size of one course unit, only when the projection was actually measured. */
export function cmPerUnit(proj: Config['proj']): number | null {
  return proj.wCm ? proj.wCm / 16 : null;
}

export interface ProjectionProfile {
  version: 1;
  id: string;
  name: string;
  surface: "WALL" | "FLOOR";
  rotation: 0 | 90 | 180 | 270;
  targetPercent: number;
  spacingPercent: number;
  safeInsetPercent: number;
  measuredWidthCm: number | null;
  measuredHeightCm: number | null;
  updatedAt: number;
}
export const PROFILE_KEY = "shumos.projection.profiles.v1";
export function validProjectionProfile(raw: unknown): raw is ProjectionProfile {
  const p = raw as ProjectionProfile;
  return (
    !!p &&
    p.version === 1 &&
    typeof p.id === "string" &&
    p.id.length > 0 &&
    p.id.length <= 100 &&
    typeof p.name === "string" &&
    p.name.trim().length > 0 &&
    p.name.length <= 100 &&
    ["WALL", "FLOOR"].includes(p.surface) &&
    [0, 90, 180, 270].includes(p.rotation) &&
    Number.isFinite(p.targetPercent) &&
    p.targetPercent >= 2 &&
    p.targetPercent <= 20 &&
    Number.isFinite(p.spacingPercent) &&
    p.spacingPercent >= 10 &&
    p.spacingPercent <= 35 &&
    Number.isFinite(p.safeInsetPercent) &&
    p.safeInsetPercent >= 3 &&
    p.safeInsetPercent <= 20 &&
    [p.measuredWidthCm, p.measuredHeightCm].every(
      (v) => v === null || (Number.isFinite(v) && v > 0 && v <= 2000),
    ) &&
    Number.isFinite(p.updatedAt) &&
    p.updatedAt >= 0
  );
}
export function defaultProjection(): ProjectionProfile {
  return {
    version: 1,
    id: "default",
    name: "معايرة جديدة",
    surface: "FLOOR",
    rotation: 0,
    targetPercent: 7,
    spacingPercent: 20,
    safeInsetPercent: 8,
    measuredWidthCm: null,
    measuredHeightCm: null,
    updatedAt: Date.now(),
  };
}

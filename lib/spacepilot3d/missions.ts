export type FlightDifficulty = "LOW" | "MEDIUM" | "HIGH";
export type EncounterKind = "ring" | "asteroid" | "fiery";
export interface GameplayConfig {
  difficulty: FlightDifficulty;
  speed: number;
  targetTolerance: number;
  encounterSpacing: number;
  obstacleDensity: number;
}
export const DIFFICULTY_PRESETS: Readonly<Record<FlightDifficulty, Readonly<GameplayConfig>>> = {
  LOW: { difficulty: "LOW", speed: 9, targetTolerance: 0.65, encounterSpacing: 4.2, obstacleDensity: 1 },
  MEDIUM: { difficulty: "MEDIUM", speed: 12, targetTolerance: 0.4, encounterSpacing: 3.3, obstacleDensity: 2 },
  HIGH: { difficulty: "HIGH", speed: 16, targetTolerance: 0.25, encounterSpacing: 2.7, obstacleDensity: 3 },
};
export interface EncounterLayout { readonly kind: EncounterKind; readonly x: number; readonly y: number; readonly scale: number }
export interface MissionPlan { readonly name: string; readonly speedFactor: number; readonly encounters: readonly EncounterLayout[] }
export const MISSION_PLANS: readonly MissionPlan[] = [
  { name: "Flight Training", speedFactor: 1, encounters: [
    { kind: "ring", x: 0, y: 0, scale: 0.65 },
    { kind: "ring", x: -2.4, y: 1.1, scale: 0.65 },
    { kind: "asteroid", x: 3.5, y: -1.6, scale: 0.8 },
    { kind: "ring", x: 1.8, y: -1, scale: 0.65 },
    { kind: "ring", x: 0, y: 1.2, scale: 0.65 },
    { kind: "ring", x: -1.8, y: -1, scale: 0.65 },
  ] },
  { name: "Asteroid Field", speedFactor: 1.12, encounters: [
    { kind: "ring", x: 0, y: 0, scale: 0.65 },
    { kind: "asteroid", x: -2.4, y: 1.5, scale: 0.9 },
    { kind: "ring", x: 2.2, y: -1.2, scale: 0.65 },
    { kind: "asteroid", x: 2.8, y: 1.6, scale: 1 },
    { kind: "ring", x: -2, y: -0.8, scale: 0.65 },
    { kind: "asteroid", x: 0, y: 0, scale: 0.9 },
  ] },
  { name: "Fiery Passage", speedFactor: 1.24, encounters: [
    { kind: "ring", x: 0, y: 0, scale: 0.65 },
    { kind: "fiery", x: -2.5, y: -1.6, scale: 0.95 },
    { kind: "ring", x: 2.2, y: 1.3, scale: 0.65 },
    { kind: "asteroid", x: 2.8, y: -1.6, scale: 1 },
    { kind: "ring", x: -1.8, y: 1.1, scale: 0.65 },
    { kind: "fiery", x: 0, y: 0, scale: 1 },
  ] },
];
export const ENCOUNTERS_PER_MISSION = 6;
export const INITIAL_APPROACH_DISTANCE = 22;
export const VISIBLE_DISTANCE = 70;
export const UPGRADE_THRESHOLDS = [0, 3, 7] as const;

export function normalizeGameplayConfig(patch: Partial<GameplayConfig> = {}): GameplayConfig {
  const difficulty: FlightDifficulty = patch.difficulty === "LOW" || patch.difficulty === "HIGH" ? patch.difficulty : "MEDIUM";
  const base = DIFFICULTY_PRESETS[difficulty];
  const finite = (value: number | undefined, fallback: number, low: number, high: number) => value === undefined || !Number.isFinite(value) ? fallback : Math.min(high, Math.max(low, value));
  return { difficulty, speed: finite(patch.speed, base.speed, 6, 30), targetTolerance: finite(patch.targetTolerance, base.targetTolerance, 0.1, 1), encounterSpacing: finite(patch.encounterSpacing, base.encounterSpacing, 2.5, 6), obstacleDensity: Math.round(finite(patch.obstacleDensity, base.obstacleDensity, 1, 3)) };
}

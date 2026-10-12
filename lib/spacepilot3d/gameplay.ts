import { sweptShipIntersection } from "./collision";
import type { RingOpening } from './rings';
import { DIFFICULTY_PRESETS, ENCOUNTERS_PER_MISSION, INITIAL_APPROACH_DISTANCE, MISSION_PLANS, normalizeGameplayConfig, UPGRADE_THRESHOLDS, VISIBLE_DISTANCE, type EncounterKind, type GameplayConfig } from "./missions";
import { FLIGHT_HALF_HEIGHT, FLIGHT_HALF_WIDTH, type NormalizedFlightInput } from "./simulation";

export type EncounterOutcome = "pending" | "collected" | "missed" | "collision" | "avoided";
export type GameplayStatus = "ready" | "running" | "paused" | "mission-complete" | "complete";
export interface GameplayObject {
  id: string;
  kind: EncounterKind;
  x: number; y: number; z: number; scale: number;
  arrivalSeconds: number;
  radius: number;
  ring?: RingOpening;
  presented: boolean;
  outcome: EncounterOutcome;
}
export interface GameplayEvent {
  sessionId: string; runId: number; mission: number; objectId: string;
  outcome: Exclude<EncounterOutcome, "pending">; atSeconds: number;
}
export interface GameplayStats {
  ringsPresented: number; ringsCollected: number; ringsMissed: number;
  asteroidsPresented: number; asteroidsAvoided: number; asteroidCollisions: number;
  score: number; collectionAccuracy: number | null; upgradeTier: number;
  resolved: number; totalEncounters: number; completedMissions: number;
}
export interface GameplaySnapshot {
  status: GameplayStatus; mission: number; missionName: string; runId: number;
  stats: GameplayStats;
}

/** Pure deterministic authority. Browser code cannot award points or resolve objects. */
export class GameplaySimulation {
  readonly sessionId: string;
  runId = 1;
  config: GameplayConfig;
  status: GameplayStatus = "ready";
  mission = 0;
  elapsedSeconds = 0;
  missionSeconds = 0;
  revision = 0;
  readonly ship = { x: 0, y: 0, bank: 0 };
  readonly objects: GameplayObject[] = [];
  readonly events: GameplayEvent[] = [];
  readonly stats: GameplayStats = { ringsPresented: 0, ringsCollected: 0, ringsMissed: 0, asteroidsPresented: 0, asteroidsAvoided: 0, asteroidCollisions: 0, score: 0, collectionAccuracy: null, upgradeTier: 1, resolved: 0, totalEncounters: MISSION_PLANS.length * ENCOUNTERS_PER_MISSION, completedMissions: 0 };
  private hadInput = false;

  constructor(options: Partial<GameplayConfig> & { sessionId?: string } = {}) {
    this.sessionId = options.sessionId ?? "local-space-pilot";
    this.config = normalizeGameplayConfig(options);
    this.loadMission();
  }

  get missionName(): string { return MISSION_PLANS[this.mission].name; }
  get speed(): number { return this.config.speed * MISSION_PLANS[this.mission].speedFactor; }
  start(): void { if (this.status === "ready") { this.status = "running"; this.revision++; } }
  pause(): void { if (this.status === "running") { this.status = "paused"; this.hadInput = false; this.revision++; } }
  resume(): void { if (this.status === "paused") { this.status = "running"; this.hadInput = false; this.revision++; } }
  invalidateInput(): void { this.hadInput = false; }
  nextMission(expectedRunId = this.runId): void {
    if (expectedRunId !== this.runId || this.status !== "mission-complete") return;
    this.mission++; this.missionSeconds = 0; this.hadInput = false; this.loadMission(); this.status = "running"; this.revision++;
  }

  restart(patch: Partial<GameplayConfig> = {}, expectedRunId = this.runId): void {
    if (expectedRunId !== this.runId) return;
    const base = patch.difficulty && patch.difficulty !== this.config.difficulty ? DIFFICULTY_PRESETS[patch.difficulty] : this.config;
    this.config = normalizeGameplayConfig({ ...base, ...patch });
    this.runId++; this.mission = 0; this.elapsedSeconds = this.missionSeconds = 0;
    this.ship.x = this.ship.y = this.ship.bank = 0; this.hadInput = false;
    this.events.length = 0;
    Object.assign(this.stats, { ringsPresented: 0, ringsCollected: 0, ringsMissed: 0, asteroidsPresented: 0, asteroidsAvoided: 0, asteroidCollisions: 0, score: 0, collectionAccuracy: null, upgradeTier: 1, resolved: 0, completedMissions: 0 });
    this.loadMission(); this.status = "running"; this.revision++;
  }

  private loadMission(): void {
    this.objects.length = 0;
    for (const [i, layout] of MISSION_PLANS[this.mission].encounters.entries()) {
      const kind = this.config.difficulty === "HIGH" && this.mission > 0 && layout.kind === "asteroid" ? "fiery" : layout.kind;
      const arrivalSeconds = INITIAL_APPROACH_DISTANCE / this.speed + i * this.config.encounterSpacing;
      this.objects.push({ ...layout, kind, id: `mission-${this.mission + 1}-object-${i + 1}`, arrivalSeconds, z: -arrivalSeconds * this.speed, radius: kind === "ring" ? layout.scale * 0.46 + this.config.targetTolerance : layout.scale * 1.08, presented: false, outcome: "pending" });
    }
  }

  /** No catch-up beyond a quarter second. At most 15 bounded substeps. */
  step(deltaSeconds: number, input: NormalizedFlightInput | null, expectedRunId = this.runId): void {
    if (expectedRunId !== this.runId || this.status !== "running" || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    if (deltaSeconds > 0.25) { this.pause(); return; }
    const valid = !!input && Number.isFinite(input.x) && Number.isFinite(input.y);
    const toX = valid ? (Math.min(1, Math.max(0, input!.x)) - 0.5) * FLIGHT_HALF_WIDTH * 2 : this.ship.x;
    const toY = valid ? (0.5 - Math.min(1, Math.max(0, input!.y))) * FLIGHT_HALF_HEIGHT * 2 : this.ship.y;
    // Pickup/mode changes are teleports in collision history, never long sweeps.
    const fromX = this.hadInput && valid ? this.ship.x : toX;
    const fromY = this.hadInput && valid ? this.ship.y : toY;
    const steps = Math.ceil(deltaSeconds / (1 / 60));
    const duration = deltaSeconds / steps;
    for (let i = 0; i < steps && this.status === "running"; i++) {
      const a = i / steps, b = (i + 1) / steps;
      this.advance(duration, fromX + (toX - fromX) * a, fromY + (toY - fromY) * a, fromX + (toX - fromX) * b, fromY + (toY - fromY) * b);
    }
    const targetBank = Math.max(-0.22, Math.min(0.22, -(toX - this.ship.x) / deltaSeconds * 0.035));
    this.ship.bank += (targetBank - this.ship.bank) * (1 - Math.exp(-10 * deltaSeconds));
    this.ship.x = toX; this.ship.y = toY; this.hadInput = valid;
  }

  private advance(delta: number, fromX: number, fromY: number, toX: number, toY: number): void {
    const fromTime = this.missionSeconds;
    this.missionSeconds += delta; this.elapsedSeconds += delta;
    let visibleObstacles = 0;
    for (const object of this.objects) {
      if (object.outcome !== "pending") continue;
      const fromZ = (fromTime - object.arrivalSeconds) * this.speed;
      const toZ = (this.missionSeconds - object.arrivalSeconds) * this.speed;
      // Density changes warning distance, never hides hazards at the ship.
      const obstacleVisible = object.presented || object.kind === "ring" || visibleObstacles < this.config.obstacleDensity || toZ > -18;
      if (object.kind !== "ring" && toZ >= -VISIBLE_DISTANCE) visibleObstacles++;
      if (toZ < -VISIBLE_DISTANCE || !obstacleVisible) { object.z = toZ; continue; }
      if (!object.presented) {
        object.presented = true;
        if (object.kind === "ring") this.stats.ringsPresented++; else this.stats.asteroidsPresented++;
        this.stats.collectionAccuracy = this.stats.ringsPresented ? this.stats.ringsCollected / this.stats.ringsPresented : null;
        this.revision++;
      }
      object.z = toZ;
      if (sweptShipIntersection(object.x, object.y, fromZ, toZ, object.radius, fromX, fromY, toX, toY)) {
        this.resolve(object, object.kind === "ring" ? "collected" : "collision");
      } else if (toZ > 3 + object.radius) this.resolve(object, object.kind === "ring" ? "missed" : "avoided");
    }
    if (this.objects.every((object) => object.outcome !== "pending")) {
      this.stats.completedMissions++;
      this.status = this.mission === MISSION_PLANS.length - 1 ? "complete" : "mission-complete";
      this.hadInput = false; this.revision++;
    }
  }

  private resolve(object: GameplayObject, outcome: Exclude<EncounterOutcome, "pending">): void {
    if (object.outcome !== "pending") return;
    object.outcome = outcome;
    if (outcome === "collected") { this.stats.ringsCollected++; this.stats.score += 100; }
    else if (outcome === "missed") this.stats.ringsMissed++;
    else if (outcome === "collision") this.stats.asteroidCollisions++;
    else this.stats.asteroidsAvoided++;
    this.stats.resolved++;
    this.stats.collectionAccuracy = this.stats.ringsPresented ? this.stats.ringsCollected / this.stats.ringsPresented : null;
    this.stats.upgradeTier = this.stats.ringsCollected >= UPGRADE_THRESHOLDS[2] ? 3 : this.stats.ringsCollected >= UPGRADE_THRESHOLDS[1] ? 2 : 1;
    this.events.push({ sessionId: this.sessionId, runId: this.runId, mission: this.mission, objectId: object.id, outcome, atSeconds: this.elapsedSeconds });
    this.revision++;
  }

  snapshot(): GameplaySnapshot { return { status: this.status, mission: this.mission + 1, missionName: this.missionName, runId: this.runId, stats: { ...this.stats } }; }
}

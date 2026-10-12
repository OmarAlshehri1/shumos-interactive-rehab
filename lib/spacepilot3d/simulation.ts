/** Isolated flight demonstration: no collisions, scoring or persistence. */
export interface NormalizedFlightInput {
  readonly x: number;
  readonly y: number;
}

/** Sources supply final normalized coordinates; null means hold the ship. */
export interface FlightInputSource {
  sample(deltaSeconds: number): NormalizedFlightInput | null;
  reset(): void;
  dispose(): void;
}

export type PrototypeStatus = "ready" | "running" | "paused";
export type PrototypeViewStatus = PrototypeStatus | "mission-complete" | "complete" | "loading" | "error";
export type PrototypeInputMode = "keyboard" | "sensor";
export interface PrototypeControls {
  start(): void;
  pause(): void;
  resume(): void;
  restart(): void;
  setInputMode(mode: PrototypeInputMode): void;
  alignSensor(): void;
  nextMission(): void;
  setDifficulty(difficulty: import("./missions").FlightDifficulty): void;
}

export const FLIGHT_HALF_WIDTH = 4.8;
export const FLIGHT_HALF_HEIGHT = 2.8;
export const OBJECT_SPEED = 12;
export const RECYCLE_Z = 16;
export const TRACK_LENGTH = 180;

const OBJECT_LAYOUT = [
  { kind: "ring", x: -2.4, y: 1.1, z: -22, scale: 0.65 },
  { kind: "asteroid", x: 3.3, y: 0.6, z: -37, scale: 1.3 },
  { kind: "asteroid", x: -3.6, y: -1.8, z: -66, scale: 1.1 },
  { kind: "ring", x: 1.6, y: -0.5, z: -85, scale: 0.7 },
  { kind: "asteroid", x: 2.7, y: 2.2, z: -113, scale: 1.6 },
  { kind: "ring", x: -1.5, y: 1.9, z: -144, scale: 0.65 },
] as const;

export interface DemoObject {
  kind: "ring" | "asteroid";
  x: number;
  y: number;
  z: number;
  scale: number;
}

function normalized(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5;
}

/** Mutable simulation snapshot, deliberately outside React's render cycle. */
export class PrototypeSimulation {
  status: PrototypeStatus = "ready";
  elapsedSeconds = 0;
  readonly ship = { x: 0, y: 0, bank: 0 };
  readonly objects: DemoObject[] = OBJECT_LAYOUT.map((object) => ({ ...object }));

  start(): void { if (this.status === "ready") this.status = "running"; }
  pause(): void { if (this.status === "running") this.status = "paused"; }
  resume(): void { if (this.status === "paused") this.status = "running"; }

  restart(): void {
    this.elapsedSeconds = 0;
    this.ship.x = this.ship.y = this.ship.bank = 0;
    for (let i = 0; i < this.objects.length; i++) Object.assign(this.objects[i], OBJECT_LAYOUT[i]);
    this.status = "running";
  }

  step(deltaSeconds: number, input: NormalizedFlightInput | null): void {
    if (this.status !== "running" || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    // Ignore long suspension gaps. The browser lifecycle also explicitly pauses.
    if (deltaSeconds > 0.25) return;
    const previousX = this.ship.x;
    if (input) {
      this.ship.x = (normalized(input.x) - 0.5) * FLIGHT_HALF_WIDTH * 2;
      this.ship.y = (0.5 - normalized(input.y)) * FLIGHT_HALF_HEIGHT * 2;
    }
    const targetBank = Math.max(-0.22, Math.min(0.22, -(this.ship.x - previousX) / deltaSeconds * 0.035));
    // Cosmetic roll only; position always follows the latest sample directly.
    this.ship.bank += (targetBank - this.ship.bank) * (1 - Math.exp(-10 * deltaSeconds));
    this.elapsedSeconds += deltaSeconds;
    for (const object of this.objects) {
      object.z += OBJECT_SPEED * deltaSeconds;
      if (object.z > RECYCLE_Z) object.z -= TRACK_LENGTH;
    }
  }
}

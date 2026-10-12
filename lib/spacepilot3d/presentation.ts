import type { AccessibilitySettings } from './rings';
import { flightDefaults, initialFlightPose, type FlightSettings, type WorldFlightPose } from "./worldFlight";
import type { GameplayEvent, GameplayObject, GameplayStats, GameplayStatus } from "./gameplay";
import { MISSION_PLANS } from "./missions";
import type { SessionReplica } from "./sessionReplica";
import type { NormalizedFlightInput } from "./simulation";

export interface FlightSceneState {
  sessionId: string; runId: number; revision: number; status: GameplayStatus;
  elapsedSeconds: number; ship: { x: number; y: number; bank: number } | WorldFlightPose;
  flightSettings?: FlightSettings; accessibility?: AccessibilitySettings;
  objects: GameplayObject[]; stats: GameplayStats; events: GameplayEvent[];
}
export interface RemoteSceneDriver {
  read(): FlightSceneState;
  update(now: number, delta: number): void;
  presented?(): void;
  unavailable(): void;
  rawPointer?(): NormalizedFlightInput | null;
}
export function emptyScene(): FlightSceneState {
  return {
    sessionId: "waiting", runId: 0, revision: 0, status: "ready", elapsedSeconds: 0,
    ship: initialFlightPose(), events: [], flightSettings: flightDefaults("MEDIUM"),
    objects: MISSION_PLANS[0].encounters.map((o, i) => ({ ...o, id: `waiting-${i}`, z: -100, arrivalSeconds: 0, radius: 0, presented: false, outcome: "pending" })),
    stats: { ringsPresented: 0, ringsCollected: 0, ringsMissed: 0, asteroidsPresented: 0, asteroidsAvoided: 0, asteroidCollisions: 0, score: 0, collectionAccuracy: null, upgradeTier: 1, resolved: 0, totalEncounters: 18, completedMissions: 0 },
  };
}
/** Copies accepted frames only. No prediction, collision checks or score updates. */
export class AcceptedScene {
  readonly state = emptyScene();
  private frameSequence = -1;
  update(replica: SessionReplica, now: number): void {
    const session = replica.state, frame = replica.frame;
    if (!session || !frame || !replica.connected(now)) { this.state.status = "paused"; return; }
    if (session.ownerId !== frame.ownerId || session.revision !== frame.revision) { this.state.status = "paused"; return; }
    if (this.state.sessionId !== session.sessionId || this.state.runId !== session.runId) { this.state.events.length = 0; this.frameSequence = -1; }
    this.state.status = session.lifecycle === "running" ? "running" : session.lifecycle === "mission-complete" ? "mission-complete" : session.lifecycle === "completed" || session.lifecycle === "ended" ? "complete" : session.lifecycle === "ready" ? "ready" : "paused";
    if (frame.sequence <= this.frameSequence) return;
    this.frameSequence = frame.sequence;
    this.state.sessionId = session.sessionId; this.state.runId = session.runId; this.state.revision = session.revision;
    this.state.flightSettings = session.flightSettings; this.state.accessibility=session.accessibility;
    this.state.elapsedSeconds = frame.elapsedSeconds; this.state.ship = frame.ship; this.state.objects = frame.objects; this.state.stats = session.stats;
    this.state.events.push(...replica.takeEffects());
  }
}

import {NINE_STAGE_CURRICULUM,CURRICULUM_ENCOUNTERS,SPACE_STAGES,curriculumIndex,isStageResult,type CurriculumId,type StageResult} from './curriculum';
import { isAccessibility, ringCounts, type AccessibilitySettings } from './rings';
import { isFlightSettings, isWorldFlightPose, type FlightSettings, type WorldFlightPose } from "./worldFlight";
import type { GameplayEvent, GameplayObject, GameplayStats } from "./gameplay";
import type { FlightDifficulty } from "./missions";
import type { SensorInputStatus } from "./sensorInput";
import type { NormalizedFlightInput, PrototypeInputMode } from "./simulation";

export const SESSION_VERSION = 4 as const;
export const SESSION_CHANNEL_PREFIX = "shumos-experimental-space-pilot-3d-v4:";
export const LINK_TIMEOUT_MS = 250;
export const FRAME_INTERVAL_MS = 1000 / 30;
export const PROBE_INTERVAL_MS = 100;
export type SessionLifecycle = "ready" | "running" | "paused" | "suspended" | "mission-complete" | "completed" | "ended";
export type SuspendReason = "control-hidden" | "display-unavailable" | "input-unavailable" | "scheduling-gap" | "clock-discontinuity" | "renderer-unavailable" | "control-closed";
export interface AcceptedOutcome extends GameplayEvent { sequence: number; missionId: string; x: number; y: number; z: number }
export interface SessionSummary extends GameplayStats {
  curriculumId?:CurriculumId; stageRepeats?:number[]; stageResults?:StageResult[]; startingStageIndex?:number;
  sessionId: string; runId: number; elapsedSeconds: number;
  reason: "completed" | "therapist-ended" | "control-reloaded";
}
/** Infrequent authoritative state. Never carries input samples or patient data. */
export interface ExperimentalSessionState {
  currentStageAssisted?:boolean;
  curriculumId?:CurriculumId; stageRepeats?:number[]; stageResults?:StageResult[]; startingStageIndex?:number;
  version: typeof SESSION_VERSION;
  roomId: string; ownerId: string; sessionId: string; runId: number; missionId: string;
  revision: number; eventSequence: number; inputEpoch: number;
  lifecycle: SessionLifecycle; reason: string | null;
  flightSettings: FlightSettings; accessibility: AccessibilitySettings; instructionsVisible: boolean; difficulty: FlightDifficulty; inputMode: PrototypeInputMode;
  sensorSource?: "local" | "remote";
  mission: number; missionName: string; elapsedSeconds: number;
  stats: GameplayStats; outcomes: AcceptedOutcome[]; summary: SessionSummary | null;
  primaryDisplayId: string | null; displays: string[]; sensorStatus: SensorInputStatus;
}
/** Ephemeral presentation data. Sequence and local receipt times replace shared clocks. */
export interface PresentationFrame {
  ownerId: string; sessionId: string; runId: number; revision: number; inputEpoch: number;
  sequence: number; elapsedSeconds: number;
  ship: WorldFlightPose;
  objects: GameplayObject[]; rawPointer: NormalizedFlightInput | null;
}
type Identity = { ownerId: string; sessionId: string; runId: number; inputEpoch: number };
export type SessionMessage =
  | { version: 4; type: "probe"; displayId: string; nonce: string }
  | { version: 4; type: "sync"; displayId: string; nonce: string; state: ExperimentalSessionState; frame: PresentationFrame }
  | { version: 4; type: "state"; state: ExperimentalSessionState }
  | { version: 4; type: "frame"; frame: PresentationFrame }
  | ({ version: 4; type: "ack"; displayId: string; frameSequence: number; sequence: number; visible: boolean; ready: boolean } & Identity)
  | ({ version: 4; type: "input"; displayId: string; frameSequence: number; sequence: number; pointer: NormalizedFlightInput } & Identity)
  | { version: 4; type: "leave"; displayId: string; ownerId: string }
  | { version: 4; type: "closed"; ownerId: string };
export type SessionAction =
  | { type: "start" | "pause" | "resume" | "restart" | "end" | "next-mission" | "reengage" }
  | { type:"select-stage";value:number }
  | { type:"repeat-stage"|"restart-stage"|"skip-stage" }
  | { type: "instructions"; value: boolean }
  | { type: "accessibility"; value: AccessibilitySettings }
  | { type: "flight-settings"; value: FlightSettings }
  | { type: "difficulty"; value: FlightDifficulty }
  | { type: "sensor-source"; value: "local" | "remote" }
  | { type: "input-mode"; value: PrototypeInputMode }
  | { type: "primary-display"; value: string };

export function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
export function isSequence(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }
export function isId(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 100; }
export function isPointer(value: unknown): value is NormalizedFlightInput {
  return isRecord(value) && typeof value.x === "number" && Number.isFinite(value.x) && value.x >= 0 && value.x <= 1 && typeof value.y === "number" && Number.isFinite(value.y) && value.y >= 0 && value.y <= 1;
}
export function isSessionState(value: unknown): value is ExperimentalSessionState {
  if (!isRecord(value))return false;
  const nine=value.curriculumId===NINE_STAGE_CURRICULUM;
  if(value.currentStageAssisted!==undefined&&typeof value.currentStageAssisted!=='boolean')return false;
  if(value.curriculumId!==undefined&&!nine)return false;
  if(nine&&(!Array.isArray(value.stageRepeats)||value.stageRepeats.length!==9||!value.stageRepeats.every(isSequence)||!curriculumIndex(value.startingStageIndex)||!Array.isArray(value.stageResults)||value.stageResults.length>9||!value.stageResults.every(isStageResult)||new Set(value.stageResults.map(r=>r.stageIndex)).size!==value.stageResults.length||!curriculumIndex(Number(value.mission)-1)||value.difficulty!==SPACE_STAGES[Number(value.mission)-1].difficulty))return false;
  if (value.version !== 4 || !isId(value.roomId) || !isId(value.ownerId) || !isId(value.sessionId) || !isId(value.missionId)) return false;
  if (![value.runId, value.revision, value.eventSequence, value.inputEpoch].every(isSequence) || !["ready", "running", "paused", "suspended", "mission-complete", "completed", "ended"].includes(String(value.lifecycle))) return false;
  if (!["LOW", "MEDIUM", "HIGH"].includes(String(value.difficulty)) || !["keyboard", "sensor"].includes(String(value.inputMode))) return false;
  if (value.sensorSource !== undefined && !["local", "remote"].includes(String(value.sensorSource))) return false;
  if (!isAccessibility(value.accessibility) || typeof value.instructionsVisible!=='boolean')return false;
  if (!isFlightSettings(value.flightSettings)) return false;
  if (!isRecord(value.stats) || !Array.isArray(value.outcomes) || value.outcomes.length > (nine?CURRICULUM_ENCOUNTERS:18) || !Array.isArray(value.displays) || value.displays.length > 8 || !value.displays.every(isId)) return false;
  const counts = ["ringsPresented", "ringsCollected", "ringsMissed", "asteroidsPresented", "asteroidsAvoided", "asteroidCollisions", "score", "upgradeTier", "resolved", "totalEncounters", "completedMissions"];
  if (!counts.every((key) => isSequence((value.stats as Record<string, unknown>)[key]))) return false;
  if (value.stats.score !== (value.stats.ringsCollected as number) * 100 || value.stats.resolved !== value.outcomes.length) return false;
  let last = 0; const ids = new Set<string>();
  for (const event of value.outcomes) {
    if (!isRecord(event) || event.sessionId !== value.sessionId || event.runId !== value.runId || !isSequence(event.sequence) || event.sequence <= last || event.sequence > (value.eventSequence as number) || !isId(event.objectId) || ids.has(event.objectId) || !["collected", "missed", "collision", "avoided"].includes(String(event.outcome))) return false;
    if (![event.x, event.y, event.z, event.atSeconds].every((n) => typeof n === "number" && Number.isFinite(n))) return false;
    last = event.sequence; ids.add(event.objectId);
  }
  const countsByOutcome = { collected: 0, missed: 0, collision: 0, avoided: 0 };
  for (const event of value.outcomes) countsByOutcome[(event as AcceptedOutcome).outcome]++;
  if (value.stats.ringsCollected !== countsByOutcome.collected || value.stats.ringsMissed !== countsByOutcome.missed || value.stats.asteroidCollisions !== countsByOutcome.collision || value.stats.asteroidsAvoided !== countsByOutcome.avoided) return false;
  if ((value.stats.ringsPresented as number) < countsByOutcome.collected + countsByOutcome.missed || (value.stats.ringsPresented as number) > (nine?CURRICULUM_ENCOUNTERS:ringCounts(value.difficulty as FlightDifficulty).rings) || (value.stats.asteroidsPresented as number) < countsByOutcome.collision + countsByOutcome.avoided || (value.stats.asteroidsPresented as number) > (nine?0:ringCounts(value.difficulty as FlightDifficulty).hazards) || value.stats.totalEncounters !== (nine?CURRICULUM_ENCOUNTERS:18)) return false;
  const accuracy = value.stats.ringsPresented ? countsByOutcome.collected / (value.stats.ringsPresented as number) : null;
  if (value.stats.collectionAccuracy !== accuracy || (value.stats.completedMissions as number) > (nine?9:3) || ![1, 2, 3].includes(value.stats.upgradeTier as number)) return false;
  if(nine){
    for(const row of value.stageResults as StageResult[]){
      const events=(value.outcomes as AcceptedOutcome[]).filter(e=>e.mission===row.stageIndex);
      if(row.ringsCollected!==events.filter(e=>e.outcome==='collected').length||row.ringsMissed!==events.filter(e=>e.outcome==='missed').length||row.asteroidsPresented!==0||row.asteroidCollisions!==0||row.asteroidsAvoided!==0)return false;
      if(row.status==='completed'&&(events.length!==SPACE_STAGES[row.stageIndex].encounters.length||row.ringsPresented!==events.length))return false;
    }
    if(!(value.outcomes as AcceptedOutcome[]).every(e=>curriculumIndex(e.mission)&&e.missionId===`mission-${e.mission+1}`&&SPACE_STAGES[e.mission].encounters.some((_,i)=>e.objectId===`mission-${e.mission+1}-object-${i+1}`)))return false;
  }
  if(nine&&value.stats.completedMissions!==(value.stageResults as StageResult[]).filter(r=>r.status==='completed').length)return false;
  return typeof value.missionName === "string" && isSequence(value.mission) && (value.mission as number) >= 1 && (value.mission as number) <= (nine?9:3) && typeof value.elapsedSeconds === "number" && Number.isFinite(value.elapsedSeconds);
}
export function isPresentationFrame(value: unknown): value is PresentationFrame {
  if (!isRecord(value) || !isId(value.ownerId) || !isId(value.sessionId) || ![value.runId, value.revision, value.inputEpoch, value.sequence].every(isSequence) || !isWorldFlightPose(value.ship) || !Array.isArray(value.objects) || (value.objects.length < 4 || value.objects.length > 6)) return false;
  if (![value.elapsedSeconds, value.ship.x, value.ship.y, value.ship.bank].every((n) => typeof n === "number" && Number.isFinite(n))) return false;
  return value.objects.every(o=>{
    if(!isRecord(o)||o.kind!=='ring')return true;
    if(!isRecord(o.ring)||!isRecord(o.ring.normal))return false;
    const n=o.ring.normal;
    return typeof o.ring.innerRadius==='number'&&o.ring.innerRadius>=3.5&&o.ring.innerRadius<=5.4&&[n.x,n.y,n.z].every(v=>typeof v==='number'&&Number.isFinite(v))&&Math.abs(Math.hypot(n.x as number,n.y as number,n.z as number)-1)<1e-6;
  }) && value.objects.every((o) => isRecord(o) && isId(o.id) && ["ring", "asteroid", "fiery"].includes(String(o.kind)) && [o.x, o.y, o.z, o.scale].every((n) => typeof n === "number" && Number.isFinite(n)) && typeof o.presented === "boolean" && ["pending", "collected", "missed", "collision", "avoided"].includes(String(o.outcome))) && (value.rawPointer === null || isPointer(value.rawPointer));
}

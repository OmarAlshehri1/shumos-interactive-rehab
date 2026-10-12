/**
 * Versioned experimental Control <-> Display protocol. Carries NO patient data.
 * Transport is a dedicated BroadcastChannel (never a production channel, never
 * Firebase, no per-frame writes). Obstacle positions are never sent: the Display
 * regenerates them from (stageIndex, seed, spacingUsed).
 */
import { DIFFICULTIES, FLOOR_CM_MAX, FLOOR_MARGIN_MAX, type FloorCalibration, type Lane, type Level3, type Lifecycle, type Projection, type Session, type SuspendReason, type HintKey } from "./types";
import { TOTAL_STAGES } from "./stages";

export const PROTOCOL_VERSION = 1 as const;
export const CHANNEL_PREFIX = "shumos-experimental-runner-quest-3d-v1:";
export const CLOCK_INTERVAL_MS = 125;
export const ACK_INTERVAL_MS = 500;
export const DISPLAY_TIMEOUT_MS = 2000;
export const DEFAULT_ROOM = "default";

export interface DisplaySummaryStage { index: number; status: "completed" | "skipped"; stars: number; holds: number; assists: number; objectivesSkipped?: number }

/** FLOOR projection only. The objective list is regenerated from (stageIndex, seed); only the moving parts travel. */
export interface DisplayFloor {
  total: number;
  /** Index of the current objective (== total when the stage is finished). */
  current: number;
  /** Region the child was last confirmed in. */
  region: Lane;
  regionSeq: number;
  cueSeq: number;
  /** One char per objective: '.' pending, 'c' completed, 'a' assisted, 's' skipped, 'r' rest taken. */
  outcomes: string;
  cal: FloorCalibration;
}

export interface DisplayState {
  /** Absent in records written before the FLOOR upgrade: means WALL. */
  projection?: Projection;
  floor?: DisplayFloor;
  lifecycle: Lifecycle;
  suspendReason: SuspendReason | null;
  stageIndex: number;
  plannedFrom: number;
  plannedTo: number;
  seed: number;
  spacingUsed: number;
  reducedMotion: boolean;
  footLiftRequired: boolean;
  /** Therapist forward-speed setting and pause-before-obstacle flag: only used by the Display's read-only motion projection. */
  targetSpeed: number;
  pauseBeforeObstacle: boolean;
  inputSource: string;
  distance: number;
  speed: number;
  lane: Lane;
  holding: boolean;
  laneSeq: number;
  stepSeq: number;
  celebrateSeq: number;
  armed: boolean[];
  resolved: boolean[];
  stars: number;
  holds: number;
  checkpointsPassed: number;
  hint: HintKey;
  running: boolean;
  summary: { reason: "completed" | "therapist-ended"; completedStages: number; skippedStages: number; totalStars: number; totalHolds: number; stages: DisplaySummaryStage[] } | null;
}

export interface Identity { ownerId: string; ownerStartedAt: number; sessionId: string; sessionEpoch: number; runId: number }

export type Message =
  | { v: 1; type: "probe"; displayId: string; nonce: string }
  | ({ v: 1; type: "sync"; displayId: string; nonce: string; revision: number; sentAtMs: number; state: DisplayState } & Identity)
  | ({ v: 1; type: "state"; revision: number; sentAtMs: number; state: DisplayState } & Identity)
  | ({ v: 1; type: "clock"; revision: number; seq: number; distance: number; speed: number; running: boolean } & Identity)
  | { v: 1; type: "ack"; displayId: string; ownerId: string; sessionEpoch: number; runId: number; revision: number; seq: number; visible: boolean }
  | { v: 1; type: "closed"; ownerId: string };

export function toDisplayState(s: Session): DisplayState | null {
  const st = s.stage;
  if (!st) return null;
  const f = st.floor;
  return {
    ...(f ? { projection: "FLOOR" as const, floor: toDisplayFloor(s, f) } : {}),
    lifecycle: s.lifecycle, suspendReason: s.suspendReason, stageIndex: st.index, plannedFrom: s.startIndex, plannedTo: s.endIndex,
    seed: st.seed, spacingUsed: st.spacingUsed, reducedMotion: s.settings.reducedMotion, footLiftRequired: s.settings.footLiftRequired, targetSpeed: s.settings.speed, pauseBeforeObstacle: s.settings.pauseBeforeObstacle, inputSource: s.settings.inputSource,
    distance: st.distance, speed: st.speed, lane: st.lane, holding: st.holding, laneSeq: st.laneSeq, stepSeq: st.stepSeq, celebrateSeq: st.celebrateSeq,
    armed: st.obstacles.map((o) => o.armed), resolved: st.obstacles.map((o) => o.resolved), stars: st.stars, holds: st.holds, checkpointsPassed: st.checkpointsPassed,
    hint: st.hint, running: s.lifecycle === "playing" && !f,
    summary: s.summary ? { reason: s.summary.reason, completedStages: s.summary.completedStages, skippedStages: s.summary.skippedStages, totalStars: s.summary.totalStars, totalHolds: s.summary.totalHolds, stages: s.summary.stages.map((r) => ({ index: r.index, status: r.status, stars: r.stars, holds: r.holds, assists: r.assists, ...(r.projection === "FLOOR" ? { objectivesSkipped: r.objectivesSkipped } : {}) })) } : null,
  };
}

const OUTCOME: Record<string, string> = { reached: "c", stepped: "c", assisted: "a", skipped: "s", rest: "r", auto: "c", dodged: "c" };
function toDisplayFloor(s: Session, f: NonNullable<NonNullable<Session["stage"]>["floor"]>): DisplayFloor {
  const obstacles = s.stage!.obstacles;
  return {
    total: f.objectives.length, current: f.current, region: f.region, regionSeq: f.regionSeq, cueSeq: f.cueSeq,
    outcomes: obstacles.map((o) => (o.resolved ? (o.how ? OUTCOME[o.how] ?? "c" : "c") : ".")).join(""),
    cal: s.settings.floor,
  };
}

// ---------- validation ----------
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isSeq = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 100;
const LIFECYCLES: Lifecycle[] = ["ready", "playing", "paused", "suspended", "stage-complete", "completed", "ended"];
const SUSPENDS = ["input-lost", "display-unavailable", "control-hidden", "scheduling-gap"];
const HINTS = ["move-left", "move-right", "step", "choose-path", "go"];
void DIFFICULTIES;

const LEVELS3: Level3[] = ["low", "normal", "high"];
function isFloorCal(v: unknown): v is FloorCalibration {
  return isRecord(v) && LEVELS3.includes(v.range as Level3) && LEVELS3.includes(v.pad as Level3) && isNum(v.margin) && v.margin >= 0 && v.margin <= FLOOR_MARGIN_MAX &&
    typeof v.grid === "boolean" && typeof v.highContrast === "boolean" && typeof v.guidance === "boolean" &&
    isNum(v.widthCm) && v.widthCm >= 0 && v.widthCm <= FLOOR_CM_MAX && isNum(v.heightCm) && v.heightCm >= 0 && v.heightCm <= FLOOR_CM_MAX;
}
function isDisplayFloor(v: unknown, objectives: number): v is DisplayFloor {
  return isRecord(v) && v.total === objectives && isSeq(v.current) && (v.current as number) <= objectives && [-1, 0, 1].includes(v.region as number) && isSeq(v.regionSeq) && isSeq(v.cueSeq) &&
    typeof v.outcomes === "string" && v.outcomes.length === objectives && /^[.casr]*$/.test(v.outcomes) && isFloorCal(v.cal);
}

export function isDisplayState(v: unknown): v is DisplayState {
  if (!isRecord(v)) return false;
  if (!(v.projection === undefined || v.projection === "WALL" || v.projection === "FLOOR")) return false;
  if (v.projection === "FLOOR" ? !isDisplayFloor(v.floor, (v.armed as unknown[] | undefined)?.length ?? -1) : v.floor !== undefined) return false;
  if (!LIFECYCLES.includes(v.lifecycle as Lifecycle) || !(v.suspendReason === null || SUSPENDS.includes(v.suspendReason as string))) return false;
  if (!isSeq(v.stageIndex) || (v.stageIndex as number) >= TOTAL_STAGES || !isSeq(v.plannedFrom) || !isSeq(v.plannedTo) || (v.plannedTo as number) >= TOTAL_STAGES) return false;
  if (!isNum(v.seed) || !isNum(v.spacingUsed) || v.spacingUsed < 0.5 || v.spacingUsed > 2) return false;
  if (typeof v.reducedMotion !== "boolean" || typeof v.footLiftRequired !== "boolean" || typeof v.pauseBeforeObstacle !== "boolean" || !isNum(v.targetSpeed) || v.targetSpeed < 0.5 || v.targetSpeed > 10 || typeof v.inputSource !== "string") return false;
  if (!isNum(v.distance) || v.distance < 0 || !isNum(v.speed) || v.speed < 0 || v.speed > 20) return false;
  if (![-1, 0, 1].includes(v.lane as number) || typeof v.holding !== "boolean" || !isSeq(v.laneSeq) || !isSeq(v.stepSeq) || !isSeq(v.celebrateSeq)) return false;
  if (!Array.isArray(v.armed) || !Array.isArray(v.resolved) || v.armed.length > 64 || v.armed.length !== v.resolved.length) return false;
  if (!v.armed.every((b) => typeof b === "boolean") || !v.resolved.every((b) => typeof b === "boolean")) return false;
  if (!isSeq(v.stars) || !isSeq(v.holds) || !isSeq(v.checkpointsPassed) || !(v.hint === null || HINTS.includes(v.hint as string)) || typeof v.running !== "boolean") return false;
  if (v.summary !== null && !isRecord(v.summary)) return false;
  return true;
}

const identityOk = (m: Record<string, unknown>) => isId(m.ownerId) && isNum(m.ownerStartedAt) && isId(m.sessionId) && isNum(m.sessionEpoch) && isSeq(m.runId);

/** Returns a typed message or null. Never throws. */
export function parseMessage(raw: unknown): Message | null {
  if (!isRecord(raw) || raw.v !== PROTOCOL_VERSION || typeof raw.type !== "string") return null;
  switch (raw.type) {
    case "probe": return isId(raw.displayId) && isId(raw.nonce) ? (raw as unknown as Message) : null;
    case "sync": return isId(raw.displayId) && isId(raw.nonce) && identityOk(raw) && isSeq(raw.revision) && isNum(raw.sentAtMs) && isDisplayState(raw.state) ? (raw as unknown as Message) : null;
    case "state": return identityOk(raw) && isSeq(raw.revision) && isNum(raw.sentAtMs) && isDisplayState(raw.state) ? (raw as unknown as Message) : null;
    case "clock": return identityOk(raw) && isSeq(raw.revision) && isSeq(raw.seq) && isNum(raw.distance) && raw.distance >= 0 && isNum(raw.speed) && raw.speed >= 0 && typeof raw.running === "boolean" ? (raw as unknown as Message) : null;
    case "ack": return isId(raw.displayId) && isId(raw.ownerId) && isNum(raw.sessionEpoch) && isSeq(raw.runId) && isSeq(raw.revision) && isSeq(raw.seq) && typeof raw.visible === "boolean" ? (raw as unknown as Message) : null;
    case "closed": return isId(raw.ownerId) ? (raw as unknown as Message) : null;
    default: return null;
  }
}

export function openChannel(roomId: string, receive: (raw: unknown) => void): { send(m: Message): void; close(): void } {
  if (typeof BroadcastChannel !== "function") throw new Error("هذا المتصفح لا يدعم الاتصال المحلي بين النوافذ.");
  const channel = new BroadcastChannel(`${CHANNEL_PREFIX}${roomId}`);
  let closed = false;
  channel.onmessage = (e: MessageEvent<unknown>) => { if (!closed) receive(e.data); };
  return {
    send(m) { if (!closed) channel.postMessage(m); },
    close() { if (closed) return; closed = true; channel.onmessage = null; channel.close(); },
  };
}

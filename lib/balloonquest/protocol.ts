/**
 * Versioned experimental Control <-> Display protocol. Carries NO patient
 * data. Transport is a dedicated BroadcastChannel (never the production
 * channel, never Firebase). Balloon POSITIONS are never sent: the Display
 * derives them from the authoritative simulation clock.
 */
import { BALLOON_COLORS, DIFFICULTIES, type BalloonColor, type Difficulty, type Layout, type Lifecycle, type Motion, type Session, type StageNumber, type SuspendReason } from "./types";

export const PROTOCOL_VERSION = 1 as const;
export const CHANNEL_PREFIX = "shumos-experimental-balloon-quest-3d-v1:";
export const CLOCK_INTERVAL_MS = 250;
export const ACK_INTERVAL_MS = 500;
export const DISPLAY_TIMEOUT_MS = 2000;
export const MAX_BALLOONS_ON_WIRE = 24;

export interface DisplayBalloon {
  id: string;
  color: BalloonColor;
  x: number;
  topY: number;
  spawnedAtMs: number;
  popping: boolean;
  poppedAtMs: number;
  wrongCueCount: number;
}

export interface DisplaySummaryStage {
  difficulty: Difficulty;
  stage: StageNumber;
  status: "completed" | "skipped";
  correct: number;
  goal: number;
}

export interface DisplayState {
  lifecycle: Lifecycle;
  suspendReason: SuspendReason | null;
  layout: Layout;
  reducedMotion: boolean;
  difficulty: Difficulty;
  stage: StageNumber;
  stageIndex: number;
  totalStages: 9;
  plannedStages: number;
  motion: Motion;
  sizeCqh: number;
  riseSeconds: number;
  goal: number;
  goalDone: number;
  target: BalloonColor;
  correctSeq: number;
  wrongCueSeq: number;
  simTimeMs: number;
  running: boolean;
  balloons: DisplayBalloon[];
  summary: { reason: "completed" | "therapist-ended"; completedStages: number; skippedStages: number; totalCorrect: number; stages: DisplaySummaryStage[] } | null;
}

export interface Identity {
  ownerId: string;
  ownerStartedAt: number;
  sessionId: string;
  sessionEpoch: number;
  runId: number;
}

export type Message =
  | { v: 1; type: "probe"; displayId: string; nonce: string }
  | ({ v: 1; type: "sync"; displayId: string; nonce: string; revision: number; sentAtMs: number; state: DisplayState } & Identity)
  | ({ v: 1; type: "state"; revision: number; sentAtMs: number; state: DisplayState } & Identity)
  | ({ v: 1; type: "clock"; revision: number; seq: number; simTimeMs: number; running: boolean } & Identity)
  | { v: 1; type: "ack"; displayId: string; ownerId: string; sessionEpoch: number; runId: number; revision: number; seq: number; visible: boolean }
  | { v: 1; type: "closed"; ownerId: string };

/** Projects the authoritative session onto the (small) state a Display needs. */
export function toDisplayState(s: Session): DisplayState | null {
  const st = s.stage;
  const idx = st?.index ?? s.stageIndex;
  const difficulty = DIFFICULTIES[Math.floor(idx / 3)];
  const stageNo = ((idx % 3) + 1) as StageNumber;
  return {
    lifecycle: s.lifecycle,
    suspendReason: s.suspendReason,
    layout: s.settings.layout,
    reducedMotion: s.settings.reducedMotion,
    difficulty,
    stage: stageNo,
    stageIndex: idx,
    totalStages: 9,
    plannedStages: s.endIndex - s.startIndex + 1,
    motion: st?.spec.motion ?? "static",
    sizeCqh: st?.spec.sizeCqh ?? 20,
    riseSeconds: st?.spec.riseSeconds ?? 0,
    goal: st?.spec.goal ?? 0,
    goalDone: st?.goalDone ?? 0,
    target: st?.target ?? "blue",
    correctSeq: st?.correctSeq ?? 0,
    wrongCueSeq: st ? st.balloons.reduce((a, b) => a + b.wrongCueCount, 0) : 0,
    simTimeMs: st?.simTimeMs ?? 0,
    running: s.lifecycle === "playing",
    balloons: (st?.balloons ?? []).map((b) => ({ id: b.id, color: b.color, x: b.x, topY: b.topY, spawnedAtMs: b.spawnedAtMs, popping: b.popping, poppedAtMs: b.poppedAtMs, wrongCueCount: b.wrongCueCount })),
    summary: s.summary
      ? {
          reason: s.summary.reason,
          completedStages: s.summary.completedStages,
          skippedStages: s.summary.skippedStages,
          totalCorrect: s.summary.totalCorrect,
          stages: s.summary.stages.map((r) => ({ difficulty: r.difficulty, stage: r.stage, status: r.status, correct: r.correct, goal: r.goal })),
        }
      : null,
  };
}

// ---------- validation ----------
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isSeq = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 100;
const LIFECYCLES: Lifecycle[] = ["ready", "playing", "paused", "suspended", "stage-complete", "completed", "ended"];
const SUSPENDS = ["input-lost", "display-unavailable", "control-hidden", "scheduling-gap"];

function isBalloon(v: unknown): v is DisplayBalloon {
  return isRecord(v) && isId(v.id) && BALLOON_COLORS.includes(v.color as BalloonColor) && isNum(v.x) && v.x >= 0 && v.x <= 100 && isNum(v.topY) && isNum(v.spawnedAtMs) && typeof v.popping === "boolean" && isNum(v.poppedAtMs) && isSeq(v.wrongCueCount);
}

export function isDisplayState(v: unknown): v is DisplayState {
  if (!isRecord(v)) return false;
  if (!LIFECYCLES.includes(v.lifecycle as Lifecycle) || !(v.suspendReason === null || SUSPENDS.includes(v.suspendReason as string))) return false;
  if (!["WALL", "FLOOR"].includes(v.layout as string) || typeof v.reducedMotion !== "boolean" || !DIFFICULTIES.includes(v.difficulty as Difficulty)) return false;
  if (![1, 2, 3].includes(v.stage as number) || !isSeq(v.stageIndex) || (v.stageIndex as number) > 8 || v.totalStages !== 9 || !isSeq(v.plannedStages)) return false;
  if (!["static", "rising"].includes(v.motion as string) || !isNum(v.sizeCqh) || v.sizeCqh < 5 || v.sizeCqh > 40 || !isNum(v.riseSeconds) || v.riseSeconds < 0) return false;
  if (!isSeq(v.goal) || !isSeq(v.goalDone) || (v.goalDone as number) > (v.goal as number) || !BALLOON_COLORS.includes(v.target as BalloonColor) || !isSeq(v.correctSeq) || !isSeq(v.wrongCueSeq)) return false;
  if (!isNum(v.simTimeMs) || typeof v.running !== "boolean" || !Array.isArray(v.balloons) || v.balloons.length > MAX_BALLOONS_ON_WIRE || !v.balloons.every(isBalloon)) return false;
  if (new Set((v.balloons as DisplayBalloon[]).map((b) => b.id)).size !== v.balloons.length) return false;
  if (v.summary !== null && !isRecord(v.summary)) return false;
  return true;
}

function identityOk(m: Record<string, unknown>): boolean {
  return isId(m.ownerId) && isNum(m.ownerStartedAt) && isId(m.sessionId) && isNum(m.sessionEpoch) && isSeq(m.runId);
}

/** Returns a typed message or null. Never throws. */
export function parseMessage(raw: unknown): Message | null {
  if (!isRecord(raw) || raw.v !== PROTOCOL_VERSION || typeof raw.type !== "string") return null;
  switch (raw.type) {
    case "probe":
      return isId(raw.displayId) && isId(raw.nonce) ? (raw as unknown as Message) : null;
    case "sync":
      return isId(raw.displayId) && isId(raw.nonce) && identityOk(raw) && isSeq(raw.revision) && isNum(raw.sentAtMs) && isDisplayState(raw.state) ? (raw as unknown as Message) : null;
    case "state":
      return identityOk(raw) && isSeq(raw.revision) && isNum(raw.sentAtMs) && isDisplayState(raw.state) ? (raw as unknown as Message) : null;
    case "clock":
      return identityOk(raw) && isSeq(raw.revision) && isSeq(raw.seq) && isNum(raw.simTimeMs) && raw.simTimeMs >= 0 && typeof raw.running === "boolean" ? (raw as unknown as Message) : null;
    case "ack":
      return isId(raw.displayId) && isId(raw.ownerId) && isNum(raw.sessionEpoch) && isSeq(raw.runId) && isSeq(raw.revision) && isSeq(raw.seq) && typeof raw.visible === "boolean" ? (raw as unknown as Message) : null;
    case "closed":
      return isId(raw.ownerId) ? (raw as unknown as Message) : null;
    default:
      return null;
  }
}

export function openChannel(roomId: string, receive: (raw: unknown) => void): { send(m: Message): void; close(): void } {
  if (typeof BroadcastChannel !== "function") throw new Error("هذا المتصفح لا يدعم الاتصال المحلي بين النوافذ.");
  const channel = new BroadcastChannel(`${CHANNEL_PREFIX}${roomId}`);
  let closed = false;
  channel.onmessage = (e: MessageEvent<unknown>) => {
    if (!closed) receive(e.data);
  };
  return {
    send(m) {
      if (!closed) channel.postMessage(m);
    },
    close() {
      if (closed) return;
      closed = true;
      channel.onmessage = null;
      channel.close();
    },
  };
}

/** Fixed demo room used by the experimental routes so a Control and a Display opened separately find each other. */
export const DEFAULT_ROOM = "default";

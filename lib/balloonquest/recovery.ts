/**
 * Recovery of an active Balloon Quest session after the therapist Control is reloaded.
 *
 * The live record already carries the Control -> Display messages; it additionally carries the Control's full
 * authoritative Session as one JSON string (`bq3.snapshot`, written together with every state message, so it
 * always matches the state the Display shows). A reloaded Control reads it back, validates it strictly, and
 * adopts it PAUSED (ControlRuntime.adopt). Nothing here touches Firebase or the DOM.
 *
 * Safety rules, all decided in evaluateRecovery:
 *  - only the same staff account's own session of the same patient is ever adopted;
 *  - a record published by ANOTHER window that is still alive (fresh heartbeat) is never taken over silently;
 *  - a malformed or inconsistent snapshot is ignored (the Control starts a normal fresh session).
 */
import { decideRecovery, HEARTBEAT_MS as SHARED_HEARTBEAT_MS, OWNER_STALE_MS as SHARED_OWNER_STALE_MS, RECOVERY_MAX_AGE_MS as SHARED_RECOVERY_MAX_AGE_MS } from "@/lib/liveGame/ownership";
import { sanitizeSettings } from "./stages";
import { BALLOON_COLORS, DIFFICULTIES, type Lifecycle, type Session, type SuspendReason } from "./types";

/** Ownership timings are platform-wide (lib/liveGame/ownership.ts); re-exported for this game's callers and tests. */
export const OWNER_STALE_MS = SHARED_OWNER_STALE_MS;
export const RECOVERY_MAX_AGE_MS = SHARED_RECOVERY_MAX_AGE_MS;
export const HEARTBEAT_MS = SHARED_HEARTBEAT_MS;
const SNAPSHOT_MAX_CHARS = 400_000;

const LIFECYCLES: readonly Lifecycle[] = ["ready", "playing", "paused", "suspended", "stage-complete", "completed", "ended"];
const SUSPEND_REASONS: readonly SuspendReason[] = ["input-lost", "display-unavailable", "control-hidden", "scheduling-gap"];

export const serializeSession = (s: Session): string => JSON.stringify(s);

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isInt = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const isStr = (v: unknown, max = 200): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const isColor = (v: unknown) => typeof v === "string" && (BALLOON_COLORS as readonly string[]).includes(v);
const isDifficulty = (v: unknown) => typeof v === "string" && (DIFFICULTIES as readonly string[]).includes(v);
const arrOf = (v: unknown, max: number, each: (x: unknown) => boolean): v is unknown[] => Array.isArray(v) && v.length <= max && v.every(each);

const validBalloon = (b: unknown): boolean =>
  isObj(b) && isStr(b.id) && isInt(b.spawnIndex) && isColor(b.color) && isNum(b.x) && isNum(b.topY) && isInt(b.slot, -1) && isNum(b.spawnedAtMs) && typeof b.popping === "boolean" && isNum(b.poppedAtMs) && isInt(b.wrongCueCount) && isNum(b.lastWrongAtMs);

const validSpec = (sp: unknown): boolean =>
  isObj(sp) && isInt(sp.index, 0, 8) && isDifficulty(sp.difficulty) && isInt(sp.stage, 1, 3) && (sp.motion === "static" || sp.motion === "rising") && (sp.layout === "WALL" || sp.layout === "FLOOR") &&
  isInt(sp.goal, 1, 100) && isNum(sp.sizeCqh) && isNum(sp.riseSeconds) && isInt(sp.activeCount, 1, 60) && arrOf(sp.palette, 7, isColor);

const validStage = (st: unknown): boolean =>
  isObj(st) && isInt(st.index, 0, 8) && isInt(st.attempt) && isNum(st.seed) && isStr(st.idPrefix) && validSpec(st.spec) && isColor(st.target) && isInt(st.goalDone) && isInt(st.wrongCount) && isInt(st.correctSeq) &&
  isNum(st.simTimeMs) && st.simTimeMs >= 0 && isNum(st.stepTimeMs) && arrOf(st.balloons, 80, validBalloon) && arrOf(st.slots, 200, (x) => isObj(x) && isNum(x.x) && isNum(x.y)) &&
  isObj(st.spawn) && isNum(st.spawn.nextSpawnAtMs) && isNum(st.spawn.lastSpawnAtMs) && isInt(st.spawn.spawnCount) && arrOf(st.spawn.recentColors, 20, isColor) && isNum(st.spawn.lastSlot) && isNum(st.spawn.lastX);

const validResult = (r: unknown): boolean =>
  isObj(r) && isInt(r.index, 0, 8) && isDifficulty(r.difficulty) && isInt(r.stage, 1, 3) && (r.status === "completed" || r.status === "skipped") && isColor(r.target) && isInt(r.goal) && isInt(r.correct) && isInt(r.wrongContacts) && isNum(r.activeMs) && isInt(r.attempts);

const validSelection = (x: unknown): boolean =>
  isObj(x) && isInt(x.sequence) && (x.inputEventId === null || typeof x.inputEventId === "string") && isInt(x.runId) && isInt(x.stageIndex) && isInt(x.stageAttempt) && isStr(x.balloonId) && isColor(x.color) && (x.outcome === "correct" || x.outcome === "wrong") && isStr(x.source, 20) && isNum(x.simTimeMs);

const validSummary = (m: unknown): boolean =>
  isObj(m) && isStr(m.sessionId) && isInt(m.runId, 1) && (m.reason === "completed" || m.reason === "therapist-ended") && arrOf(m.stages, 9, validResult) && isInt(m.completedStages) && isInt(m.skippedStages) && isInt(m.totalCorrect) && isInt(m.totalWrongContacts) && isNum(m.activeMs) && isInt(m.restarts);

/** Strictly validates a parsed snapshot. Returns a clean Session (settings re-sanitised) or null. */
export function validateSession(o: unknown): Session | null {
  if (!isObj(o) || o.version !== 1 || !isStr(o.sessionId, 100)) return null;
  if (!isNum(o.sessionEpoch) || !isInt(o.runId, 1) || !isNum(o.seed) || !isInt(o.revision, 1) || !isObj(o.settings)) return null;
  if (typeof o.lifecycle !== "string" || !(LIFECYCLES as readonly string[]).includes(o.lifecycle)) return null;
  if (!(o.suspendReason === null || (typeof o.suspendReason === "string" && (SUSPEND_REASONS as readonly string[]).includes(o.suspendReason)))) return null;
  if (!isInt(o.startIndex, 0, 8) || !isInt(o.endIndex, 0, 8) || !isInt(o.stageIndex, 0, 8) || o.endIndex < o.startIndex) return null;
  if (!isInt(o.selectionSeq) || !isInt(o.restarts)) return null;
  if (!arrOf(o.results, 9, validResult) || !arrOf(o.selections, 400, validSelection) || !arrOf(o.seenInputEvents, 400, (x) => typeof x === "string" && x.length <= 120)) return null;
  const lifecycle = o.lifecycle as Lifecycle;
  const needsStage = lifecycle === "playing" || lifecycle === "paused" || lifecycle === "suspended" || lifecycle === "stage-complete";
  if (lifecycle === "ready") return null; // nothing to recover
  if (needsStage && !validStage(o.stage)) return null;
  const terminal = lifecycle === "completed" || lifecycle === "ended";
  if (terminal !== (o.summary !== null && o.summary !== undefined)) return null;
  if (terminal && !validSummary(o.summary)) return null;
  return {
    ...(o as unknown as Session),
    settings: sanitizeSettings(o.settings as Partial<Session["settings"]>),
    stage: o.stage !== null && o.stage !== undefined && validStage(o.stage) ? (o.stage as Session["stage"]) : null,
    summary: terminal ? (o.summary as Session["summary"]) : null,
  };
}

/** Parses the snapshot string stored in the live record. */
export function parseSnapshot(raw: unknown): Session | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > SNAPSHOT_MAX_CHARS) return null;
  try {
    return validateSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** The slice of the stored live record the decision needs (kept structural so it is trivial to test). */
export interface StoredRecordView {
  gameId: string | null;
  sessionId: string;
  patientId: string | null;
  session: {
    engine?: string;
    config: { childFirstName: string };
    bq3: { ownerId: string; snapshot?: string; controlTabId?: string; heartbeatAt?: number };
  };
}

export type RecoveryDecision =
  | { kind: "none" }
  | { kind: "recover"; session: Session; childName: string; why: "same-window" | "owner-gone" | "takeover"; /** The window that published the adopted session, when it was a different one. */ fromTabId: string | null }
  | { kind: "blocked"; why: "other-window-active"; takeoverAllowed: boolean };

export interface RecoveryInput {
  record: StoredRecordView | null;
  uid: string;
  patientId: string | null;
  tabId: string;
  /** Wall clock, ms. */
  now: number;
  /** The therapist explicitly chose to take over a window that still looks alive. */
  force?: boolean;
}

/** Balloon Quest's decision: its own record/snapshot validation, then the platform's shared ownership rules (lib/liveGame/ownership.ts). */
export function evaluateRecovery({ record, uid, patientId, tabId, now, force }: RecoveryInput): RecoveryDecision {
  if (!record || record.gameId !== "balloon-quest" || record.session.engine !== "bq3") return { kind: "none" };
  const b = record.session.bq3;
  const parsed = parseSnapshot(b.snapshot);
  const d = decideRecovery({ recordSessionId: record.sessionId, recordPatientId: record.patientId, meta: b, snapshot: parsed, uid, patientId, tabId, now, force });
  if (d.kind === "recover") return { kind: "recover", session: d.snapshot, childName: record.session.config.childFirstName, why: d.why, fromTabId: d.fromTabId };
  return d;
}

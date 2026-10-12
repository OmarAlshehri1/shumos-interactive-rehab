/**
 * Runner Quest 3D over the EXISTING production live-session record (`/liveSession`), so Control (iPad /
 * therapist computer) and Display (projector laptop) can be different devices on the same Shumos site.
 *
 * Transport strategy (bounded, latency-tolerant):
 *  - Control is authoritative and the only writer. The Display is read-only.
 *  - ONE record, strictly increasing top-level `revision` (the platform rule), written
 *      * immediately on every discrete change (start, lane change, step accepted, obstacle resolved, hold,
 *        pause, stage change ...) and
 *      * at most once per second as a clock sample while playing (distance + speed).
 *    Measured/expected rate: a handful of writes per second at most; never per frame, never raw input,
 *    never the 3D scene. Obstacle positions are not sent: the Display regenerates them from the seed.
 *  - The Display re-runs the same deterministic kinematics between samples (see projection.ts).
 *  - Inside the record the Control identity tuple [ownerStartedAt, sessionEpoch, runId, revision] lets the
 *    Display reject stale/duplicate/old-run data exactly like the local channel does.
 */
import { GameState } from "@/lib/game";
import { CLOCK_INTERVAL_MS, isDisplayState, PROTOCOL_VERSION, type DisplayState, type Message } from "./protocol";
import { difficultyOfIndex } from "./stages";
import type { Lifecycle } from "./types";

export const RUNNER_ENGINE_TAG = "rq3" as const;
export const RUNNER_ENGINE_VERSION = 1 as const;
/** Firebase clock refresh while playing. */
export const LIVE_CLOCK_INTERVAL_MS = 1000;
const RETRY_MS = 1000;

export interface RunnerLiveBlock {
  ownerId: string;
  ownerStartedAt: number;
  sessionEpoch: number;
  runId: number;
  revision: number;
  state: DisplayState;
  clock: { seq: number; distance: number; speed: number; running: boolean };
}

/** What `liveSession.session` holds. Field names match what the generic consumers (rules, display guard) read. */
export interface RunnerLiveSession {
  engine: typeof RUNNER_ENGINE_TAG;
  engineVersion: typeof RUNNER_ENGINE_VERSION;
  sessionId: string;
  seed: number;
  createdAt: number;
  gameState: GameState;
  currentDifficulty: string;
  currentStage: { stageNumber: 1 | 2 | 3; stageIndex: number };
  config: { childFirstName: string };
  rq3: RunnerLiveBlock;
}

export function legacyGameState(lifecycle: Lifecycle): GameState {
  switch (lifecycle) {
    case "ready": return GameState.START_ZONE;
    case "playing": case "paused": case "suspended": return GameState.PLAYING;
    case "stage-complete": return GameState.STAGE_COMPLETE;
    case "completed": case "ended": return GameState.SESSION_COMPLETE;
  }
}

export const sanitizeChildName = (name: string): string => name.trim().slice(0, 30);
export const isRunnerSession = (raw: unknown): boolean => !!raw && typeof raw === "object" && (raw as { engine?: unknown }).engine === RUNNER_ENGINE_TAG;

interface BuildInput { state: Message & { type: "state" }; clock: (Message & { type: "clock" }) | null; seed: number; createdAt: number; childFirstName: string }

export function buildLiveSession({ state: m, clock, seed, createdAt, childFirstName }: BuildInput): RunnerLiveSession {
  const s = m.state;
  return {
    engine: RUNNER_ENGINE_TAG, engineVersion: RUNNER_ENGINE_VERSION, sessionId: m.sessionId, seed, createdAt,
    gameState: legacyGameState(s.lifecycle),
    currentDifficulty: difficultyOfIndex(s.stageIndex),
    currentStage: { stageNumber: ((s.stageIndex % 3) + 1) as 1 | 2 | 3, stageIndex: s.stageIndex },
    config: { childFirstName: sanitizeChildName(childFirstName) },
    rq3: {
      ownerId: m.ownerId, ownerStartedAt: m.ownerStartedAt, sessionEpoch: m.sessionEpoch, runId: m.runId, revision: m.revision, state: s,
      // The clock sample is only valid for the state revision it was taken at.
      clock: clock && clock.revision === m.revision ? { seq: clock.seq, distance: clock.distance, speed: clock.speed, running: clock.running } : { seq: 0, distance: s.distance, speed: s.speed, running: s.running },
    },
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v as object) : []);

/**
 * Realtime Database drops nulls and empty arrays, so a record read back is repaired to the shape the
 * protocol validators expect before it is checked. Anything that does not validate returns null (the
 * Display then shows the waiting world instead of rendering a guess).
 */
export function reviveRunnerSession(raw: unknown): RunnerLiveSession | null {
  if (!isRecord(raw) || raw.engine !== RUNNER_ENGINE_TAG || raw.engineVersion !== RUNNER_ENGINE_VERSION || !isRecord(raw.rq3) || !isRecord(raw.config)) return null;
  const b = raw.rq3;
  if (!isRecord(b.state) || !isRecord(b.clock)) return null;
  const st = b.state;
  const state: Record<string, unknown> = { ...st, suspendReason: st.suspendReason ?? null, hint: st.hint ?? null, summary: st.summary ?? null, armed: asArray(st.armed), resolved: asArray(st.resolved) };
  if (isRecord(state.summary)) state.summary = { ...state.summary, stages: asArray((state.summary as Record<string, unknown>).stages) };
  if (!isDisplayState(state)) return null;
  const c = b.clock;
  const ok = typeof b.ownerId === "string" && typeof b.ownerStartedAt === "number" && typeof b.sessionEpoch === "number" && Number.isSafeInteger(b.runId) && Number.isSafeInteger(b.revision) &&
    Number.isSafeInteger(c.seq) && typeof c.distance === "number" && Number.isFinite(c.distance) && c.distance >= 0 && typeof c.speed === "number" && Number.isFinite(c.speed) && c.speed >= 0 && typeof c.running === "boolean";
  if (!ok || typeof raw.sessionId !== "string" || typeof raw.seed !== "number" || typeof raw.createdAt !== "number" || typeof raw.config.childFirstName !== "string") return null;
  return {
    engine: RUNNER_ENGINE_TAG, engineVersion: RUNNER_ENGINE_VERSION, sessionId: raw.sessionId, seed: raw.seed, createdAt: raw.createdAt,
    gameState: legacyGameState(state.lifecycle), currentDifficulty: difficultyOfIndex(state.stageIndex),
    currentStage: { stageNumber: ((state.stageIndex % 3) + 1) as 1 | 2 | 3, stageIndex: state.stageIndex },
    config: { childFirstName: raw.config.childFirstName },
    rq3: {
      ownerId: b.ownerId as string, ownerStartedAt: b.ownerStartedAt as number, sessionEpoch: b.sessionEpoch as number, runId: b.runId as number, revision: b.revision as number, state,
      clock: { seq: c.seq as number, distance: c.distance as number, speed: c.speed as number, running: c.running as boolean },
    },
  };
}

/** The same two protocol messages the local channel carries, so the Display replica needs no second code path. */
export function liveToMessages(s: RunnerLiveSession): { state: Message; clock: Message } {
  const b = s.rq3;
  const id = { ownerId: b.ownerId, ownerStartedAt: b.ownerStartedAt, sessionId: s.sessionId, sessionEpoch: b.sessionEpoch, runId: b.runId };
  return {
    state: { v: PROTOCOL_VERSION, type: "state", revision: b.revision, sentAtMs: 0, state: b.state, ...id },
    clock: { v: PROTOCOL_VERSION, type: "clock", revision: b.revision, seq: b.clock.seq, distance: b.clock.distance, speed: b.clock.speed, running: b.clock.running, ...id },
  };
}

// ---------------------------------------------------------------- publisher

export interface LiveWrite { sessionId: string; revision: number; session: RunnerLiveSession }
export interface PublisherDeps {
  /** One Firebase write. Rejects on failure (rules, offline, revision conflict). */
  write(record: LiveWrite): Promise<void>;
  /** Highest revision currently stored, used to re-base after a failed write. */
  fetchBaseRevision(): Promise<number>;
  now(): number;
  onError?(e: unknown): void;
}

/**
 * Turns the runtime's message stream into a bounded number of live-record writes: every state change
 * at once (one write in flight, the latest pending state wins), clock samples at most once per second,
 * nothing until enabled (child name present), and a back-off retry on failure.
 */
export class RunnerLivePublisher {
  private state: (Message & { type: "state" }) | null = null;
  private clock: (Message & { type: "clock" }) | null = null;
  private enabled = false;
  private childName = "";
  private seed = 0;
  private createdAt = 0;
  private revision = 0;
  private inFlight = false;
  private dirty = false;
  private lastWriteAt = -Infinity;
  private lastWrittenClockSeq = -1;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  writes = 0;
  constructor(private readonly deps: PublisherDeps) {}

  setBaseRevision(revision: number): void { this.revision = Math.max(this.revision, revision); }
  setSessionMeta(seed: number, createdAt: number): void { this.seed = seed; this.createdAt = createdAt; }
  setChildName(name: string): void { const c = sanitizeChildName(name); if (c === this.childName) return; this.childName = c; this.markDirty(); }
  setEnabled(enabled: boolean): void { if (enabled === this.enabled) return; this.enabled = enabled; if (enabled) this.markDirty(); }

  /** Feed every message the runtime sends. */
  push(m: Message): void {
    if (m.type === "state") { this.state = m; this.markDirty(); }
    else if (m.type === "clock") {
      this.clock = m;
      if (this.enabled && m.running && this.deps.now() - this.lastWriteAt >= LIVE_CLOCK_INTERVAL_MS && m.seq !== this.lastWrittenClockSeq) this.markDirty();
    }
  }
  private markDirty(): void { this.dirty = true; void this.flush(); }

  private async flush(): Promise<void> {
    if (this.inFlight || !this.dirty || !this.enabled || !this.state || this.childName.length === 0) return;
    this.inFlight = true; this.dirty = false;
    let failed = false;
    const state = this.state, clock = this.clock, revision = ++this.revision;
    try {
      await this.deps.write({ sessionId: state.sessionId, revision, session: buildLiveSession({ state, clock, seed: this.seed, createdAt: this.createdAt, childFirstName: this.childName }) });
      this.writes++;
      this.lastWriteAt = this.deps.now();
      if (clock && clock.revision === state.revision) this.lastWrittenClockSeq = clock.seq;
    } catch (e) {
      this.deps.onError?.(e);
      try { this.revision = Math.max(this.revision, await this.deps.fetchBaseRevision()); } catch { /* offline: next push retries */ }
      this.dirty = true; failed = true;
    } finally { this.inFlight = false; }
    if (failed) {
      if (this.retryTimer === null) this.retryTimer = setTimeout(() => { this.retryTimer = null; void this.flush(); }, RETRY_MS);
      return;
    }
    if (this.dirty) await this.flush();
  }

  dispose(): void { this.enabled = false; if (this.retryTimer !== null) clearTimeout(this.retryTimer); this.retryTimer = null; }
}

export { CLOCK_INTERVAL_MS };

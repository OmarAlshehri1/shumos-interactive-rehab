/**
 * Balloon Quest 3D over the EXISTING production live-session record.
 *
 * The new engine is published under the existing `balloon-quest` game id
 * (identity preserved, no Firebase rules change): `liveSession.session` carries
 * the generic fields every consumer already expects plus `engine: "bq3"` and a
 * `bq3` block holding the versioned Control -> Display messages. Balloon
 * positions are still never sent — only state changes (a few per second at
 * most) and a ~1 Hz clock sample.
 */
import { GameState } from "@/lib/game";
import { CLOCK_INTERVAL_MS, isDisplayState, PROTOCOL_VERSION, type DisplayState, type Message } from "./protocol";
import { DIFFICULTIES, type Difficulty, type Lifecycle, type StageNumber } from "./types";

export const ENGINE_TAG = "bq3" as const;
export const ENGINE_VERSION = 1 as const;
/** Firebase clock refresh. The Display extrapolates between samples, so 1 Hz is plenty. */
export const LIVE_CLOCK_INTERVAL_MS = 1000;
const RETRY_MS = 1000;

export interface Bq3LiveBlock {
  ownerId: string;
  ownerStartedAt: number;
  sessionEpoch: number;
  runId: number;
  revision: number;
  state: DisplayState;
  clock: { seq: number; simTimeMs: number; running: boolean };
  /** The Control's full authoritative Session as JSON, matching `state` (reload recovery; see recovery.ts). Never read by the Display. */
  snapshot?: string;
  /** Which Control window published this (per-tab id kept in sessionStorage). */
  controlTabId?: string;
  /** Set by a window that adopted this session from another window: names the window that must now stand down. */
  takeoverFrom?: string;
  /** Wall clock of the Control's last write: lets a reloaded Control tell a vanished owner from a live one. */
  heartbeatAt?: number;
}

/** What `liveSession.session` holds for the new engine. Field names match what the generic consumers read. */
export interface Bq3LiveSession {
  engine: typeof ENGINE_TAG;
  engineVersion: typeof ENGINE_VERSION;
  sessionId: string;
  seed: number;
  createdAt: number;
  gameState: GameState;
  currentDifficulty: Difficulty;
  currentStage: { stageNumber: StageNumber; stageIndex: number };
  config: { childFirstName: string };
  bq3: Bq3LiveBlock;
}

export function legacyGameState(lifecycle: Lifecycle): GameState {
  switch (lifecycle) {
    case "ready":
      return GameState.START_ZONE;
    case "playing":
    case "paused":
    case "suspended":
      return GameState.PLAYING;
    case "stage-complete":
      return GameState.STAGE_COMPLETE;
    case "completed":
    case "ended":
      return GameState.SESSION_COMPLETE;
  }
}

export const sanitizeChildName = (name: string): string => name.trim().slice(0, 30);

export function isBq3Session(raw: unknown): boolean {
  return !!raw && typeof raw === "object" && (raw as { engine?: unknown }).engine === ENGINE_TAG;
}

interface BuildInput {
  state: Message & { type: "state" };
  clock: (Message & { type: "clock" }) | null;
  seed: number;
  createdAt: number;
  childFirstName: string;
  snapshot?: string | null;
  controlTabId?: string | null;
  takeoverFrom?: string | null;
  heartbeatAt?: number;
}

export function buildLiveSession({ state: m, clock, seed, createdAt, childFirstName, snapshot, controlTabId, takeoverFrom, heartbeatAt }: BuildInput): Bq3LiveSession {
  const s = m.state;
  return {
    engine: ENGINE_TAG,
    engineVersion: ENGINE_VERSION,
    sessionId: m.sessionId,
    seed,
    createdAt,
    gameState: legacyGameState(s.lifecycle),
    currentDifficulty: s.difficulty,
    currentStage: { stageNumber: s.stage, stageIndex: s.stageIndex },
    config: { childFirstName: sanitizeChildName(childFirstName) },
    bq3: {
      ownerId: m.ownerId,
      ownerStartedAt: m.ownerStartedAt,
      sessionEpoch: m.sessionEpoch,
      runId: m.runId,
      revision: m.revision,
      state: s,
      // The clock sample is only valid for the state revision it was taken at.
      clock: clock && clock.revision === m.revision ? { seq: clock.seq, simTimeMs: clock.simTimeMs, running: clock.running } : { seq: 0, simTimeMs: s.simTimeMs, running: s.running },
      ...(snapshot ? { snapshot } : {}),
      ...(controlTabId ? { controlTabId } : {}),
      ...(takeoverFrom ? { takeoverFrom } : {}),
      ...(typeof heartbeatAt === "number" ? { heartbeatAt } : {}),
    },
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Realtime Database drops nulls and empty arrays, so a record read back is
 * repaired to the shape the protocol validators expect before it is checked.
 * Returns null for anything that does not validate: a malformed record fails
 * safely to the waiting world rather than rendering a guess.
 */
export function reviveBq3Session(raw: unknown): Bq3LiveSession | null {
  if (!isRecord(raw) || raw.engine !== ENGINE_TAG || raw.engineVersion !== ENGINE_VERSION || !isRecord(raw.bq3) || !isRecord(raw.config)) return null;
  const b = raw.bq3;
  if (!isRecord(b.state) || !isRecord(b.clock)) return null;
  const st = b.state;
  const state = {
    ...st,
    suspendReason: st.suspendReason ?? null,
    balloons: Array.isArray(st.balloons) ? st.balloons : st.balloons && typeof st.balloons === "object" ? Object.values(st.balloons as object) : [],
    summary: st.summary ?? null,
  };
  if (isRecord(state.summary)) {
    const sm = state.summary as Record<string, unknown>;
    sm.stages = Array.isArray(sm.stages) ? sm.stages : sm.stages && typeof sm.stages === "object" ? Object.values(sm.stages as object) : [];
  }
  if (!isDisplayState(state)) return null;
  const c = b.clock;
  const ok =
    typeof b.ownerId === "string" && typeof b.ownerStartedAt === "number" && typeof b.sessionEpoch === "number" && Number.isSafeInteger(b.runId) && Number.isSafeInteger(b.revision) &&
    Number.isSafeInteger(c.seq) && typeof c.simTimeMs === "number" && Number.isFinite(c.simTimeMs) && typeof c.running === "boolean";
  if (!ok || typeof raw.sessionId !== "string" || typeof raw.seed !== "number" || typeof raw.createdAt !== "number" || typeof raw.config.childFirstName !== "string") return null;
  return {
    engine: ENGINE_TAG,
    engineVersion: ENGINE_VERSION,
    sessionId: raw.sessionId,
    seed: raw.seed,
    createdAt: raw.createdAt,
    gameState: legacyGameState(state.lifecycle),
    currentDifficulty: state.difficulty,
    currentStage: { stageNumber: state.stage, stageIndex: state.stageIndex },
    config: { childFirstName: raw.config.childFirstName },
    bq3: {
      ownerId: b.ownerId as string,
      ownerStartedAt: b.ownerStartedAt as number,
      sessionEpoch: b.sessionEpoch as number,
      runId: b.runId as number,
      revision: b.revision as number,
      state,
      clock: { seq: c.seq as number, simTimeMs: c.simTimeMs as number, running: c.running as boolean },
      ...(typeof b.snapshot === "string" ? { snapshot: b.snapshot } : {}),
      ...(typeof b.controlTabId === "string" ? { controlTabId: b.controlTabId } : {}),
      ...(typeof b.takeoverFrom === "string" ? { takeoverFrom: b.takeoverFrom } : {}),
      ...(typeof b.heartbeatAt === "number" ? { heartbeatAt: b.heartbeatAt } : {}),
    },
  };
}

/** The same two protocol messages the BroadcastChannel path carries, so the Display replica needs no second code path. */
export function bq3ToMessages(s: Bq3LiveSession): { state: Message; clock: Message } {
  const b = s.bq3;
  const id = { ownerId: b.ownerId, ownerStartedAt: b.ownerStartedAt, sessionId: s.sessionId, sessionEpoch: b.sessionEpoch, runId: b.runId };
  return {
    state: { v: PROTOCOL_VERSION, type: "state", revision: b.revision, sentAtMs: 0, state: b.state, ...id },
    clock: { v: PROTOCOL_VERSION, type: "clock", revision: b.revision, seq: b.clock.seq, simTimeMs: b.clock.simTimeMs, running: b.clock.running, ...id },
  };
}

export const difficultyOfIndex = (i: number): Difficulty => DIFFICULTIES[Math.floor(i / 3)];

// ---------------------------------------------------------------- publisher

export interface LiveWrite {
  sessionId: string;
  revision: number;
  session: Bq3LiveSession;
}

export interface PublisherDeps {
  /** One Firebase write. Rejects on failure (rules, offline, revision conflict). */
  write(record: LiveWrite): Promise<void>;
  /** Highest revision currently stored, used to re-base after a failed write. */
  fetchBaseRevision(): Promise<number>;
  now(): number;
  onError?(e: unknown): void;
}

/**
 * Turns the runtime's message stream into a bounded number of live-record
 * writes: every state change is written at once (one in flight at a time, the
 * latest pending state wins), clock samples at most once per second, and
 * nothing at all until enabled (child name present).
 */
export class LivePublisher {
  private state: (Message & { type: "state" }) | null = null;
  private clock: (Message & { type: "clock" }) | null = null;
  private enabled = false;
  private childName = "";
  private seed = 0;
  private createdAt = 0;
  private snapshot: string | null = null;
  private tabId: string | null = null;
  private takeoverFrom: string | null = null;
  private revision = 0;
  private inFlight = false;
  private dirty = false;
  private lastWriteAt = -Infinity;
  private lastWrittenClockSeq = -1;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  writes = 0;

  constructor(private readonly deps: PublisherDeps) {}

  setBaseRevision(revision: number): void {
    this.revision = Math.max(this.revision, revision);
  }
  setSessionMeta(seed: number, createdAt: number): void {
    this.seed = seed;
    this.createdAt = createdAt;
  }
  /** The Session (JSON) that matches the state message pushed next; written with it for reload recovery. */
  setSnapshot(json: string): void {
    this.snapshot = json;
  }
  setTabId(id: string): void {
    this.tabId = id;
  }
  /** Marks every following write as a hand-over from another window (that window then stands down). */
  setTakeoverFrom(id: string | null): void {
    this.takeoverFrom = id;
  }
  /** Liveness: rewrites the current record (fresh heartbeat) if nothing was written for `everyMs`. */
  touch(everyMs: number): void {
    if (this.enabled && this.state && this.deps.now() - this.lastWriteAt >= everyMs) this.markDirty();
  }
  setChildName(name: string): void {
    const clean = sanitizeChildName(name);
    if (clean === this.childName) return;
    this.childName = clean;
    this.markDirty();
  }
  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    if (enabled) this.markDirty();
  }
  /** Feed every message the runtime sends. */
  push(m: Message): void {
    if (m.type === "state") {
      this.state = m;
      this.markDirty();
    } else if (m.type === "clock") {
      this.clock = m;
      if (this.enabled && m.running && this.deps.now() - this.lastWriteAt >= LIVE_CLOCK_INTERVAL_MS && m.seq !== this.lastWrittenClockSeq) this.markDirty();
    }
  }

  private markDirty(): void {
    this.dirty = true;
    void this.flush();
  }

  private async flush(): Promise<void> {
    if (this.inFlight || !this.dirty || !this.enabled || !this.state || this.childName.length === 0) return;
    this.inFlight = true;
    this.dirty = false;
    let failed = false;
    const state = this.state;
    const clock = this.clock;
    const revision = ++this.revision;
    try {
      await this.deps.write({ sessionId: state.sessionId, revision, session: buildLiveSession({ state, clock, seed: this.seed, createdAt: this.createdAt, childFirstName: this.childName, snapshot: this.snapshot, controlTabId: this.tabId, takeoverFrom: this.takeoverFrom, heartbeatAt: this.deps.now() }) });
      this.writes++;
      this.lastWriteAt = this.deps.now();
      if (clock && clock.revision === state.revision) this.lastWrittenClockSeq = clock.seq;
    } catch (e) {
      this.deps.onError?.(e);
      // Re-base on whatever is stored, then try again with the latest state.
      try {
        this.revision = Math.max(this.revision, await this.deps.fetchBaseRevision());
      } catch {
        /* offline: the next push retries */
      }
      this.dirty = true;
      failed = true;
    } finally {
      this.inFlight = false;
    }
    if (failed) {
      // Back off instead of spinning while the write keeps failing (offline, rules, conflict).
      if (this.retryTimer === null) {
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          void this.flush();
        }, RETRY_MS);
      }
      return;
    }
    if (this.dirty) await this.flush();
  }

  dispose(): void {
    this.enabled = false;
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
}

export { CLOCK_INTERVAL_MS };

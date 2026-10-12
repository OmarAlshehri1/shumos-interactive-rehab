/**
 * Authoritative Balloon Quest 3D Control runtime. Owns simulation time,
 * balloon positions, accepted selections, scoring, stage progression and the
 * session lifecycle. DOM-free: time and transport are injected, so the full
 * Control <-> Display behaviour is testable without a browser.
 */
import { InputHub } from "./input/hub";
import { KeyboardCursor } from "./input/keyboard";
import { SelectionPipeline } from "./input/pipeline";
import { requiresLiveInput, type PointerSample } from "./input/types";
import { ACK_INTERVAL_MS, CLOCK_INTERVAL_MS, DISPLAY_TIMEOUT_MS, parseMessage, PROTOCOL_VERSION, toDisplayState, type Identity, type Message } from "./protocol";
import { hashSeed } from "./rng";
import {
  advanceStage, createSession, endSession, newRun, pauseSession, recoverSession, restartStage, resumeSession, selectBalloon, setStart, skipStage, startSession, suspendSession, tickSession, updateSettings,
  type SelectRequest,
} from "./session";
import type { Difficulty, Session, SourceId, StageNumber, SuspendReason, TherapistSettings } from "./types";

/** A frame gap longer than this is treated as a scheduling gap: hold, never silently advance. */
export const GAP_MS = 300;
export const INPUT_LOSS_GRACE_MS = 600;
export const INPUT_RECOVERY_MS = 300;
/** After a therapist tap, a missing sensor does not re-hold the game for this long. */
export const MANUAL_GRACE_MS = 20_000;
export const AUTO_ADVANCE_MS = 3500;
const RESEND_MIN_MS = 250;
const IDLE_HEARTBEAT_MS = 1000;

export type Command =
  | { type: "start" | "pause" | "resume" | "restart" | "skip" | "advance" | "end" | "new-run" }
  | { type: "new-session"; difficulty: Difficulty; stage: StageNumber }
  | { type: "start-at"; difficulty: Difficulty; stage: StageNumber }
  | { type: "settings"; patch: Partial<TherapistSettings> };

export interface ControlView {
  session: Session;
  displays: number;
  displayReady: boolean;
  inputOk: boolean;
  sources: ReturnType<InputHub["status"]>;
  /** Why the last command was refused, for the therapist UI. */
  lastRefusal: string | null;
  canStart: boolean;
}

export interface RuntimeDeps {
  /** Monotonic clock, ms. */
  now(): number;
  /** Wall clock, ms since epoch. */
  wall(): number;
  send(m: Message): void;
  ownerId: string;
  newId(): string;
  seed?: number;
  settings?: Partial<TherapistSettings>;
  onView?(view: ControlView): void;
  /**
   * Production transport: whether a Display is currently connected, as reported by the
   * existing Firebase display presence. When provided it replaces the BroadcastChannel
   * acknowledgement bookkeeping (a networked Display never sends acks).
   */
  externalDisplayReady?(): boolean;
}

interface DisplayInfo {
  lastAckAt: number;
  visible: boolean;
  revision: number;
  seq: number;
}

export class ControlRuntime {
  session: Session;
  readonly hub = new InputHub();
  readonly pipeline = new SelectionPipeline();
  readonly keyboard = new KeyboardCursor();
  private readonly ownerStartedAt: number;
  private displays = new Map<string, DisplayInfo>();
  private lastTickAt: number;
  private lastPublishedRevision = -1;
  private lastClockAt = -Infinity;
  private lastStateSentAt = -Infinity;
  private clockSeq = 0;
  private inputLostMs = 0;
  private manualUntilMs = 0;
  /** A recovered between-stage state waits for the therapist instead of auto-advancing. */
  private awaitConfirm = false;
  private inputRecoveredMs = 0;
  private stageCompleteAt: number | null = null;
  private lastRefusal: string | null = null;
  private lastViewKey = "";
  private lastViewRevision = -1;
  private lastViewAt = -Infinity;
  private disposed = false;

  constructor(private readonly deps: RuntimeDeps) {
    this.ownerStartedAt = deps.wall();
    this.lastTickAt = deps.now();
    this.session = this.fresh({ settings: deps.settings });
    this.hub.setMode(this.session.settings.inputMode);
  }

  private fresh(p: { difficulty?: Difficulty; stage?: StageNumber; settings?: Partial<TherapistSettings> }): Session {
    const seed = this.deps.seed ?? hashSeed(this.deps.newId());
    return createSession({ sessionId: this.deps.newId(), sessionEpoch: this.deps.wall(), seed, startDifficulty: p.difficulty, startStage: p.stage, settings: p.settings });
  }

  private get identity(): Identity {
    return { ownerId: this.deps.ownerId, ownerStartedAt: this.ownerStartedAt, sessionId: this.session.sessionId, sessionEpoch: this.session.sessionEpoch, runId: this.session.runId };
  }

  getSimTimeMs(): number {
    return this.session.stage?.simTimeMs ?? 0;
  }

  // ---- input ----
  /** Hands call this (via the React bridge); simulated sources call it directly. */
  ingestPointer(sample: PointerSample): ReturnType<InputHub["ingest"]> {
    return this.hub.ingest(sample, this.deps.now());
  }
  press(source: SourceId): boolean {
    return this.hub.press(source);
  }
  /** Therapist taps a balloon on the Control preview. Always a deliberate human action; still subject to the playing gate. */
  therapistSelect(balloonId: string): boolean {
    const now = this.deps.now();
    // A tap while the game is held for lost sensor input means the therapist is carrying on by hand:
    // resume, and do not re-hold for the missing sensor while taps keep coming.
    if (this.session.lifecycle === "suspended" && this.session.suspendReason === "input-lost") {
      this.session = resumeSession(this.session);
      this.inputLostMs = 0;
      this.inputRecoveredMs = 0;
      this.pipeline.reset();
    }
    this.manualUntilMs = now + MANUAL_GRACE_MS;
    const r = selectBalloon(this.session, { balloonId, source: "THERAPIST", inputEventId: `THERAPIST:${this.deps.newId()}` });
    if (r.outcome === "ignored") return false;
    this.session = r.session;
    this.afterChange();
    return true;
  }
  notePendingRecenter(source: SourceId): void {
    this.pipeline.notePendingRecenter(source);
  }

  // ---- messages from Displays ----
  receive(raw: unknown): void {
    if (this.disposed) return;
    const m = parseMessage(raw);
    if (!m) return;
    const now = this.deps.now();
    if (m.type === "probe") {
      this.deps.send({ v: PROTOCOL_VERSION, type: "sync", displayId: m.displayId, nonce: m.nonce, revision: this.session.revision, sentAtMs: this.deps.wall(), state: toDisplayState(this.session)!, ...this.identity });
      return;
    }
    if (m.type !== "ack" || m.ownerId !== this.deps.ownerId) return;
    const prev = this.displays.get(m.displayId);
    if (prev && m.seq <= prev.seq) return; // stale or duplicated ack
    this.displays.set(m.displayId, { lastAckAt: now, visible: m.visible, revision: m.revision, seq: m.seq });
    // Message-loss recovery: a Display that is behind gets the current state again (rate limited).
    const behind = m.sessionEpoch !== this.session.sessionEpoch || m.runId !== this.session.runId || m.revision < this.session.revision;
    if (behind && now - this.lastStateSentAt >= RESEND_MIN_MS) this.sendState(now);
    this.emitView(true);
  }

  private displayReady(now: number): boolean {
    if (this.deps.externalDisplayReady) return this.deps.externalDisplayReady();
    for (const d of this.displays.values()) if (d.visible && now - d.lastAckAt <= DISPLAY_TIMEOUT_MS) return true;
    return false;
  }
  private liveDisplays(now: number): number {
    if (this.deps.externalDisplayReady) return this.deps.externalDisplayReady() ? 1 : 0;
    let n = 0;
    for (const d of this.displays.values()) if (now - d.lastAckAt <= DISPLAY_TIMEOUT_MS) n++;
    return n;
  }

  // ---- commands ----
  command(cmd: Command, expect?: { sessionEpoch: number; runId: number }): boolean {
    if (this.disposed) return false;
    if (expect && (expect.sessionEpoch !== this.session.sessionEpoch || expect.runId !== this.session.runId)) return this.refuse("الأمر لجلسة سابقة");
    const now = this.deps.now();
    const before = this.session;
    let next = before;
    switch (cmd.type) {
      case "start":
        if (before.lifecycle !== "ready") return this.refuse("الجلسة ليست في حالة الجاهزية");
        if (!before.settings.allowNoDisplay && !this.displayReady(now)) return this.refuse("افتح شاشة العرض أولًا أو فعّل «بدون شاشة عرض»");
        if (requiresLiveInput(before.settings.inputMode) && !this.hub.hasLiveInput(now)) return this.refuse("لا يوجد إدخال حي من الحساس المختار");
        this.pipeline.reset();
        next = startSession(before);
        break;
      case "pause":
        next = pauseSession(before);
        break;
      case "resume":
        if (before.lifecycle === "suspended" && requiresLiveInput(before.settings.inputMode) && !this.hub.hasLiveInput(now)) return this.refuse("لا يمكن الاستئناف قبل عودة الإدخال");
        if (before.lifecycle === "suspended" && before.suspendReason === "display-unavailable" && !before.settings.allowNoDisplay && !this.displayReady(now)) return this.refuse("شاشة العرض غير متاحة");
        this.pipeline.reset();
        next = resumeSession(before);
        break;
      case "restart":
        next = restartStage(before);
        this.pipeline.reset();
        break;
      case "skip":
        next = skipStage(before);
        this.pipeline.reset();
        break;
      case "advance":
        next = advanceStage(before);
        this.pipeline.reset();
        break;
      case "end":
        next = endSession(before);
        break;
      case "new-run":
        next = newRun(before);
        this.pipeline.reset();
        break;
      case "new-session":
        next = this.fresh({ difficulty: cmd.difficulty, stage: cmd.stage, settings: before.settings });
        this.pipeline.reset();
        break;
      case "start-at":
        next = setStart(before, cmd.difficulty, cmd.stage);
        break;
      case "settings":
        next = updateSettings(before, cmd.patch);
        if (next.settings.inputMode !== before.settings.inputMode) {
          this.hub.setMode(next.settings.inputMode);
          this.pipeline.reset();
          this.inputLostMs = 0;
        }
        break;
    }
    // Re-applying the value a setting already has is not an error worth showing the therapist.
    if (next === before && (cmd.type === "settings" || cmd.type === "start-at")) return true;
    if (next === before) return this.refuse("غير متاح في الحالة الحالية");
    this.lastRefusal = null;
    this.session = next;
    this.afterChange();
    return true;
  }

  private refuse(reason: string): false {
    this.lastRefusal = reason;
    this.emitView(true);
    return false;
  }

  // ---- frame ----
  tick(): void {
    if (this.disposed) return;
    const now = this.deps.now();
    const dt = Math.max(0, now - this.lastTickAt);
    this.lastTickAt = now;
    if (this.session.settings.inputMode === "keyboard") {
      this.keyboard.step(dt);
      this.hub.ingest(this.keyboard.sample(now), now);
    }
    let s = this.session;

    if (s.lifecycle === "playing") {
      if (dt > GAP_MS) s = suspendSession(s, "scheduling-gap");
      else {
        const live = this.hub.hasLiveInput(now);
        this.inputLostMs = live || now < this.manualUntilMs ? 0 : this.inputLostMs + dt;
        if (this.inputLostMs >= INPUT_LOSS_GRACE_MS) s = suspendSession(s, "input-lost");
        else if (!s.settings.allowNoDisplay && !this.displayReady(now)) s = suspendSession(s, "display-unavailable");
      }
    } else if (s.lifecycle === "suspended") {
      s = this.maybeAutoResume(s, now, dt);
    }

    if (s.lifecycle === "playing") {
      s = tickSession(s, dt);
      for (const req of this.pipeline.process(s, this.hub, now)) {
        const r = selectBalloon(s, req as SelectRequest);
        s = r.session;
        if (s.lifecycle !== "playing") break;
      }
    } else {
      this.pipeline.process(s, this.hub, now); // keeps presses/gates drained and re-armed while held
    }

    if (s.lifecycle === "stage-complete") {
      this.stageCompleteAt ??= now;
      if (s.settings.autoAdvance && !this.awaitConfirm && now - this.stageCompleteAt >= AUTO_ADVANCE_MS) {
        s = advanceStage(s);
        this.pipeline.reset();
      }
    } else {
      this.stageCompleteAt = null;
      this.awaitConfirm = false;
    }

    this.session = s;
    this.afterChange(now);
  }

  private maybeAutoResume(s: Session, now: number, dt: number): Session {
    const reason: SuspendReason | null = s.suspendReason;
    if (reason === "input-lost") {
      if (this.hub.hasLiveInput(now)) this.inputRecoveredMs += dt;
      else this.inputRecoveredMs = 0;
      if (this.inputRecoveredMs >= INPUT_RECOVERY_MS) {
        this.inputRecoveredMs = 0;
        this.inputLostMs = 0;
        this.pipeline.reset(); // pointer already on a balloon never counts as a fresh contact
        return resumeSession(s);
      }
    } else if (reason === "display-unavailable" && (s.settings.allowNoDisplay || this.displayReady(now))) {
      this.pipeline.reset();
      return resumeSession(s);
    }
    return s;
  }

  /**
   * Adopts a previously published session after the Control was reloaded (see recovery.ts for how it is found and
   * validated). Play comes back paused; only an explicit therapist command continues it.
   */
  adopt(snapshot: Session): void {
    this.session = recoverSession(snapshot);
    this.hub.setMode(this.session.settings.inputMode);
    this.pipeline.reset();
    this.inputLostMs = 0;
    this.inputRecoveredMs = 0;
    this.manualUntilMs = 0;
    this.stageCompleteAt = null;
    this.awaitConfirm = this.session.lifecycle === "stage-complete";
    this.lastPublishedRevision = -1;
    this.lastTickAt = this.deps.now();
    this.afterChange();
  }

  /** Browser-level holds (tab hidden etc.): never auto-resumed. */
  suspend(reason: SuspendReason): void {
    const next = suspendSession(this.session, reason);
    if (next !== this.session) {
      this.session = next;
      this.afterChange();
    }
  }

  // ---- publishing ----
  private afterChange(now = this.deps.now()): void {
    this.publish(now);
    // Health (display/input) can change without a revision bump, so refresh the UI view at most 4x/second.
    if (this.session.revision !== this.lastViewRevision || now - this.lastViewAt >= 250) {
      this.lastViewRevision = this.session.revision;
      this.lastViewAt = now;
      this.emitView(false);
    }
  }

  private sendState(now: number): void {
    this.lastStateSentAt = now;
    this.deps.send({ v: PROTOCOL_VERSION, type: "state", revision: this.session.revision, sentAtMs: this.deps.wall(), state: toDisplayState(this.session)!, ...this.identity });
  }

  private publish(now: number): void {
    if (this.session.revision !== this.lastPublishedRevision) {
      this.lastPublishedRevision = this.session.revision;
      this.sendState(now);
      this.lastClockAt = now;
      return;
    }
    // While playing: a 4 Hz clock. While paused / held / between stages: a slow liveness heartbeat (running:false) so a Display can tell "Control is paused" from "Control is gone".
    const playing = this.session.lifecycle === "playing";
    if (now - this.lastClockAt >= (playing ? CLOCK_INTERVAL_MS : IDLE_HEARTBEAT_MS)) {
      this.lastClockAt = now;
      this.deps.send({ v: PROTOCOL_VERSION, type: "clock", revision: this.session.revision, seq: ++this.clockSeq, simTimeMs: this.getSimTimeMs(), running: playing, ...this.identity });
    }
  }

  view(): ControlView {
    const now = this.deps.now();
    const s = this.session;
    const displayReady = this.displayReady(now);
    return {
      session: s,
      displays: this.liveDisplays(now),
      displayReady,
      inputOk: this.hub.hasLiveInput(now),
      sources: this.hub.status(now),
      lastRefusal: this.lastRefusal,
      canStart: s.lifecycle === "ready" && (s.settings.allowNoDisplay || displayReady) && this.hub.hasLiveInput(now),
    };
  }

  private emitView(force: boolean): void {
    if (!this.deps.onView) return;
    const v = this.view();
    // Re-render the UI only when something it shows changed (never per animation frame).
    const key = `${v.session.revision}|${v.displays}|${v.displayReady}|${v.inputOk}|${v.sources.map((x) => x.state).join(",")}|${v.lastRefusal}|${v.canStart}`;
    if (!force && key === this.lastViewKey) return;
    this.lastViewKey = key;
    this.deps.onView(v);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.deps.send({ v: PROTOCOL_VERSION, type: "closed", ownerId: this.deps.ownerId });
  }
}

export { ACK_INTERVAL_MS };

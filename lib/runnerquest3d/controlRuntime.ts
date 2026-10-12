/**
 * Authoritative Runner Quest 3D Control runtime. Owns simulation time, accepted
 * movement, obstacle outcomes, scoring, stage progression and the lifecycle.
 * DOM-free: time and transport are injected, so the full Control <-> Display
 * behaviour is testable without a browser.
 */
import type { MotionSample } from "@/lib/physicalInput/types";
import { PhysicalRole } from "@/lib/physicalInput/types";
import { InputHub, isDirect, type HubResult, type RoleStatus } from "./input/hub";
import type { FootGesture } from "./input/footRecognizer";
import { SimulatedFootRig } from "./input/simulatedFoot";
import { ACK_INTERVAL_MS, CLOCK_INTERVAL_MS, DISPLAY_TIMEOUT_MS, parseMessage, PROTOCOL_VERSION, toDisplayState, type Identity, type Message } from "./protocol";
import { hashSeed } from "./rng";
import { advanceStage, applyAction, assistPastObstacle, createSession, endSession, newRun, pauseSession, repeatObjective, restartStage, resumeSession, selectStageRange, setProjection, skipObjective, skipStage, startSession, suspendSession, tickSession, updateSettings } from "./session";
import type { InputSourceId, Projection, RunnerAction, Session, SuspendReason, TherapistSettings } from "./types";

/** A frame gap longer than this is a scheduling gap: hold, never silently advance. */
export const GAP_MS = 500;
export const INPUT_LOSS_GRACE_MS = 700;
export const INPUT_RECOVERY_MS = 400;
const RESEND_MIN_MS = 250;
/** A sensor hint is only shown while it is recent: it describes a moment, not a state. */
export const FLOOR_HINT_FRESH_MS = 8000;
const ONSET_HINT_KEEP_MS = 6000;
const IDLE_HEARTBEAT_MS = 1000;

export type Command =
  | { type: "start" | "pause" | "resume" | "restart" | "skip" | "advance" | "end" | "new-run" | "assist" | "recenter" | "continue-manually" | "repeat" | "skip-objective" }
  | { type: "projection"; value: Projection }
  | { type: "range"; from: number; to: number }
  | { type: "allow-no-display"; value: boolean }
  | { type: "settings"; patch: Partial<TherapistSettings> };

export interface ControlView {
  session: Session;
  displays: number;
  displayReady: boolean;
  inputOk: boolean;
  inputReady: boolean;
  roles: RoleStatus[];
  allowNoDisplay: boolean;
  /** A sensor source is lost but the therapist chose to continue with manual controls. */
  sensorBypass: boolean;
  lastRefusal: string | null;
  canStart: boolean;
  /** Last accepted/blocked input, for the therapist diagnostics line. */
  lastInput: { text: string; at: number } | null;
  /**
   * FLOOR only. A foot sensor saw a movement onset or a return to rest. It is a HINT for the therapist: it never completes an
   * objective and never says where the child is; the therapist confirms the actual region/step.
   */
  floorHint: FloorHint | null;
}
export interface FloorHint { kind: "left" | "right" | "step" | "rest"; source: string; at: number }

export interface RuntimeDeps {
  now(): number;
  wall(): number;
  send(m: Message): void;
  ownerId: string;
  newId(): string;
  seed?: number;
  settings?: Partial<TherapistSettings>;
  startIndex?: number;
  endIndex?: number;
  projection?: Projection;
  onView?(view: ControlView): void;
  /**
   * Production transport: whether the Display is currently connected, as reported by the existing Firebase
   * display presence. When provided it replaces the BroadcastChannel acknowledgement bookkeeping.
   */
  externalDisplayReady?(): boolean;
}

interface DisplayInfo { lastAckAt: number; visible: boolean; revision: number; seq: number }

export class ControlRuntime {
  session: Session;
  readonly hub = new InputHub();
  readonly rig = new SimulatedFootRig();
  private readonly ownerStartedAt: number;
  private displays = new Map<string, DisplayInfo>();
  private lastTickAt: number;
  private lastPublishedRevision = -1;
  private lastClockAt = -Infinity;
  private lastStateSentAt = -Infinity;
  private clockSeq = 0;
  private inputLostMs = 0;
  private inputRecoveredMs = 0;
  private lastRefusal: string | null = null;
  private lastInput: { text: string; at: number } | null = null;
  private floorHint: FloorHint | null = null;
  private wasResting = true;
  private allowNoDisplay = false;
  private sensorBypass = false;
  private lastViewKey = "";
  private lastViewAt = -Infinity;
  private disposed = false;
  /** Counters used by tests/validation. */
  readonly counters = { accepted: 0, blocked: 0, ignoredRole: 0, wrongSource: 0, hinted: 0 };

  constructor(private readonly deps: RuntimeDeps) {
    this.ownerStartedAt = deps.wall();
    this.lastTickAt = deps.now();
    const seed = deps.seed ?? hashSeed(deps.newId());
    this.session = createSession({ sessionId: deps.newId(), sessionEpoch: deps.wall(), seed, startIndex: deps.startIndex, endIndex: deps.endIndex, settings: deps.settings, projection: deps.projection });
    this.syncHub();
  }

  private get identity(): Identity {
    return { ownerId: this.deps.ownerId, ownerStartedAt: this.ownerStartedAt, sessionId: this.session.sessionId, sessionEpoch: this.session.sessionEpoch, runId: this.session.runId };
  }

  private syncHub(): void {
    this.hub.setMode(this.session.settings.inputSource);
    this.hub.setSensitivity(this.session.settings.sensitivity, this.session.settings.tolerance);
  }

  // ---- input ----
  /** A foot sample from ANY adapter (simulated today, WT901 later). The hub decides whether it may matter. */
  ingestFoot(role: PhysicalRole | string, sample: MotionSample, receivedAt = this.deps.now()): HubResult {
    const r = this.hub.ingestFoot(role, sample, receivedAt);
    return this.handleHub(r, role, receivedAt, true);
  }
  /**
   * Therapist touch/manual action. Accepted in EVERY input mode (explicit override or assistance), shares
   * the sensors' debounce and goes through the same authoritative action path.
   */
  manual(action: RunnerAction): HubResult {
    const now = this.deps.now();
    return this.handleHub(this.hub.manual(action, now), "المعالج", now);
  }
  /** Keyboard (MANUAL / KEYBOARD sources). */
  key(key: string, repeat = false): HubResult {
    const now = this.deps.now();
    const r = this.hub.keyboard(key, repeat, now);
    return this.handleHub(r, "KEYBOARD", now);
  }
  private handleHub(r: HubResult, src: string, now: number, fromSensor = false): HubResult {
    if (r.reason === "ignored-role") this.counters.ignoredRole++;
    else if (r.reason === "wrong-source") this.counters.wrongSource++;
    if (!r.accepted || !r.action) return r;
    if (this.session.lifecycle !== "playing") { this.counters.blocked++; return { ...r, accepted: false }; }
    if (fromSensor && this.session.projection === "FLOOR") {
      // A WT901 reports orientation/movement, never floor position: it can only HINT. The therapist confirms what the child actually did.
      const a = r.action;
      this.floorHint = { kind: a.kind === "step" ? "step" : a.kind === "lane" ? (a.dir < 0 ? "left" : "right") : a.region < 0 ? "left" : a.region > 0 ? "right" : "rest", source: src, at: now };
      this.counters.hinted++;
      this.emitView(true);
      return { ...r, accepted: false };
    }
    const out = applyAction(this.session, r.action, r.inputId);
    if (out === "applied") {
      this.counters.accepted++;
      this.lastInput = { text: `${src}: ${r.action.kind === "lane" ? (r.action.dir < 0 ? "يسار" : "يمين") : r.action.kind === "region" ? (r.action.region < 0 ? "يسار" : r.action.region > 0 ? "يمين" : "المنتصف") : this.session.projection === "FLOOR" ? "تأكيد الحركة" : "رفع القدم"}`, at: now };
      this.afterChange(now);
      return r;
    }
    this.counters.blocked++;
    return { ...r, accepted: false };
  }
  /** Simulated gesture on a simulated foot sensor (UI pad / keyboard-in-simulation). */
  simulateGesture(role: PhysicalRole.RIGHT_FOOT | PhysicalRole.LEFT_FOOT, g: FootGesture): void {
    this.rig.sensorFor(role)?.trigger(g, this.deps.now());
  }
  simulateConnection(role: PhysicalRole.RIGHT_FOOT | PhysicalRole.LEFT_FOOT, connected: boolean): void {
    const sensor = this.rig.sensorFor(role)!;
    sensor.connected = connected;
    if (!connected) this.hub.markDisconnected(role);
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
    if (prev && m.seq <= prev.seq) return;
    this.displays.set(m.displayId, { lastAckAt: now, visible: m.visible, revision: m.revision, seq: m.seq });
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
    const s = this.session;
    if (expect && (expect.sessionEpoch !== s.sessionEpoch || expect.runId !== s.runId)) return this.refuse("الأمر لجلسة سابقة");
    const now = this.deps.now();
    let ok = false;
    switch (cmd.type) {
      case "start":
        if (s.lifecycle !== "ready") return this.refuse("الجلسة ليست في حالة الجاهزية");
        if (!this.allowNoDisplay && !this.displayReady(now)) return this.refuse("افتح شاشة العرض أولًا أو فعّل «معاينة بدون شاشة عرض»");
        if (!this.hub.isLive(now)) return this.refuse("لا يوجد إدخال حي من المصدر المختار");
        if (!this.hub.isReady()) return this.refuse("انتظر حتى يستقر وضع الراحة للحسّاس ثم أعد المحاولة");
        ok = startSession(s);
        this.inputLostMs = 0;
        break;
      case "pause": ok = pauseSession(s); break;
      case "resume":
        if (s.lifecycle === "suspended" && !this.hub.isLive(now)) return this.refuse("لا يمكن الاستئناف قبل عودة الإدخال");
        if (s.lifecycle === "suspended" && !this.hub.isReady()) return this.refuse("انتظر حتى يستقر وضع الراحة للحسّاس ثم استأنف");
        if (s.lifecycle === "suspended" && s.suspendReason === "display-unavailable" && !this.allowNoDisplay && !this.displayReady(now)) return this.refuse("شاشة العرض غير متاحة");
        ok = resumeSession(s);
        this.inputLostMs = 0;
        break;
      case "restart": ok = restartStage(s); this.floorHint = null; break;
      case "skip": ok = skipStage(s); this.floorHint = null; break;
      case "advance": ok = advanceStage(s); this.floorHint = null; break;
      case "end": ok = endSession(s); break;
      case "new-run": newRun(s); ok = true; break;
      case "assist": ok = assistPastObstacle(s); this.floorHint = null; break;
      case "repeat": ok = repeatObjective(s); break;
      case "skip-objective": ok = skipObjective(s); this.floorHint = null; break;
      case "projection": ok = setProjection(s, cmd.value); if (!ok) return this.refuse("اختر العرض (جداري/أرضي) قبل بدء الجلسة فقط"); break;
      case "continue-manually":
        if (s.lifecycle !== "suspended" || s.suspendReason !== "input-lost") return this.refuse("المتابعة اليدوية متاحة فقط بعد انقطاع الحسّاس");
        this.sensorBypass = true;
        this.inputLostMs = 0;
        ok = resumeSession(s);
        break;
      case "recenter": this.hub.recenter(now); this.lastInput = { text: "إعادة ضبط وضع الراحة", at: now }; ok = true; break;
      case "range": ok = selectStageRange(s, cmd.from, cmd.to); break;
      case "allow-no-display": this.allowNoDisplay = cmd.value; ok = true; break;
      case "settings": {
        const before = s.settings.inputSource;
        updateSettings(s, cmd.patch);
        this.syncHub();
        if (s.settings.inputSource !== before) { this.inputLostMs = 0; this.sensorBypass = false; }
        ok = true;
        break;
      }
    }
    if (!ok) return this.refuse("غير متاح في الحالة الحالية");
    this.lastRefusal = null;
    this.afterChange();
    return true;
  }

  private refuse(reason: string): false { this.lastRefusal = reason; this.emitView(true); return false; }

  // ---- frame ----
  tick(): void {
    if (this.disposed) return;
    const now = this.deps.now();
    const dt = Math.max(0, now - this.lastTickAt);
    this.lastTickAt = now;
    // Simulated sensors produce samples; real adapters call ingestFoot directly.
    if (!isDirect(this.session.settings.inputSource)) this.rig.pump(now, (role, sample, at) => { this.ingestFoot(role, sample, at); });
    const s = this.session;
    if (s.projection === "FLOOR" && !isDirect(s.settings.inputSource)) this.trackRestHint(now);
    if (s.lifecycle === "playing") {
      if (dt > GAP_MS) suspendSession(s, "scheduling-gap");
      else {
        const live = this.hub.isLive(now);
        if (this.sensorBypass && live && this.hub.isReady()) this.sensorBypass = false; // the sensor came back: automatic input resumes
        this.inputLostMs = live || this.sensorBypass ? 0 : this.inputLostMs + dt;
        if (this.inputLostMs >= INPUT_LOSS_GRACE_MS) suspendSession(s, "input-lost");
        else if (!this.allowNoDisplay && !this.displayReady(now)) suspendSession(s, "display-unavailable");
      }
    } else if (s.lifecycle === "suspended") this.maybeAutoResume(s, now, dt);
    if (s.lifecycle === "playing") tickSession(s, dt);
    this.afterChange(now);
  }

  /** FLOOR + foot sensors: the foot settled back to its rest pose after a movement => a "return to rest" hint (never auto-confirms). */
  private trackRestHint(now: number): void {
    const roles = this.hub.status(now);
    const resting = roles.length > 0 && roles.every((r) => r.fresh && r.state === "neutral");
    const onset = this.floorHint && this.floorHint.kind !== "rest" && now - this.floorHint.at < ONSET_HINT_KEEP_MS; // never bury a movement hint the therapist has not acted on yet
    if (resting && !this.wasResting && this.session.lifecycle === "playing" && !onset) {
      this.floorHint = { kind: "rest", source: roles.map((r) => String(r.role)).join("+"), at: now };
      this.emitView(true);
    }
    this.wasResting = resting;
  }

  private maybeAutoResume(s: Session, now: number, dt: number): void {
    const reason: SuspendReason | null = s.suspendReason;
    if (reason === "input-lost") {
      this.inputRecoveredMs = this.hub.isLive(now) && this.hub.isReady() ? this.inputRecoveredMs + dt : 0;
      // Recovery never resumes by itself into motion: the therapist resumes after the foot has settled.
    } else if (reason === "display-unavailable" && (this.allowNoDisplay || this.displayReady(now))) {
      resumeSession(s);
    }
  }

  /** Browser-level holds (tab hidden etc.): never auto-resumed. */
  suspend(reason: SuspendReason): void {
    if (suspendSession(this.session, reason)) this.afterChange();
  }

  // ---- publishing ----
  private afterChange(now = this.deps.now()): void {
    this.publish(now);
    if (this.session.revision !== this.lastPublishedRevision || now - this.lastViewAt >= 250) {
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
      this.emitView(false);
      return;
    }
    const playing = this.session.lifecycle === "playing";
    if (now - this.lastClockAt >= (playing ? CLOCK_INTERVAL_MS : IDLE_HEARTBEAT_MS)) {
      this.lastClockAt = now;
      const st = this.session.stage!;
      this.deps.send({ v: PROTOCOL_VERSION, type: "clock", revision: this.session.revision, seq: ++this.clockSeq, distance: st.distance, speed: st.speed, running: playing && !st.floor, ...this.identity });
    }
  }

  view(): ControlView {
    const now = this.deps.now();
    const s = this.session;
    const displayReady = this.displayReady(now);
    const inputOk = this.hub.isLive(now);
    return {
      session: s, displays: this.liveDisplays(now), displayReady, inputOk, inputReady: this.hub.isReady(), roles: this.hub.status(now), allowNoDisplay: this.allowNoDisplay,
      sensorBypass: this.sensorBypass, lastRefusal: this.lastRefusal, lastInput: this.lastInput, floorHint: this.floorHint && now - this.floorHint.at < FLOOR_HINT_FRESH_MS ? this.floorHint : null,
      canStart: s.lifecycle === "ready" && (this.allowNoDisplay || displayReady) && inputOk && this.hub.isReady(),
    };
  }

  private emitView(force: boolean): void {
    if (!this.deps.onView) return;
    const v = this.view();
    const key = `${v.session.revision}|${v.displays}|${v.displayReady}|${v.inputOk}|${v.inputReady}|${v.roles.map((x) => x.state + x.fresh).join(",")}|${v.lastRefusal}|${v.canStart}|${v.allowNoDisplay}|${v.sensorBypass}|${v.lastInput?.at ?? 0}|${v.floorHint?.at ?? 0}`;
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
export type { InputSourceId };

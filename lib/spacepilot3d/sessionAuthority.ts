import {NINE_STAGE_CURRICULUM,curriculumIndex,type CurriculumId} from './curriculum';
import { isAccessibility } from './rings';
import { WorldGameplaySimulation as GameplaySimulation } from "./worldGameplay";
import { isFlightSettings } from "./worldFlight";
import type { FlightDifficulty } from "./missions";
import { SENSOR_PICKUP_RADIUS, type SensorInputStatus } from "./sensorInput";
import type { NormalizedFlightInput, PrototypeInputMode } from "./simulation";
import { isId, isPointer, isRecord, isSequence, LINK_TIMEOUT_MS, type AcceptedOutcome, type ExperimentalSessionState, type PresentationFrame, type SessionAction, type SessionLifecycle, type SessionSummary, type SuspendReason } from "./sessionContract";

interface Subscriber { lastAck: number; visible: boolean; ready: boolean; epoch: number; sequence: number }
/** The only game simulation in a paired session. Instantiated exclusively by Control. */
export class SessionAuthority {
  readonly simulation: GameplaySimulation;
  revision = 1;
  eventSequence = 0;
  inputEpoch = 1;
  lifecycle: SessionLifecycle = "ready";
  reason: string | null = null;
  instructionsVisible = true;
  inputMode: PrototypeInputMode = "keyboard";
  primaryDisplayId: string | null = null;
  sensorStatus: SensorInputStatus = "waiting";
  summary: SessionSummary | null = null;
  readonly outcomes: AcceptedOutcome[] = [];
  private readonly subscribers = new Map<string, Subscriber>();
  private readonly sentFrames = new Map<number, { at: number; epoch: number; runId: number }>();
  private frameSequence = 0;
  private lastTick: number | null = null;
  private keyboard: { pointer: NormalizedFlightInput; received: number; sequence: number } | null = null;
  private keyboardSequence = -1;
  private sensorPointer: NormalizedFlightInput | null = null;
  private rawPointer: NormalizedFlightInput | null = null;
  private awaitingInputSince = 0;
  sensorSource: "local" | "remote" = "local";
  manualOverride = false;
  private manualPointer: NormalizedFlightInput | null = null;

  constructor(readonly roomId: string, readonly ownerId: string, readonly sessionId: string, difficulty: FlightDifficulty = "MEDIUM", private readonly linkTimeout = LINK_TIMEOUT_MS,curriculumId?:CurriculumId) {
    this.simulation = new GameplaySimulation({ sessionId, difficulty:curriculumId?'LOW':difficulty,curriculumId });
  }

  get difficulty(): FlightDifficulty { return this.simulation.config.difficulty; }
  private change(): void { this.revision++; }
  private invalidate(): void { this.inputEpoch++; this.keyboard = null; this.keyboardSequence = -1; this.simulation.invalidateInput(); this.lastTick = null; }
  suspend(reason: SuspendReason): void {
    if (this.lifecycle !== "running") return;
    this.simulation.pause(); this.lifecycle = "suspended"; this.reason = reason; this.invalidate(); this.change();
  }
  private displayReady(now: number): boolean {
    const display = this.primaryDisplayId ? this.subscribers.get(this.primaryDisplayId) : null;
    return !!display && display.epoch === this.inputEpoch && display.visible && display.ready && now >= display.lastAck && now - display.lastAck <= this.linkTimeout;
  }
  canPlay(now: number): boolean {
    const aligned = this.sensorPointer && Math.hypot(this.sensorPointer.x - this.simulation.ship.controlX, this.sensorPointer.y - this.simulation.ship.controlY) <= SENSOR_PICKUP_RADIUS;
    return this.displayReady(now) && (this.inputMode === "keyboard" || this.manualOverride || !!aligned);
  }

  /** No remote action/outcome messages are accepted. Only the therapist calls this. */
  command(action: SessionAction, expectedRevision: number, expectedRunId: number, now: number): boolean {
    if (expectedRevision !== this.revision || expectedRunId !== this.simulation.runId || this.lifecycle === "ended") return false;
    switch (action.type) {
      case "start":
        if (this.lifecycle !== "ready" || !this.canPlay(now)) return false;
        this.instructionsVisible=false; this.simulation.start(); this.lifecycle = "running"; break;
      case "resume":
        if (!["paused", "suspended"].includes(this.lifecycle) || !this.canPlay(now)) return false;
        this.simulation.resume(); this.lifecycle = "running"; break;
      case "pause":
        if (this.lifecycle !== "running") return false;
        this.simulation.pause(); this.lifecycle = "paused"; break;
      case "select-stage":
        if(!this.simulation.curriculumId||!curriculumIndex(action.value)||['completed','ended'].includes(this.lifecycle)||!this.simulation.selectStage(action.value))return false;
        this.lifecycle='ready';this.summary=null;this.retainOutcomes();break;
      case "restart-stage":case "repeat-stage":
        if(!this.simulation.selectStage(this.simulation.mission,true))return false;
        this.lifecycle='ready';this.summary=null;this.retainOutcomes();break;
      case "skip-stage":
        if(!this.simulation.skipStage())return false;
        this.lifecycle=this.simulation.status==='complete'?'completed':'mission-complete';
        if(this.lifecycle==='completed')this.summary=this.makeSummary('completed');break;
      case "restart":
        this.simulation.restart(); this.simulation.pause(); this.lifecycle = "paused"; this.outcomes.length = 0; this.summary = null; break;
      case "end":
        this.simulation.pause(); this.lifecycle = "ended"; this.summary = this.makeSummary("therapist-ended"); break;
      case "next-mission":
        if (this.lifecycle !== "mission-complete" || !this.canPlay(now)) return false;
        this.simulation.nextMission(); this.lifecycle = "running"; break;
      case "instructions":
        if(this.lifecycle!=="ready" || typeof action.value!=='boolean')return false;
        this.instructionsVisible=action.value;break;
      case "accessibility":
        if(!['ready','paused'].includes(this.lifecycle)||!isAccessibility(action.value))return false;
        if(this.simulation.curriculumId){this.simulation.config.accessibility={...action.value};this.simulation.selectStage(this.simulation.mission);this.lifecycle='ready';this.retainOutcomes();break;}
        this.simulation.restart({accessibility:action.value});this.simulation.pause();this.simulation.status='ready';this.outcomes.length=0;break;
      case "flight-settings":
        if (!['ready','paused'].includes(this.lifecycle) || !isFlightSettings(action.value)) return false;
        if(this.simulation.curriculumId){this.simulation.config.flightSettings={...action.value};this.simulation.selectStage(this.simulation.mission);this.lifecycle='ready';this.retainOutcomes();break;}
        this.simulation.restart({ flightSettings: action.value }); this.simulation.pause(); this.simulation.status = "ready";
        this.outcomes.length = 0; break;
      case "difficulty":
        if (this.lifecycle !== "ready" || !["LOW", "MEDIUM", "HIGH"].includes(action.value)) return false;
        if(this.simulation.curriculumId){this.simulation.selectStage(action.value==='LOW'?0:action.value==='MEDIUM'?3:6);this.retainOutcomes();break;}
        this.simulation.restart({ difficulty: action.value }); this.simulation.pause(); this.simulation.status = "ready";
        this.outcomes.length = 0; break;
      case "sensor-source":
        if (!["local", "remote"].includes(action.value) || action.value === this.sensorSource) return false;
        this.sensorSource = action.value;
        if (this.lifecycle === "running") { this.simulation.pause(); this.lifecycle = "paused"; }
        this.sensorPointer = null; break;
      case "input-mode":
        if (!["keyboard", "sensor"].includes(action.value) || action.value === this.inputMode) return false;
        this.inputMode = action.value;
        if (this.lifecycle === "running") { this.simulation.pause(); this.lifecycle = "paused"; }
        this.sensorPointer = null; break;
      case "primary-display":
        if (this.lifecycle === "running" || !this.subscribers.has(action.value)) return false;
        this.primaryDisplayId = action.value; break;
      case "reengage":
        if (this.lifecycle === "running") { this.simulation.pause(); this.lifecycle = "paused"; }
        this.sensorPointer = null; break;
    }
    this.reason = action.type === "restart" ? "Run reset. Resume when ready." : null;
    if (["start", "resume", "next-mission"].includes(action.type)) { this.simulation.invalidateInput(); this.lastTick = null; this.awaitingInputSince = now; }
    else this.invalidate();
    this.change(); return true;
  }

  /** Validate echoed locally-issued frame IDs; never compare clocks across windows. */
  receive(raw: unknown, now: number): boolean {
    if (!isRecord(raw) || raw.version !== 4 || !isId(raw.displayId) || raw.ownerId !== this.ownerId) return false;
    if (raw.type === "leave") {
      if (!this.subscribers.delete(raw.displayId)) return false;
      if (raw.displayId === this.primaryDisplayId) { this.suspend("display-unavailable"); this.primaryDisplayId = null; }
      this.change(); return true;
    }
    if (raw.type !== "ack" && raw.type !== "input") return false;
    if (raw.sessionId !== this.sessionId || raw.runId !== this.simulation.runId || raw.inputEpoch !== this.inputEpoch || !isSequence(raw.frameSequence)) return false;
    const frame = this.sentFrames.get(raw.frameSequence);
    if (!frame || frame.epoch !== this.inputEpoch || frame.runId !== this.simulation.runId || now < frame.at || now - frame.at > this.linkTimeout) return false;
    if (raw.type === "ack") {
      if (typeof raw.visible !== "boolean" || typeof raw.ready !== "boolean" || !isSequence(raw.sequence)) return false;
      const previous = this.subscribers.get(raw.displayId);
      if (previous && raw.sequence <= previous.sequence) return false;
      if (!previous && this.subscribers.size >= 8) return false;
      this.subscribers.set(raw.displayId, { lastAck: now, visible: raw.visible, ready: raw.ready, epoch: this.inputEpoch, sequence: raw.sequence });
      if (!previous || previous.visible !== raw.visible || previous.ready !== raw.ready || previous.epoch !== this.inputEpoch) this.change();
      if (!this.primaryDisplayId && raw.visible && raw.ready) { this.primaryDisplayId = raw.displayId; this.invalidate(); this.change(); }
      if (raw.displayId === this.primaryDisplayId && (!raw.visible || !raw.ready)) this.suspend(raw.ready ? "display-unavailable" : "renderer-unavailable");
      return true;
    }
    if (this.lifecycle !== "running" || this.inputMode !== "keyboard" || raw.displayId !== this.primaryDisplayId || !isSequence(raw.sequence) || raw.sequence <= this.keyboardSequence || !isPointer(raw.pointer) || !this.displayReady(now)) return false;
    this.keyboardSequence = raw.sequence;
    this.keyboard = { pointer: { ...raw.pointer }, received: now, sequence: raw.sequence };
    return true;
  }

  tick(now: number, sensorPointer: NormalizedFlightInput | null = null, sensorStatus: SensorInputStatus = "waiting", rawPointer: NormalizedFlightInput | null = null): void {
    if (!Number.isFinite(now)) { this.suspend("clock-discontinuity"); return; }
    this.sensorPointer = sensorPointer && isPointer(sensorPointer) ? sensorPointer : null;
    this.rawPointer = rawPointer && isPointer(rawPointer) ? rawPointer : null;
    if (this.sensorStatus !== sensorStatus) { this.sensorStatus = sensorStatus; this.change(); }
    for (const [id, display] of this.subscribers) {
      if (now - display.lastAck <= this.linkTimeout && now >= display.lastAck) continue;
      this.subscribers.delete(id);
      if (id === this.primaryDisplayId) { this.suspend("display-unavailable"); this.primaryDisplayId = null; this.invalidate(); }
      this.change();
    }
    // A replacement Display is selected only while the session is stopped.
    if (!this.primaryDisplayId && this.lifecycle !== "running") {
      const replacement = [...this.subscribers].find(([, d]) => d.visible && d.ready);
      if (replacement) { this.primaryDisplayId = replacement[0]; this.invalidate(); this.change(); }
    }
    const elapsed = this.lastTick === null ? 0 : now - this.lastTick;
    this.lastTick = now;
    if (this.lifecycle !== "running") return;
    if (elapsed < 0) { this.suspend("clock-discontinuity"); return; }
    if (elapsed > LINK_TIMEOUT_MS) { this.suspend("scheduling-gap"); return; }
    if (!this.displayReady(now)) { this.suspend("display-unavailable"); return; }
    const pointer = this.manualPointer ?? (this.inputMode === "sensor" ? this.sensorPointer : this.keyboard && now >= this.keyboard.received && now - this.keyboard.received <= this.linkTimeout ? this.keyboard.pointer : null);
    // Keyboard must first echo the new epoch. Time remains frozen during pickup.
    if (!pointer) {
      if (this.inputMode === "sensor" || this.keyboardSequence >= 0 || now - this.awaitingInputSince > this.linkTimeout) this.suspend("input-unavailable");
      return;
    }
    const before = this.simulation.revision;
    if(this.simulation.curriculumId&&this.manualPointer&&elapsed>0)this.simulation.noteManualParticipation();
    this.simulation.step(elapsed / 1000, pointer);
    for (let i = this.outcomes.length; i < this.simulation.events.length; i++) {
      const event = this.simulation.events[i];
      const object = this.simulation.objects.find((o) => o.id === event.objectId)!;
      this.outcomes.push({ ...event, sequence: ++this.eventSequence, missionId: `mission-${event.mission + 1}`, x: object.x, y: object.y, z: object.z });
    }
    if (this.simulation.status === "mission-complete") { this.lifecycle = "mission-complete"; this.invalidate(); }
    if (this.simulation.status === "complete") { this.lifecycle = "completed"; this.summary = this.makeSummary("completed"); this.invalidate(); }
    if (this.simulation.revision !== before) this.change();
  }

  private retainOutcomes(){const ids=new Set(this.simulation.events.map(e=>e.objectId));this.outcomes.splice(0,this.outcomes.length,...this.outcomes.filter(e=>ids.has(e.objectId)));}

  /** Therapist input is local to the authority; never accepted from Display. */
  manual(pointer: NormalizedFlightInput | null, override: boolean): void {
    this.manualOverride = override;
    this.manualPointer = pointer && isPointer(pointer) ? { ...pointer } : null;
  }

  /** Recover accepted progress under a new ownership epoch, stopped for pickup. */
  restore(state: ExperimentalSessionState, frame: PresentationFrame, missionSeconds: number): void {
    const sim = this.simulation;
    sim.restart({ difficulty: state.difficulty, flightSettings: state.flightSettings, accessibility: state.accessibility });
    sim.config.accessibility={...state.accessibility};
    sim.stageResults.splice(0,sim.stageResults.length,...(state.stageResults??[]).map(r=>({...r})));
    sim.startingStageIndex=state.startingStageIndex??0;sim.repeats.splice(0,sim.repeats.length,...(state.stageRepeats??Array(9).fill(0)));
    sim.restoreStageAssistance(state.currentStageAssisted ?? (state.accessibility.mode!=='ADVANCED'||state.accessibility.ringTolerance>0));
    sim.runId = state.runId; sim.mission = state.mission - 1; sim.config.difficulty = state.difficulty;
    sim.elapsedSeconds = state.elapsedSeconds; sim.missionSeconds = missionSeconds;
    Object.assign(sim.ship, frame.ship); Object.assign(sim.stats, state.stats);
    sim.objects.splice(0, sim.objects.length, ...frame.objects.map(o => ({ ...o })));
    sim.events.splice(0, sim.events.length, ...state.outcomes.map(e => ({ ...e })));
    this.outcomes.splice(0, this.outcomes.length, ...state.outcomes.map(e => ({ ...e })));
    this.revision = state.revision + 1; this.inputEpoch = state.inputEpoch + 1;
    this.eventSequence = state.eventSequence; this.inputMode = state.inputMode; this.sensorSource = state.sensorSource ?? "local";
    this.instructionsVisible = state.instructionsVisible; this.summary = state.summary;
    this.lifecycle = state.lifecycle === "running" ? "suspended" : state.lifecycle;
    this.reason = state.lifecycle === "running" ? "control-closed" : state.reason;
    sim.status = this.lifecycle === "ready" ? "ready" : this.lifecycle === "mission-complete" ? "mission-complete" : ["completed", "ended"].includes(this.lifecycle) ? "complete" : "paused";
    sim.invalidateInput(); this.lastTick = null;
  }

  makeSummary(reason: SessionSummary["reason"]): SessionSummary {
    return { ...(this.simulation.curriculumId?{currentStageAssisted:this.simulation.currentStageAssisted,curriculumId:NINE_STAGE_CURRICULUM,stageRepeats:[...this.simulation.repeats],stageResults:this.simulation.stageResults.map(r=>({...r})),startingStageIndex:this.simulation.startingStageIndex}:{}), ...this.simulation.stats, sessionId: this.sessionId, runId: this.simulation.runId, elapsedSeconds: this.simulation.elapsedSeconds, reason };
  }
  snapshot(): ExperimentalSessionState {
    return { ...(this.simulation.curriculumId?{currentStageAssisted:this.simulation.currentStageAssisted,curriculumId:NINE_STAGE_CURRICULUM,stageRepeats:[...this.simulation.repeats],stageResults:this.simulation.stageResults.map(r=>({...r})),startingStageIndex:this.simulation.startingStageIndex}:{}), version: 4, roomId: this.roomId, ownerId: this.ownerId, sessionId: this.sessionId, runId: this.simulation.runId, missionId: `mission-${this.simulation.mission + 1}`, revision: this.revision, eventSequence: this.eventSequence, inputEpoch: this.inputEpoch, lifecycle: this.lifecycle, reason: this.reason, flightSettings: { ...this.simulation.config.flightSettings }, accessibility: {...this.simulation.config.accessibility}, instructionsVisible:this.instructionsVisible, difficulty: this.difficulty, inputMode: this.inputMode, sensorSource: this.sensorSource, mission: this.simulation.mission + 1, missionName: this.simulation.missionName, elapsedSeconds: this.simulation.elapsedSeconds, stats: { ...this.simulation.stats }, outcomes: this.outcomes.map((event) => ({ ...event })), summary: this.summary ? { ...this.summary } : null, primaryDisplayId: this.primaryDisplayId, displays: [...this.subscribers.keys()], sensorStatus: this.sensorStatus };
  }
  frame(now: number): PresentationFrame {
    const sequence = ++this.frameSequence;
    this.sentFrames.set(sequence, { at: now, epoch: this.inputEpoch, runId: this.simulation.runId });
    if (this.sentFrames.size > 32) this.sentFrames.delete(this.sentFrames.keys().next().value!);
    return { ownerId: this.ownerId, sessionId: this.sessionId, runId: this.simulation.runId, revision: this.revision, inputEpoch: this.inputEpoch, sequence, elapsedSeconds: this.simulation.elapsedSeconds, ship: { ...this.simulation.ship }, objects: this.simulation.objects.map((object) => ({ ...object })), rawPointer: this.rawPointer ? { ...this.rawPointer } : null };
  }
}

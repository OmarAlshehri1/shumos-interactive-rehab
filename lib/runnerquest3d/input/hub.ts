/**
 * Input hub: the ONLY place that decides which source may affect gameplay.
 * Each session explicitly selects one source; everything else is ignored.
 *
 *  MANUAL     : no automatic source; the therapist's touch controls (and a desktop keyboard) drive the runner.
 *  KEYBOARD   : same, labelled as the development/simulation keyboard source.
 *
 * Manual therapist actions (`manual()`) are accepted in EVERY mode: they are the explicit override /
 * assistance path, share one debounce with the sensors (so two sources can never double-move the runner),
 * and are applied through the same authoritative `applyAction`.
 *
 *  RIGHT_FOOT : RIGHT_FOOT samples only; tilt left/right + lift.
 *  LEFT_FOOT  : LEFT_FOOT samples only; tilt left/right + lift.
 *  DUAL_FOOT  : LEFT_FOOT tilt-left -> left, RIGHT_FOOT tilt-right -> right, a lift of either foot -> step.
 *
 * RIGHT_HAND / LEFT_HAND / handheld / anything else is always ignored.
 */
import { PhysicalRole, type MotionSample } from "@/lib/physicalInput/types";
import type { InputSourceId, Level3, RunnerAction } from "../types";
import { configFor, FootActionRecognizer, type FootGesture, type RecognizerState } from "./footRecognizer";

/** Sources that need no sensor stream. */
export const isDirect = (m: InputSourceId): boolean => m === "KEYBOARD" || m === "MANUAL";
export const LANE_DEBOUNCE_MS = 180;
export const STEP_DEBOUNCE_MS = 700;

export const rolesForSource = (s: InputSourceId): PhysicalRole[] =>
  s === "RIGHT_FOOT" ? [PhysicalRole.RIGHT_FOOT] : s === "LEFT_FOOT" ? [PhysicalRole.LEFT_FOOT] : s === "DUAL_FOOT" ? [PhysicalRole.LEFT_FOOT, PhysicalRole.RIGHT_FOOT] : [];

export interface HubResult {
  accepted: boolean;
  action?: RunnerAction;
  gesture?: FootGesture;
  /** Why nothing happened (for tests/diagnostics). */
  reason?: "wrong-source" | "ignored-role" | "no-gesture" | "debounced" | "dual-mapping";
  inputId?: string;
}

export interface RoleStatus { role: PhysicalRole; fresh: boolean; state: RecognizerState }

export class InputHub {
  private mode: InputSourceId = "MANUAL";
  private rec = new Map<PhysicalRole, FootActionRecognizer>();
  private lastLaneAt = -Infinity;
  private lastStepAt = -Infinity;
  private seq = 0;
  private sensitivity: Level3 = "normal";
  private tolerance: Level3 = "normal";

  constructor() { this.rebuild(); }

  private rebuild(): void {
    const cfg = configFor(this.sensitivity, this.tolerance);
    for (const role of [PhysicalRole.RIGHT_FOOT, PhysicalRole.LEFT_FOOT]) {
      const r = this.rec.get(role);
      if (r) r.setConfig(cfg); else this.rec.set(role, new FootActionRecognizer(cfg));
    }
  }

  setMode(mode: InputSourceId): void {
    if (mode === this.mode) return;
    this.mode = mode;
    // A fresh selection means fresh rest poses: nothing carried over from another source.
    this.rec.clear();
    this.rebuild();
    this.lastLaneAt = this.lastStepAt = -Infinity;
  }
  getMode(): InputSourceId { return this.mode; }
  setSensitivity(sensitivity: Level3, tolerance: Level3): void {
    this.sensitivity = sensitivity; this.tolerance = tolerance; this.rebuild();
  }

  recenter(nowMs: number): void { this.rec.forEach((r) => r.recenter(nowMs)); }
  markDisconnected(role: PhysicalRole): void { this.rec.get(role)?.markDisconnected(); }

  /** Feed one foot sample. Returns the action to apply (if any). */
  ingestFoot(role: PhysicalRole | string, sample: MotionSample, nowMs: number): HubResult {
    if (isDirect(this.mode)) return { accepted: false, reason: "wrong-source" };
    if (role !== PhysicalRole.RIGHT_FOOT && role !== PhysicalRole.LEFT_FOOT) return { accepted: false, reason: "ignored-role" };
    if (!rolesForSource(this.mode).includes(role)) return { accepted: false, reason: "wrong-source" };
    const r = this.rec.get(role)!;
    const g = r.push(sample, nowMs);
    if (!g) return { accepted: false, reason: "no-gesture" };
    return this.map(role, g, nowMs);
  }

  private map(role: PhysicalRole, g: FootGesture, nowMs: number): HubResult {
    let action: RunnerAction;
    if (g === "LIFT") action = { kind: "step" };
    else {
      if (this.mode === "DUAL_FOOT" && ((role === PhysicalRole.LEFT_FOOT && g !== "TILT_LEFT") || (role === PhysicalRole.RIGHT_FOOT && g !== "TILT_RIGHT"))) return { accepted: false, gesture: g, reason: "dual-mapping" };
      action = { kind: "lane", dir: g === "TILT_LEFT" ? -1 : 1 };
    }
    return this.debounce(action, `${role}:${++this.seq}`, nowMs, g);
  }

  /** Therapist touch action: always accepted regardless of the selected source (override / assistance). */
  manual(action: RunnerAction, nowMs: number): HubResult {
    return this.debounce(action, `MANUAL:${++this.seq}`, nowMs);
  }

  /** Keyboard actions. Only meaningful in MANUAL/KEYBOARD modes; ignores key auto-repeat. */
  keyboard(key: string, repeat: boolean, nowMs: number): HubResult {
    if (!isDirect(this.mode)) return { accepted: false, reason: "wrong-source" };
    if (repeat) return { accepted: false, reason: "debounced" };
    let action: RunnerAction | null = null;
    if (key === "ArrowLeft" || key === "a" || key === "A") action = { kind: "lane", dir: -1 };
    else if (key === "ArrowRight" || key === "d" || key === "D") action = { kind: "lane", dir: 1 };
    else if (key === " " || key === "ArrowUp" || key === "w" || key === "W") action = { kind: "step" };
    else if (key === "ArrowDown" || key === "s" || key === "S") action = { kind: "region", region: 0 }; // FLOOR: back to the centre (ignored by WALL)
    if (!action) return { accepted: false, reason: "no-gesture" };
    return this.debounce(action, `KEYBOARD:${++this.seq}`, nowMs);
  }

  private debounce(action: RunnerAction, inputId: string, nowMs: number, gesture?: FootGesture): HubResult {
    if (action.kind === "lane" || action.kind === "region") {
      if (nowMs - this.lastLaneAt < LANE_DEBOUNCE_MS) return { accepted: false, gesture, reason: "debounced" };
      this.lastLaneAt = nowMs;
    } else {
      if (nowMs - this.lastStepAt < STEP_DEBOUNCE_MS) return { accepted: false, gesture, reason: "debounced" };
      this.lastStepAt = nowMs;
    }
    return { accepted: true, action, gesture, inputId };
  }

  /** True when every required source is currently delivering fresh samples (keyboard is always live). */
  isLive(nowMs: number): boolean {
    if (isDirect(this.mode)) return true;
    return rolesForSource(this.mode).every((role) => this.rec.get(role)!.isFresh(nowMs));
  }
  status(nowMs: number): RoleStatus[] {
    return rolesForSource(this.mode).map((role) => ({ role, fresh: this.rec.get(role)!.isFresh(nowMs), state: this.rec.get(role)!.state }));
  }
  /** True when every required recognizer has learned its rest pose and is ready to detect. */
  isReady(): boolean {
    return isDirect(this.mode) || rolesForSource(this.mode).every((role) => { const s = this.rec.get(role)!.state; return s === "neutral" || s === "active"; });
  }
}

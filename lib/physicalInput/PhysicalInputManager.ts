import type { InputSource, Unsubscribe } from "./InputSource";
import type { SemanticDetector } from "./SemanticDetector";
import type { ContinuousMotionController, NormalizedPointer } from "./ContinuousMotionController";
import {
  CalibrationStatus,
  ConnectionState,
  type CalibrationProfile,
  type MotionSample,
  type PhysicalRole,
  type SemanticEvent,
} from "./types";

/**
 * PhysicalInputManager
 * ├── RIGHT_HAND
 * ├── LEFT_HAND
 * ├── RIGHT_FOOT
 * └── LEFT_FOOT
 *
 * Owns, per role, exactly one InputSource + one SemanticDetector + one
 * CalibrationProfile, and guarantees they never see or affect another
 * role's state ("no cross-triggering" - see assignRole). RIGHT_HAND is
 * wired into the shared sensor runtime (see
 * components/control/sensors/SensorRuntimeProvider.tsx) that five
 * sensor-play routes read for continuous-pointer game input; production
 * therapist-tap game routes (ControlScreen and friends) are unaffected —
 * this manager is additive, never a replacement for existing input.
 *
 * Disconnect safety (see this directory's tests):
 *  - a disconnect immediately cancels that role's in-progress detector
 *    state (SemanticDetector.reset()) - never lets a stale candidate later
 *    emit against samples from before the drop.
 *  - a disconnect longer than `recalibrationRequiredAfterDisconnectMs`
 *    marks that role's profile NEEDS_RECALIBRATION; while in that state,
 *    incoming samples are still delivered to onSampleObserved (for UI /
 *    diagnostics) but are never routed to the detector, so no semantic
 *    event - and therefore no game input - can be emitted until an explicit
 *    recalibrate() call. A short drop (below the threshold) does not
 *    require this - only that the detector's own in-flight state resets.
 *  - reconnecting never replays buffered/stale samples: this class only
 *    reacts to samples an InputSource emits AFTER connect() resolves for
 *    the current connection; there is no queue.
 */
export interface RoleAssignment {
  readonly inputSource: InputSource;
  readonly detector: SemanticDetector;
  profile: CalibrationProfile;
}

export interface PhysicalInputManagerOptions {
  readonly recalibrationRequiredAfterDisconnectMs?: number;
  readonly now?: () => number;
}

const DEFAULT_RECALIBRATION_THRESHOLD_MS = 3000;

export class PhysicalInputManager {
  private readonly assignments = new Map<PhysicalRole, RoleAssignment>();
  private readonly unsubscribers = new Map<PhysicalRole, Unsubscribe[]>();
  private readonly disconnectedAtMs = new Map<PhysicalRole, number>();
  private readonly eventListeners = new Set<(event: SemanticEvent) => void>();
  private readonly sampleListeners = new Set<(role: PhysicalRole, sample: MotionSample) => void>();
  private readonly continuousControllers = new Map<PhysicalRole, ContinuousMotionController>();
  private readonly pointerListeners = new Set<(role: PhysicalRole, pointer: NormalizedPointer | null) => void>();
  private readonly recalibrationRequiredAfterDisconnectMs: number;
  private readonly now: () => number;

  constructor(options: PhysicalInputManagerOptions = {}) {
    this.recalibrationRequiredAfterDisconnectMs =
      options.recalibrationRequiredAfterDisconnectMs ?? DEFAULT_RECALIBRATION_THRESHOLD_MS;
    this.now = options.now ?? (() => Date.now());
  }

  /** Assigns one role's InputSource/SemanticDetector/CalibrationProfile. Throws if the role is already assigned - call unassignRole first, so a role is never silently rebound onto a different device mid-session. */
  assignRole(role: PhysicalRole, inputSource: InputSource, detector: SemanticDetector, profile: CalibrationProfile): void {
    if (this.assignments.has(role)) {
      throw new Error(`${role} is already assigned; call unassignRole(${role}) first`);
    }
    detector.reset(profile);
    this.assignments.set(role, { inputSource, detector, profile });

    const subscriptions: Unsubscribe[] = [];
    subscriptions.push(
      inputSource.onSample((sample) => this.handleSample(role, sample)),
    );
    subscriptions.push(
      inputSource.onConnectionStateChange((state) => this.handleConnectionStateChange(role, state)),
    );
    this.unsubscribers.set(role, subscriptions);
  }

  async unassignRole(role: PhysicalRole): Promise<void> {
    const assignment = this.assignments.get(role);
    if (!assignment) return;
    for (const unsubscribe of this.unsubscribers.get(role) ?? []) unsubscribe();
    this.unsubscribers.delete(role);
    if (assignment.inputSource.connectionState !== ConnectionState.DISCONNECTED) {
      await assignment.inputSource.disconnect();
    }
    this.assignments.delete(role);
    this.continuousControllers.delete(role);
    this.disconnectedAtMs.delete(role);
  }

  async connect(role: PhysicalRole): Promise<void> {
    await this.requireAssignment(role).inputSource.connect();
  }

  async disconnect(role: PhysicalRole): Promise<void> {
    await this.requireAssignment(role).inputSource.disconnect();
  }

  /**
   * Explicitly clears NEEDS_RECALIBRATION for a role (a therapist re-running
   * calibration for that role). `profile` replaces the stored one entirely -
   * this is the ONLY way a role's events resume after a long disconnect;
   * see class doc comment.
   */
  recalibrate(role: PhysicalRole, profile: CalibrationProfile): void {
    const assignment = this.requireAssignment(role);
    assignment.profile = profile;
    assignment.detector.reset(profile);
    this.disconnectedAtMs.delete(role);
  }

  connectionStateOf(role: PhysicalRole): ConnectionState {
    return this.requireAssignment(role).inputSource.connectionState;
  }

  calibrationStatusOf(role: PhysicalRole): CalibrationStatus {
    return this.requireAssignment(role).profile.status;
  }

  onEvent(handler: (event: SemanticEvent) => void): Unsubscribe {
    this.eventListeners.add(handler);
    return () => this.eventListeners.delete(handler);
  }

  /** Every routed sample, tagged by role - for live-status UI (connected/calibrated/current movement), independent of whether a gesture ever commits. */
  onSampleObserved(handler: (role: PhysicalRole, sample: MotionSample) => void): Unsubscribe {
    this.sampleListeners.add(handler);
    return () => this.sampleListeners.delete(handler);
  }

  /** Adds continuous analog pointer output without changing or bypassing semantic input behavior. */
  attachContinuousController(role: PhysicalRole, controller: ContinuousMotionController): void {
    this.requireAssignment(role);
    if (this.continuousControllers.has(role)) {
      throw new Error(`${role} already has a ContinuousMotionController`);
    }
    this.continuousControllers.set(role, controller);
  }

  onPointerChanged(handler: (role: PhysicalRole, pointer: NormalizedPointer | null) => void): Unsubscribe {
    this.pointerListeners.add(handler);
    return () => this.pointerListeners.delete(handler);
  }

  private requireAssignment(role: PhysicalRole): RoleAssignment {
    const assignment = this.assignments.get(role);
    if (!assignment) throw new Error(`${role} has no assigned InputSource`);
    return assignment;
  }

  private handleSample(role: PhysicalRole, sample: MotionSample): void {
    const assignment = this.assignments.get(role);
    if (!assignment) return; // late sample from a since-unassigned source - never routed
    for (const listener of this.sampleListeners) listener(role, sample);

    const pointerController = this.continuousControllers.get(role);
    if (pointerController) {
      const pointer = pointerController.observe(sample);
      if (pointer) {
        for (const listener of this.pointerListeners) listener(role, pointer);
      }
    }

    // Only a CALIBRATED profile may route to the detector - covers both a
    // never-calibrated role (NOT_CALIBRATED) and one invalidated by a long
    // disconnect (NEEDS_RECALIBRATION) with the same guard. See class doc
    // comment.
    if (assignment.profile.status !== CalibrationStatus.CALIBRATED) return;
    const event = assignment.detector.observe(sample);
    if (event === null) return;
    // Guards against a detector implementation bug emitting under the wrong
    // role - the one place cross-triggering could otherwise slip through.
    if (event.role !== role) {
      throw new Error(`detector for ${role} emitted an event tagged ${event.role} - refusing to route it`);
    }
    for (const listener of this.eventListeners) listener(event);
  }

  private handleConnectionStateChange(role: PhysicalRole, state: ConnectionState): void {
    const assignment = this.assignments.get(role);
    if (!assignment) return;

    if (state === ConnectionState.DISCONNECTED || state === ConnectionState.ERROR) {
      this.disconnectedAtMs.set(role, this.now());
      assignment.detector.reset(assignment.profile); // cancel any in-progress candidate safely
      const pointerController = this.continuousControllers.get(role);
      if (pointerController) {
        pointerController.invalidate();
        for (const listener of this.pointerListeners) listener(role, null);
      }
      return;
    }

    if (state === ConnectionState.CONNECTED) {
      const disconnectedAt = this.disconnectedAtMs.get(role);
      this.disconnectedAtMs.delete(role);
      if (disconnectedAt !== undefined && this.now() - disconnectedAt >= this.recalibrationRequiredAfterDisconnectMs) {
        assignment.profile = { ...assignment.profile, status: CalibrationStatus.NEEDS_RECALIBRATION };
      }
      // Detector state was already reset at disconnect time; nothing here
      // replays anything from before this fresh connection.
    }
  }
}

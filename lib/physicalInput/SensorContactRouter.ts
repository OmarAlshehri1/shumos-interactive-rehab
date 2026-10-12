import { ContactActivationGate, type CircularContactTarget } from "./ContactActivationGate";
import type { NormalizedPointer } from "./ContinuousMotionController";

/**
 * Framework-free core of the sensor-pointer-to-canonical-action pipeline
 * (see useSensorPointerTargets.ts's React wrapper, which is a thin adapter
 * over this). Kept plain/testable without a DOM or React harness, matching
 * this codebase's established pattern (ContactActivationGate itself is
 * plain for the same reason).
 *
 * Owns exactly the state a game screen needs reset for it: the contact
 * gate's "currently inside" set, and the last-seen pointer sample (so the
 * same sample is never processed twice, e.g. across two renders before a
 * new BLE sample arrives). Resets both whenever `active` transitions in
 * either direction, or whenever the sensor is not connected — so leaving a
 * game's spatial phase (e.g. a non-spatial game phase) and coming
 * back never resumes with a stale "already inside" target.
 */
export class SensorContactRouter {
  private readonly gate = new ContactActivationGate();
  private lastObservedAtMs: number | null = null;
  private wasActive: boolean;
  private contactCount = 0;
  /** Set by notePendingRecenter(); consumed by the very next observe() (see there) instead of a normal gate.observe() call. */
  private pendingRecenterPrime = false;

  constructor(initiallyActive = true) {
    this.wasActive = initiallyActive;
  }

  get count(): number {
    return this.contactCount;
  }

  /**
   * Called when the shared runtime's therapist recenter fires (see
   * useSensorPointerTargets.ts's recenterEpoch plumbing). The pointer is
   * about to jump straight to the new center — this makes the NEXT
   * observe() call prime the gate at that new position (see
   * ContactActivationGate.primeAt) instead of treating it as a fresh
   * contact, so recentering directly onto/near a target can never fire a
   * phantom action.
   */
  notePendingRecenter(): void {
    this.pendingRecenterPrime = true;
  }

  /**
   * Call once per pointer update. Returns the target id a NEW contact
   * fired against, or null (nothing entered, gate closed, a pending
   * recenter consumed this sample to re-prime instead, or this exact
   * sample was already processed).
   */
  observe(
    active: boolean,
    connected: boolean,
    pointer: NormalizedPointer | null,
    targets: readonly CircularContactTarget[],
  ): string | null {
    if (this.wasActive !== active) {
      this.wasActive = active;
      this.gate.reset();
      this.lastObservedAtMs = null;
    }
    if (!active || !connected) {
      this.gate.reset();
      this.lastObservedAtMs = null;
      this.pendingRecenterPrime = false;
      return null;
    }
    if (!pointer) return null;
    if (this.lastObservedAtMs === pointer.timing.pointerOutputAtMs) return null;
    this.lastObservedAtMs = pointer.timing.pointerOutputAtMs;

    if (this.pendingRecenterPrime) {
      this.pendingRecenterPrime = false;
      this.gate.primeAt(pointer.pointer, targets);
      return null;
    }

    const contact = this.gate.observe(pointer.pointer, targets, pointer.timing.pointerOutputAtMs);
    if (!contact) return null;
    this.contactCount += 1;
    return contact.targetId;
  }
}

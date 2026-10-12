import type { NormalizedPointerPosition } from "./ContinuousMotionController";

export interface CircularContactTarget {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly enabled?: boolean;
}

export interface ContactEnterEvent {
  readonly targetId: string;
  readonly pointerEnteredAtMs: number;
}

/** Edge-triggered contact gate: enter once, hold does nothing, exit rearms. */
export class ContactActivationGate {
  private insideIds = new Set<string>();

  observe(
    pointer: NormalizedPointerPosition,
    targets: readonly CircularContactTarget[],
    timestampMs: number,
  ): ContactEnterEvent | null {
    const currentlyInside = targets
      .filter((target) => target.enabled !== false && Math.hypot(pointer.x - target.x, pointer.y - target.y) <= target.radius)
      .sort((a, b) => Math.hypot(pointer.x - a.x, pointer.y - a.y) - Math.hypot(pointer.x - b.x, pointer.y - b.y));
    const entered = currentlyInside.find((target) => !this.insideIds.has(target.id)) ?? null;
    this.insideIds = new Set(currentlyInside.map((target) => target.id));
    return entered ? { targetId: entered.id, pointerEnteredAtMs: timestampMs } : null;
  }

  reset(): void {
    this.insideIds.clear();
  }

  /**
   * Seeds "currently inside" from `pointer`'s real containment against
   * `targets` WITHOUT firing an enter event for any of them — used right
   * after a therapist recenter (see SensorContactRouter.notePendingRecenter)
   * so the pointer's instantaneous jump to the new center never reads as a
   * fresh "enter" against whatever target happens to sit there. A plain
   * reset() would not do this: it clears "already inside" to empty, so the
   * very next observe() at the recentered position would see every
   * currently-overlapping target as newly entered.
   */
  primeAt(pointer: NormalizedPointerPosition, targets: readonly CircularContactTarget[]): void {
    this.insideIds = new Set(
      targets
        .filter((target) => target.enabled !== false && Math.hypot(pointer.x - target.x, pointer.y - target.y) <= target.radius)
        .map((target) => target.id),
    );
  }
}

export interface ContactActionTiming {
  readonly targetId: string;
  readonly pointerEnteredAtMs: number;
  readonly canonicalActionStartedAtMs: number;
  readonly canonicalActionCompletedAtMs: number;
  visualResponseAtMs: number | null;
}

/** Measures the adapter boundary without knowing or reproducing any game's scoring logic. */
export class ContactActionInstrument {
  private readonly entries: ContactActionTiming[] = [];

  constructor(private readonly now: () => number = () => performance.now()) {}

  invoke<T>(event: ContactEnterEvent, canonicalAction: (targetId: string) => T): { result: T; timing: ContactActionTiming } {
    const canonicalActionStartedAtMs = this.now();
    const result = canonicalAction(event.targetId);
    const timing: ContactActionTiming = {
      targetId: event.targetId,
      pointerEnteredAtMs: event.pointerEnteredAtMs,
      canonicalActionStartedAtMs,
      canonicalActionCompletedAtMs: this.now(),
      visualResponseAtMs: null,
    };
    this.entries.push(timing);
    return { result, timing };
  }

  markVisualResponse(targetId: string, timestampMs = this.now()): void {
    const pending = [...this.entries].reverse().find((entry) => entry.targetId === targetId && entry.visualResponseAtMs === null);
    if (pending) pending.visualResponseAtMs = timestampMs;
  }

  report(): readonly ContactActionTiming[] {
    return this.entries.map((entry) => ({ ...entry }));
  }
}

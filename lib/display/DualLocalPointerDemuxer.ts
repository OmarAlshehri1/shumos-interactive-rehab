import type { LocalPointerHandRole, LocalPointerMessage } from "./LocalPointerChannel";
import type { RawPointerSample } from "./PointerInterpolator";

export interface DualPointerSnapshot {
  readonly right: RawPointerSample | null;
  readonly left: RawPointerSample | null;
}

/**
 * Pure "latest sample wins PER HAND, not globally" demultiplexer for
 * LocalPointerMessage (tonight's dual-sensor brief, section 15) —
 * useDualLocalPointerChannel.ts wraps this with rAF pacing/BroadcastChannel
 * plumbing, mirroring this codebase's established SensorContactRouter
 * (pure) / useSensorPointerTargets (React wrapper) split, so the actual
 * per-hand staleness rule is unit-testable without a DOM.
 *
 * Each role's own `seq` is tracked independently — critically different
 * from naively reusing ONE shared "last seq" counter across both roles'
 * messages on the same channel, which would let one hand's sequence
 * numbers wrongly compete with the other's (e.g. a burst of RIGHT_HAND
 * messages pushing the shared counter far ahead, then a perfectly fresh
 * LEFT_HAND message with a lower absolute seq getting rejected as "stale").
 */
export class DualLocalPointerDemuxer {
  private readonly lastSeq: Record<LocalPointerHandRole, number> = { RIGHT_HAND: -1, LEFT_HAND: -1 };
  private readonly latest: Record<LocalPointerHandRole, RawPointerSample | null> = { RIGHT_HAND: null, LEFT_HAND: null };

  /** Returns true if this message was newer (for its OWN role) and applied; false if rejected as stale/out-of-order for that role. */
  accept(message: LocalPointerMessage): boolean {
    if (typeof message.seq !== "number" || message.seq <= this.lastSeq[message.role]) return false;
    this.lastSeq[message.role] = message.seq;
    this.latest[message.role] = message.visible ? { x: message.x, y: message.y, visible: true } : { x: 0, y: 0, visible: false };
    return true;
  }

  snapshot(): DualPointerSnapshot {
    return { right: this.latest.RIGHT_HAND, left: this.latest.LEFT_HAND };
  }
}

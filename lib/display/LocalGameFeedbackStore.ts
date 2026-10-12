/**
 * Pure, framework-agnostic bookkeeping for "which target ids has a local
 * accepted-action feedback message told us about, not yet reconciled with
 * canonical (Firebase-synced) state" — the same "plain class, no DOM/timers
 * of its own, driven by a caller" split PointerInterpolator.ts already uses
 * for the pointer fast path, so this piece of the game-feedback fast path
 * (see useLocalGameFeedback.ts, which owns the BroadcastChannel subscription
 * around this) is unit-testable the same way.
 *
 * OWN SUBSCRIBE/NOTIFY (React-free) — this replaces an earlier version that
 * exposed a `{isLocallyAccepted, reconcile}` object memoized with STABLE
 * function identity and handed to consumers through React Context. That
 * meant the context VALUE never changed reference when a new action
 * arrived, so React never re-notified `useContext` consumers — a leaf
 * balloon only ever "saw" a local accept by coincidence, whenever something
 * ELSE happened to re-render it, which is exactly the random
 * fractions-of-a-second-to-2-seconds delay measured on real hardware. This
 * store instead exposes `subscribe`, so `useSyncExternalStore` (see
 * LocalGameFeedbackProvider.tsx) can subscribe ONE specific balloon
 * directly and get a real, immediate notification — no parent re-render,
 * no Context value-identity subtlety, in the loop at all.
 */
export class LocalGameFeedbackStore {
  private accepted = new Map<string, number>();
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  /** Records `targetId` as locally accepted at `atMs`. Idempotent: accepting the same id again just refreshes its timestamp — never creates a second entry, so "duplicate local event" can't be observed as anything but a no-op. */
  accept(targetId: string, atMs: number): void {
    this.accepted.set(targetId, atMs);
    this.notify();
  }

  isAccepted(targetId: string): boolean {
    return this.accepted.has(targetId);
  }

  /** When `targetId` was accepted, for latency diagnostics — null if it was never accepted (or has since been reconciled/expired). */
  acceptedAt(targetId: string): number | null {
    return this.accepted.get(targetId) ?? null;
  }

  /** Call once canonical state has confirmed (or superseded — e.g. a stage restart reusing the same id) this target. Returns whether it was actually present. */
  reconcile(targetId: string): boolean {
    const removed = this.accepted.delete(targetId);
    if (removed) this.notify();
    return removed;
  }

  /** Drops every entry older than `maxAgeMs` as of `nowMs` — the safety-net expiry for an entry nothing ever reconciled. Returns whether anything was actually removed. */
  sweepExpired(nowMs: number, maxAgeMs: number): boolean {
    let changed = false;
    for (const [id, acceptedAtMs] of this.accepted) {
      if (nowMs - acceptedAtMs > maxAgeMs) {
        this.accepted.delete(id);
        changed = true;
      }
    }
    if (changed) this.notify();
    return changed;
  }

  get size(): number {
    return this.accepted.size;
  }

  clear(): void {
    if (this.accepted.size === 0) return;
    this.accepted.clear();
    this.notify();
  }
}

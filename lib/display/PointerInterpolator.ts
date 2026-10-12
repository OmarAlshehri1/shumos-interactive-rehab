/**
 * DISPLAY VISUAL INTERPOLATION ONLY — never the logical game pointer.
 *
 * Smooths the child-facing virtual hand between the throttled pointer
 * samples arriving from /control over Firebase (~30Hz, see
 * SensorPointerDisplaySync.tsx) so the render keeps moving between hops
 * instead of jumping at the network's own irregular delivery cadence. This
 * class is pure state (no DOM, no timers of its own) — a caller (see
 * useInterpolatedPointer.ts) drives it once per animation frame via tick().
 *
 * Deliberately exponential convergence, not a spring: rendered position
 * always moves a fraction of the remaining distance toward the latest
 * target every frame, so it can never overshoot and never needs a
 * "settling" bounce — it just gets closer every tick until it's there.
 * "Latest sample wins" falls out of the design for free: setTarget has no
 * queue, so an in-order arrival simply replaces whatever target was there
 * before tick() next runs — nothing kept from an older sample is ever
 * replayed.
 */

export interface RawPointerSample {
  readonly x: number;
  readonly y: number;
  readonly visible: boolean;
}

/** Time constant for the exponential catch-up — roughly how long a full "hop" takes to mostly resolve. Short enough to stay close behind a ~30Hz sample stream without visibly lagging. */
const CONVERGENCE_TAU_MS = 40;

/** A jump bigger than this (screen fractions) is treated as a teleport (reconnect, recenter) rather than motion to glide across — snap instead of gliding the whole way. */
const SNAP_DISTANCE = 0.25;

/** Once within this distance of the target, snap exactly onto it rather than approaching asymptotically forever — this is what makes "stop" actually stop instead of drifting sub-pixel amounts indefinitely. */
const REST_EPSILON = 0.0008;

export class PointerInterpolator {
  private rendered: RawPointerSample | null = null;
  private target: RawPointerSample | null = null;

  /** Records the latest sample. Hiding, and reappearing after being hidden, both apply instantly — never gliding toward/away-from a hidden state, and never gliding in from a stale old position on reconnect. */
  setTarget(next: RawPointerSample | null): void {
    this.target = next;
    if (!next || !next.visible || !this.rendered || !this.rendered.visible) {
      this.rendered = next;
    }
  }

  /** Advances the rendered position toward the current target by `dtMs` of elapsed wall time. Call once per animation frame; returns the new rendered value. */
  tick(dtMs: number): RawPointerSample | null {
    const target = this.target;
    const current = this.rendered;
    if (!target || !target.visible || !current || !current.visible) {
      this.rendered = target;
      return this.rendered;
    }

    const dx = target.x - current.x;
    const dy = target.y - current.y;

    if (Math.abs(dx) <= REST_EPSILON && Math.abs(dy) <= REST_EPSILON) {
      this.rendered = target;
      return this.rendered;
    }

    if (Math.abs(dx) > SNAP_DISTANCE || Math.abs(dy) > SNAP_DISTANCE) {
      this.rendered = target;
      return this.rendered;
    }

    const alpha = 1 - Math.exp(-Math.max(0, dtMs) / CONVERGENCE_TAU_MS);
    this.rendered = { x: current.x + dx * alpha, y: current.y + dy * alpha, visible: true };
    return this.rendered;
  }

  getRendered(): RawPointerSample | null {
    return this.rendered;
  }
}

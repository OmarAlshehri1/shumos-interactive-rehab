import { BubbleMoveDirection } from "@/lib/bubblepop";

/**
 * Pure time-based motion for ONE mission bubble (task section 5-7). Deliberately
 * never synced through Firebase — /control and /display both already agree on
 * `stage.targetStartedAt`/`targetPausedMs`/`pausedAt` (the SAME fields the engine
 * already uses for response-time scoring), so both sides compute the identical
 * position from the identical timestamps, with zero extra realtime state.
 *
 * NO SPEED FAILURE (task section 6): the bubble loops continuously across the
 * ocean every `travelMs` for as long as it stays the active mission — it is
 * never "missed" for reaching an edge, it simply re-enters and keeps going
 * until the matching station is pressed.
 */

/** Kept clear at the left/right edges of the ocean so a bubble is never flush against the wall's border. */
export const OCEAN_X_MARGIN = 0.08;

/** How much paused time counts toward "elapsed" — always 0; pausing freezes the bubble in place (task section 16). */
export function elapsedActiveMs(now: number, targetStartedAt: number | null, targetPausedMs: number, pausedAt: number | null): number {
  const effectiveNow = pausedAt ?? now;
  return Math.max(0, effectiveNow - (targetStartedAt ?? effectiveNow) - targetPausedMs);
}

/** 0..1 progress through the bubble's current crossing lap. */
export function bubbleMotionPhase(travelMs: number, elapsedMs: number): number {
  if (travelMs <= 0) return 0;
  const wrapped = ((elapsedMs % travelMs) + travelMs) % travelMs;
  return wrapped / travelMs;
}

/** Normalized [0,1] horizontal position within the ocean band, respecting OCEAN_X_MARGIN. */
export function bubbleMotionX(direction: BubbleMoveDirection, travelMs: number, elapsedMs: number): number {
  const phase = bubbleMotionPhase(travelMs, elapsedMs);
  const raw = direction === BubbleMoveDirection.RIGHT_TO_LEFT ? 1 - phase : phase;
  return OCEAN_X_MARGIN + raw * (1 - 2 * OCEAN_X_MARGIN);
}

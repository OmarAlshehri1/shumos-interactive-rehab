/**
 * LOCAL FAST PATH: the RIGHT_HAND display pointer, mirrored directly between
 * /control and /display over `BroadcastChannel` instead of Firebase, for the
 * common clinic setup where both routes are two tabs/windows of the SAME
 * browser on the SAME Mac (the projector/TV is just an extended display, not
 * a separate computer) — see ARCHITECTURE.md and the 2026-09-04 overnight
 * doc's "Display pointer transport" deferral for why this was previously
 * deferred, and LocalPointerBroadcastSync.tsx / useLocalPointerChannel.ts
 * for the publish/subscribe halves.
 *
 * `BroadcastChannel` only ever delivers within one browser instance on one
 * origin — on a genuinely separate Display device (a real second computer)
 * it silently delivers nothing at all. That is the desired fallback
 * behavior, not a bug to work around: useLocalPointerChannel's health
 * tracking sees no messages, stays unhealthy, and DisplayScreen falls back
 * to the existing Firebase path unconditionally. No separate "is this the
 * same machine?" detection is needed anywhere.
 *
 * Carries ONLY the final normalized pointer + visibility, never raw IMU
 * telemetry — the exact same payload shape SensorPointerDisplaySync already
 * mirrors to Firebase (lib/realtime/sessionRepository.ts's
 * reportControllerPointer), just over a same-process channel instead of a
 * network one, and at the sensor's own cadence instead of Firebase's
 * throttled one.
 */
export const LOCAL_POINTER_CHANNEL_NAME = "shumos-sensor-pointer";

/**
 * Role tag carried on every message (tonight's dual-sensor brief, section
 * 15). A plain string literal union rather than importing PhysicalRole from
 * lib/physicalInput — this file is read by both /control (which has that
 * import available) and /display (a deliberately separate, lighter render
 * surface); duplicating just the two values actually used here avoids
 * coupling /display's bundle to the whole physicalInput module graph for a
 * single string type. Existing single-hand consumers (useLocalPointerChannel)
 * ignore this field entirely and keep working unchanged; see
 * useDualLocalPointerChannel for the role-aware receiver.
 */
export type LocalPointerHandRole = "RIGHT_HAND" | "LEFT_HAND";

export interface LocalPointerMessage {
  readonly role: LocalPointerHandRole;
  readonly x: number;
  readonly y: number;
  readonly visible: boolean;
  /** Increments once per publish PER ROLE — never a single global counter — so a newer message from one hand can never be mistaken for a newer message from the other (see useDualLocalPointerChannel's "latest wins per hand, not globally" doc comment). Lets a subscriber reject a stale/out-of-order delivery for that same hand without relying on wall-clock alone. */
  readonly seq: number;
  /** `Date.now()` at publish. Safe to compare directly against the subscriber's own `Date.now()` for latency/age — same OS clock, since this only ever crosses tabs on one machine. */
  readonly sentAtMs: number;
}

export function isBroadcastChannelSupported(): boolean {
  return typeof window !== "undefined" && typeof window.BroadcastChannel === "function";
}

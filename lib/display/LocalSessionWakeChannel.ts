import { isBroadcastChannelSupported } from "./LocalPointerChannel";

/**
 * PROJECTOR START/FOCUS FIX — the same-Mac sibling of LocalPointerChannel.ts
 * and LocalGameFeedbackChannel.ts, but for the opposite failure mode: not
 * "too slow," but "sometimes never arrives at all." Real hardware
 * observation: /display shown on an unfocused external projector can get
 * stuck on an old GameState (commonly the WELCOME "ابدأ" screen) after
 * Control has already moved the session forward — Firebase's own onValue
 * listener is a long-lived connection, and an unfocused-but-visible
 * projector window's background JS/network scheduling can silently stall
 * its delivery without Firebase ever reporting a disconnect (connectionStatus
 * stays "connected" throughout — this is not a real network drop).
 *
 * This channel carries NO session data at all — deliberately. It is only
 * ever a "something changed, go re-check" nudge; the receiving Display tab
 * always re-fetches the actual CURRENT canonical record itself (see
 * useRealtimeDisplaySession.ts's `reconcile`) and applies it through the
 * exact same guard every other delivery path already goes through. It can
 * therefore never create a second source of truth, never go stale/
 * mismatched (nothing to mismatch — it carries no identity to check), and
 * is safe to over-fire.
 *
 * Same fallback story as the other local channels: on a genuinely separate
 * Display device this is simply never received, and useRealtimeDisplaySession's
 * OTHER reconciliation triggers (focus/visibility regain, a bounded periodic
 * poll) are what cover that case instead.
 */
export const LOCAL_SESSION_WAKE_CHANNEL_NAME = "shumos-session-wake";

export interface LocalSessionWakeMessage {
  readonly type: "SESSION_WAKE";
  readonly seq: number;
  readonly sentAtMs: number;
}

let channel: BroadcastChannel | null = null;
let seq = 0;

function getChannel(): BroadcastChannel | null {
  if (!isBroadcastChannelSupported()) return null;
  if (!channel) channel = new BroadcastChannel(LOCAL_SESSION_WAKE_CHANNEL_NAME);
  return channel;
}

/** CONTROL-SIDE EMIT — call right after a real, successful session publish (see useRealtimeControllerSession.ts's `publish`). A plain function, not a hook, for the same reason LocalGameFeedbackChannel.ts's emit is one. */
export function publishSessionWake(): void {
  const ch = getChannel();
  if (!ch) return;
  seq += 1;
  const message: LocalSessionWakeMessage = { type: "SESSION_WAKE", seq, sentAtMs: Date.now() };
  if (process.env.NODE_ENV !== "production") {
    console.debug(`[SESSION WAKE SENT] seq=${message.seq}`);
  }
  ch.postMessage(message);
}

export function isSessionWakeMessage(data: unknown): data is LocalSessionWakeMessage {
  return !!data && typeof data === "object" && (data as Partial<LocalSessionWakeMessage>).type === "SESSION_WAKE";
}

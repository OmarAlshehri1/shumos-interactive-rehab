import { isBroadcastChannelSupported } from "./LocalPointerChannel";
import type { GameId } from "@/lib/games/registry";

/**
 * LOCAL GAME-FEEDBACK FAST PATH — the same-Mac sibling of
 * LocalPointerChannel.ts, but for a discrete, already-ACCEPTED canonical
 * game action (a balloon popped, a bubble hit, ...) instead of a continuous
 * pointer stream. See each `use*RealtimeControllerSession.ts` hook's own
 * call site for exactly where a message gets published — always AFTER the
 * canonical engine has already accepted the action (never merely "the
 * pointer overlapped a target"), so a rejected contact can never produce a
 * message here.
 *
 * Same fallback story as the pointer channel: `BroadcastChannel` only ever
 * delivers within one browser instance. A genuinely separate Display device
 * simply never receives these messages, and every consumer here degrades to
 * "nothing was locally accepted" — the existing Firebase-driven session
 * sync is what shows the result there, exactly as before this existed.
 *
 * Carries only what's needed to identify WHICH accepted action this is and
 * where it belongs — never re-runs or replaces any canonical logic, never
 * carries score/progression.
 */
export const LOCAL_GAME_FEEDBACK_CHANNEL_NAME = "shumos-game-feedback";

export interface LocalGameFeedbackMessage {
  readonly type: "GAME_FEEDBACK";
  readonly gameId: GameId;
  readonly sessionId: string;
  /** The revision this action will produce once its Firebase write lands — same value the canonical hook computes for its own `LiveInteraction`/publish call, not a separately invented number. */
  readonly revision: number;
  /** Real per-game action id, derived from real fields (`${revision}-${targetId}`) — the same shape this codebase's own `LiveInteraction.id` already uses (see lib/realtime/types.ts), never a fabricated identifier. */
  readonly actionId: string;
  /** The engine's own target identifier for whatever got hit (balloonId, bubble id, pad id, ...) — game-specific, always a real id the canonical action already used. */
  readonly targetId: string;
  readonly seq: number;
  readonly sentAtMs: number;
}

/**
 * Pure scoping check, shared by the Display-side consumer (see
 * useLocalGameFeedback.ts): a message only ever applies to the CURRENT
 * (gameId, sessionId) — a leftover message from a previous game/session, or
 * a malformed/foreign postMessage on the same channel name, is never
 * applied. Exported as its own function specifically so this rule is
 * unit-testable without needing a live BroadcastChannel or React.
 */
export function isRelevantGameFeedbackMessage(
  data: unknown,
  gameId: GameId | null,
  sessionId: string | null,
): data is LocalGameFeedbackMessage {
  if (!gameId || !sessionId || typeof data !== "object" || data === null) return false;
  const message = data as Partial<LocalGameFeedbackMessage>;
  return message.type === "GAME_FEEDBACK" && message.gameId === gameId && message.sessionId === sessionId && typeof message.targetId === "string";
}

let channel: BroadcastChannel | null = null;
let seq = 0;

function getChannel(): BroadcastChannel | null {
  if (!isBroadcastChannelSupported()) return null;
  if (!channel) channel = new BroadcastChannel(LOCAL_GAME_FEEDBACK_CHANNEL_NAME);
  return channel;
}

/**
 * CONTROL-SIDE EMIT. A plain function, not a hook: every call site is an
 * existing callback inside a `use*RealtimeControllerSession.ts` hook, not a
 * render — there is nothing to subscribe to here, just one more postMessage
 * alongside the existing `publish(...)` call already there.
 *
 * DEV DIAGNOSTICS (console, not UI — this is a one-time latency-tracing
 * aid, not a permanent overlay): logs "LOCAL ACTION SENT" with the exact
 * targetId/seq at the moment this posts, so a real hardware trace can line
 * this timestamp up against "LOCAL ACTION RECEIVED" (useLocalGameFeedback.ts)
 * and "LOCAL POP RENDERED" (Balloon.tsx) to see exactly which hop is slow.
 */
export function publishLocalGameFeedback(message: Omit<LocalGameFeedbackMessage, "type" | "seq" | "sentAtMs">): void {
  const ch = getChannel();
  if (!ch) return;
  seq += 1;
  const full: LocalGameFeedbackMessage = { type: "GAME_FEEDBACK", seq, sentAtMs: Date.now(), ...message };
  if (process.env.NODE_ENV !== "production") {
    console.debug(`[LOCAL ACTION SENT] balloon=${full.targetId} seq=${full.seq} gameId=${full.gameId} sessionId=${full.sessionId}`);
  }
  ch.postMessage(full);
}

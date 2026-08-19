import { GameState } from "@/lib/game";
import type { LiveSessionRecord } from "@/lib/realtime/types";

/**
 * STALE-DISPLAY RELIABILITY FIX — see components/control/home/HomeScreen.tsx's
 * LiveSessionRecoveryBanner. Pulled out as a pure function (no Firebase, no
 * React) so the lifecycle decision itself — the actual root-cause fix for
 * "/display kept showing a finished game after the dev server restarted" —
 * is unit-testable without mocking a realtime subscription.
 */
export const COMPLETE_SESSION_ABANDON_MS = 5 * 60 * 1000;

export type LiveSessionRecoveryDecision =
  | { kind: "none" }
  /** A genuinely unfinished session — never auto-cleared; Home shows a recovery card. */
  | { kind: "active" }
  /** SESSION_COMPLETE, but recent enough that a real report/celebration review could still be in progress — left alone. */
  | { kind: "hold" }
  /** SESSION_COMPLETE and abandoned past the grace window — safe for Home to silently clear. */
  | { kind: "reclaim" };

/**
 * Classifies the one canonical liveSession for Home's purposes. `now` is
 * passed in (rather than read internally) so this stays a pure function —
 * callers pass `Date.now()`.
 */
export function classifyLiveSessionForHome(record: LiveSessionRecord | null, now: number): LiveSessionRecoveryDecision {
  if (!record) return { kind: "none" };
  if (record.session.gameState !== GameState.SESSION_COMPLETE) return { kind: "active" };
  // updatedAt can still be the ServerValue.TIMESTAMP sentinel object while a write is in flight —
  // treat that as "just now" so a session can never be reclaimed before its own completion write has even landed.
  const updatedAt = typeof record.updatedAt === "number" ? record.updatedAt : now;
  return now - updatedAt >= COMPLETE_SESSION_ABANDON_MS ? { kind: "reclaim" } : { kind: "hold" };
}

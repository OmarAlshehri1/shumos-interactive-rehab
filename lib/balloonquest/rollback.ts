/**
 * Rollback switch for the Balloon Quest replacement. When
 * NEXT_PUBLIC_BALLOON_QUEST_LEGACY=1 is set at build time, `/control/balloon-quest`
 * (and the local-mode Display) serve the ORIGINAL implementation again. The
 * original stays reachable at `/control/balloon-quest-legacy` either way.
 * Realtime Displays render whichever engine a live session was started with, so
 * this flag never strands a session in flight.
 */
export const LEGACY_BALLOON_QUEST = process.env.NEXT_PUBLIC_BALLOON_QUEST_LEGACY === "1";

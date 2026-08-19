import type { ComponentType } from "react";
import type { AnySessionState } from "@/lib/realtime/types";
import type { GameId } from "@/lib/games/registry";
import { BalloonQuestDisplay, type BalloonQuestDisplayProps } from "./games/BalloonQuestDisplay";
import { FollowTheFootstepsDisplay, type FollowTheFootstepsDisplayProps } from "./games/FollowTheFootstepsDisplay";
import { BubblePopWallDisplay, type BubblePopWallDisplayProps } from "./games/BubblePopWallDisplay";
import { FeedTheAnimalsDisplay, type FeedTheAnimalsDisplayProps } from "./games/FeedTheAnimalsDisplay";
import { SpacePilotDisplay, type SpacePilotDisplayProps } from "./games/SpacePilotDisplay";
import { ColorChaseDisplay, type ColorChaseDisplayProps } from "./games/ColorChaseDisplay";
import type { DisplayEventListener } from "./events";

/**
 * DISPLAY GAME RESOLVER — the typed boundary between a canonical session's
 * `gameId` (see lib/realtime/types.ts) and the child-facing display module
 * that actually renders it. DisplayScreen.tsx looks up `gameId` here; a
 * missing/unregistered id (see LiveSessionRecord.gameId's doc comment)
 * simply has no entry, and the caller falls back to the Shumos waiting
 * world — never a guess, never a crash.
 *
 * MULTI-GAME PLATFORM: each game's own display module keeps its own STRICT
 * prop type (BalloonQuestDisplayProps's `session: SessionState`,
 * FollowTheFootstepsDisplayProps's `session: FootstepsSessionState`) —
 * neither file was weakened to accept the other's shape. `SharedGameDisplayProps`
 * below is only this REGISTRY's own boundary type (session widened to the
 * union both games' canonical records can carry); the two `as` casts here
 * are the one place that boundary is bridged. This is sound in practice,
 * not just convenient: DisplayScreen.tsx only ever looks a component up by
 * the SAME record's own `gameId` that determined `session`'s concrete
 * shape (see sessionRepository.ts's parseLiveSessionValue), so the runtime
 * pairing is always correct even though TypeScript can't prove it
 * structurally across a heterogeneous registry.
 */
export interface SharedGameDisplayProps {
  session: AnySessionState;
  onEvent: DisplayEventListener;
  onWelcomeStart: () => void;
  onCountdownComplete: () => void;
  onSelectBalloon: (balloonId: string) => void;
  onStageCompleteDone: () => void;
  externalIncorrectSignal: { balloonId: string; token: number } | null;
  speakCountdownTick: (tick: "3" | "2" | "1" | "start") => Promise<void>;
  celebrationReplayToken: string | null;
}

export const GAME_DISPLAY_MODULES: Record<GameId, ComponentType<SharedGameDisplayProps>> = {
  "balloon-quest": BalloonQuestDisplay as unknown as ComponentType<SharedGameDisplayProps>,
  "follow-the-footsteps": FollowTheFootstepsDisplay as unknown as ComponentType<SharedGameDisplayProps>,
  "bubble-pop-wall": BubblePopWallDisplay as unknown as ComponentType<SharedGameDisplayProps>,
  "feed-the-animals": FeedTheAnimalsDisplay as unknown as ComponentType<SharedGameDisplayProps>,
  "space-pilot": SpacePilotDisplay as unknown as ComponentType<SharedGameDisplayProps>,
  "color-chase": ColorChaseDisplay as unknown as ComponentType<SharedGameDisplayProps>,
};

// Re-exported only so this file remains the single import site TypeScript
// needs for every concrete prop type — never imported elsewhere.
export type { BalloonQuestDisplayProps, FollowTheFootstepsDisplayProps, BubblePopWallDisplayProps, FeedTheAnimalsDisplayProps, SpacePilotDisplayProps, ColorChaseDisplayProps };

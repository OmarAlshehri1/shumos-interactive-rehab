import { HarvestDisplayModule } from './games/HarvestDisplayModule';
import { BloomDisplayModule } from './games/BloomDisplayModule';
import { FireRescueDisplayModule } from './games/FireRescueDisplayModule';
import { PearlVoyageDisplayModule } from './games/PearlVoyageDisplayModule';
import { BubblePopDomeDisplayRouter } from './games/BubblePopDomeDisplayRouter';
import { MirrorQuestDisplayModule } from './games/MirrorQuestDisplayModule';
import { SafeHexDisplayModule } from './games/SafeHexDisplayModule';
import { FootstepsDisplayModule } from './games/FootstepsDisplayModule';
import { ColorChaseDisplayModule } from './games/ColorChaseDisplayModule';
import type { ComponentType } from "react";
import type { AnySessionState } from "@/lib/realtime/types";
import type { GameId } from "@/lib/games/registry";
import type { BalloonQuestDisplayProps } from "./games/BalloonQuestDisplay";
import { BalloonQuestDisplayRouter } from "./games/BalloonQuestDisplayRouter";
import { FollowTheFootstepsDisplay, type FollowTheFootstepsDisplayProps } from "./games/FollowTheFootstepsDisplay";
import { type BubblePopWallDisplayProps } from "./games/BubblePopWallDisplay";
import { SpacePilotDisplay, type SpacePilotDisplayProps } from "./games/SpacePilotDisplay";
import { ColorChaseDisplay, type ColorChaseDisplayProps } from "./games/ColorChaseDisplay";
import { RunnerQuestDisplayModule } from "./games/RunnerQuestDisplayModule";
import { BuildQuestDisplayModule } from "./games/BuildQuestDisplayModule";
import { SpacePilotDisplayModule } from "./games/SpacePilotDisplayModule";
import { TurnGoDisplayModule } from "./games/TurnGoDisplayModule";
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
  muted?: boolean;
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
  "harvest-valley-3d": HarvestDisplayModule,
  "blooming-world-3d": BloomDisplayModule,
  "fire-rescue-3d": FireRescueDisplayModule,
  "pearl-voyage-3d": PearlVoyageDisplayModule,
  // Router: the redesigned engine (session tagged `engine: "bq3"`) or the legacy one kept for rollback — see BalloonQuestDisplayRouter.
  "balloon-quest": BalloonQuestDisplayRouter as unknown as ComponentType<SharedGameDisplayProps>,
  // Router: the Enchanted Forest (session tagged `engine: "fp3"`) or the original game kept for rollback — see FootstepsDisplayModule.
  "follow-the-footsteps": ((props: SharedGameDisplayProps) => <FootstepsDisplayModule {...props} Legacy={FollowTheFootstepsDisplay as unknown as ComponentType<SharedGameDisplayProps>} />) as ComponentType<SharedGameDisplayProps>,
  "bubble-pop-wall": BubblePopDomeDisplayRouter,
  // Router: the 3D engine (session tagged `engine: "sp3"`) or the original one kept for rollback — see SpacePilotDisplayModule.
  "space-pilot": ((props: SharedGameDisplayProps) => <SpacePilotDisplayModule {...props} Legacy={SpacePilotDisplay as unknown as ComponentType<SharedGameDisplayProps>} />) as ComponentType<SharedGameDisplayProps>,
  // Router: The Lost Colors garden (session tagged `engine: "cc3"`) or the original game kept for rollback — see ColorChaseDisplayModule.
  "color-chase": ((props: SharedGameDisplayProps) => <ColorChaseDisplayModule {...props} Legacy={ColorChaseDisplay as unknown as ComponentType<SharedGameDisplayProps>} />) as ComponentType<SharedGameDisplayProps>,
  // Runner Quest 3D: live-session module (cross-device, read-only Display).
  "runner-quest-3d": RunnerQuestDisplayModule,
  // Build Quest 3D: live-session module (cross-device, read-only Display).
  "build-quest-3d": BuildQuestDisplayModule,
  "mirror-quest-3d": MirrorQuestDisplayModule,
  // Safe Hex Arena 3D: live-session module (cross-device, read-only Display).
  "safe-hex-arena-3d": SafeHexDisplayModule,
  // Turn & Go 3D: live-session module (cross-device, read-only Display).
  "turn-and-go-3d": TurnGoDisplayModule,
};

// Re-exported only so this file remains the single import site TypeScript
// needs for every concrete prop type — never imported elsewhere.
export type { BalloonQuestDisplayProps, FollowTheFootstepsDisplayProps, BubblePopWallDisplayProps, SpacePilotDisplayProps, ColorChaseDisplayProps };

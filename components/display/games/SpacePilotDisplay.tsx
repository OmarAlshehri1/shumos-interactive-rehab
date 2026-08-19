"use client";

import { AnimatePresence, motion } from "motion/react";
import { GameState, isStarOnlyStage, stageStarsCollected, type SpacePilotSessionState } from "@/lib/spacepilot";
import type { DisplayEventListener } from "../events";
import { CountdownScene } from "../scenes/CountdownScene";
import { SpacePilotEncounterPlayingScene } from "../spacepilot/scenes/SpacePilotEncounterPlayingScene";
import { SpacePilotInstructionsScene } from "../spacepilot/scenes/SpacePilotInstructionsScene";
import { SpacePilotPlayingScene } from "../spacepilot/scenes/SpacePilotPlayingScene";
import { SpacePilotReadyPositionScene } from "../spacepilot/scenes/SpacePilotReadyPositionScene";
import { SpacePilotSessionCompleteScene } from "../spacepilot/scenes/SpacePilotSessionCompleteScene";
import { SpacePilotStageCompleteScene } from "../spacepilot/scenes/SpacePilotStageCompleteScene";
import { SpacePilotWelcomeScene } from "../spacepilot/scenes/SpacePilotWelcomeScene";
import { FINAL_ACTION_FAILSAFE_MS, useStageCompletionPresentation } from "../useStageCompletionPresentation";

export interface SpacePilotDisplayProps {
  session: SpacePilotSessionState;
  onEvent: DisplayEventListener;
  onWelcomeStart: () => void;
  onCountdownComplete: () => void;
  /** Unused by this game (no tappable target exists on /display — THERAPIST = interaction authority, see LaneControls.tsx's doc comment) — kept only so this component's prop shape matches the shared display-game registry's contract. */
  onSelectBalloon: (balloonId: string) => void;
  onStageCompleteDone: () => void;
  /** Unused by this game — Space Pilot has no incorrect-tap concept (a missed star is diffable from `stars[i].status`, see SpacePilotPlayingScene's doc comment), kept only for prop-shape compatibility. */
  externalIncorrectSignal: { balloonId: string; token: number } | null;
  speakCountdownTick: (tick: "3" | "2" | "1" | "start") => Promise<void>;
  celebrationReplayToken: string | null;
}

/**
 * MULTI-GAME PLATFORM — Space Pilot's own child-facing display module,
 * registered in components/display/gameDisplayRegistry.tsx as the
 * "space-pilot" entry. Same gameState -> scene mapping shape as every other
 * game, reusing CountdownScene UNCHANGED (it has no game-specific
 * dependency) but otherwise mounting this game's own scenes exclusively.
 */
export function SpacePilotDisplay({
  session,
  onEvent,
  onWelcomeStart,
  onCountdownComplete,
  onStageCompleteDone,
  speakCountdownTick,
  celebrationReplayToken,
}: SpacePilotDisplayProps) {
  const stage = session.currentStage;
  const { holdingFinalAction, finishFinalAction } = useStageCompletionPresentation(
    session.gameState,
    `${session.currentDifficulty}:${stage.startedAt ?? "idle"}`,
    FINAL_ACTION_FAILSAFE_MS.spacePilot,
  );
  const showPlaying = session.gameState === GameState.PLAYING || holdingFinalAction;

  return (
    <AnimatePresence mode="wait">
      {session.gameState === GameState.WELCOME && (
        <motion.div key="welcome" className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
          <SpacePilotWelcomeScene childName={session.config.childFirstName} onEvent={onEvent} onStart={onWelcomeStart} />
        </motion.div>
      )}

      {session.gameState === GameState.START_ZONE && (
        <motion.div key="ready-position" className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
          <SpacePilotReadyPositionScene onEvent={onEvent} />
        </motion.div>
      )}

      {session.gameState === GameState.INSTRUCTIONS && (
        <motion.div key="instructions" className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
          <SpacePilotInstructionsScene childName={session.config.childFirstName} difficulty={session.currentDifficulty} onEvent={onEvent} />
        </motion.div>
      )}

      {session.gameState === GameState.COUNTDOWN && (
        <motion.div key="countdown" className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
          <CountdownScene onComplete={onCountdownComplete} onEvent={onEvent} speakCountdownTick={speakCountdownTick} />
        </motion.div>
      )}

      {showPlaying && (
        <motion.div
          key="playing"
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, y: "-12vh" }}
          transition={{ duration: 0.4, ease: "easeIn" }}
        >
          {isStarOnlyStage(stage) ? (
            <SpacePilotPlayingScene stage={stage} childFirstName={session.config.childFirstName} onEvent={onEvent} isPaused={stage.pausedAt !== null} onFinalActionSettled={finishFinalAction} />
          ) : (
            <SpacePilotEncounterPlayingScene
              stage={stage}
              difficulty={session.currentDifficulty}
              childFirstName={session.config.childFirstName}
              onEvent={onEvent}
              isPaused={stage.pausedAt !== null}
              onFinalActionSettled={finishFinalAction}
            />
          )}
        </motion.div>
      )}

      {session.gameState === GameState.STAGE_COMPLETE && !holdingFinalAction && (
        <motion.div key="stage-complete" className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
          <SpacePilotStageCompleteScene
            childFirstName={session.config.childFirstName}
            difficulty={session.currentDifficulty}
            starsCollected={stageStarsCollected(stage)}
            onDone={onStageCompleteDone}
            onEvent={onEvent}
          />
        </motion.div>
      )}

      {session.gameState === GameState.SESSION_COMPLETE && session.summary && (
        <motion.div
          key={`session-complete-${celebrationReplayToken ?? "initial"}`}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          <SpacePilotSessionCompleteScene summary={session.summary} onEvent={onEvent} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

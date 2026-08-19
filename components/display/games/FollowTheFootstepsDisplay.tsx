"use client";

import { AnimatePresence, motion } from "motion/react";
import { GameState, type FootstepsSessionState } from "@/lib/footsteps";
import type { DisplayEventListener } from "../events";
import { CountdownScene } from "../scenes/CountdownScene";
import { FootstepsInstructionsScene } from "../footsteps/scenes/FootstepsInstructionsScene";
import { FootstepsPlayingScene } from "../footsteps/scenes/FootstepsPlayingScene";
import { FootstepsSessionCompleteScene } from "../footsteps/scenes/FootstepsSessionCompleteScene";
import { FootstepsStageCompleteScene } from "../footsteps/scenes/FootstepsStageCompleteScene";
import { FootstepsStartZoneScene } from "../footsteps/scenes/FootstepsStartZoneScene";
import { FootstepsWelcomeScene } from "../footsteps/scenes/FootstepsWelcomeScene";
import { FINAL_ACTION_FAILSAFE_MS, useStageCompletionPresentation } from "../useStageCompletionPresentation";

export interface FollowTheFootstepsDisplayProps {
  session: FootstepsSessionState;
  onEvent: DisplayEventListener;
  onWelcomeStart: () => void;
  onCountdownComplete: () => void;
  /** Unused by this game (no tappable target exists on /display — THERAPIST = interaction authority) — kept only so this component's prop shape matches the shared display-game registry's contract. */
  onSelectBalloon: (balloonId: string) => void;
  onStageCompleteDone: () => void;
  externalIncorrectSignal: { balloonId: string; token: number } | null;
  speakCountdownTick: (tick: "3" | "2" | "1" | "start") => Promise<void>;
  celebrationReplayToken: string | null;
}

/**
 * MULTI-GAME PLATFORM — Follow the Footsteps' own child-facing display
 * module, registered in components/display/gameDisplayRegistry.tsx as the
 * "follow-the-footsteps" entry. Same gameState -> scene mapping shape as
 * BalloonQuestDisplay.tsx, reusing CountdownScene UNCHANGED (it has no
 * balloon-specific dependency — pure 3-2-1-ابدأ paced against real voice
 * playback) but otherwise mounting this game's own scenes exclusively.
 */
export function FollowTheFootstepsDisplay({
  session,
  onEvent,
  onWelcomeStart,
  onCountdownComplete,
  onStageCompleteDone,
  speakCountdownTick,
  celebrationReplayToken,
}: FollowTheFootstepsDisplayProps) {
  const stage = session.currentStage;
  const { holdingFinalAction, finishFinalAction } = useStageCompletionPresentation(
    session.gameState,
    `${stage.difficulty}:${stage.stageNumber}:${stage.startedAt ?? "idle"}`,
    FINAL_ACTION_FAILSAFE_MS.footsteps,
  );
  const showPlaying = session.gameState === GameState.PLAYING || holdingFinalAction;

  return (
    <AnimatePresence mode="wait">
      {session.gameState === GameState.WELCOME && (
        <motion.div key="welcome" className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
          <FootstepsWelcomeScene childName={session.config.childFirstName} onEvent={onEvent} onStart={onWelcomeStart} />
        </motion.div>
      )}

      {session.gameState === GameState.START_ZONE && (
        <motion.div
          key={`start-zone-${stage.stageNumber}`}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          <FootstepsStartZoneScene stageNumber={stage.stageNumber} startingStage={session.config.startingStage} onEvent={onEvent} />
        </motion.div>
      )}

      {session.gameState === GameState.INSTRUCTIONS && (
        <motion.div
          key={`instructions-${stage.stageNumber}`}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          <FootstepsInstructionsScene childName={session.config.childFirstName} stageNumber={stage.stageNumber} onEvent={onEvent} />
        </motion.div>
      )}

      {session.gameState === GameState.COUNTDOWN && (
        <motion.div key="countdown" className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
          <CountdownScene onComplete={onCountdownComplete} onEvent={onEvent} speakCountdownTick={speakCountdownTick} />
        </motion.div>
      )}

      {showPlaying && (
        <motion.div
          key={`playing-${stage.stageNumber}`}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          // The playing scene's completion callback owns the final-step payoff;
          // this short exit is only the handoff into Stage Complete.
          exit={{ opacity: 0, y: "-12vh" }}
          transition={{ duration: 0.4, ease: "easeIn" }}
        >
          <FootstepsPlayingScene stage={stage} onEvent={onEvent} isPaused={stage.pausedAt !== null} onFinalActionSettled={finishFinalAction} />
        </motion.div>
      )}

      {session.gameState === GameState.STAGE_COMPLETE && !holdingFinalAction && (
        <motion.div
          key={`stage-complete-${stage.stageNumber}`}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          <FootstepsStageCompleteScene
            childFirstName={session.config.childFirstName}
            stageNumber={stage.stageNumber}
            stepsCompleted={session.results[session.results.length - 1]?.stepsCompleted ?? stage.currentIndex}
            footprints={stage.footprints}
            checkpoints={stage.checkpoints}
            destination={stage.destination}
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
          <FootstepsSessionCompleteScene summary={session.summary} onEvent={onEvent} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

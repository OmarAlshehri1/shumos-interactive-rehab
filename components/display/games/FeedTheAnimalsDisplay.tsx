"use client";

import { AnimatePresence, motion } from "motion/react";
import { GameState, type FeedAnimalsSessionState } from "@/lib/feedanimals";
import type { DisplayEventListener } from "../events";
import { CountdownScene } from "../scenes/CountdownScene";
import { FeedAnimalsInstructionsScene } from "../feedanimals/scenes/FeedAnimalsInstructionsScene";
import { FeedAnimalsPathPlayingScene } from "../feedanimals/scenes/FeedAnimalsPathPlayingScene";
import { FeedAnimalsPlayingScene } from "../feedanimals/scenes/FeedAnimalsPlayingScene";
import { FeedAnimalsReadyPositionScene } from "../feedanimals/scenes/FeedAnimalsReadyPositionScene";
import { FeedAnimalsSessionCompleteScene } from "../feedanimals/scenes/FeedAnimalsSessionCompleteScene";
import { FeedAnimalsStageCompleteScene } from "../feedanimals/scenes/FeedAnimalsStageCompleteScene";
import { FeedAnimalsWelcomeScene } from "../feedanimals/scenes/FeedAnimalsWelcomeScene";
import { FINAL_ACTION_FAILSAFE_MS, useStageCompletionPresentation } from "../useStageCompletionPresentation";

export interface FeedTheAnimalsDisplayProps {
  session: FeedAnimalsSessionState;
  onEvent: DisplayEventListener;
  onWelcomeStart: () => void;
  onCountdownComplete: () => void;
  /** Unused by this game (no tappable target exists on /display — THERAPIST = interaction authority) — kept only so this component's prop shape matches the shared display-game registry's contract. */
  onSelectBalloon: (balloonId: string) => void;
  onStageCompleteDone: () => void;
  /** Reused as-is from the shared registry contract — `balloonId` doubles as the generic "target element id" here (a food choice id), see lib/realtime/types.ts's LiveInteraction doc comment. */
  externalIncorrectSignal: { balloonId: string; token: number } | null;
  speakCountdownTick: (tick: "3" | "2" | "1" | "start") => Promise<void>;
  celebrationReplayToken: string | null;
}

/**
 * MULTI-GAME PLATFORM — Feed the Animals' own child-facing display module,
 * registered in components/display/gameDisplayRegistry.tsx as the
 * "feed-the-animals" entry. Same gameState -> scene mapping shape as every
 * other game, reusing CountdownScene UNCHANGED (game-agnostic) but
 * otherwise mounting this game's own SAFARI ADVENTURE scenes exclusively.
 */
export function FeedTheAnimalsDisplay({
  session,
  onEvent,
  onWelcomeStart,
  onCountdownComplete,
  onStageCompleteDone,
  externalIncorrectSignal,
  speakCountdownTick,
  celebrationReplayToken,
}: FeedTheAnimalsDisplayProps) {
  const stage = session.currentStage;
  const { holdingFinalAction, finishFinalAction } = useStageCompletionPresentation(
    session.gameState,
    `${stage.difficulty}:${stage.stageNumber}:${stage.startedAt ?? "idle"}`,
    stage.kind === "path" ? FINAL_ACTION_FAILSAFE_MS.feedAnimalsPath : FINAL_ACTION_FAILSAFE_MS.feedAnimalsChoice,
  );
  const showPlaying = session.gameState === GameState.PLAYING || holdingFinalAction;

  return (
    <AnimatePresence mode="wait">
      {session.gameState === GameState.WELCOME && (
        <motion.div key="welcome" className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
          <FeedAnimalsWelcomeScene childName={session.config.childFirstName} onEvent={onEvent} onStart={onWelcomeStart} />
        </motion.div>
      )}

      {session.gameState === GameState.START_ZONE && (
        <motion.div
          key={`ready-position-${stage.stageNumber}`}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          <FeedAnimalsReadyPositionScene
            childName={session.config.childFirstName}
            stageNumber={stage.stageNumber}
            startingStage={session.config.startingStage}
            onEvent={onEvent}
          />
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
          <FeedAnimalsInstructionsScene childName={session.config.childFirstName} stageNumber={stage.stageNumber} onEvent={onEvent} />
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
          // The active feed/path scene reports when its local reward has finished;
          // this short exit only performs the Stage Complete handoff.
          exit={{ opacity: 0, y: "-12vh" }}
          transition={{ duration: 0.4, ease: "easeIn" }}
        >
          {stage.kind === "path" ? (
            <FeedAnimalsPathPlayingScene
              stage={stage}
              childFirstName={session.config.childFirstName}
              onEvent={onEvent}
              isPaused={stage.pausedAt !== null}
              onFinalActionSettled={finishFinalAction}
            />
          ) : (
            <FeedAnimalsPlayingScene
              stage={stage}
              childFirstName={session.config.childFirstName}
              onEvent={onEvent}
              externalIncorrectSignal={externalIncorrectSignal ? { foodChoiceId: externalIncorrectSignal.balloonId, token: externalIncorrectSignal.token } : null}
              isPaused={stage.pausedAt !== null}
              onFinalActionSettled={finishFinalAction}
            />
          )}
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
          <FeedAnimalsStageCompleteScene
            childFirstName={session.config.childFirstName}
            stageNumber={stage.stageNumber}
            roundsCompleted={session.results[session.results.length - 1]?.roundsCompleted ?? stage.currentRoundIndex}
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
          <FeedAnimalsSessionCompleteScene summary={session.summary} onEvent={onEvent} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

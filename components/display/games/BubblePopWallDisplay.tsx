"use client";

import { AnimatePresence, motion } from "motion/react";
import { type BubbleColor, GameState, type BubblePopSessionState } from "@/lib/bubblepop";
import type { DisplayEventListener } from "../events";
import { CountdownScene } from "../scenes/CountdownScene";
import { BubblePopInstructionsScene } from "../bubblepop/scenes/BubblePopInstructionsScene";
import { BubblePopPlayingScene } from "../bubblepop/scenes/BubblePopPlayingScene";
import { BubblePopReadyPositionScene } from "../bubblepop/scenes/BubblePopReadyPositionScene";
import { BubblePopSessionCompleteScene } from "../bubblepop/scenes/BubblePopSessionCompleteScene";
import { BubblePopStageCompleteScene } from "../bubblepop/scenes/BubblePopStageCompleteScene";
import { BubblePopWelcomeScene } from "../bubblepop/scenes/BubblePopWelcomeScene";
import { FINAL_ACTION_FAILSAFE_MS, useStageCompletionPresentation } from "../useStageCompletionPresentation";

export interface BubblePopWallDisplayProps {
  session: BubblePopSessionState;
  onEvent: DisplayEventListener;
  onWelcomeStart: () => void;
  onCountdownComplete: () => void;
  /** Unused by this game (no tappable target exists on /display — THERAPIST = interaction authority) — kept only so this component's prop shape matches the shared display-game registry's contract. */
  onSelectBalloon: (balloonId: string) => void;
  onStageCompleteDone: () => void;
  /** Reused as-is from the shared registry contract — `balloonId` doubles as the generic "target element id" here (the pressed station's color), see lib/realtime/types.ts's LiveInteraction doc comment. */
  externalIncorrectSignal: { balloonId: string; token: number } | null;
  speakCountdownTick: (tick: "3" | "2" | "1" | "start") => Promise<void>;
  celebrationReplayToken: string | null;
}

/**
 * MULTI-GAME PLATFORM — Bubble Pop Wall's own child-facing display module,
 * registered in components/display/gameDisplayRegistry.tsx as the
 * "bubble-pop-wall" entry. Same gameState -> scene mapping shape as the
 * other two games, reusing CountdownScene UNCHANGED (it has no game-specific
 * dependency — pure 3-2-1-ابدأ paced against real voice playback) but
 * otherwise mounting this game's own scenes exclusively.
 */
export function BubblePopWallDisplay({
  session,
  onEvent,
  onWelcomeStart,
  onCountdownComplete,
  onStageCompleteDone,
  externalIncorrectSignal,
  speakCountdownTick,
  celebrationReplayToken,
}: BubblePopWallDisplayProps) {
  const stage = session.currentStage;
  const { holdingFinalAction, finishFinalAction } = useStageCompletionPresentation(
    session.gameState,
    `${stage.difficulty}:${stage.stageNumber}:${stage.startedAt ?? "idle"}`,
    FINAL_ACTION_FAILSAFE_MS.bubblePop,
  );
  const showPlaying = session.gameState === GameState.PLAYING || holdingFinalAction;

  return (
    <AnimatePresence mode="wait">
      {session.gameState === GameState.WELCOME && (
        <motion.div key="welcome" className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
          <BubblePopWelcomeScene childName={session.config.childFirstName} onEvent={onEvent} onStart={onWelcomeStart} />
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
          <BubblePopReadyPositionScene
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
          <BubblePopInstructionsScene childName={session.config.childFirstName} stageNumber={stage.stageNumber} onEvent={onEvent} />
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
          // The pop effect reports completion after pulse + burst; this short exit
          // only transitions the resolved playfield into Stage Complete.
          exit={{ opacity: 0, y: "-12vh" }}
          transition={{ duration: 0.4, ease: "easeIn" }}
        >
          <BubblePopPlayingScene
            stage={stage}
            childFirstName={session.config.childFirstName}
            onEvent={onEvent}
            externalIncorrectSignal={
              // A color+shape station encodes as "COLOR:SHAPE" (see useBubblePopRealtimeControllerSession.ts's
              // confirmBubblePopColor) — only the color half drives the wobble match here (task section 9's
              // gentle feedback is per-color, not per-exact-token; harmless if two candidate tokens share a color).
              externalIncorrectSignal
                ? { color: externalIncorrectSignal.balloonId.split(":")[0] as BubbleColor, token: externalIncorrectSignal.token }
                : null
            }
            isPaused={stage.pausedAt !== null}
            onFinalActionSettled={finishFinalAction}
          />
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
          <BubblePopStageCompleteScene
            childFirstName={session.config.childFirstName}
            stageNumber={stage.stageNumber}
            targetsCompleted={session.results[session.results.length - 1]?.targetsCompleted ?? stage.currentTargetIndex}
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
          <BubblePopSessionCompleteScene summary={session.summary} onEvent={onEvent} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

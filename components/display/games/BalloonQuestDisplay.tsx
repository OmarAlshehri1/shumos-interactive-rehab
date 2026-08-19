"use client";

import { AnimatePresence, motion } from "motion/react";
import { GameState, type SessionState } from "@/lib/game";
import type { DisplayEventListener } from "../events";
import { CountdownScene } from "../scenes/CountdownScene";
import { InstructionsScene } from "../scenes/InstructionsScene";
import { PlayingScene } from "../scenes/PlayingScene";
import { SessionCompleteScene } from "../scenes/SessionCompleteScene";
import { StageCompleteScene } from "../scenes/StageCompleteScene";
import { StartZoneScene } from "../scenes/StartZoneScene";
import { WelcomeScene } from "../scenes/WelcomeScene";
import { FINAL_ACTION_FAILSAFE_MS, useStageCompletionPresentation } from "../useStageCompletionPresentation";

export interface BalloonQuestDisplayProps {
  session: SessionState;
  onEvent: DisplayEventListener;
  onWelcomeStart: () => void;
  onCountdownComplete: () => void;
  onSelectBalloon: (balloonId: string) => void;
  onStageCompleteDone: () => void;
  externalIncorrectSignal: { balloonId: string; token: number } | null;
  speakCountdownTick: (tick: "3" | "2" | "1" | "start") => Promise<void>;
  /** TASK 9: null in local mode (no replay counterpart) or before the therapist has ever tapped "إعادة الاحتفال". A new token re-keys the SESSION_COMPLETE scene so it remounts and replays. */
  celebrationReplayToken: string | null;
}

/**
 * MULTI-GAME PLATFORM: Balloon Quest's own child-facing display module —
 * the approved Task 3/4 gameState -> scene mapping (formerly DisplayScreen.tsx's
 * SceneSwitch), relocated here unchanged so it can be registered in
 * components/display/gameDisplayRegistry.tsx as the "balloon-quest" entry.
 * Nothing about how Balloon Quest looks or plays changed in this move —
 * only who mounts it (the platform's display game resolver, once a
 * canonical session's gameId resolves to this module) and where the file
 * lives.
 */
export function BalloonQuestDisplay({
  session,
  onEvent,
  onWelcomeStart,
  onCountdownComplete,
  onSelectBalloon,
  onStageCompleteDone,
  externalIncorrectSignal,
  speakCountdownTick,
  celebrationReplayToken,
}: BalloonQuestDisplayProps) {
  const stage = session.currentStage;
  const { holdingFinalAction, finishFinalAction } = useStageCompletionPresentation(
    session.gameState,
    `${stage.difficulty}:${stage.stageNumber}:${stage.startedAt ?? "idle"}`,
    FINAL_ACTION_FAILSAFE_MS.balloonQuest,
  );
  const showPlaying = session.gameState === GameState.PLAYING || holdingFinalAction;

  return (
    <AnimatePresence mode="wait">
      {session.gameState === GameState.WELCOME && (
        <motion.div
          key="welcome"
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          <WelcomeScene childName={session.config.childFirstName} onEvent={onEvent} onStart={onWelcomeStart} />
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
          <StartZoneScene stageNumber={stage.stageNumber} startingStage={session.config.startingStage} onEvent={onEvent} />
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
          <InstructionsScene targetColor={stage.targetColor} stageNumber={stage.stageNumber} onEvent={onEvent} />
        </motion.div>
      )}

      {session.gameState === GameState.COUNTDOWN && (
        <motion.div
          key="countdown"
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <CountdownScene onComplete={onCountdownComplete} onEvent={onEvent} speakCountdownTick={speakCountdownTick} />
        </motion.div>
      )}

      {showPlaying && (
        <motion.div
          key={`playing-${stage.stageNumber}`}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, y: "-12vh" }}
          transition={{ duration: 0.45, ease: "easeIn" }}
        >
          <PlayingScene
            stage={stage}
            onSelectBalloon={onSelectBalloon}
            onEvent={onEvent}
            externalIncorrectSignal={externalIncorrectSignal}
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
          <StageCompleteScene
            childFirstName={session.config.childFirstName}
            stageNumber={stage.stageNumber}
            correctCount={session.results[session.results.length - 1]?.correctCount ?? stage.correctCount}
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
          <SessionCompleteScene summary={session.summary} onEvent={onEvent} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

"use client";

import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { Difficulty, GameState, type FootstepsSessionState, type StageNumber } from "@/lib/footsteps";
import type { FootstepsDifficultyDecision } from "@/lib/control/footsteps/useLocalFootstepsControllerSession";
import { ConfirmSheet } from "@/components/control/live/ConfirmSheet";
import { EndSessionReasonSheet } from "@/components/control/session/EndSessionReasonSheet";
import type { EarlyEndSelection } from "@/lib/sessions/workflowMetadata";
import { SessionControls } from "@/components/control/live/SessionControls";
import { LiveNavigationControls } from "@/components/control/live/LiveNavigationControls";
import { StartZoneOverlay } from "@/components/control/live/StartZoneOverlay";
import { FootMap } from "./FootMap";
import { FootstepsLiveHeader } from "./FootstepsLiveHeader";
import { FootstepsLiveProgress } from "./FootstepsLiveProgress";
import { FootstepsStageCompleteOverlay } from "./FootstepsStageCompleteOverlay";
import { FootstepsStageStrip } from "./FootstepsStageStrip";

interface FootstepsLiveSessionScreenProps {
  session: FootstepsSessionState;
  onConfirmCurrentFootstep: () => void;
  onPauseOrResume: () => void;
  onRestartStage: () => void;
  onSkipStage: () => void;
  onEndSessionEarly: (selection: EarlyEndSelection) => void;
  onAdvanceStage: (decision: FootstepsDifficultyDecision) => void;
  onJumpToStage: (stageNumber: StageNumber) => void;
  onDifficultyChange: (difficulty: Difficulty) => void;
  onChildReady: () => void;
  offline?: boolean;
}

type PendingConfirm = "restart" | "skip" | "end" | null;

/**
 * Follow the Footsteps' own live gameplay screen — same layout skeleton as
 * Balloon Quest's LiveSessionScreen.tsx (header / map / progress / stage
 * strip / session controls / overlays) but wired to this game's own step-
 * confirmation flow instead of balloon selection, and reusing StartZoneOverlay
 * + SessionControls directly since those two are already fully generic.
 */
export function FootstepsLiveSessionScreen({
  session,
  onConfirmCurrentFootstep,
  onPauseOrResume,
  onRestartStage,
  onSkipStage,
  onEndSessionEarly,
  onAdvanceStage,
  onJumpToStage,
  onDifficultyChange,
  onChildReady,
  offline = false,
}: FootstepsLiveSessionScreenProps) {
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);

  const stage = session.currentStage;
  const isStageComplete = session.gameState === GameState.STAGE_COMPLETE;
  const isAwaitingStartZone = session.gameState === GameState.START_ZONE;
  const isTransitioning = session.gameState === GameState.INSTRUCTIONS || session.gameState === GameState.COUNTDOWN;
  const lastResult = session.results[session.results.length - 1] ?? null;

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex h-full min-h-0 flex-1 flex-col landscape:flex-row">
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto py-2 landscape:min-w-0">
          <FootstepsLiveHeader
            childFirstName={session.config.childFirstName}
            stageNumber={stage.stageNumber}
            currentIndex={stage.currentIndex}
            totalSteps={stage.totalSteps}
            gameState={session.gameState}
            isPaused={stage.pausedAt !== null}
          />
          <div className="min-h-0 flex-1 px-4 sm:px-6">
            <FootMap
              footprints={stage.footprints}
              checkpoints={stage.checkpoints}
              obstacles={stage.obstacles}
              destination={stage.destination}
              currentIndex={stage.currentIndex}
              disabled={isStageComplete || isAwaitingStartZone || isTransitioning || stage.pausedAt !== null || offline}
              offline={offline}
              onConfirm={onConfirmCurrentFootstep}
            />
          </div>
          <FootstepsLiveProgress currentIndex={stage.currentIndex} totalSteps={stage.totalSteps} sessionStartedAt={session.createdAt} />
        </div>

        <div className="flex shrink-0 flex-col gap-3 overflow-y-auto border-t border-slate-100 pt-3 landscape:w-72 landscape:border-t-0 landscape:border-s landscape:pt-3">
          <div className="px-4 sm:px-6">
            <LiveNavigationControls currentDifficulty={session.currentDifficulty} hasMeaningfulProgress={stage.currentIndex > 0} disabled={offline} onDifficultyChange={onDifficultyChange} />
          </div>
          <div className="px-4 sm:px-6">
            <FootstepsStageStrip
              difficulty={session.currentDifficulty}
              currentStageNumber={stage.stageNumber}
              results={session.results}
              disabled={isAwaitingStartZone || offline}
              hasMeaningfulProgress={stage.currentIndex > 0}
              onJumpToStage={onJumpToStage}
            />
          </div>
          <SessionControls
            isPaused={stage.pausedAt !== null}
            disabled={isStageComplete || isAwaitingStartZone || isTransitioning}
            offline={offline}
            onPauseResume={onPauseOrResume}
            onRestartStage={() => setPendingConfirm("restart")}
            onSkipStage={() => setPendingConfirm("skip")}
            onEndSession={() => setPendingConfirm("end")}
          />
        </div>
      </div>

      <AnimatePresence>
        {isStageComplete && lastResult && (
          <FootstepsStageCompleteOverlay
            result={lastResult}
            currentDifficulty={session.currentDifficulty}
            onAdvance={onAdvanceStage}
            onRequestEndSession={() => setPendingConfirm("end")}
          />
        )}
        {isAwaitingStartZone && (
          <StartZoneOverlay
            stageNumber={stage.stageNumber}
            startingStage={session.config.startingStage}
            onChildReady={onChildReady}
            onRequestEndSession={() => setPendingConfirm("end")}
          />
        )}
      </AnimatePresence>

      <ConfirmSheet
        open={pendingConfirm === "restart"}
        title="إعادة المرحلة؟"
        description="سيتم إعادة هذه المرحلة من البداية، وفقدان التقدم الحالي فيها."
        confirmLabel="إعادة المرحلة"
        onConfirm={() => {
          onRestartStage();
          setPendingConfirm(null);
        }}
        onCancel={() => setPendingConfirm(null)}
      />
      <ConfirmSheet
        open={pendingConfirm === "skip"}
        title="تخطي المرحلة؟"
        description="سيتم تسجيل هذه المرحلة كمرحلة تم تخطيها، وليست كمرحلة فشل فيها الطفل، والانتقال إلى ما بعدها."
        confirmLabel="تخطي المرحلة"
        onConfirm={() => {
          onSkipStage();
          setPendingConfirm(null);
        }}
        onCancel={() => setPendingConfirm(null)}
      />
      <EndSessionReasonSheet
        open={pendingConfirm === "end"}
        onConfirm={(selection) => {
          onEndSessionEarly(selection);
          setPendingConfirm(null);
        }}
        onCancel={() => setPendingConfirm(null)}
      />
    </div>
  );
}

"use client";

import { useState } from "react";
import { Difficulty, GameState, getFeedAnimalsPathLeg, getFeedAnimalsPathStage, type FeedAnimalsSessionState, type StageNumber } from "@/lib/feedanimals";
import type { FeedAnimalsDifficultyDecision } from "@/lib/control/feedanimals/useLocalFeedAnimalsControllerSession";
import { ConfirmSheet } from "@/components/control/live/ConfirmSheet";
import { EndSessionReasonSheet } from "@/components/control/session/EndSessionReasonSheet";
import type { EarlyEndSelection } from "@/lib/sessions/workflowMetadata";
import { ReadyPositionOverlay } from "@/components/control/live/ReadyPositionOverlay";
import { SessionControls } from "@/components/control/live/SessionControls";
import { LiveNavigationControls } from "@/components/control/live/LiveNavigationControls";
import { AnimalFoodMap } from "./AnimalFoodMap";
import { AnimalPathMap } from "./AnimalPathMap";
import { FeedAnimalsLiveHeader } from "./FeedAnimalsLiveHeader";
import { FeedAnimalsLiveProgress } from "./FeedAnimalsLiveProgress";
import { FeedAnimalsStageCompleteOverlay } from "./FeedAnimalsStageCompleteOverlay";
import { FeedAnimalsStageStrip } from "./FeedAnimalsStageStrip";

interface FeedAnimalsLiveSessionScreenProps {
  session: FeedAnimalsSessionState;
  onConfirmFoodSelection: (foodChoiceId: string) => void;
  onAdvanceMonkey: (direction: "left" | "right" | "jump") => void;
  onPauseOrResume: () => void;
  onRestartStage: () => void;
  onSkipStage: () => void;
  onEndSessionEarly: (selection: EarlyEndSelection) => void;
  onAdvanceStage: (decision: FeedAnimalsDifficultyDecision) => void;
  onJumpToStage: (stageNumber: StageNumber) => void;
  onDifficultyChange: (difficulty: Difficulty) => void;
  onChildReady: () => void;
  offline?: boolean;
}

type PendingConfirm = "restart" | "skip" | "end" | null;

/**
 * Feed the Animals' own live gameplay screen — same layout skeleton as
 * every other game (header / map / progress / stage strip / session
 * controls / overlays) but wired to this game's own food-selection flow,
 * and using the wall-appropriate ReadyPositionOverlay. Reuses
 * SessionControls + ConfirmSheet directly since both are already fully
 * generic.
 */
export function FeedAnimalsLiveSessionScreen({
  session,
  onConfirmFoodSelection,
  onAdvanceMonkey,
  onPauseOrResume,
  onRestartStage,
  onSkipStage,
  onEndSessionEarly,
  onAdvanceStage,
  onJumpToStage,
  onDifficultyChange,
  onChildReady,
  offline = false,
}: FeedAnimalsLiveSessionScreenProps) {
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);

  const stage = session.currentStage;
  const activePathDef = stage.kind === "path" ? getFeedAnimalsPathStage(stage.difficulty, stage.stageNumber) : null;
  const isStageComplete = session.gameState === GameState.STAGE_COMPLETE;
  const isAwaitingReadyPosition = session.gameState === GameState.START_ZONE;
  const isTransitioning = session.gameState === GameState.INSTRUCTIONS || session.gameState === GameState.COUNTDOWN;
  const lastResult = session.results[session.results.length - 1] ?? null;
  const hasMeaningfulProgress = stage.kind === "path" ? stage.pathProgressStep > 0 : stage.currentRoundIndex > 0 || stage.incorrectCount > 0;

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex h-full min-h-0 flex-1 flex-col landscape:flex-row">
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto py-2 landscape:min-w-0">
          <FeedAnimalsLiveHeader childFirstName={session.config.childFirstName} stage={stage} gameState={session.gameState} isPaused={stage.pausedAt !== null} />
          <div className="min-h-0 flex-1 px-4 sm:px-6">
            {stage.kind === "path" ? (
              <AnimalPathMap
                stage={stage}
                disabled={isStageComplete || isAwaitingReadyPosition || isTransitioning || stage.pausedAt !== null || offline}
                offline={offline}
                onMove={onAdvanceMonkey}
              />
            ) : (
              <AnimalFoodMap
                stage={stage}
                disabled={isStageComplete || isAwaitingReadyPosition || isTransitioning || stage.pausedAt !== null || offline}
                offline={offline}
                onConfirm={onConfirmFoodSelection}
              />
            )}
          </div>
          <FeedAnimalsLiveProgress
            currentRoundIndex={stage.kind === "path" ? stage.pathProgressStep : stage.currentRoundIndex}
            totalRounds={stage.kind === "path" ? (activePathDef ? getFeedAnimalsPathLeg(activePathDef, stage.legIndex).totalSteps : 0) : stage.rounds.length}
            sessionStartedAt={session.createdAt}
          />
        </div>

        <div className="flex shrink-0 flex-col gap-3 overflow-y-auto border-t border-slate-100 pt-3 landscape:w-72 landscape:border-t-0 landscape:border-s landscape:pt-3">
          <div className="px-4 sm:px-6">
            <LiveNavigationControls currentDifficulty={session.currentDifficulty} hasMeaningfulProgress={hasMeaningfulProgress} disabled={offline} onDifficultyChange={onDifficultyChange} />
          </div>
          <div className="px-4 sm:px-6">
            <FeedAnimalsStageStrip
              difficulty={session.currentDifficulty}
              currentStageNumber={stage.stageNumber}
              results={session.results}
              disabled={isAwaitingReadyPosition || offline}
              hasMeaningfulProgress={hasMeaningfulProgress}
              onJumpToStage={onJumpToStage}
            />
          </div>
          <SessionControls
            isPaused={stage.pausedAt !== null}
            disabled={isStageComplete || isAwaitingReadyPosition || isTransitioning}
            offline={offline}
            onPauseResume={onPauseOrResume}
            onRestartStage={() => setPendingConfirm("restart")}
            onSkipStage={() => setPendingConfirm("skip")}
            onEndSession={() => setPendingConfirm("end")}
          />
        </div>
      </div>

      {isStageComplete && lastResult && (
        <FeedAnimalsStageCompleteOverlay
          result={lastResult}
          currentDifficulty={session.currentDifficulty}
          onAdvance={onAdvanceStage}
          onRequestEndSession={() => setPendingConfirm("end")}
        />
      )}
      {isAwaitingReadyPosition && (
        <ReadyPositionOverlay
          stageNumber={stage.stageNumber}
          startingStage={session.config.startingStage}
          onChildReady={onChildReady}
          onRequestEndSession={() => setPendingConfirm("end")}
        />
      )}

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

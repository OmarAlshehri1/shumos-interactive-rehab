"use client";

import { useState } from "react";
import { type BubbleColor, Difficulty, GameState, type BubblePopSessionState, type BubbleShape, type StageNumber } from "@/lib/bubblepop";
import type { BubblePopDifficultyDecision } from "@/lib/control/bubblepop/useLocalBubblePopControllerSession";
import { ConfirmSheet } from "@/components/control/live/ConfirmSheet";
import { EndSessionReasonSheet } from "@/components/control/session/EndSessionReasonSheet";
import type { EarlyEndSelection } from "@/lib/sessions/workflowMetadata";
import { ReadyPositionOverlay } from "@/components/control/live/ReadyPositionOverlay";
import { SessionControls } from "@/components/control/live/SessionControls";
import { LiveNavigationControls } from "@/components/control/live/LiveNavigationControls";
import { BubblePopLiveHeader } from "./BubblePopLiveHeader";
import { BubblePopLiveProgress } from "./BubblePopLiveProgress";
import { BubblePopStageCompleteOverlay } from "./BubblePopStageCompleteOverlay";
import { BubblePopStageStrip } from "./BubblePopStageStrip";
import { StationBar } from "./StationBar";

interface BubblePopLiveSessionScreenProps {
  session: BubblePopSessionState;
  onConfirmStationColor: (color: BubbleColor, shape?: BubbleShape) => void;
  onPauseOrResume: () => void;
  onRestartStage: () => void;
  onSkipStage: () => void;
  onEndSessionEarly: (selection: EarlyEndSelection) => void;
  onAdvanceStage: (decision: BubblePopDifficultyDecision) => void;
  onJumpToStage: (stageNumber: StageNumber) => void;
  onDifficultyChange: (difficulty: Difficulty) => void;
  onChildReady: () => void;
  offline?: boolean;
}

type PendingConfirm = "restart" | "skip" | "end" | null;

/**
 * Bubble Pop Wall's own live gameplay screen — same layout skeleton as the
 * other two games (header / map / progress / stage strip / session controls
 * / overlays) but wired to this game's own bubble-selection flow, and using
 * the wall-appropriate ReadyPositionOverlay instead of the floor games'
 * StartZoneOverlay. Reuses SessionControls + ConfirmSheet directly since
 * both are already fully generic.
 */
export function BubblePopLiveSessionScreen({
  session,
  onConfirmStationColor,
  onPauseOrResume,
  onRestartStage,
  onSkipStage,
  onEndSessionEarly,
  onAdvanceStage,
  onJumpToStage,
  onDifficultyChange,
  onChildReady,
  offline = false,
}: BubblePopLiveSessionScreenProps) {
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);

  const stage = session.currentStage;
  const isStageComplete = session.gameState === GameState.STAGE_COMPLETE;
  const isAwaitingReadyPosition = session.gameState === GameState.START_ZONE;
  const isTransitioning = session.gameState === GameState.INSTRUCTIONS || session.gameState === GameState.COUNTDOWN;
  const lastResult = session.results[session.results.length - 1] ?? null;

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex h-full min-h-0 flex-1 flex-col landscape:flex-row">
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto py-2 landscape:min-w-0">
          <BubblePopLiveHeader childFirstName={session.config.childFirstName} stage={stage} gameState={session.gameState} isPaused={stage.pausedAt !== null} />
          <div className="min-h-0 flex-1 px-4 sm:px-6">
            <StationBar
              stage={stage}
              disabled={isStageComplete || isAwaitingReadyPosition || isTransitioning || stage.pausedAt !== null || offline}
              offline={offline}
              onConfirm={onConfirmStationColor}
            />
          </div>
          <BubblePopLiveProgress currentTargetIndex={stage.currentTargetIndex} totalTargets={stage.targetSequence.length} sessionStartedAt={session.createdAt} />
        </div>

        <div className="flex shrink-0 flex-col gap-3 overflow-y-auto border-t border-slate-100 pt-3 landscape:w-72 landscape:border-t-0 landscape:border-s landscape:pt-3">
          <div className="px-4 sm:px-6">
            <LiveNavigationControls currentDifficulty={session.currentDifficulty} hasMeaningfulProgress={stage.currentTargetIndex > 0 || stage.incorrectCount > 0} disabled={offline} onDifficultyChange={onDifficultyChange} />
          </div>
          <div className="px-4 sm:px-6">
            <BubblePopStageStrip
              difficulty={session.currentDifficulty}
              currentStageNumber={stage.stageNumber}
              results={session.results}
              disabled={isAwaitingReadyPosition || offline}
              hasMeaningfulProgress={stage.currentTargetIndex > 0 || stage.incorrectCount > 0}
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
        <BubblePopStageCompleteOverlay
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

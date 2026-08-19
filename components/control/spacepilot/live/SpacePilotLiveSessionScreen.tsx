"use client";

import { useState } from "react";
import { Difficulty, GameState, type SpacePilotSessionState } from "@/lib/spacepilot";
import { ConfirmSheet } from "@/components/control/live/ConfirmSheet";
import { LiveNavigationControls } from "@/components/control/live/LiveNavigationControls";
import { LaneControlBar } from "./LaneControlBar";
import { SpacePilotLiveHeader } from "./SpacePilotLiveHeader";
import { SpacePilotLiveProgress } from "./SpacePilotLiveProgress";
import { SpacePilotReadyPositionOverlay } from "./SpacePilotReadyPositionOverlay";
import { SpacePilotSessionControls } from "./SpacePilotSessionControls";
import { SpacePilotStageCompleteOverlay } from "./SpacePilotStageCompleteOverlay";
import { EndSessionReasonSheet } from "@/components/control/session/EndSessionReasonSheet";
import type { EarlyEndSelection } from "@/lib/sessions/workflowMetadata";

interface SpacePilotLiveSessionScreenProps {
  session: SpacePilotSessionState;
  onMoveRocketLane: (direction: "UP" | "DOWN") => void;
  onFireWeapon?: () => void;
  onPauseOrResume: () => void;
  onRestartLevel: () => void;
  onEndSessionEarly: (selection: EarlyEndSelection) => void;
  onChildReady: () => void;
  onDifficultyChange: (difficulty: Difficulty) => void;
  offline?: boolean;
}

type PendingConfirm = "restart" | "end" | null;

/**
 * Space Pilot's own live gameplay screen — same layout skeleton as every
 * other game (header / lane bar / progress / session controls / overlays),
 * wired to this game's own lane-movement flow. No stage strip (single
 * level, nothing to jump between).
 */
export function SpacePilotLiveSessionScreen({
  session,
  onMoveRocketLane,
  onFireWeapon,
  onPauseOrResume,
  onRestartLevel,
  onEndSessionEarly,
  onChildReady,
  onDifficultyChange,
  offline = false,
}: SpacePilotLiveSessionScreenProps) {
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);

  const stage = session.currentStage;
  const isStageComplete = session.gameState === GameState.STAGE_COMPLETE;
  const isAwaitingReadyPosition = session.gameState === GameState.START_ZONE;
  const isTransitioning = session.gameState === GameState.INSTRUCTIONS || session.gameState === GameState.COUNTDOWN;

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex h-full min-h-0 flex-1 flex-col landscape:flex-row">
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto py-2 landscape:min-w-0">
          <SpacePilotLiveHeader
            childFirstName={session.config.childFirstName}
            stage={stage}
            difficulty={session.currentDifficulty}
            gameState={session.gameState}
            isPaused={stage.pausedAt !== null}
          />
          <div className="min-h-0 flex-1 px-4 sm:px-6">
            <LaneControlBar
              stage={stage}
              disabled={isStageComplete || isAwaitingReadyPosition || isTransitioning || stage.pausedAt !== null || offline}
              offline={offline}
              onMove={onMoveRocketLane}
              onFire={onFireWeapon}
            />
          </div>
          <SpacePilotLiveProgress stage={stage} />
        </div>

        <div className="flex shrink-0 flex-col gap-3 overflow-y-auto border-t border-slate-100 pt-3 landscape:w-72 landscape:border-t-0 landscape:border-s landscape:pt-3">
          <div className="px-4 sm:px-6">
            <LiveNavigationControls currentDifficulty={session.currentDifficulty} hasMeaningfulProgress={stage.startedAt !== null} disabled={offline} onDifficultyChange={onDifficultyChange} />
          </div>
          <SpacePilotSessionControls
            isPaused={stage.pausedAt !== null}
            disabled={isStageComplete || isAwaitingReadyPosition || isTransitioning}
            offline={offline}
            onPauseResume={onPauseOrResume}
            onRestartLevel={() => setPendingConfirm("restart")}
            onEndSession={() => setPendingConfirm("end")}
          />
        </div>
      </div>

      {isStageComplete && <SpacePilotStageCompleteOverlay stage={stage} difficulty={session.currentDifficulty} onEndSession={() => setPendingConfirm("end")} />}
      {isAwaitingReadyPosition && <SpacePilotReadyPositionOverlay onChildReady={onChildReady} onRequestEndSession={() => setPendingConfirm("end")} />}

      <ConfirmSheet
        open={pendingConfirm === "restart"}
        title="إعادة الرحلة؟"
        description="سيتم إعادة المرحلة من البداية، وفقدان التقدم الحالي فيها."
        confirmLabel="إعادة الرحلة"
        onConfirm={() => {
          onRestartLevel();
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

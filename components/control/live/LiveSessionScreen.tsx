"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence } from "motion/react";
import { GameState, type SessionState, type StageNumber } from "@/lib/game";
import type { DifficultyDecision } from "@/lib/control/useLocalControllerSession";
import { BalloonMap } from "./BalloonMap";
import { ConfirmSheet } from "./ConfirmSheet";
import { LiveHeader } from "./LiveHeader";
import { LiveProgress } from "./LiveProgress";
import { SessionControls } from "./SessionControls";
import { StageCompleteOverlay } from "./StageCompleteOverlay";
import { StageStrip } from "./StageStrip";
import { StartZoneOverlay } from "./StartZoneOverlay";

interface IncorrectSignal {
  balloonId: string;
  token: number;
}

interface LiveSessionScreenProps {
  session: SessionState;
  onSelectBalloon: (balloonId: string) => boolean | null;
  onPauseOrResume: () => void;
  onRestartStage: () => void;
  onSkipStage: () => void;
  onEndSessionEarly: () => void;
  /** TASK 11: the therapist's post-STAGE_COMPLETE decision — continue, or step to the adjacent easier/harder difficulty. See StageCompleteOverlay.tsx. */
  onAdvanceStage: (decision: DifficultyDecision) => void;
  /** TASK 11: the stage strip's forward jump, confirmed via StageStrip's own ConfirmSheet. */
  onJumpToStage: (stageNumber: StageNumber) => void;
  /** TASK 8.2: the therapist's "الطفل جاهز" confirmation — the only way out of GameState.START_ZONE. */
  onChildReady: () => void;
  /** TASK 8: undefined in local mode (nothing disabled for connectivity); true once /control's socket is confirmed down. */
  offline?: boolean;
}

type PendingConfirm = "restart" | "skip" | "end" | null;

const SHAKE_DURATION_MS = 450;

export function LiveSessionScreen({
  session,
  onSelectBalloon,
  onPauseOrResume,
  onRestartStage,
  onSkipStage,
  onEndSessionEarly,
  onAdvanceStage,
  onJumpToStage,
  onChildReady,
  offline = false,
}: LiveSessionScreenProps) {
  const [incorrectSignal, setIncorrectSignal] = useState<IncorrectSignal | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);

  const stage = session.currentStage;
  const isStageComplete = session.gameState === GameState.STAGE_COMPLETE;
  // TASK 8.2: awaiting the therapist's Start Zone confirmation — balloon taps and session controls are disabled the same way they already are during StageCompleteOverlay.
  const isAwaitingStartZone = session.gameState === GameState.START_ZONE;
  // RELIABILITY FIX: INSTRUCTIONS/COUNTDOWN is a real, if brief, window
  // where the canonical session isn't GameState.PLAYING yet — LiveHeader
  // now labels it distinctly instead of misleadingly saying "قيد اللعب",
  // and pause/restart/skip/balloon-taps must be disabled here too: without
  // this, the SAME controls a moment later mean something real were
  // visibly enabled but silently no-op'd (pauseOrResume/restartStage/
  // skipStage/selectBalloon in useRealtimeControllerSession.ts all
  // correctly gate on GameState.PLAYING and refuse to act, with zero
  // visible feedback — confusing, not broken, but indistinguishable from
  // broken to a therapist tapping "إيقاف مؤقت" and seeing nothing happen).
  // End Session deliberately stays reachable — see the "never trapped"
  // requirement — this only covers the four transient-state actions.
  const isTransitioning = session.gameState === GameState.INSTRUCTIONS || session.gameState === GameState.COUNTDOWN;
  const lastResult = session.results[session.results.length - 1] ?? null;

  useEffect(() => {
    if (!incorrectSignal) return;
    const timer = setTimeout(() => setIncorrectSignal(null), SHAKE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [incorrectSignal]);

  const handleSelect = useCallback(
    (balloonId: string) => {
      const wasCorrect = onSelectBalloon(balloonId);
      if (wasCorrect === false) {
        setIncorrectSignal({ balloonId, token: Date.now() });
      }
    },
    [onSelectBalloon],
  );

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex h-full min-h-0 flex-1 flex-col landscape:flex-row">
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto py-2 landscape:min-w-0">
          <LiveHeader
            childFirstName={session.config.childFirstName}
            stageNumber={stage.stageNumber}
            targetColor={stage.targetColor}
            gameState={session.gameState}
            isPaused={stage.pausedAt !== null}
          />
          <div className="min-h-0 flex-1 px-4 sm:px-6">
            <BalloonMap
              balloons={stage.balloons}
              incorrectSignal={incorrectSignal}
              disabled={isStageComplete || isAwaitingStartZone || isTransitioning || stage.pausedAt !== null || offline}
              offline={offline}
              onSelect={handleSelect}
            />
          </div>
          <LiveProgress
            correctCount={stage.correctCount}
            totalTargets={stage.totalTargets}
            incorrectCount={stage.incorrectCount}
            sessionStartedAt={session.createdAt}
          />
        </div>

        <div className="flex shrink-0 flex-col gap-3 overflow-y-auto border-t border-slate-100 pt-3 landscape:w-72 landscape:border-t-0 landscape:border-s landscape:pt-3">
          <div className="px-4 sm:px-6">
            <StageStrip
              difficulty={session.currentDifficulty}
              currentStageNumber={stage.stageNumber}
              results={session.results}
              disabled={isAwaitingStartZone || offline}
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
          <StageCompleteOverlay
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
      <ConfirmSheet
        open={pendingConfirm === "end"}
        title="إنهاء الجلسة؟"
        description="سيتم إنهاء الجلسة الحالية وعرض الملخص. لا يمكن التراجع عن هذا الإجراء."
        confirmLabel="إنهاء الجلسة"
        destructive
        onConfirm={() => {
          onEndSessionEarly();
          setPendingConfirm(null);
        }}
        onCancel={() => setPendingConfirm(null)}
      />
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Difficulty, FoodSize, GameState, MovementPattern, ReachHeight, ReachSide, type FeedAnimalsSessionState, type StageNumber } from "@/lib/feedanimals";
import {
  useLocalFeedAnimalsControllerSession,
  type FeedAnimalsControllerPhase,
  type FeedAnimalsDifficultyDecision,
  type FeedAnimalsDraftConfig,
} from "@/lib/control/feedanimals/useLocalFeedAnimalsControllerSession";
import { useFeedAnimalsRealtimeControllerSession } from "@/lib/control/feedanimals/useFeedAnimalsRealtimeControllerSession";
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { usePatientContext } from "@/lib/patients/PatientSessionContext";
import { usePatientPrefill } from "@/lib/patients/usePatientPrefill";
import type { EarlyEndSelection } from "@/lib/sessions/workflowMetadata";
import { ConnectionBadge } from "@/components/control/ConnectionBadge";
import { LeaseContestedOverlay } from "@/components/control/LeaseContestedOverlay";
import { FeedAnimalsLiveSessionScreen } from "./live/FeedAnimalsLiveSessionScreen";
import { FeedAnimalsReadyScreen } from "./ready/FeedAnimalsReadyScreen";
import { FeedAnimalsSessionSummaryScreen } from "./summary/FeedAnimalsSessionSummaryScreen";
import { FeedAnimalsSetupScreen } from "./setup/FeedAnimalsSetupScreen";

/**
 * MULTI-GAME PLATFORM — Feed the Animals' own top-level /control component,
 * mirroring every other game's top-level screens (local vs realtime adapter
 * switch, SETUP/READY/LIVE/SUMMARY phase routing) but never importing
 * anything from any other game's UI.
 */
export function FeedAnimalsControlScreen() {
  return isRealtimeEnabled() ? <RealtimeFeedAnimalsControlScreen /> : <LocalFeedAnimalsControlScreen />;
}

function LocalFeedAnimalsControlScreen() {
  const controller = useLocalFeedAnimalsControllerSession();
  usePatientPrefill(controller.phase, controller.draft.childFirstName, controller.setChildName, controller.setDifficulty, controller.setStartingStage);
  return (
    <ControllerShell phase={controller.phase}>
      <ControllerBody controller={controller} />
    </ControllerShell>
  );
}

function RealtimeFeedAnimalsControlScreen() {
  const controller = useFeedAnimalsRealtimeControllerSession();
  usePatientPrefill(controller.phase, controller.draft.childFirstName, controller.setChildName, controller.setDifficulty, controller.setStartingStage);

  if (controller.authPhase !== "authorized") {
    return (
      <ControllerShell phase="SETUP">
        <AuthGate />
      </ControllerShell>
    );
  }

  return (
    <ControllerShell phase={controller.phase}>
      <ConnectionBadge status={controller.connectionStatus} hasLoadedInitialSession={controller.hasLoadedInitialSession} syncRestoredAt={controller.syncRestoredAt} />
      {!controller.isOwner && <LeaseContestedOverlay onTakeOver={controller.claimOwnership} takeoverBlocked={controller.takeoverBlocked} />}
      {controller.hasLoadedInitialSession ? (
        <ControllerBody
          controller={controller}
          displayConnected={controller.displayConnected}
          displayFullscreen={controller.displayFullscreen}
          offline={controller.connectionStatus !== "connected"}
        />
      ) : (
        <LoadingSessionCheck />
      )}
    </ControllerShell>
  );
}

function AuthGate() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-400">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-amber-600" />
      <span className="text-sm font-medium">جاري تجهيز الاتصال...</span>
    </div>
  );
}

function LoadingSessionCheck() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-400">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-amber-600" />
      <span className="text-sm font-medium">جاري التحقق من الجلسة...</span>
    </div>
  );
}

interface ControllerShellProps {
  phase: FeedAnimalsControllerPhase;
  children: React.ReactNode;
}

function ControllerShell({ phase, children }: ControllerShellProps) {
  return (
    <main
      dir="rtl"
      lang="ar"
      data-controller-phase={phase}
      className="fixed inset-0 flex h-dvh w-dvw touch-manipulation flex-col overflow-hidden bg-slate-50 pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] text-slate-900 select-none"
      style={{ fontFamily: "var(--font-control), system-ui, sans-serif" }}
    >
      {children}
    </main>
  );
}

interface ControllerLike {
  therapistName?: string | null;
  phase: FeedAnimalsControllerPhase;
  draft: FeedAnimalsDraftConfig;
  session: FeedAnimalsSessionState | null;
  setChildName: (value: string) => void;
  setDifficulty: (value: Difficulty) => void;
  setStartingStage: (value: StageNumber) => void;
  setFoodSize: (value: FoodSize) => void;
  setReachHeight: (value: ReachHeight) => void;
  setReachSide: (value: ReachSide) => void;
  setMovementPattern: (value: MovementPattern) => void;
  confirmSetup: () => void;
  editSetup: () => void;
  startLiveSession: () => void;
  confirmFoodSelection: (foodChoiceId: string) => void;
  advanceMonkey: (direction: "left" | "right" | "jump") => void;
  pauseOrResume: () => void;
  restartStage: () => void;
  skipStage: () => void;
  endSessionEarly: (selection: EarlyEndSelection) => void;
  advanceStage: (decision: FeedAnimalsDifficultyDecision) => void;
  jumpToStage: (stageNumber: StageNumber) => void;
  changeLiveDifficulty: (difficulty: Difficulty) => void;
  newSession: () => void;
  confirmChildReady: () => void;
  replayCelebration: () => void;
  sessionPatientId?: string | null;
  startAnotherSessionForSamePatient?: () => void;
}

interface ControllerBodyProps {
  controller: ControllerLike;
  displayConnected?: boolean;
  displayFullscreen?: boolean;
  offline?: boolean;
}

function SetupPatientChip() {
  const { selectedPatient, clearPatient } = usePatientContext();
  if (!selectedPatient) return null;
  return (
    <button
      type="button"
      onClick={clearPatient}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100"
    >
      {selectedPatient.firstName}
      <span aria-hidden="true">·</span>
      تغيير المريض
    </button>
  );
}

function ControllerBody({ controller, displayConnected, displayFullscreen, offline }: ControllerBodyProps) {
  const router = useRouter();
  const { selectedPatient } = usePatientContext();
  return (
    <>
      {controller.phase === "SETUP" && (
        <div className="flex flex-1 flex-col overflow-y-auto">
          <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-5 pt-5 sm:px-8">
            <Link href="/control/activities" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-400 transition-colors hover:text-slate-600">
              <span aria-hidden="true">→</span>
              العودة للأنشطة
            </Link>
            <SetupPatientChip />
          </div>
          <FeedAnimalsSetupScreen
            draft={controller.draft}
            patientName={selectedPatient?.firstName ?? null}
            therapistName={controller.therapistName}
            onChildNameChange={controller.setChildName}
            onDifficultyChange={controller.setDifficulty}
            onStartingStageChange={controller.setStartingStage}
            onStart={controller.confirmSetup}
          />
        </div>
      )}

      {controller.phase === "READY" && controller.session && (
        <div className="flex flex-1 flex-col overflow-y-auto">
          <FeedAnimalsReadyScreen
            session={controller.session}
            onStart={controller.startLiveSession}
            onEdit={controller.editSetup}
            onCancel={() => {
              controller.newSession();
              router.push("/control/activities");
            }}
            displayConnected={displayConnected}
            displayFullscreen={displayFullscreen}
          />
        </div>
      )}

      {controller.phase === "LIVE" && controller.session && controller.session.gameState !== GameState.SESSION_COMPLETE && (
        <FeedAnimalsLiveSessionScreen
          session={controller.session}
          onConfirmFoodSelection={controller.confirmFoodSelection}
          onAdvanceMonkey={controller.advanceMonkey}
          onPauseOrResume={controller.pauseOrResume}
          onRestartStage={controller.restartStage}
          onSkipStage={controller.skipStage}
          onEndSessionEarly={controller.endSessionEarly}
          onAdvanceStage={controller.advanceStage}
          onJumpToStage={controller.jumpToStage}
          onDifficultyChange={controller.changeLiveDifficulty}
          onChildReady={controller.confirmChildReady}
          offline={offline}
        />
      )}

      {controller.phase === "SUMMARY" && controller.session?.summary && (
        <div className="flex flex-1 flex-col overflow-y-auto">
          <FeedAnimalsSessionSummaryScreen
            summary={controller.session.summary}
            sessionPatientId={controller.sessionPatientId ?? null}
            workflow={controller.session.workflow}
            therapistName={controller.therapistName}
            onNewSession={controller.newSession}
            onReplayCelebration={controller.replayCelebration}
            onReturnToPatientProfile={() => {
              if (!controller.sessionPatientId) return;
              controller.newSession();
              router.push(`/control/patients/${controller.sessionPatientId}`);
            }}
            onStartAnotherForSamePatient={() => {
              controller.startAnotherSessionForSamePatient?.();
              router.push("/control/activities");
            }}
            onGoToActivities={() => {
              controller.newSession();
              router.push("/control/activities");
            }}
            onGoHome={() => {
              controller.newSession();
              router.push("/control");
            }}
          />
        </div>
      )}
    </>
  );
}

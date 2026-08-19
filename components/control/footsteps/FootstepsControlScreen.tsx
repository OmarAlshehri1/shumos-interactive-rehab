"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Difficulty, GameState, type FootstepsSessionState, PathStyle, PathWidth, type StageNumber, StepLength } from "@/lib/footsteps";
import {
  useLocalFootstepsControllerSession,
  type FootstepsControllerPhase,
  type FootstepsDifficultyDecision,
  type FootstepsDraftConfig,
} from "@/lib/control/footsteps/useLocalFootstepsControllerSession";
import { useFootstepsRealtimeControllerSession } from "@/lib/control/footsteps/useFootstepsRealtimeControllerSession";
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { usePatientContext } from "@/lib/patients/PatientSessionContext";
import { usePatientPrefill } from "@/lib/patients/usePatientPrefill";
import type { EarlyEndSelection } from "@/lib/sessions/workflowMetadata";
import { ConnectionBadge } from "@/components/control/ConnectionBadge";
import { LeaseContestedOverlay } from "@/components/control/LeaseContestedOverlay";
import { FootstepsLiveSessionScreen } from "./live/FootstepsLiveSessionScreen";
import { FootstepsReadyScreen } from "./ready/FootstepsReadyScreen";
import { FootstepsSessionSummaryScreen } from "./summary/FootstepsSessionSummaryScreen";
import { FootstepsSetupScreen } from "./setup/FootstepsSetupScreen";

/**
 * MULTI-GAME PLATFORM — Follow the Footsteps' own top-level /control
 * component, mirroring components/control/ControlScreen.tsx's structure
 * (local vs realtime adapter switch, SETUP/READY/LIVE/SUMMARY phase
 * routing) but never importing anything from Balloon Quest's UI. See
 * lib/patients/usePatientPrefill.ts's doc comment — that hook is already
 * fully generic (childFirstName/difficulty/startingStage only) and is
 * reused here unchanged, not duplicated.
 */
export function FootstepsControlScreen() {
  return isRealtimeEnabled() ? <RealtimeFootstepsControlScreen /> : <LocalFootstepsControlScreen />;
}

function LocalFootstepsControlScreen() {
  const controller = useLocalFootstepsControllerSession();
  usePatientPrefill(controller.phase, controller.draft.childFirstName, controller.setChildName, controller.setDifficulty, controller.setStartingStage);
  return (
    <ControllerShell phase={controller.phase}>
      <ControllerBody controller={controller} />
    </ControllerShell>
  );
}

function RealtimeFootstepsControlScreen() {
  const controller = useFootstepsRealtimeControllerSession();
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
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600" />
      <span className="text-sm font-medium">جاري تجهيز الاتصال...</span>
    </div>
  );
}

function LoadingSessionCheck() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-400">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600" />
      <span className="text-sm font-medium">جاري التحقق من الجلسة...</span>
    </div>
  );
}

interface ControllerShellProps {
  phase: FootstepsControllerPhase;
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
  phase: FootstepsControllerPhase;
  draft: FootstepsDraftConfig;
  session: FootstepsSessionState | null;
  setChildName: (value: string) => void;
  setDifficulty: (value: Difficulty) => void;
  setStartingStage: (value: StageNumber) => void;
  setStepLength: (value: StepLength) => void;
  setPathStyle: (value: PathStyle) => void;
  setPathWidth: (value: PathWidth) => void;
  confirmSetup: () => void;
  editSetup: () => void;
  startLiveSession: () => void;
  confirmCurrentFootstep: () => void;
  pauseOrResume: () => void;
  restartStage: () => void;
  skipStage: () => void;
  endSessionEarly: (selection: EarlyEndSelection) => void;
  advanceStage: (decision: FootstepsDifficultyDecision) => void;
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
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100"
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
          <FootstepsSetupScreen
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
          <FootstepsReadyScreen
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
        <FootstepsLiveSessionScreen
          session={controller.session}
          onConfirmCurrentFootstep={controller.confirmCurrentFootstep}
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
          <FootstepsSessionSummaryScreen
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

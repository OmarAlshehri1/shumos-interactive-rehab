"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { GameState, type Difficulty, type SessionState, type StageNumber } from "@/lib/game";
import {
  useLocalControllerSession,
  type ControllerPhase,
  type DifficultyDecision,
  type DraftConfig,
} from "@/lib/control/useLocalControllerSession";
import { useRealtimeControllerSession } from "@/lib/control/useRealtimeControllerSession";
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { usePatientContext } from "@/lib/patients/PatientSessionContext";
import { usePatientPrefill } from "@/lib/patients/usePatientPrefill";
import { ConnectionBadge } from "./ConnectionBadge";
import { LeaseContestedOverlay } from "./LeaseContestedOverlay";
import { LiveSessionScreen } from "./live/LiveSessionScreen";
import { ReadyScreen } from "./ready/ReadyScreen";
import { SessionSummaryScreen } from "./summary/SessionSummaryScreen";
import { SetupScreen } from "./setup/SetupScreen";

/**
 * TASK 5/6/8: therapist-facing controller root. Routes between the four
 * workflow phases (SETUP / READY / LIVE / SUMMARY) that the active adapter
 * derives from the underlying SessionState — the raw GameState enum is
 * never exposed to the therapist, per spec.
 *
 * TASK 6: picks between the realtime adapter (synced with /display through
 * Firebase) and the Task 5 local adapter, based on the same static,
 * explicit switch DisplayScreen uses (see lib/realtime/firebaseClient.ts's
 * isRealtimeEnabled()). The local adapter is kept only for development/
 * testing /control in isolation — a real clinic deployment always has
 * Firebase configured and uses the realtime adapter.
 *
 * STAFF AUTHENTICATION FOUNDATION: the realtime branch also waits on
 * useRealtimeControllerSession's own staff-auth check before showing the
 * normal controller — see AuthGate below. This is a lightweight, brief
 * fallback only: the real login screen and every real auth state
 * (checking/unauthorized/error) live one level up, in
 * components/control/auth/StaffAuthGate.tsx (wired in at the /control
 * layout level), which already guarantees this component never mounts
 * before an authorized staff session exists.
 */
export function ControlScreen() {
  return isRealtimeEnabled() ? <RealtimeControlScreen /> : <LocalControlScreen />;
}

function LocalControlScreen() {
  const controller = useLocalControllerSession();
  usePatientPrefill(controller.phase, controller.draft.childFirstName, controller.setChildName, controller.setDifficulty, controller.setStartingStage);
  return (
    <ControllerShell phase={controller.phase}>
      <ControllerBody controller={controller} />
    </ControllerShell>
  );
}

function RealtimeControlScreen() {
  const controller = useRealtimeControllerSession();
  usePatientPrefill(controller.phase, controller.draft.childFirstName, controller.setChildName, controller.setDifficulty, controller.setStartingStage);

  // STAFF AUTHENTICATION FOUNDATION: StaffAuthGate (app/control/layout.tsx)
  // already guarantees an authorized staff session exists before this
  // component ever mounts — this is just the brief single-tick fallback
  // for this hook's own useStaffAuth() call to catch up (see
  // useRealtimeControllerSession.ts's authPhase doc comment), never a real
  // login screen (that's StaffLoginScreen.tsx, owned by StaffAuthGate).
  if (controller.authPhase !== "authorized") {
    return (
      <ControllerShell phase="SETUP">
        <AuthGate />
      </ControllerShell>
    );
  }

  return (
    <ControllerShell phase={controller.phase}>
      <ConnectionBadge
        status={controller.connectionStatus}
        hasLoadedInitialSession={controller.hasLoadedInitialSession}
        syncRestoredAt={controller.syncRestoredAt}
      />
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

/**
 * STAFF AUTHENTICATION FOUNDATION: the brief single-tick fallback while
 * this hook's own useStaffAuth() call catches up to what StaffAuthGate
 * already resolved (see RealtimeControlScreen above) — real login/error/
 * unauthorized screens all live in components/control/auth/StaffAuthGate.tsx,
 * one level up, not here.
 */
function AuthGate() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-400">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-teal-600" />
      <span className="text-sm font-medium">جاري تجهيز الاتصال...</span>
    </div>
  );
}

/**
 * Shown for the brief window after auth resolves but before the FIRST
 * Firebase response about the live session arrives — never the empty
 * SETUP form, which would let a fast-acting therapist start typing a new
 * child's name before we know whether a session is already in progress.
 */
function LoadingSessionCheck() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-400">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-teal-600" />
      <span className="text-sm font-medium">جاري التحقق من الجلسة...</span>
    </div>
  );
}

interface ControllerShellProps {
  phase: ControllerPhase;
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

/** The common shape both adapters return that the four phase screens need — see lib/control/useLocalControllerSession.ts and useRealtimeControllerSession.ts. */
interface ControllerLike {
  phase: ControllerPhase;
  draft: DraftConfig;
  session: SessionState | null;
  setChildName: (value: string) => void;
  setDifficulty: (value: Difficulty) => void;
  /** TASK 12: the setup screen's "مرحلة البداية" picker. */
  setStartingStage: (value: StageNumber) => void;
  setTargetSize: (value: DraftConfig["targetSize"]) => void;
  setTargetSpacing: (value: DraftConfig["targetSpacing"]) => void;
  setPlayArea: (value: DraftConfig["playArea"]) => void;
  confirmSetup: () => void;
  editSetup: () => void;
  startLiveSession: () => void;
  selectBalloon: (balloonId: string) => boolean | null;
  pauseOrResume: () => void;
  restartStage: () => void;
  skipStage: () => void;
  endSessionEarly: () => void;
  /** TASK 11: the therapist's post-STAGE_COMPLETE decision — continue, or step to the adjacent easier/harder difficulty. */
  advanceStage: (decision: DifficultyDecision) => void;
  /** TASK 11: the stage strip's forward jump. */
  jumpToStage: (stageNumber: StageNumber) => void;
  newSession: () => void;
  /** TASK 8.2: the therapist's "الطفل جاهز" confirmation — the only way out of GameState.START_ZONE. */
  confirmChildReady: () => void;
  /** TASK 9: "إعادة الاحتفال" — replays the SESSION_COMPLETE celebration on /display. Presentation-only. */
  replayCelebration: () => void;
  /** CONTROL UX POLISH TASK — the CURRENT liveSession's own pinned patientId (null for a walk-in). Only present on the realtime adapter — see useRealtimeControllerSession.ts's sessionPatientId doc comment; absent/undefined on the local dev adapter, which never has a saved-patient branch to begin with. */
  sessionPatientId?: string | null;
  /** CONTROL UX POLISH TASK — "جلسة أخرى لنفس المريض": same reset as newSession(), but preserves the active patient context. Only present on the realtime adapter. */
  startAnotherSessionForSamePatient?: () => void;
}

interface ControllerBodyProps {
  controller: ControllerLike;
  displayConnected?: boolean;
  displayFullscreen?: boolean;
  offline?: boolean;
}

/**
 * PATIENT REGISTRY TASK — "provide a clear تغيير المريض / إلغاء اختيار
 * المريض where appropriate." The setup screen's small equivalent of
 * PatientContextBanner (Game Library) — silent while no patient context is
 * active (ordinary walk-in flow, unchanged). Only clears the patient
 * context itself; the already-filled name field is left alone (still
 * editable) so a therapist who only wants to detach from the saved record
 * — not retype a name that happens to be correct — doesn't lose it.
 */
function SetupPatientChip() {
  const { selectedPatient, clearPatient } = usePatientContext();
  if (!selectedPatient) return null;
  return (
    <button
      type="button"
      onClick={clearPatient}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 transition-colors hover:bg-teal-100"
    >
      {selectedPatient.firstName}
      <span aria-hidden="true">·</span>
      تغيير المريض
    </button>
  );
}

/** Identical between local and realtime modes — only which adapter supplies `controller` differs. */
function ControllerBody({ controller, displayConnected, displayFullscreen, offline }: ControllerBodyProps) {
  const router = useRouter();
  return (
    <>
      {controller.phase === "SETUP" && (
        <div className="flex flex-1 flex-col overflow-y-auto">
          {/*
            TASK — GAME LIBRARY: only shown pre-session (no live session
            record exists yet in this phase — see derivePhase in both
            controller adapters), matching "before a session has started,
            provide a clear العودة للأنشطة action." Once the therapist
            confirms setup, the phase moves to READY/LIVE and this link
            disappears — the existing End Session workflow is the only way
            back out of an active session, unchanged.
          */}
          <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-5 pt-5 sm:px-8">
            <Link
              href="/control/activities"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-400 transition-colors hover:text-slate-600"
            >
              <span aria-hidden="true">→</span>
              العودة للأنشطة
            </Link>
            <SetupPatientChip />
          </div>
          <SetupScreen
            draft={controller.draft}
            onChildNameChange={controller.setChildName}
            onDifficultyChange={controller.setDifficulty}
            onStartingStageChange={controller.setStartingStage}
            onTargetSizeChange={controller.setTargetSize}
            onTargetSpacingChange={controller.setTargetSpacing}
            onPlayAreaChange={controller.setPlayArea}
            onStart={controller.confirmSetup}
          />
        </div>
      )}

      {controller.phase === "READY" && controller.session && (
        <ReadyScreen
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
      )}

      {controller.phase === "LIVE" && controller.session && controller.session.gameState !== GameState.SESSION_COMPLETE && (
        <LiveSessionScreen
          session={controller.session}
          onSelectBalloon={controller.selectBalloon}
          onPauseOrResume={controller.pauseOrResume}
          onRestartStage={controller.restartStage}
          onSkipStage={controller.skipStage}
          onEndSessionEarly={controller.endSessionEarly}
          onAdvanceStage={controller.advanceStage}
          onJumpToStage={controller.jumpToStage}
          onChildReady={controller.confirmChildReady}
          offline={offline}
        />
      )}

      {controller.phase === "SUMMARY" && controller.session?.summary && (
        <div className="flex flex-1 flex-col overflow-y-auto">
          <SessionSummaryScreen
            summary={controller.session.summary}
            sessionPatientId={controller.sessionPatientId ?? null}
            onNewSession={controller.newSession}
            onReplayCelebration={controller.replayCelebration}
            onReturnToPatientProfile={() => {
              // Defensive guard: SessionSummaryScreen only renders this
              // action when sessionPatientId is truthy, but that gate lives
              // in a different file — never navigate to a "null"/"undefined"
              // patient route if this is ever reachable another way.
              if (!controller.sessionPatientId) return;
              // RELIABILITY FIX: this finished session's data is already
              // durably saved (see the exactly-once history effect) by the
              // time SUMMARY renders — clearing the live session here is
              // always safe. Without it, `/liveSession` stayed pinned to
              // this already-ended session indefinitely: /display kept
              // showing its SESSION_COMPLETE celebration forever instead of
              // returning to the waiting world, and the NEXT therapist to
              // open Balloon Quest for ANY patient (including a different
              // one) landed on THIS stale summary instead of a fresh Setup
              // screen — a real "start a session for the wrong patient" risk
              // if they mistook it for the new patient's session and tapped
              // "جلسة أخرى لنفس المريض". newSession() also resets the draft
              // and patient context, matching every other "leave a finished
              // summary" action below.
              controller.newSession();
              router.push(`/control/patients/${controller.sessionPatientId}`);
            }}
            onStartAnotherForSamePatient={() => {
              controller.startAnotherSessionForSamePatient?.();
              router.push("/control/activities");
            }}
            onGoToActivities={() => {
              controller.newSession(); // RELIABILITY FIX — see onReturnToPatientProfile's doc comment; applies identically to the walk-in "الأنشطة" secondary action.
              router.push("/control/activities");
            }}
            onGoHome={() => {
              controller.newSession(); // RELIABILITY FIX — see onReturnToPatientProfile's doc comment; applies identically to "الرئيسية" on both the saved-patient and walk-in branches.
              router.push("/control");
            }}
          />
        </div>
      )}
    </>
  );
}

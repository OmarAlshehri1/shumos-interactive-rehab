"use client";

import { GameState, type Difficulty, type SessionState, type StageNumber } from "@/lib/game";
import {
  useLocalControllerSession,
  type ControllerPhase,
  type DifficultyDecision,
  type DraftConfig,
} from "@/lib/control/useLocalControllerSession";
import { useRealtimeControllerSession } from "@/lib/control/useRealtimeControllerSession";
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
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
 * TASK 8: the realtime branch now also waits on Firebase Authentication
 * (silent, anonymous — no login UI ever appears) before showing the normal
 * controller. See AuthGate below and the report's "Auth bootstrap
 * behavior" section.
 */
export function ControlScreen() {
  return isRealtimeEnabled() ? <RealtimeControlScreen /> : <LocalControlScreen />;
}

function LocalControlScreen() {
  const controller = useLocalControllerSession();
  return (
    <ControllerShell phase={controller.phase}>
      <ControllerBody controller={controller} />
    </ControllerShell>
  );
}

function RealtimeControlScreen() {
  const controller = useRealtimeControllerSession();

  if (controller.authStatus !== "authenticated") {
    return (
      <ControllerShell phase="SETUP">
        <AuthGate status={controller.authStatus} />
      </ControllerShell>
    );
  }

  return (
    <ControllerShell phase={controller.phase}>
      <ConnectionBadge status={controller.connectionStatus} hasLoadedInitialSession={controller.hasLoadedInitialSession} />
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
 * TASK 8: the auth-resolution screen — appears only for the brief
 * "initializing" window on first load (no user-visible login step, just a
 * moment of silent bootstrap), or, if Firebase Auth genuinely can't be
 * reached, a clear operational error. Never pretends the controller is
 * connected when it isn't — see the report's "Auth states" section.
 */
function AuthGate({ status }: { status: "initializing" | "failed" }) {
  if (status === "failed") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
        <span className="text-3xl" aria-hidden="true">
          ⚠️
        </span>
        <h2 className="text-lg font-bold text-slate-800">تعذّر الاتصال بالنظام</h2>
        <p className="max-w-xs text-sm leading-relaxed text-slate-500">
          لم نتمكن من تجهيز الاتصال الآمن بالخادم. تحقق من الاتصال بالإنترنت ثم أعد تحميل الصفحة.
        </p>
      </div>
    );
  }

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
}

interface ControllerBodyProps {
  controller: ControllerLike;
  displayConnected?: boolean;
  displayFullscreen?: boolean;
  offline?: boolean;
}

/** Identical between local and realtime modes — only which adapter supplies `controller` differs. */
function ControllerBody({ controller, displayConnected, displayFullscreen, offline }: ControllerBodyProps) {
  return (
    <>
      {controller.phase === "SETUP" && (
        <div className="flex flex-1 flex-col overflow-y-auto">
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
            onNewSession={controller.newSession}
            onReplayCelebration={controller.replayCelebration}
          />
        </div>
      )}
    </>
  );
}

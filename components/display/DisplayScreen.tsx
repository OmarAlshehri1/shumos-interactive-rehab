"use client";

import { useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { GameState, type SessionState } from "@/lib/game";
import { useLocalDemoSession } from "@/lib/demo/useLocalDemoSession";
import { useRealtimeDisplaySession } from "@/lib/display/useRealtimeDisplaySession";
import { useFullscreen } from "@/lib/display/useFullscreen";
import { useAudioManager } from "@/lib/audio/useAudioManager";
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { reportDisplayFullscreen } from "@/lib/realtime/sessionRepository";
import type { DisplayEventListener } from "./events";
import { DevBadge } from "./DevBadge";
import { MuteToggle } from "./MuteToggle";
import { Environment } from "./environment/Environment";
import { PlayStage } from "./PlayStage";
import { CountdownScene } from "./scenes/CountdownScene";
import { InstructionsScene } from "./scenes/InstructionsScene";
import { PlayingScene } from "./scenes/PlayingScene";
import { SessionCompleteScene } from "./scenes/SessionCompleteScene";
import { StageCompleteScene } from "./scenes/StageCompleteScene";
import { StartZoneScene } from "./scenes/StartZoneScene";
import { WaitingScene } from "./scenes/WaitingScene";
import { WelcomeScene } from "./scenes/WelcomeScene";

/**
 * TASK 6: picks between the realtime experience (driven by /control through
 * Firebase) and the Task 3 local demo, based on the SAME static, explicit
 * switch used by /control (see lib/realtime/firebaseClient.ts's
 * isRealtimeEnabled() — computed once from which NEXT_PUBLIC_FIREBASE_* env
 * vars are present, never from whether a connection attempt currently
 * succeeds). A configured-but-temporarily-offline deployment must show a
 * disconnected state, not silently fall back to a single-device local
 * session — see the report.
 *
 * Both branches render the exact same SceneSwitch — the approved Task 3/4
 * scenes never needed to change to support Firebase; only who supplies the
 * SessionState, and which callbacks are real vs. no-ops, changed.
 */
export function DisplayScreen() {
  return isRealtimeEnabled() ? <RealtimeDisplayScreen /> : <LocalDisplayScreen />;
}

function LocalDisplayScreen() {
  const { session, selectBalloon, advance, enterPlaying, advanceAfterStageComplete } = useLocalDemoSession();
  const audio = useAudioManager();
  const fullscreen = useFullscreen();

  // TASK 8.1: the session (and therefore all 3 stage colors) is known
  // synchronously at mount here — see lib/demo/useLocalDemoSession.ts.
  // Fire the prefetch warm-up exactly once; prefetchForSession itself is
  // safe to call before unlock() (it only warms the server/client cache via
  // fetch, no autoplay policy applies to that).
  const prefetchedRef = useRef(false);
  useEffect(() => {
    if (prefetchedRef.current) return;
    prefetchedRef.current = true;
    audio.prefetchForSession(session.config.childFirstName);
    // Runs once on mount for this fixed demo session; audio/session identity isn't a meaningful dependency here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The "ابدأ التجربة" button is both the audio-unlock gesture (must run
  // synchronously inside this click handler, per browser autoplay policy)
  // and the WELCOME -> INSTRUCTIONS advance — one deliberate interaction.
  // TASK 9 PART 4: also the fullscreen request — same real user gesture,
  // browsers require both to originate from one.
  const handleStart = useCallback(() => {
    audio.unlock();
    fullscreen.requestFullscreen();
    advance();
  }, [audio, fullscreen, advance]);

  return (
    <DisplayShell muted={audio.muted} onToggleMute={audio.toggleMute} gameState={session.gameState}>
      <SceneSwitch
        session={session}
        onEvent={audio.handleEvent}
        onWelcomeStart={handleStart}
        onCountdownComplete={enterPlaying}
        onSelectBalloon={selectBalloon}
        onStageCompleteDone={advanceAfterStageComplete}
        externalIncorrectSignal={null}
        speakCountdownTick={audio.speakCountdownTick}
        celebrationReplayToken={null}
      />
    </DisplayShell>
  );
}

function RealtimeDisplayScreen() {
  const realtime = useRealtimeDisplaySession();
  const audio = useAudioManager();
  const fullscreen = useFullscreen();

  // See WaitingScene's doc comment: this is the projector's one-time
  // audio-unlock gesture. It never touches Firebase — the therapist's own
  // device is what actually starts a session. TASK 9 PART 4: also where
  // fullscreen is requested — "بدء العرض" is the one real user gesture this
  // tab ever gets before the therapist starts driving everything remotely.
  const handleWaitingTap = useCallback(() => {
    audio.unlock();
    fullscreen.requestFullscreen();
  }, [audio, fullscreen]);

  // TASK 9 PART 4: best-effort status report so /control can show whether
  // the projector is actually in fullscreen (see ReadyScreen). Never
  // touches game state; failures are swallowed by reportDisplayFullscreen's
  // caller contract (informational only).
  useEffect(() => {
    if (realtime.authStatus !== "authenticated") return;
    void reportDisplayFullscreen(fullscreen.isFullscreen).catch(() => {});
  }, [fullscreen.isFullscreen, realtime.authStatus]);

  // TASK 8.1: /control publishes the full session (all 3 stage colors
  // already generated) the moment a new one is created — prefetch the
  // instant it first appears here, once per sessionId, rather than never
  // (the old code defined prefetchForSession but no caller ever invoked it
  // — see the Task 8.1 report). Guarded by sessionId so re-renders from
  // every later Firebase snapshot of the SAME session don't re-trigger it.
  const prefetchedSessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    const session = realtime.session;
    if (!session || prefetchedSessionIdRef.current === session.sessionId) return;
    prefetchedSessionIdRef.current = session.sessionId;
    audio.prefetchForSession(session.config.childFirstName);
    // audio's identity isn't a meaningful dependency here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realtime.session]);

  return (
    <DisplayShell
      muted={audio.muted}
      onToggleMute={audio.toggleMute}
      gameState={realtime.session?.gameState ?? null}
    >
      {realtime.session ? (
        <SceneSwitch
          session={realtime.session}
          onEvent={audio.handleEvent}
          onWelcomeStart={() => {}}
          onCountdownComplete={() => {}}
          onSelectBalloon={() => {}}
          onStageCompleteDone={() => {}}
          externalIncorrectSignal={realtime.incorrectSignal}
          speakCountdownTick={audio.speakCountdownTick}
          celebrationReplayToken={realtime.celebrationReplayToken}
        />
      ) : (
        <WaitingScene onTap={handleWaitingTap} isFullscreenSupported={fullscreen.isSupported} />
      )}
    </DisplayShell>
  );
}

interface DisplayShellProps {
  muted: boolean;
  onToggleMute: () => void;
  gameState: GameState | null;
  children: React.ReactNode;
}

function DisplayShell({ muted, onToggleMute, gameState, children }: DisplayShellProps) {
  return (
    <MotionConfig reducedMotion="user">
      <main
        dir="rtl"
        lang="ar"
        data-game-state={gameState ?? "WAITING"}
        className="fixed inset-0 h-dvh w-dvw overflow-hidden"
        style={{ fontFamily: "var(--font-balloon-quest), system-ui, sans-serif" }}
      >
        {/* TASK 9 PART 4: Environment fills the true viewport (not the letterboxed stage) so a non-16:9 window never shows a black bar — see Environment.tsx and PlayStage.tsx. */}
        <Environment />
        <PlayStage>{children}</PlayStage>
        {/* Mute/dev affordances stay at the true screen corner regardless of letterboxing, so they're always reachable. */}
        <MuteToggle muted={muted} onToggle={onToggleMute} />
        {gameState && <DevBadge gameState={gameState} />}
      </main>
    </MotionConfig>
  );
}

interface SceneSwitchProps {
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

/** The approved Task 3/4 gameState -> scene mapping, unchanged since Task 3 — only ever driven by whichever SessionState its caller supplies. */
function SceneSwitch({
  session,
  onEvent,
  onWelcomeStart,
  onCountdownComplete,
  onSelectBalloon,
  onStageCompleteDone,
  externalIncorrectSignal,
  speakCountdownTick,
  celebrationReplayToken,
}: SceneSwitchProps) {
  const stage = session.currentStage;

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
          <StartZoneScene stageNumber={stage.stageNumber} onEvent={onEvent} />
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

      {session.gameState === GameState.PLAYING && (
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
          />
        </motion.div>
      )}

      {session.gameState === GameState.STAGE_COMPLETE && (
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

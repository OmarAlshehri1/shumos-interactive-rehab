"use client";

import { useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { GameState } from "@/lib/game";
import { useLocalDemoSession } from "@/lib/demo/useLocalDemoSession";
import { useRealtimeDisplaySession } from "@/lib/display/useRealtimeDisplaySession";
import { useFullscreen } from "@/lib/display/useFullscreen";
import { useAudioManager } from "@/lib/audio/useAudioManager";
import { getDisplayDb, isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { reportCountdownComplete, reportDisplayFullscreen } from "@/lib/realtime/sessionRepository";
import { DevBadge } from "./DevBadge";
import { MuteToggle } from "./MuteToggle";
import { Environment } from "./environment/Environment";
import { PlayStage } from "./PlayStage";
import { BalloonQuestDisplay } from "./games/BalloonQuestDisplay";
import { GAME_DISPLAY_MODULES } from "./gameDisplayRegistry";
import { ShumosWaitingWorld } from "./waiting/ShumosWaitingWorld";

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
 * MULTI-GAME PLATFORM: the local demo (no Firebase, no waiting world, no
 * gameId — see LocalDisplayScreen below) always renders Balloon Quest
 * directly, exactly as before; only the realtime branch resolves a game
 * through the platform shell (DisplayShell) + the display game resolver
 * (gameDisplayRegistry.tsx). Both branches render the SAME
 * BalloonQuestDisplay module underneath — the approved Task 3/4 scenes
 * never needed to change; only who supplies the SessionState, which
 * callbacks are real vs. no-ops, and (in realtime mode) whether a game is
 * even resolved yet, changed.
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
      <BalloonQuestDisplay
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

  // See ShumosWaitingWorld's doc comment: this is the projector's one-time
  // audio-unlock gesture. It never touches Firebase — the therapist's own
  // device is what actually starts a session. TASK 9 PART 4: also where
  // fullscreen is requested — "بدء العرض" is the one real user gesture this
  // tab ever gets before the therapist starts driving everything remotely.
  //
  // MULTI-GAME PLATFORM: also starts the calm birds/breeze ambience (see
  // lib/audio/ambience.ts) right away, so the waiting world isn't silent —
  // per the task's "Mariam must remain SILENT while waiting," this fires
  // "ambience_start" specifically, never "welcome" (which is what actually
  // triggers speech — see AudioManager.ts's dispatch). unlock() runs first,
  // synchronously, so by the time this event reaches AudioManager it's
  // already unlocked and plays immediately rather than needing to be
  // buffered. Safe to fire on every tap: startAmbienceIfNeeded() is a no-op
  // once ambience is already running, and it then simply continues,
  // unchanged, straight through into Balloon Quest — no restart, no gap.
  const handleWaitingTap = useCallback(() => {
    audio.unlock();
    audio.handleEvent({ type: "ambience_start", timestamp: Date.now() });
    fullscreen.requestFullscreen();
  }, [audio, fullscreen]);

  // TASK 9 PART 4: best-effort status report so /control can show whether
  // the projector is actually in fullscreen (see ReadyScreen). Never
  // touches game state; failures are swallowed by reportDisplayFullscreen's
  // caller contract (informational only).
  useEffect(() => {
    if (realtime.authStatus !== "authenticated") return;
    void reportDisplayFullscreen(getDisplayDb(), fullscreen.isFullscreen).catch(() => {});
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

  // DISPLAY GAME RESOLVER: a game is only "resolved" once BOTH a session
  // exists AND its gameId maps to a registered display module (see
  // gameDisplayRegistry.tsx) — a session whose gameId is missing/
  // unsupported/malformed (LiveSessionRecord.gameId is null in every one of
  // those cases, see sessionRepository.ts's normalizeGameId) resolves to
  // nothing, same as no session at all: fail safely to the waiting world,
  // never guess it must be Balloon Quest.
  const session = realtime.session;
  const activeGame = session && realtime.gameId ? { Component: GAME_DISPLAY_MODULES[realtime.gameId], session } : null;

  // BUG FIX — "ابدأ" stall: identifies exactly which (sessionId, revision)
  // is on screen right now, kept in a ref (not read directly in the
  // callback below) specifically so handleCountdownComplete's own identity
  // never changes across renders — CountdownScene's pacing effect depends
  // on its onComplete prop's identity, and churning it on every unrelated
  // realtime update would risk restarting an in-flight tick's timer for no
  // reason. See useRealtimeControllerSession.ts's runInstructionsToPlaying
  // for the controller side of this handshake.
  const activeRecordRef = useRef<{ sessionId: string; revision: number } | null>(null);
  useEffect(() => {
    activeRecordRef.current = session && realtime.revision != null ? { sessionId: session.sessionId, revision: realtime.revision } : null;
  }, [session, realtime.revision]);

  const handleCountdownComplete = useCallback(() => {
    const current = activeRecordRef.current;
    if (!current) return;
    void reportCountdownComplete(getDisplayDb(), current.sessionId, current.revision).catch(() => {});
  }, []);

  return (
    <DisplayShell
      muted={audio.muted}
      onToggleMute={audio.toggleMute}
      gameState={realtime.session?.gameState ?? null}
    >
      {/*
        PLATFORM <-> GAME TRANSITION: a short (~1.1s) crossfade, not a hard
        cut, in both directions — entering Balloon Quest (waiting world
        fades out while WelcomeScene's own "مغامرة البالونات" intro fades
        in underneath it, per the approved flow) and returning to the
        waiting world once the canonical session is cleared (ended/reset ->
        back to the Game Library). AnimatePresence's default (sync) mode
        overlaps the two rather than sequencing them, which is what makes
        this read as one continuous world rather than two separate screens.
      */}
      <AnimatePresence>
        {activeGame ? (
          <motion.div
            key="game"
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.1, ease: "easeInOut" }}
          >
            <activeGame.Component
              session={activeGame.session}
              onEvent={audio.handleEvent}
              onWelcomeStart={() => {}}
              onCountdownComplete={handleCountdownComplete}
              onSelectBalloon={() => {}}
              onStageCompleteDone={() => {}}
              externalIncorrectSignal={realtime.incorrectSignal}
              speakCountdownTick={audio.speakCountdownTick}
              celebrationReplayToken={realtime.celebrationReplayToken}
            />
          </motion.div>
        ) : (
          <motion.div
            key="waiting"
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.06 }}
            transition={{ duration: 1.1, ease: "easeInOut" }}
          >
            <ShumosWaitingWorld onTap={handleWaitingTap} isFullscreenSupported={fullscreen.isSupported} />
          </motion.div>
        )}
      </AnimatePresence>
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

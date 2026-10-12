"use client";
import { ProjectionGrid } from "./ProjectionGrid";
import type { ProjectionPreviewCommand } from "@/lib/projection/calibration";
import { subscribeToProjectionPreview } from "@/lib/realtime/sessionRepository";
import { visitGamePaused } from "@/lib/therapyVisits/gameSafety";
import {decode as decodeBridgeLive} from '@/lib/balancebridge3d/live';
import { SharedGameIntroduction } from "./SharedGameIntroduction";
import { isDomeLive } from "@/lib/bubblepopwall3d/live";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { Difficulty, GameState } from "@/lib/game";
import { useLocalDemoSession } from "@/lib/demo/useLocalDemoSession";
import { useRealtimeDisplaySession } from "@/lib/display/useRealtimeDisplaySession";
import { useFullscreen } from "@/lib/display/useFullscreen";
import { useAudioManager } from "@/lib/audio/useAudioManager";
import { getDisplayDb, isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { BALLOON_QUEST_GAME_ID, getGameById } from "@/lib/games/registry";
import {
  reportCountdownComplete,
  reportDisplayAudioStatus,
  reportDisplayFullscreen,
  subscribeToDisplayAudioEnableCommand,
} from "@/lib/realtime/sessionRepository";
import { SensorPointerLayer } from "./SensorPointerLayer";
import { LocalGameFeedbackProvider } from "./LocalGameFeedbackProvider";
import { DevBadge } from "./DevBadge";
import { MuteToggle } from "./MuteToggle";
import { Environment } from "./environment/Environment";
import { CosmicEnvironment } from "./footsteps/environment/CosmicEnvironment";
import { UnderwaterEnvironment } from "./bubblepop/environment/UnderwaterEnvironment";
import { SpaceEnvironment } from "./spacepilot/environment/SpaceEnvironment";
import { ColorChaseEnvironment } from "./colorchase/ColorChaseEnvironment";
import { PlayStage } from "./PlayStage";
import { BalloonQuestDisplay } from "./games/BalloonQuestDisplay";
import { GAME_DISPLAY_MODULES } from "./gameDisplayRegistry";
import { ShumosWaitingWorld } from "./waiting/ShumosWaitingWorld";
import { isBq3Session } from "@/lib/balloonquest/live";
import { isSpacePilotLive } from "@/lib/spacepilot3d/cloudState";
import { isFp3Live } from "@/lib/footsteps3d/live";
import { isCc3Live } from "@/lib/colorchase3d/live";
import { LEGACY_BALLOON_QUEST } from "@/lib/balloonquest/rollback";
import { BalloonQuest3DDisplay } from "./balloonquest3d/game/BalloonQuest3DDisplay";
import { Bq3SkyBackground } from "./balloonquest3d/game/Bq3SkyBackground";

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
  if (isRealtimeEnabled()) return <RealtimeDisplayScreen />;
  // Local mode (no Firebase): the redesigned game talks to /control through the local BroadcastChannel; the original local demo stays available via the rollback flag.
  return LEGACY_BALLOON_QUEST ? <LocalDisplayScreen /> : <LocalBalloonQuest3DDisplayScreen />;
}

function LocalBalloonQuest3DDisplayScreen() {
  const audio = useAudioManager();
  return (
    <DisplayShell muted={audio.muted} onToggleMute={audio.toggleMute} gameState={null} background={<Bq3SkyBackground />}>
      <BalloonQuest3DDisplay embedded />
    </DisplayShell>
  );
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
    // The local demo always renders Balloon Quest directly (see this file's own doc comment) — never another game, so this is never a guess.
    audio.prefetchForSession(session.config.childFirstName, BALLOON_QUEST_GAME_ID);
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
  const [projectionPreview, setProjectionPreview] = useState<ProjectionPreviewCommand | null>(null);
  const [previewTime, setPreviewTime] = useState(() => Date.now());
  useEffect(() => {
    if (realtime.authStatus !== "authenticated") return;
    return subscribeToProjectionPreview(getDisplayDb(), setProjectionPreview);
  }, [realtime.authStatus]);
  useEffect(() => {
    if (!projectionPreview?.enabled) return;
    const timer = setInterval(() => setPreviewTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [projectionPreview]);
  const audio = useAudioManager();
  const setActiveAudioGame = audio.setActiveGame;
  const attemptRemoteAudioEnable = audio.attemptRemoteEnable;
  const processingAudioCommandRef = useRef(false);
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
  // RELIABILITY / VOICE COVERAGE: the waiting world's own visible Arabic
  // message ("بانتظار اختيار النشاط من الأخصائي") must be spoken once, per
  // the product rule that the child never needs to read to understand the
  // screen — but never re-spoken on a later tap (e.g. a second tap because
  // fullscreen didn't engage), since this screen can stay mounted/tapped
  // indefinitely and repeated speech here would be exactly the annoying loop
  // the spec forbids.
  const hasGreetedWaitingWorldRef = useRef(false);
  const handleWaitingTap = useCallback(() => {
    audio.unlock();
    audio.handleEvent({ type: "ambience_start", timestamp: Date.now() });
    if (!hasGreetedWaitingWorldRef.current) {
      hasGreetedWaitingWorldRef.current = true;
      audio.handleEvent({ type: "waiting_world_greeting", timestamp: Date.now() });
    }
    fullscreen.requestFullscreen();
  }, [audio, fullscreen]);

  // TASK 9 PART 4: best-effort status report so /control can show whether
  // the projector is actually in fullscreen (see ReadyScreen). Never
  // touches game state; failures are swallowed by reportDisplayFullscreen's
  // caller contract (informational only).
  useEffect(() => {
    if (realtime.authStatus !== "authenticated") return;
    if (processingAudioCommandRef.current) return;
    void reportDisplayFullscreen(getDisplayDb(), fullscreen.isFullscreen).catch(() => {});
  }, [fullscreen.isFullscreen, realtime.authStatus]);

  // Display-authored truth for /control. A refresh creates a new manager in
  // the not-ready state; a manual display tap, mute change, or reconnect
  // publishes the current state again. The control never infers readiness
  // merely because its command write succeeded.
  useEffect(() => {
    if (realtime.authStatus !== "authenticated") return;
    void reportDisplayAudioStatus(getDisplayDb(), {
      state: audio.readiness.ready ? "ready" : "not-ready",
      commandId: null,
      contextState: audio.readiness.contextState,
    }).catch(() => {});
  }, [audio.readiness.contextState, audio.readiness.ready, realtime.authStatus, realtime.connectionStatus]);

  // Refresh the Display's own observed audio state; heartbeat flags cannot unlock audio.
  useEffect(() => {
    if (realtime.authStatus !== "authenticated" || realtime.connectionStatus !== "connected") return;
    const timer = setInterval(() => {
      if (processingAudioCommandRef.current) return;
      void reportDisplayAudioStatus(getDisplayDb(), {
        state: audio.readiness.ready ? "ready" : "not-ready",
        commandId: null,
        contextState: audio.readiness.contextState,
      }).catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
  }, [audio.readiness.contextState, audio.readiness.ready, realtime.authStatus, realtime.connectionStatus]);

  const processedAudioCommandRef = useRef<string | null>(null);
  useEffect(() => {
    if (realtime.authStatus !== "authenticated") return;
    let disposed = false;
    const db = getDisplayDb();
    const unsubscribe = subscribeToDisplayAudioEnableCommand(db, (command) => {
      if (!command || command.id === processedAudioCommandRef.current) return;
      processedAudioCommandRef.current = command.id;
      processingAudioCommandRef.current = true;
      void (async () => {
        await reportDisplayAudioStatus(db, {
          state: "attempting",
          commandId: command.id,
          contextState: "checking",
        }).catch(() => {});
        const result = await attemptRemoteAudioEnable();
        if (disposed) {
          processingAudioCommandRef.current = false;
          return;
        }
        await reportDisplayAudioStatus(db, {
          state: result.ready ? "ready" : "blocked",
          commandId: command.id,
          contextState: result.contextState,
        }).catch(() => {});
        processingAudioCommandRef.current = false;
      })();
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [attemptRemoteAudioEnable, realtime.authStatus]);

  // TASK 8.1: /control publishes the full session the moment a new one is
  // created — prefetch the instant it first appears here, once per
  // sessionId, rather than never (the old code defined prefetchForSession
  // but no caller ever invoked it — see the Task 8.1 report). Guarded by
  // sessionId so re-renders from every later Firebase snapshot of the SAME
  // session don't re-trigger it. Waits for `gameId` to be resolved (never
  // guesses — see LiveSessionRecord.gameId's doc comment) so an
  // unsupported/malformed record's session never gets prefetched under the
  // wrong game's line set.
  //
  // COST INCIDENT — see AudioManager.prefetchForSession's doc comment:
  // this now passes `realtime.gameId` through so ONLY the active game's own
  // lines are warmed, never all five registered games' full libraries.
  const prefetchedSessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    const session = realtime.session;
    if (!session || !realtime.gameId || prefetchedSessionIdRef.current === session.sessionId) return;
    // The redesigned Balloon Quest has no voice lines: do not warm the legacy line set (paid TTS) for it.
    if (isBq3Session(session)) return;
    // Space Pilot 3D has no voice lines either: never warm the original Space Pilot's paid line set for it.
    if (isSpacePilotLive(session)) return;
    // The Enchanted Forest has no voice lines: never warm the original Follow the Footsteps' paid line set for it.
    if (isFp3Live(session) || isCc3Live(session)) return;
    if (isDomeLive(session)) return;
    prefetchedSessionIdRef.current = session.sessionId;
    audio.prefetchForSession(session.config.childFirstName, realtime.gameId);
    // audio's identity isn't a meaningful dependency here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realtime.session, realtime.gameId]);

  // DISPLAY GAME RESOLVER: a game is only "resolved" once BOTH a session
  // exists AND its gameId maps to a registered display module (see
  // gameDisplayRegistry.tsx) — a session whose gameId is missing/
  // unsupported/malformed (LiveSessionRecord.gameId is null in every one of
  // those cases, see sessionRepository.ts's normalizeGameId) resolves to
  // nothing, same as no session at all: fail safely to the waiting world,
  // never guess it must be Balloon Quest.
  const session = realtime.session;
  const activeGame = session && realtime.gameId ? { Component: GAME_DISPLAY_MODULES[realtime.gameId], session } : null;
  // Space Pilot 3D is silent by design (no ambience, no voice): it uses the same silent audio profile as the other 3D games.
  const activeAudioGameId = session && realtime.gameId ? (isSpacePilotLive(session) || isFp3Live(session) || isCc3Live(session) || isDomeLive(session) ? "build-quest-3d" : realtime.gameId) : null;

  // DISPLAY REQUIREMENT: the child only ever sees the mirrored hand while a
  // sensor-compatible game (lib/games/registry.ts's `sensorCompatible`) is
  // actually PLAYING — never during WELCOME/INSTRUCTIONS/COUNTDOWN/
  // STAGE_COMPLETE/SESSION_COMPLETE, and never for a game with no discrete
  // contact action (Space Pilot). Mirrors exactly what gates contact
  // detection on /control's own live maps (see SensorHandLayer callers).
  // The pointer's OWN visibility is checked separately, inside
  // SensorPointerLayer (see its own doc comment for why that state lives
  // there and not here) — this only ever expresses the game/session-level
  // gate, never "where is the hand right now."
  const sensorHandGateVisible = !!(
    activeGame &&
    realtime.gameId &&
    getGameById(realtime.gameId)?.sensorCompatible &&
    !isDomeLive(activeGame.session) &&
    activeGame.session.gameState === GameState.PLAYING
  );

  // Welcome events normally start ambience, but they do not mount when a
  // refreshed display reconnects directly into START_ZONE, COUNTDOWN,
  // PLAYING, or a completion scene. Synchronizing from the canonical game
  // id closes that refresh hole and also stops the previous game's world on
  // game switches. null selects the shared waiting-world garden ambience.
  useEffect(() => {
    if (!realtime.hasLoadedInitialSession) return;
    setActiveAudioGame(activeAudioGameId);
  }, [activeAudioGameId, realtime.hasLoadedInitialSession, setActiveAudioGame]);

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

  // MULTI-GAME PLATFORM — DISPLAY BACKGROUND RESOLVER: the persistent
  // world behind the letterboxed PlayStage must match whichever game is
  // actually active (task section 44's "must NOT reuse Balloon Quest's
  // garden as its primary environment") — never the same Environment for
  // every game. Falls back to Balloon Quest's own Environment for the
  // waiting world / local-demo / any other/no game, matching this file's
  // pre-existing behavior exactly for every case except a genuinely active
  // Follow the Footsteps session. Stage-number variation (task section 47)
  // comes straight from the canonical currentStage — never randomized.
  // MULTI-GAME PLATFORM: `activeGame.session`'s type isn't narrowed by the
  // separate `realtime.gameId` check above (same "boundary bridged with an
  // explicit cast" story as gameDisplayRegistry.tsx's own GAME_DISPLAY_MODULES
  // doc comment) — Space Pilot's SpacePilotStageRuntime has no `stageNumber`
  // at all (single fixed level, see lib/spacepilot/session.ts's doc
  // comment), so accessing it generically across the full session union no
  // longer type-checks now that a 5th game exists. Each branch below casts
  // `currentStage` to just the one field it actually needs, sound because
  // the branch condition already guarantees which concrete game this is.
  const bridgeState=activeGame&&realtime.gameId==='balance-bridge-3d'?decodeBridgeLive(activeGame.session):null;
  const environmentBackground =
    bridgeState ? <div style={{position:'fixed',inset:0,background:'#18392f'}} /> :
    activeGame && realtime.gameId === "follow-the-footsteps" && isFp3Live(activeGame.session) ? (
      <div style={{ position: "fixed", inset: 0, background: "#0b1a12" }} />
    ) : activeGame && realtime.gameId === "follow-the-footsteps" ? (
      <CosmicEnvironment stageNumber={(activeGame.session.currentStage as { stageNumber: 1 | 2 | 3 | 4 | 5 }).stageNumber} />
    ) : activeGame && isDomeLive(activeGame.session) ? (
      <div style={{ position: "fixed", inset: 0, background: "#dde8ed" }} />
    ) : activeGame && realtime.gameId === "bubble-pop-wall" ? (
      <UnderwaterEnvironment
        stageNumber={(activeGame.session.currentStage as { stageNumber: 1 | 2 | 3 | 4 | 5 }).stageNumber}
        difficulty={activeGame.session.currentDifficulty as Difficulty}
      />
    ) : activeGame && realtime.gameId === "space-pilot" ? (
      <SpaceEnvironment />
    ) : activeGame && realtime.gameId === "color-chase" && isCc3Live(activeGame.session) ? (
      <div style={{ position: "fixed", inset: 0, background: "#26402a" }} />
    ) : activeGame && realtime.gameId === "color-chase" ? (
      <ColorChaseEnvironment />
    ) : activeGame && isBq3Session(activeGame.session) ? (
      <Bq3SkyBackground />
    ) : (
      <Environment />
    );

  return (
    <DisplayShell
      muted={audio.muted}
      onToggleMute={audio.toggleMute}
      gameState={realtime.session?.gameState ?? null}
      background={environmentBackground}
    >
      {projectionPreview?.enabled && projectionPreview.expiresAt > previewTime && visitGamePaused(realtime.session ? { session: realtime.session } as Parameters<typeof visitGamePaused>[0] : null) && (
        <div data-testid="projection-display-preview" style={{ position: "fixed", inset: 0, zIndex: 100, display: "grid", placeItems: "center", background: "#102b3b" }}>
          <ProjectionGrid profile={projectionPreview.profile} />
        </div>
      )}
      {/*
        PLATFORM <-> GAME TRANSITION: a short (~1.1s) crossfade, not a hard
        cut, in both directions — entering Balloon Quest (waiting world
        fades out while WelcomeScene's own "مغامرة البالونات" intro fades
        in underneath it, per the approved flow) and returning to the
        waiting world once the canonical session is cleared (ended/reset ->
        back to the Game Library). AnimatePresence's default (sync) mode
        overlaps the two rather than sequencing them, which is what makes
        this read as one continuous world rather than two separate screens.

        RELIABILITY FIX — idle-overlay bleed-through: `activeGame` reads as
        false for an instant on every fresh mount (before the first RTDB
        snapshot resolves), even when a session is already live — e.g.
        SESSION_COMPLETE, found during Bubble Pop Wall QA. That falsely
        mounted the "waiting" layer moments before the real "game" layer
        also mounted, and since AnimatePresence's sync crossfade doesn't
        z-index its children, paint order (not truth) decided which one sat
        on top for ~1.1s. Rendering neither until hasLoadedInitialSession is
        true means the very first paint already reflects reality — the
        crossfade above still applies to every REAL transition afterward.
      */}
      <AnimatePresence>
        {!realtime.hasLoadedInitialSession ? null : activeGame ? (
          <motion.div
            key="game"
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.1, ease: "easeInOut" }}
          >
            <LocalGameFeedbackProvider gameId={realtime.gameId} sessionId={activeGame.session.sessionId}>
              <activeGame.Component
                session={activeGame.session}
                muted={audio.muted}
                onEvent={audio.handleEvent}
                onWelcomeStart={() => {}}
                onCountdownComplete={handleCountdownComplete}
                onSelectBalloon={() => {}}
                onStageCompleteDone={() => {}}
                externalIncorrectSignal={realtime.incorrectSignal}
                speakCountdownTick={audio.speakCountdownTick}
                celebrationReplayToken={realtime.celebrationReplayToken}
              />
            </LocalGameFeedbackProvider>
            {realtime.gameId && activeGame.session.gameState === "START_ZONE" && "engine" in activeGame.session && <SharedGameIntroduction gameId={realtime.gameId} session={activeGame.session} onEvent={audio.handleEvent} audioEnabled={bridgeState?.config.audio!==false} speechKey={bridgeState?`balance-bridge-3d:${bridgeState.sessionId}:${bridgeState.run}:${bridgeState.stage}`:undefined} />}
            <SensorPointerLayer authenticated={realtime.authStatus === "authenticated"} gateVisible={sensorHandGateVisible} />
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
  /** MULTI-GAME PLATFORM: which persistent world fills the true viewport behind the letterboxed stage — defaults to Balloon Quest's own Environment so every existing call site (LocalDisplayScreen, and any future omission) behaves exactly as before. */
  background?: React.ReactNode;
  children: React.ReactNode;
}

function DisplayShell({ muted, onToggleMute, gameState, background, children }: DisplayShellProps) {
  return (
    <MotionConfig reducedMotion="user">
      <main
        dir="rtl"
        lang="ar"
        data-game-state={gameState ?? "WAITING"}
        className="fixed inset-0 h-dvh w-dvw overflow-hidden"
        style={{ fontFamily: "var(--font-balloon-quest), system-ui, sans-serif" }}
      >
        {/* TASK 9 PART 4: fills the true viewport (not the letterboxed stage) so a non-16:9 window never shows a black bar — see Environment.tsx/CosmicEnvironment.tsx and PlayStage.tsx. */}
        {background ?? <Environment />}
        <PlayStage>{children}</PlayStage>
        {/* Mute/dev affordances stay at the true screen corner regardless of letterboxing, so they're always reachable. */}
        <MuteToggle muted={muted} onToggle={onToggleMute} />
        {gameState && <DevBadge gameState={gameState} />}
      </main>
    </MotionConfig>
  );
}

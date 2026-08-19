"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DisplayEvent, DisplayEventListener } from "@/components/display/events";
import type { GameId } from "@/lib/games/registry";
import { AudioManager, type AudioReadiness } from "./AudioManager";

export interface UseAudioManagerResult {
  handleEvent: DisplayEventListener;
  unlock: () => void;
  muted: boolean;
  toggleMute: () => void;
  readiness: AudioReadiness;
  /** Remote commands may attempt recovery, but only this result can confirm Chrome actually reached running. */
  attemptRemoteEnable: () => Promise<AudioReadiness>;
  /** Keeps ambience correct across refreshes, session switches, and the shared waiting world. */
  setActiveGame: (gameId: GameId | null) => void;
  /** COST INCIDENT — see AudioManager.prefetchForSession's doc comment: `gameId` scopes the warm-up to ONLY that game's own predictable lines, never all five. */
  prefetchForSession: (childName: string, gameId: GameId) => void;
  /** Speaks one countdown tick and resolves once it's actually settled — passed to CountdownScene so it can pace itself against real playback. */
  speakCountdownTick: (tick: "3" | "2" | "1" | "start") => Promise<void>;
}

/**
 * Owns one AudioManager for the lifetime of the display session. Creation
 * and teardown both happen inside the effect (not a lazy ref-on-render)
 * specifically so this self-heals correctly under React StrictMode's dev
 * mount -> cleanup -> re-mount cycle — the manager is destroyed and a fresh
 * one created each time, rather than the ref being left pointing at a torn-
 * down instance.
 *
 * React fires a child's mount effects before its parent's, so
 * WelcomeScene's own useEffect (which fires the "welcome" event) runs
 * before this hook's effect below has had a chance to construct the
 * manager. bufferedEventsRef exists to cover exactly that gap: a plain ref
 * with a side-effect-free initializer is safe to read/write from the very
 * first render, unlike the manager itself. Anything that arrives before
 * the manager exists is queued here and flushed the moment it's ready.
 */
export function useAudioManager(): UseAudioManagerResult {
  const managerRef = useRef<AudioManager | null>(null);
  const bufferedEventsRef = useRef<DisplayEvent[]>([]);
  const [muted, setMutedState] = useState(false);
  const [readiness, setReadiness] = useState<AudioReadiness>({ ready: false, contextState: "unavailable" });

  useEffect(() => {
    const manager = new AudioManager(undefined, setReadiness);
    managerRef.current = manager;
    // Deliberately NOT cleared after flushing: under React StrictMode (dev
    // mode), this effect runs mount -> cleanup -> mount again before the
    // user can interact. If the buffer were cleared here, the first
    // (StrictMode-only) manager would receive the buffered "welcome" event
    // and then get destroyed, while the second, actually-final manager
    // would flush an already-empty buffer and never learn about it —
    // silently losing the welcome line in dev mode specifically (proven via
    // instrumented trace during the Task 4.2 debug session). Replaying the
    // same buffered events into every manager this effect ever creates is
    // safe: AudioManager.handleEvent() for "welcome" just re-sets a field
    // to the same value, and the buffer never grows again once a manager
    // exists (see handleEvent below), so this can't cause duplicate speech.
    for (const event of bufferedEventsRef.current) {
      manager.handleEvent(event);
    }
    return () => {
      manager.destroy();
      managerRef.current = null;
    };
  }, []);

  const unlock = useCallback(() => {
    managerRef.current?.unlock();
  }, []);

  // Every genuine interaction is a recovery opportunity, not just the
  // first. Browsers can create a suspended context on the first gesture or
  // suspend an already-unlocked context after backgrounding/device changes.
  // AudioManager.unlock() is idempotent for speech but intentionally retries
  // context.resume() synchronously on each pointer/key gesture.
  useEffect(() => {
    function handleInteraction() {
      unlock();
    }
    window.addEventListener("pointerdown", handleInteraction);
    window.addEventListener("keydown", handleInteraction);
    return () => {
      window.removeEventListener("pointerdown", handleInteraction);
      window.removeEventListener("keydown", handleInteraction);
    };
  }, [unlock]);

  // The normal first display tap also enters fullscreen. Some browser/
  // projector combinations suspend or interrupt Web Audio during that
  // transition, after the original pointer handler already ran. A
  // fullscreen lifecycle event is the deterministic recovery point: rerun
  // the same real unlock path, which resumes the context and re-applies the
  // audible master gain without changing the mute state or needing a
  // second user click.
  useEffect(() => {
    function handleFullscreenChange() {
      unlock();
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
    };
  }, [unlock]);

  const handleEvent = useCallback<DisplayEventListener>((event: DisplayEvent) => {
    if (managerRef.current) {
      managerRef.current.handleEvent(event);
    } else {
      bufferedEventsRef.current.push(event);
    }
  }, []);

  const toggleMute = useCallback(() => {
    // The mute button click is itself a legitimate user gesture. Resume the
    // Web Audio graph before changing gain so unmute cannot leave a
    // previously-suspended context permanently silent.
    managerRef.current?.unlock();
    setMutedState((previous) => {
      const next = !previous;
      managerRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const attemptRemoteEnable = useCallback(() => {
    setMutedState(false);
    return managerRef.current?.attemptRemoteEnable() ?? Promise.resolve({ ready: false, contextState: "unavailable" });
  }, []);

  const prefetchForSession = useCallback((childName: string, gameId: GameId) => {
    managerRef.current?.prefetchForSession(childName, gameId);
  }, []);

  const setActiveGame = useCallback((gameId: GameId | null) => {
    managerRef.current?.setActiveGame(gameId);
  }, []);

  const speakCountdownTick = useCallback((tick: "3" | "2" | "1" | "start") => {
    return managerRef.current?.speakCountdownTick(tick) ?? Promise.resolve();
  }, []);

  return { handleEvent, unlock, muted, toggleMute, readiness, attemptRemoteEnable, setActiveGame, prefetchForSession, speakCountdownTick };
}

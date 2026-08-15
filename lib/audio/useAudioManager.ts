"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DisplayEvent, DisplayEventListener } from "@/components/display/events";
import { AudioManager } from "./AudioManager";

export interface UseAudioManagerResult {
  handleEvent: DisplayEventListener;
  unlock: () => void;
  muted: boolean;
  toggleMute: () => void;
  prefetchForSession: (childName: string) => void;
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

  useEffect(() => {
    const manager = new AudioManager();
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

  // Safety net: the polished "ابدأ التجربة" button is the primary unlock
  // path, but any first genuine interaction (e.g. a tester using only the
  // keyboard) should still unlock audio, per the autoplay-policy rule that
  // any user gesture qualifies — not specifically a click on one element.
  useEffect(() => {
    let firedOnce = false;
    function handleFirstInteraction() {
      if (firedOnce) return;
      firedOnce = true;
      unlock();
      window.removeEventListener("pointerdown", handleFirstInteraction);
      window.removeEventListener("keydown", handleFirstInteraction);
    }
    window.addEventListener("pointerdown", handleFirstInteraction);
    window.addEventListener("keydown", handleFirstInteraction);
    return () => {
      window.removeEventListener("pointerdown", handleFirstInteraction);
      window.removeEventListener("keydown", handleFirstInteraction);
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
    setMutedState((previous) => {
      const next = !previous;
      managerRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const prefetchForSession = useCallback((childName: string) => {
    managerRef.current?.prefetchForSession(childName);
  }, []);

  const speakCountdownTick = useCallback((tick: "3" | "2" | "1" | "start") => {
    return managerRef.current?.speakCountdownTick(tick) ?? Promise.resolve();
  }, []);

  return { handleEvent, unlock, muted, toggleMute, prefetchForSession, speakCountdownTick };
}

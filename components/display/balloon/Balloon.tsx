"use client";

import { memo, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { motion, useAnimation } from "motion/react";
import type { Balloon as EngineBalloon } from "@/lib/game";
import { useLocalGameFeedbackContext } from "@/components/display/LocalGameFeedbackProvider";
import { BALLOON_COLOR_THEME } from "../colorPalette";
import { CORRECT_ENCOURAGEMENTS_AR, INCORRECT_ENCOURAGEMENT_AR } from "../copy";
import { BalloonArt } from "./BalloonArt";
import { Sparkles } from "./Sparkles";

type PopPhase = "idle" | "popping" | "gone";

interface BalloonProps {
  balloon: EngineBalloon;
  /** Changes (e.g. to Date.now()) each time this specific balloon should play its incorrect-shake. 0 = never yet. */
  shakeToken: number;
  onSelect: (balloonId: string) => void;
  onCorrectEvent?: () => void;
  onPopEvent?: () => void;
}

function idOffset(id: string, mod: number): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return hash % mod;
}

/**
 * Renders one balloon and owns its own pop choreography, driven by
 * balloon.isPopped (the engine's canonical opinion on this balloon) OR a
 * same-Mac LOCAL FAST-PATH signal that the SAME canonical action was already
 * accepted on Control (see LocalGameFeedbackProvider.tsx + Control's
 * useRealtimeControllerSession.ts's selectBalloon) — whichever arrives
 * first starts the VISUAL "popping" choreography (squash -> expand -> pop
 * -> sparkle burst -> fade), then the component unmounts itself (phase
 * "gone") rather than staying in the DOM.
 *
 * DELIBERATE SPLIT — visual vs. audio/score-adjacent effects: the local
 * signal can only ever accelerate the VISUAL start. `onCorrectEvent`/
 * `onPopEvent` (which drive audio + the celebration burst, see
 * PlayingScene.tsx's handleCorrectEvent/handlePopEvent) stay wired to
 * `balloon.isPopped` ALONE, in their own separate effect below — never to
 * the local signal — so nothing here can ever play a sound or celebrate
 * twice, or celebrate an action the canonical engine actually rejected: the
 * local signal only ever exists because Control's OWN canonical
 * selectBalloon() already returned `wasCorrect === true` before that
 * message was sent.
 *
 * Restarting a stage reuses the same deterministic balloon ids (same seed +
 * stage number), so isPopped can also flip back to false on an existing
 * instance — handled below by resetting phase, not just reacting to the
 * pop transition. `reconcile(balloon.id)` runs at both the confirmed-pop and
 * restart-detected edges so a stale local-accepted flag can never survive
 * into a later, unrelated occurrence of the same balloon id.
 *
 * SUBSCRIBES DIRECTLY VIA useSyncExternalStore — deliberately not
 * `useContext` alone: an earlier version read `isLocallyAccepted` off a
 * Context value that was memoized with stable function identity, so its
 * reference never changed when a new local action arrived, and React
 * Context only re-renders a consumer when the value's REFERENCE changes —
 * the local flag was then only ever noticed by accident, on whatever OTHER
 * re-render happened to come along next (random 0-2s on real hardware, not
 * a fixed delay). `useSyncExternalStore` subscribes THIS balloon straight
 * to the store's own notify/subscribe (see LocalGameFeedbackStore.ts),
 * re-rendering only this one component, only when ITS OWN target id's
 * accepted-state actually changes — no parent, no Context-identity
 * subtlety, in the loop at all.
 */
export const Balloon = memo(function Balloon({ balloon, shakeToken, onSelect, onCorrectEvent, onPopEvent }: BalloonProps) {
  const theme = BALLOON_COLOR_THEME[balloon.color];
  const [phase, setPhase] = useState<PopPhase>(balloon.isPopped ? "gone" : "idle");
  const [showTryAgain, setShowTryAgain] = useState(false);
  const wasPoppedVisual = useRef(balloon.isPopped);
  const audioFired = useRef(balloon.isPopped);
  const shakeControls = useAnimation();
  const store = useLocalGameFeedbackContext();
  const subscribe = useCallback((onChange: () => void) => store.subscribe(onChange), [store]);
  const getSnapshot = useCallback(() => store.isAccepted(balloon.id), [store, balloon.id]);
  const locallyAccepted = useSyncExternalStore(subscribe, getSnapshot, () => false);

  const idleDelay = idOffset(balloon.id, 30) / 10; // 0.0 - 2.9s
  const idleDuration = 3.4 + idOffset(balloon.id, 16) / 10; // 3.4 - 4.9s
  const entranceDelay = idOffset(balloon.id, 12) / 22; // 0.0 - 0.5s, staggers the stage's balloons descending in
  const idleStyle = {
    "--bq-idle-delay": `${idleDelay}s`,
    "--bq-idle-duration": `${idleDuration}s`,
  } as React.CSSProperties;

  // VISUAL START ONLY — see this component's own doc comment for why audio
  // is deliberately NOT triggered here. Runs on the very next render after
  // `locallyAccepted` flips true (React commits + runs effects that same
  // frame, no artificial delay) — see the DEV DIAGNOSTIC below for
  // confirming this in a real trace.
  useEffect(() => {
    const shouldStartVisual = balloon.isPopped || locallyAccepted;
    if (shouldStartVisual && !wasPoppedVisual.current) {
      wasPoppedVisual.current = true;
      setPhase("popping");
      if (process.env.NODE_ENV !== "production" && locallyAccepted) {
        const acceptedAt = store.acceptedAt(balloon.id);
        const latencyFromAcceptMs = acceptedAt != null ? Date.now() - acceptedAt : null;
        console.debug(`[LOCAL POP RENDERED] balloon=${balloon.id}${latencyFromAcceptMs != null ? ` latency-from-action=${latencyFromAcceptMs}ms` : ""}`);
      }
      const goneTimer = setTimeout(() => setPhase("gone"), 800);
      return () => clearTimeout(goneTimer);
    }
    if (!balloon.isPopped && !locallyAccepted && wasPoppedVisual.current) {
      // Stage was restarted: neither canonical nor local state still calls this balloon popped.
      wasPoppedVisual.current = false;
      setPhase("idle");
    }
  }, [balloon.isPopped, locallyAccepted, store, balloon.id]);

  // AUDIO / SCORE-ADJACENT EVENTS — strictly canonical-only, see doc comment above.
  useEffect(() => {
    if (balloon.isPopped && !audioFired.current) {
      audioFired.current = true;
      store.reconcile(balloon.id);
      onCorrectEvent?.();
      const popTimer = setTimeout(() => onPopEvent?.(), 150);
      return () => clearTimeout(popTimer);
    }
    if (!balloon.isPopped && audioFired.current) {
      audioFired.current = false;
      store.reconcile(balloon.id);
    }
  }, [balloon.isPopped, onCorrectEvent, onPopEvent, store, balloon.id]);

  useEffect(() => {
    if (shakeToken > 0) {
      void shakeControls.start({
        x: [0, -6, 6, -4, 4, 0],
        rotate: [0, -4, 4, -3, 3, 0],
        transition: { duration: 0.5, ease: "easeInOut" },
      });
      setShowTryAgain(true);
      const hideTimer = setTimeout(() => setShowTryAgain(false), 900);
      return () => clearTimeout(hideTimer);
    }
    // shakeControls identity is stable across renders (Motion's contract); only shakeToken should retrigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shakeToken]);

  if (phase === "gone") return null;

  const message = CORRECT_ENCOURAGEMENTS_AR[idOffset(balloon.id, CORRECT_ENCOURAGEMENTS_AR.length)];

  return (
    <div
      className="absolute"
      style={{
        left: `${balloon.position.x * 100}%`,
        top: `${balloon.position.y * 100}%`,
        width: `${balloon.size * 100}vmin`,
        height: `${balloon.size * 100}vmin`,
        transform: "translate(-50%, -50%)",
      }}
    >
      {/* Entrance: balloons descend into their generated positions rather than just fading in. */}
      <motion.div
        className="h-full w-full"
        initial={{ y: "-30vh", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 90, damping: 14, delay: entranceDelay }}
      >
        {phase === "idle" && (
          // Shake (Motion, JS-driven) and idle breathing (CSS keyframes) both
          // animate `transform`, so they're split across two nested elements —
          // animating the same property from two systems on one element fights.
          <motion.div animate={shakeControls} className="h-full w-full">
            <button
              type="button"
              aria-label={`balloon-${balloon.color.toLowerCase()}`}
              onClick={() => onSelect(balloon.id)}
              className="bq-balloon-idle block h-full w-full cursor-pointer touch-manipulation border-0 bg-transparent p-0"
              style={idleStyle}
            >
              <BalloonArt theme={theme} />
            </button>
            {showTryAgain && (
              <motion.div
                className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full bg-white/90 px-3 py-1 text-[2vmin] font-semibold text-slate-500 shadow-sm"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: [0, 1, 1, 0], y: [4, -4, -4, -10] }}
                transition={{ duration: 0.9, ease: "easeOut" }}
              >
                {INCORRECT_ENCOURAGEMENT_AR}
              </motion.div>
            )}
          </motion.div>
        )}

        {phase === "popping" && (
          <>
            <motion.div
              className="h-full w-full"
              initial={{ scaleX: 1, scaleY: 1, opacity: 1 }}
              animate={{
                scaleX: [1, 1.12, 0.82, 1.3, 1.3],
                scaleY: [1, 0.85, 1.15, 1.3, 1.3],
                opacity: [1, 1, 1, 1, 0],
              }}
              transition={{ duration: 0.55, times: [0, 0.2, 0.4, 0.6, 1], ease: "easeOut" }}
            >
              <BalloonArt theme={theme} />
            </motion.div>
            <Sparkles colors={[theme.base, theme.light, "#FFFFFF"]} />
            <motion.div
              className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full bg-white/90 px-3 py-1 text-[2.4vmin] font-bold text-slate-700 shadow-sm"
              initial={{ opacity: 0, y: 6, scale: 0.8 }}
              animate={{ opacity: [0, 1, 1, 0], y: [6, -6, -10, -18], scale: [0.8, 1, 1, 1] }}
              transition={{ duration: 1, ease: "easeOut" }}
            >
              {message}
            </motion.div>
          </>
        )}
      </motion.div>
    </div>
  );
});

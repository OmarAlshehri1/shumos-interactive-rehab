"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import type { StageRuntime } from "@/lib/game";
import { BALLOON_COLOR_THEME } from "../colorPalette";
import { BalloonField } from "../balloon/BalloonField";
import { StartZoneMarker } from "../startZone/StartZoneMarker";
import type { DisplayEventListener } from "../events";

interface PlayingSceneProps {
  stage: StageRuntime;
  onSelectBalloon: (balloonId: string) => void;
  onEvent: DisplayEventListener;
  /**
   * TASK 6: externally-driven incorrect signal, for realtime mode where the
   * tap happens on /control, not here — onSelectBalloon is a no-op there,
   * so the local click-derived signal below never fires on its own. When
   * provided, a new token drives the exact same shake feedback a local
   * click would. Undefined in local demo mode (unchanged behavior).
   */
  externalIncorrectSignal?: { balloonId: string; token: number } | null;
  /**
   * TASK 6: pause/resume never changes gameState (see lib/game/session.ts —
   * it only ever touches stage.pausedAt), and this scene never had any
   * paused presentation before Task 6, in local or realtime mode — nothing
   * to "unbreak," this is a genuinely new requirement ("projector must
   * immediately enter the corresponding paused presentation"). Defaults to
   * false so this is purely additive.
   */
  isPaused?: boolean;
}

/**
 * The core gameplay screen. Renders the real generated balloons at their
 * engine-defined normalized positions (BalloonField never invents its own
 * layout) plus a compact floating instruction pill and progress dots —
 * deliberately not a dashboard: no accuracy, no reaction time, no counts
 * beyond "how many left," per the spec's child-only-needs-encouragement
 * rule. Those richer stats belong to the therapist/report experience.
 */
export function PlayingScene({ stage, onSelectBalloon, onEvent, externalIncorrectSignal, isPaused = false }: PlayingSceneProps) {
  const theme = BALLOON_COLOR_THEME[stage.targetColor];
  const [incorrectSignal, setIncorrectSignal] = useState<{ balloonId: string; token: number } | null>(null);
  // externalIncorrectSignal is already React state one level up (see
  // useRealtimeDisplaySession's id-based dedupe) — no need to mirror it
  // into a second piece of local state, just prefer it at render time.
  const effectiveIncorrectSignal = externalIncorrectSignal ?? incorrectSignal;

  useEffect(() => {
    if (!externalIncorrectSignal) return;
    onEvent({ type: "incorrect", timestamp: Date.now() });
    // Fires only when a genuinely new externally-driven signal arrives (see useRealtimeDisplaySession's id-based dedupe).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalIncorrectSignal]);

  const handleSelect = useCallback(
    (balloonId: string) => {
      const balloon = stage.balloons.find((b) => b.id === balloonId);
      const isFreshIncorrectAttempt = balloon && !balloon.isTarget && !balloon.isPopped;
      if (isFreshIncorrectAttempt) {
        setIncorrectSignal({ balloonId, token: Date.now() });
        onEvent({ type: "incorrect", timestamp: Date.now() });
      }
      onSelectBalloon(balloonId);
    },
    [stage.balloons, onSelectBalloon, onEvent],
  );

  const handleCorrectEvent = useCallback(
    () =>
      onEvent({
        type: "correct",
        timestamp: Date.now(),
        correctCount: stage.correctCount,
        totalTargets: stage.totalTargets,
      }),
    [onEvent, stage.correctCount, stage.totalTargets],
  );
  const handlePopEvent = useCallback(() => onEvent({ type: "balloon_pop", timestamp: Date.now() }), [onEvent]);

  return (
    <div className="relative h-full w-full">
      {/* TASK 8.2: subdued during active play — the child always has a "home" reference without it competing with the balloons. */}
      <StartZoneMarker variant="subdued" />
      <BalloonField
        balloons={stage.balloons}
        incorrectSignal={effectiveIncorrectSignal}
        onSelect={handleSelect}
        onCorrectEvent={handleCorrectEvent}
        onPopEvent={handlePopEvent}
      />

      <div className="pointer-events-none absolute inset-x-0 top-[3vmin] flex flex-col items-center gap-[1.4vmin]">
        <div className="flex items-center gap-[1.4vmin] rounded-full bg-white/85 px-[2.6vmin] py-[1.2vmin] shadow-[0_6px_24px_rgba(60,30,90,0.18)] backdrop-blur-sm">
          <span
            className="h-[3.4vmin] w-[3.4vmin] rounded-full border-2 border-white shadow-inner"
            style={{ background: `linear-gradient(135deg, ${theme.light}, ${theme.base})` }}
            aria-hidden="true"
          />
          <span className="text-[2.6vmin] font-bold whitespace-nowrap text-slate-700">
            ابحث عن اللون {theme.definiteNameAr}
          </span>
        </div>

        <div className="flex items-center gap-[1vmin] rounded-full bg-white/70 px-[2vmin] py-[0.9vmin] shadow-[0_4px_16px_rgba(60,30,90,0.12)] backdrop-blur-sm">
          {Array.from({ length: stage.totalTargets }).map((_, i) => (
            <span
              key={i}
              className="h-[1.8vmin] w-[1.8vmin] rounded-full transition-colors duration-300"
              style={{ background: i < stage.correctCount ? theme.base : "rgba(100,100,120,0.25)" }}
            />
          ))}
        </div>
      </div>

      {isPaused && (
        <motion.div
          className="absolute inset-0 flex flex-col items-center justify-center gap-[2vmin] bg-slate-900/45 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <span className="text-[10vmin]" aria-hidden="true">
            ⏸
          </span>
          <span className="text-[3.4vmin] font-bold text-white drop-shadow-[0_3px_14px_rgba(60,30,90,0.3)]">
            توقف مؤقت
          </span>
        </motion.div>
      )}
    </div>
  );
}

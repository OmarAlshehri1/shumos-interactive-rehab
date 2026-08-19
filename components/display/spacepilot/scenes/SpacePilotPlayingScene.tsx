"use client";

import { useEffect, useRef, useState } from "react";
import { CollectibleStarStatus, StarLane, TOTAL_STARS, starArrivalOffsetMs, type SpacePilotStageRuntime } from "@/lib/spacepilot";
import type { DisplayEventListener } from "@/components/display/events";
import { LANE_Y_PERCENT, ROCKET_X_PERCENT } from "../lanes";
import { LaneControls } from "../controls/LaneControls";
import { StarProgressDots } from "../progress/StarProgressDots";
import { SpacePilotRocket } from "../rocket/SpacePilotRocket";
import { CollectibleStarArt } from "../stars/CollectibleStarArt";
import { FinalRocketPayoff } from "../celebration/FinalRocketPayoff";

interface SpacePilotPlayingSceneProps {
  stage: SpacePilotStageRuntime;
  childFirstName: string;
  onEvent: DisplayEventListener;
  isPaused: boolean;
  onFinalActionSettled?: () => void;
}

/** How long before a star's scheduled arrival it enters from the left edge — generous (task's "Do NOT make the child race"). */
const LEAD_MS = 5200;
/** How long a MISSED star continues drifting past the rocket before it's gone — brief, since it's already resolved. */
const TAIL_MS = 1300;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

/**
 * Space Pilot's own core gameplay scene. Every position here is a PURE
 * function of canonical time (`stage.startedAt`/`totalPausedMs`/`pausedAt`)
 * and the canonical star schedule (starArrivalOffsetMs) — nothing about
 * WHETHER a star is collected is ever decided here (that's the
 * controller's resolveSpacePilotStarArrival, see
 * lib/control/spacepilot/useSpacePilotRealtimeControllerSession.ts); this
 * scene only ever visualizes canonical state and reacts (sound/burst) the
 * instant that state confirms an outcome — same "display never decides
 * gameplay" boundary Bubble Pop Wall's PlayingScene already establishes.
 *
 * ONE STAR IN FLIGHT AT A TIME (mirrors Bubble Pop Wall's "one mission, one
 * moving bubble" design) — never fills the screen with several stars at
 * once, keeping the current target obvious (task's "no visual noise").
 */
export function SpacePilotPlayingScene({ stage, childFirstName, onEvent, isPaused, onFinalActionSettled }: SpacePilotPlayingSceneProps) {
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    if (isPaused) return;
    let raf: number;
    const loop = () => {
      setTick(Date.now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [isPaused]);

  const now = isPaused && stage.pausedAt !== null ? stage.pausedAt : tick;
  const elapsedMs = stage.startedAt !== null ? now - stage.startedAt - stage.totalPausedMs : 0;

  // Fire the right audio/celebration event exactly once per star resolution
  // (COLLECTED -> star_collected or, for the final star, final_star_collected;
  // MISSED -> star_missed), plus a transient rocket "boost" pulse on collect.
  const lastAnnouncedIndexRef = useRef(-1);
  const [boosting, setBoosting] = useState(false);
  const finalPayoff = stage.currentStarIndex >= TOTAL_STARS && stage.stars[TOTAL_STARS - 1]?.status === CollectibleStarStatus.COLLECTED;
  useEffect(() => {
    if (stage.currentStarIndex <= lastAnnouncedIndexRef.current) return;
    const resolvedIndex = stage.currentStarIndex - 1;
    if (resolvedIndex < 0) return;
    lastAnnouncedIndexRef.current = stage.currentStarIndex;
    const star = stage.stars[resolvedIndex];
    if (!star) return;
    let clearBoost: ReturnType<typeof setTimeout> | undefined;
    if (star.status === CollectibleStarStatus.COLLECTED) {
      // Deferred a tick (never set synchronously inside the effect body) — the boost is a pure visual reaction to a state change that already happened, not something this effect needs to commit in the same pass.
      const startBoost = setTimeout(() => {
        setBoosting(true);
        clearBoost = setTimeout(() => setBoosting(false), 420);
      }, 0);
      if (resolvedIndex + 1 >= TOTAL_STARS) {
        onEvent({ type: "space_pilot_final_star_collected", timestamp: Date.now(), childName: childFirstName });
        const settleFinal = setTimeout(() => onFinalActionSettled?.(), 1_100);
        return () => {
          clearTimeout(startBoost);
          clearTimeout(settleFinal);
          if (clearBoost) clearTimeout(clearBoost);
        };
      } else {
        onEvent({ type: "space_pilot_star_collected", timestamp: Date.now(), upgradeLevel: resolvedIndex + 1 });
      }
      return () => {
        clearTimeout(startBoost);
        if (clearBoost) clearTimeout(clearBoost);
      };
    }
    onEvent({ type: "space_pilot_star_missed", timestamp: Date.now() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.currentStarIndex, onFinalActionSettled]);

  // Transient bank while the rocket's lane changes — task's "lane change should feel like the rocket actually flies into the new lane... rocket slightly tilts during movement... then settles."
  const previousLaneRef = useRef(stage.rocketLane);
  const [bankDegrees, setBankDegrees] = useState(0);
  useEffect(() => {
    if (previousLaneRef.current === stage.rocketLane) return;
    const laneRank = (lane: StarLane) => [StarLane.TOP, StarLane.MIDDLE, StarLane.BOTTOM].indexOf(lane);
    const direction: "UP" | "DOWN" = laneRank(stage.rocketLane) < laneRank(previousLaneRef.current) ? "UP" : "DOWN";
    previousLaneRef.current = stage.rocketLane;
    onEvent({ type: "space_pilot_lane_change", timestamp: Date.now(), direction, lane: stage.rocketLane });
    setBankDegrees(direction === "UP" ? -14 : 14);
    const settle = setTimeout(() => setBankDegrees(0), 420);
    return () => clearTimeout(settle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.rocketLane]);

  // Shared "paused" event (task's cross-game pause audit item) — fired once when this scene's own pause overlay appears, so the child is told what's happening rather than left reading it.
  const wasPausedRef = useRef(isPaused);
  useEffect(() => {
    if (isPaused && !wasPausedRef.current) onEvent({ type: "paused", timestamp: Date.now() });
    wasPausedRef.current = isPaused;
  }, [isPaused, onEvent]);

  const currentIndex = stage.currentStarIndex;
  const currentStar = currentIndex < stage.stars.length ? stage.stars[currentIndex] : null;
  const arrivalMs = currentStar ? starArrivalOffsetMs(currentIndex) : 0;

  let starVisual: { xPercent: number; laneY: StarLane; outcome: "collect" | "miss" | null } | null = null;
  if (currentStar) {
    if (currentStar.status !== CollectibleStarStatus.PENDING) {
      // Just resolved — pinned at the collection zone, playing its outcome animation.
      starVisual = {
        xPercent: ROCKET_X_PERCENT,
        laneY: currentStar.lane,
        outcome: currentStar.status === CollectibleStarStatus.COLLECTED ? "collect" : "miss",
      };
    } else {
      const visibleFrom = arrivalMs - LEAD_MS;
      const visibleTo = arrivalMs + TAIL_MS;
      if (elapsedMs >= visibleFrom && elapsedMs <= visibleTo) {
        const xPercent =
          elapsedMs < arrivalMs ? lerp(-8, ROCKET_X_PERCENT, (elapsedMs - visibleFrom) / LEAD_MS) : lerp(ROCKET_X_PERCENT, 118, (elapsedMs - arrivalMs) / TAIL_MS);
        starVisual = { xPercent, laneY: currentStar.lane, outcome: null };
      }
    }
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <StarProgressDots stars={stage.stars} />
      {finalPayoff && <FinalRocketPayoff />}

      {/* Lane guide tracks — faint, unobtrusive, help the child read the three rows. */}
      {(Object.values(StarLane) as StarLane[]).map((lane) => (
        <div
          key={lane}
          className="pointer-events-none absolute inset-x-0 h-px bg-white/10"
          style={{ top: `${LANE_Y_PERCENT[lane]}%` }}
        />
      ))}

      {starVisual && (
        <div
          className="absolute h-[13vmin] w-[13vmin] -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${starVisual.xPercent}%`, top: `${LANE_Y_PERCENT[starVisual.laneY]}%` }}
        >
          <CollectibleStarArt outcome={starVisual.outcome} />
        </div>
      )}

      {/*
        REAL ROOT CAUSE of the rocket sitting above the lane/star centerline:
        this div used to carry BOTH the Tailwind `-translate-y-1/2` utility
        class AND an inline `style.transform` on the SAME element. Tailwind
        v4 compiles translate utilities to the standalone CSS `translate`
        property (not into `transform`) — so the class's own -50% and the
        inline transform's own -50% both applied, COMPOSING into a full
        -100% (one whole container height) upward shift instead of the
        intended -50%. The star container two lines above never had this
        bug (no competing inline transform there), which is exactly why the
        star always looked correctly centered while the rocket didn't. Fix:
        the inline transform alone already fully centers both axes — no
        Tailwind translate utility class belongs on this element.
      */}
      <div
        className="absolute h-[13vmin] w-[22vmin] transition-[top] duration-[420ms] ease-out"
        style={{ left: `${ROCKET_X_PERCENT}%`, top: `${LANE_Y_PERCENT[stage.rocketLane]}%`, transform: "translate(-38%, -50%)" }}
      >
        <SpacePilotRocket upgradeLevel={stage.collectedCount} bankDegrees={bankDegrees} boosting={boosting} />
      </div>

      {isPaused && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40">
          <span className="rounded-full bg-white/10 px-[4vmin] py-[1.6vmin] text-[3.4vmin] font-bold text-white backdrop-blur-sm">توقف مؤقت</span>
        </div>
      )}

      <LaneControls />
    </div>
  );
}

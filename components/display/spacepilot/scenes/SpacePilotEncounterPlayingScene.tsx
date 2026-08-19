"use client";

import { useEffect, useRef, useState } from "react";
import {
  Difficulty,
  EncounterOutcome,
  EncounterType,
  StarLane,
  encounterArrivalOffsetMs,
  type SpacePilotEncounterStageRuntime,
} from "@/lib/spacepilot";
import type { DisplayEventListener } from "@/components/display/events";
import { LANE_Y_PERCENT, ROCKET_X_PERCENT } from "../lanes";
import { LaneControls } from "../controls/LaneControls";
import { EncounterProgressDots } from "../progress/EncounterProgressDots";
import { SpacePilotRocket } from "../rocket/SpacePilotRocket";
import { CollectibleStarArt } from "../stars/CollectibleStarArt";
import { AsteroidArt } from "../hazards/AsteroidArt";
import { AlienShipArt } from "../hazards/AlienShipArt";
import { FireProjectile } from "../hazards/FireProjectile";
import { FinalRocketPayoff } from "../celebration/FinalRocketPayoff";

interface SpacePilotEncounterPlayingSceneProps {
  stage: SpacePilotEncounterStageRuntime;
  difficulty: Difficulty;
  childFirstName: string;
  onEvent: DisplayEventListener;
  isPaused: boolean;
  onFinalActionSettled?: () => void;
}

/** How long before an encounter's scheduled arrival it enters from the left edge — generous warning distance (task's "see asteroid -> understand lane -> choose"). */
const LEAD_MS = 5200;
/** How long a resolved (avoided/passed/missed) encounter continues drifting past the rocket before it's gone. */
const TAIL_MS = 1300;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

/**
 * MEDIUM ("حزام النيازك") / ADVANCED ("مهمة المجرة")'s shared gameplay
 * scene — the encounter-model analogue of SpacePilotPlayingScene, same
 * "display never decides gameplay, only visualizes canonical state and
 * reacts the instant it confirms an outcome" boundary. One object in
 * flight at a time (same convention EASY already establishes). Adds two
 * things EASY never needed: rendering three encounter types (star/
 * asteroid/alien) instead of just stars, and the FIRE mechanic's traveling
 * projectile — itself purely reactive (canonical state already resolved
 * the hit/miss the instant FIRE was pressed, see fireSpacePilotWeapon).
 */
export function SpacePilotEncounterPlayingScene({ stage, difficulty, childFirstName, onEvent, isPaused, onFinalActionSettled }: SpacePilotEncounterPlayingSceneProps) {
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

  const currentIndex = stage.currentEncounterIndex;
  const currentEncounter = currentIndex < stage.encounters.length ? stage.encounters[currentIndex] : null;
  const arrivalMs = currentEncounter ? encounterArrivalOffsetMs(difficulty, currentIndex) : 0;

  let visual: { xPercent: number; laneY: StarLane; type: EncounterType; outcome: EncounterOutcome | null } | null = null;
  if (currentEncounter) {
    if (currentEncounter.status !== EncounterOutcome.PENDING) {
      visual = { xPercent: ROCKET_X_PERCENT, laneY: currentEncounter.lane, type: currentEncounter.type, outcome: currentEncounter.status };
    } else {
      const visibleFrom = arrivalMs - LEAD_MS;
      const visibleTo = arrivalMs + TAIL_MS;
      if (elapsedMs >= visibleFrom && elapsedMs <= visibleTo) {
        const xPercent =
          elapsedMs < arrivalMs ? lerp(-8, ROCKET_X_PERCENT, (elapsedMs - visibleFrom) / LEAD_MS) : lerp(ROCKET_X_PERCENT, 118, (elapsedMs - arrivalMs) / TAIL_MS);
        visual = { xPercent, laneY: currentEncounter.lane, type: currentEncounter.type, outcome: null };
      }
    }
  }

  // Track the currently-visible pending encounter's live X so a FIRE shot
  // fired mid-approach (canonical resolution doesn't wait for arrival) can
  // animate its projectile to wherever the target actually is on screen.
  // Updated in an effect (never during render itself) so this stays a pure
  // render and the ref reflects the position from the frame just committed.
  const lastVisibleRef = useRef<{ index: number; xPercent: number } | null>(null);
  useEffect(() => {
    if (currentEncounter && visual && visual.outcome === null) {
      lastVisibleRef.current = { index: currentIndex, xPercent: visual.xPercent };
    }
  });

  // Fire the right audio/celebration event exactly once per encounter
  // resolution, plus a transient rocket "boost" pulse on a positive outcome.
  const lastAnnouncedIndexRef = useRef(-1);
  const [boosting, setBoosting] = useState(false);
  const finalEncounter = stage.encounters.at(-1);
  const finalPayoff = stage.currentEncounterIndex >= stage.encounters.length && finalEncounter?.status !== EncounterOutcome.PENDING;
  useEffect(() => {
    if (stage.currentEncounterIndex <= lastAnnouncedIndexRef.current) return;
    const resolvedIndex = stage.currentEncounterIndex - 1;
    if (resolvedIndex < 0) return;
    lastAnnouncedIndexRef.current = stage.currentEncounterIndex;
    const encounter = stage.encounters[resolvedIndex];
    if (!encounter) return;
    let clearBoost: ReturnType<typeof setTimeout> | undefined;

    if (encounter.type === EncounterType.STAR) {
      if (encounter.status === EncounterOutcome.COLLECTED) {
        const startBoost = setTimeout(() => {
          setBoosting(true);
          clearBoost = setTimeout(() => setBoosting(false), 420);
        }, 0);
        if (resolvedIndex === stage.encounters.length - 1) {
          onEvent({ type: "space_pilot_final_star_collected", timestamp: Date.now(), childName: childFirstName });
          if (difficulty === Difficulty.ADVANCED) onEvent({ type: "space_pilot_portal", timestamp: Date.now() });
          const settleFinal = setTimeout(() => onFinalActionSettled?.(), 1_100);
          return () => {
            clearTimeout(startBoost);
            clearTimeout(settleFinal);
            if (clearBoost) clearTimeout(clearBoost);
          };
        } else {
          onEvent({ type: "space_pilot_star_collected", timestamp: Date.now(), upgradeLevel: stage.collectedStars });
        }
        return () => {
          clearTimeout(startBoost);
          if (clearBoost) clearTimeout(clearBoost);
        };
      }
      onEvent({ type: "space_pilot_star_missed", timestamp: Date.now() });
    } else if (encounter.type === EncounterType.ASTEROID) {
      if (encounter.status === EncounterOutcome.CLEARED) {
        onEvent({ type: "space_pilot_asteroid_cleared", timestamp: Date.now() });
      } else {
        onEvent({ type: "space_pilot_asteroid_avoided", timestamp: Date.now() });
      }
    } else {
      onEvent({ type: "space_pilot_alien_passed", timestamp: Date.now() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.currentEncounterIndex, onFinalActionSettled]);

  // FIRE — a shot was just launched (canonical `lastFiredAt` advanced).
  // Fires once per genuine shot; a rapid tap inside the cooldown never
  // changes `lastFiredAt`, so it never re-triggers this (task's "rapid FIRE
  // taps must not spawn hundreds of projectiles").
  const lastFiredAtRef = useRef<number | null>(stage.lastFiredAt);
  const [projectile, setProjectile] = useState<{ token: number; yPercent: number; targetXPercent: number } | null>(null);
  const projectileTokenRef = useRef(0);
  useEffect(() => {
    if (stage.lastFiredAt === lastFiredAtRef.current) return;
    const firedAtLane = stage.rocketLane;
    lastFiredAtRef.current = stage.lastFiredAt;
    onEvent({ type: "space_pilot_fire", timestamp: Date.now(), lane: firedAtLane });

    // Was the encounter that just resolved (if any) an asteroid this exact
    // shot cleared? If so, aim at wherever it was last seen on screen;
    // otherwise this was a shot into empty space — send it off past the
    // left edge.
    const resolvedIndex = stage.currentEncounterIndex - 1;
    const justCleared = resolvedIndex >= 0 && stage.encounters[resolvedIndex]?.status === EncounterOutcome.CLEARED;
    const target = justCleared && lastVisibleRef.current?.index === resolvedIndex ? lastVisibleRef.current.xPercent : -12;

    projectileTokenRef.current += 1;
    setProjectile({ token: projectileTokenRef.current, yPercent: LANE_Y_PERCENT[firedAtLane], targetXPercent: target });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.lastFiredAt]);

  // Transient bank while the rocket's lane changes — same feel as EASY's scene.
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

  const wasPausedRef = useRef(isPaused);
  useEffect(() => {
    if (isPaused && !wasPausedRef.current) onEvent({ type: "paused", timestamp: Date.now() });
    wasPausedRef.current = isPaused;
  }, [isPaused, onEvent]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <EncounterProgressDots encounters={stage.encounters} />
      {finalPayoff && <FinalRocketPayoff />}

      {(Object.values(StarLane) as StarLane[]).map((lane) => (
        <div key={lane} className="pointer-events-none absolute inset-x-0 h-px bg-white/10" style={{ top: `${LANE_Y_PERCENT[lane]}%` }} />
      ))}

      {visual && (
        <div
          className="absolute h-[13vmin] w-[13vmin] -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${visual.xPercent}%`, top: `${LANE_Y_PERCENT[visual.laneY]}%` }}
        >
          {visual.type === EncounterType.STAR && <CollectibleStarArt outcome={visual.outcome === EncounterOutcome.COLLECTED ? "collect" : visual.outcome === EncounterOutcome.MISSED ? "miss" : null} />}
          {visual.type === EncounterType.ASTEROID && (
            <AsteroidArt outcome={visual.outcome === EncounterOutcome.CLEARED ? "cleared" : visual.outcome === EncounterOutcome.AVOIDED ? "avoided" : null} />
          )}
          {visual.type === EncounterType.ALIEN && <AlienShipArt />}
        </div>
      )}

      {projectile && (
        <FireProjectile
          key={projectile.token}
          yPercent={projectile.yPercent}
          originXPercent={ROCKET_X_PERCENT}
          targetXPercent={projectile.targetXPercent}
          onComplete={() => setProjectile((current) => (current?.token === projectile.token ? null : current))}
        />
      )}

      {/* See SpacePilotPlayingScene.tsx's matching comment: no Tailwind translate utility class belongs on this element — the inline transform alone already fully centers both axes, and combining the two double-shifts it under Tailwind v4. */}
      <div
        className="absolute h-[13vmin] w-[22vmin] transition-[top] duration-[420ms] ease-out"
        style={{ left: `${ROCKET_X_PERCENT}%`, top: `${LANE_Y_PERCENT[stage.rocketLane]}%`, transform: "translate(-38%, -50%)" }}
      >
        <SpacePilotRocket upgradeLevel={stage.collectedStars} bankDegrees={bankDegrees} boosting={boosting} />
      </div>

      {isPaused && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40">
          <span className="rounded-full bg-white/10 px-[4vmin] py-[1.6vmin] text-[3.4vmin] font-bold text-white backdrop-blur-sm">توقف مؤقت</span>
        </div>
      )}

      <LaneControls showFire />
    </div>
  );
}

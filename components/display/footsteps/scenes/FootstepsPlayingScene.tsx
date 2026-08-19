"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { FootstepsStageRuntime, NormalizedPosition } from "@/lib/footsteps";
import { StartZoneMarker } from "@/components/display/startZone/StartZoneMarker";
import type { DisplayEventListener } from "@/components/display/events";
import { StepStarBurst } from "../celebration/StepStarBurst";
import { DestinationStar } from "../path/DestinationStar";
import { CheckpointStar } from "../path/CheckpointStar";
import { PathTrail } from "../path/PathTrail";
import { FootprintArt, type FootprintVisualState } from "../footprints/FootprintArt";
import { ObstacleArt } from "../obstacles/ObstacleArt";

interface FootstepsPlayingSceneProps {
  stage: FootstepsStageRuntime;
  onEvent: DisplayEventListener;
  isPaused?: boolean;
  onFinalActionSettled?: () => void;
}

/** How long the local per-step star burst stays mounted before clearing itself — task section 30. */
const STEP_BURST_DURATION_MS = 950;

/**
 * The core cosmic gameplay screen. Renders the REAL generated footprints at
 * their engine-defined normalized positions — never invents its own
 * layout, same "never guess the layout" discipline as Balloon Quest's
 * BalloonField. ONE TARGET AT A TIME (task sections 7-9, 46): only the
 * current target is ever shown as a real, confirmable target. Everything
 * beyond it stays hidden — CONTROL's own map (FootMap.tsx) is where the
 * therapist can still see the fuller picture. Completed footprints settle
 * into the glowing PathTrail behind the child. There is no tappable UI here
 * — THERAPIST = interaction authority; this scene is read-only, driven
 * entirely by canonical state.
 *
 * ROUTE ARCHITECTURE REWRITE — ADVANCED stages may also have a cosmic
 * obstacle (task section 17): while active, it renders ALONGSIDE the current
 * footprint (never replacing it, never revealing more of the future path)
 * so the child sees both "the obstacle" and "the next place to go."
 */
export function FootstepsPlayingScene({ stage, onEvent, isPaused = false, onFinalActionSettled }: FootstepsPlayingSceneProps) {
  // Diffs stage.currentIndex against its previous value to detect a
  // therapist-confirmed target — the same "derive the moment from a state
  // diff, never from a local tap" discipline Balloon Quest's BalloonField
  // uses to detect a newly-popped balloon in realtime mode.
  const previousIndexRef = useRef(stage.currentIndex);
  const stageIdentityRef = useRef(stageIdentity(stage));
  // The just-confirmed target's position gets a local star burst (task
  // sections 27-30) — cleared automatically after its own duration, never
  // accumulating (task section 50).
  const [stepBurst, setStepBurst] = useState<{ key: number; position: NormalizedPosition; big: boolean } | null>(null);
  const burstKeyRef = useRef(0);

  useEffect(() => {
    const identity = stageIdentity(stage);
    if (identity !== stageIdentityRef.current) {
      // A genuinely new/restarted stage — reset the baseline without firing
      // a stale confirm event for whatever index this stage happens to start at.
      stageIdentityRef.current = identity;
      previousIndexRef.current = stage.currentIndex;
      return;
    }
    if (stage.currentIndex === previousIndexRef.current) return;
    const confirmedIndex = previousIndexRef.current;
    const confirmedFootprint = stage.footprints.find((f) => f.index === confirmedIndex);
    previousIndexRef.current = stage.currentIndex;
    if (!confirmedFootprint) return;

    onEvent({
      type: "footstep_confirm",
      timestamp: Date.now(),
      foot: confirmedFootprint.foot,
      stepIndex: confirmedIndex,
      totalSteps: stage.totalSteps,
    });

    const crossedCheckpoint = stage.checkpoints.find((c) => c.afterTargetIndex === confirmedIndex);
    if (crossedCheckpoint) {
      onEvent({ type: "footsteps_checkpoint_reached", timestamp: Date.now() });
    }

    // ROUTE ARCHITECTURE REWRITE — an obstacle "activates" the moment the
    // target just before it is confirmed (the child is now walking toward
    // the target just past it), and "clears" the moment THAT target is
    // confirmed — the same therapist confirmation that already advances the
    // route, no separate action (task section 13).
    const activatedObstacle = stage.obstacles.find((o) => o.afterTargetIndex === confirmedIndex);
    if (activatedObstacle) {
      onEvent({ type: "footsteps_obstacle_active", timestamp: Date.now(), obstacleId: activatedObstacle.id, kind: activatedObstacle.kind });
    }
    const clearedObstacle = stage.obstacles.find((o) => o.afterTargetIndex === confirmedIndex - 1);
    if (clearedObstacle) {
      onEvent({ type: "footsteps_obstacle_cleared", timestamp: Date.now(), obstacleId: clearedObstacle.id, kind: clearedObstacle.kind });
    }

    // Halfway milestone and the final step (task sections 33-34) both get the larger shower.
    const isHalfwayMilestone = stage.totalSteps > 0 && confirmedIndex + 1 === Math.ceil(stage.totalSteps / 2);
    const isFinalStep = confirmedIndex + 1 === stage.totalSteps;
    burstKeyRef.current += 1;
    setStepBurst({ key: burstKeyRef.current, position: confirmedFootprint.position, big: isHalfwayMilestone || isFinalStep || Boolean(crossedCheckpoint) });
    if (isFinalStep && onFinalActionSettled) {
      const settle = window.setTimeout(onFinalActionSettled, STEP_BURST_DURATION_MS);
      return () => window.clearTimeout(settle);
    }
    // Re-runs whenever the canonical currentIndex changes; onEvent identity isn't a meaningful dependency here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.currentIndex, onFinalActionSettled]);

  useEffect(() => {
    if (!stepBurst) return;
    const timer = setTimeout(() => setStepBurst((current) => (current?.key === stepBurst.key ? null : current)), STEP_BURST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [stepBurst]);

  // VOICE COVERAGE: the "توقف مؤقت" overlay below is visible Arabic text the
  // child can't be expected to read — speak it once on the false->true
  // transition, never on every render.
  const wasPausedRef = useRef(isPaused);
  useEffect(() => {
    if (isPaused && !wasPausedRef.current) onEvent({ type: "paused", timestamp: Date.now() });
    wasPausedRef.current = isPaused;
  }, [isPaused, onEvent]);

  const progress = stage.totalSteps === 0 ? 0 : stage.currentIndex / stage.totalSteps;
  const completedPoints = stage.footprints.filter((f) => f.index < stage.currentIndex).map((f) => f.position);
  // ROUTE ARCHITECTURE REWRITE — the obstacle whose "before" target was just
  // confirmed and whose "after" target hasn't been yet — see the confirm
  // effect above for the matching active/cleared event timing.
  const activeObstacle = stage.obstacles.find((o) => o.afterTargetIndex + 1 === stage.currentIndex);

  return (
    <div className="relative h-full w-full">
      <StartZoneMarker variant="subdued" />

      <PathTrail points={completedPoints} />

      {stage.checkpoints.map((checkpoint) => (
        <div
          key={checkpoint.id}
          className="absolute"
          style={{ left: `${checkpoint.position.x * 100}%`, top: `${checkpoint.position.y * 100}%` }}
        >
          <CheckpointStar activated={stage.currentIndex > checkpoint.afterTargetIndex} />
        </div>
      ))}

      <div className="absolute" style={{ left: `${stage.destination.x * 100}%`, top: `${stage.destination.y * 100}%` }}>
        <DestinationStar progress={progress} activated={stage.currentIndex >= stage.totalSteps} stageNumber={stage.stageNumber} />
      </div>

      {activeObstacle && (
        <div
          className="absolute"
          style={{
            left: `${activeObstacle.position.x * 100}%`,
            top: `${activeObstacle.position.y * 100}%`,
            width: "clamp(34px, 11cqmin, 17vmin)",
            height: "clamp(34px, 11cqmin, 17vmin)",
            transform: `translate(-50%, -50%) rotate(${activeObstacle.rotationDeg}deg)`,
          }}
        >
          <ObstacleArt kind={activeObstacle.kind} />
        </div>
      )}

      <AnimatePresence>
        {stepBurst && (
          <div
            key={stepBurst.key}
            className="absolute"
            style={{
              left: `${stepBurst.position.x * 100}%`,
              top: `${stepBurst.position.y * 100}%`,
              width: "clamp(28px, 9cqmin, 15vmin)",
              height: "clamp(28px, 9cqmin, 15vmin)",
              transform: "translate(-50%, -50%)",
            }}
          >
            <StepStarBurst big={stepBurst.big} />
          </div>
        )}
      </AnimatePresence>

      {stage.footprints.map((footprint) => {
        const state = footprintVisualState(footprint.index, stage.currentIndex);
        if (state === null) return null; // remaining future path stays hidden — see task section 8
        return (
          <div
            key={footprint.id}
            className="absolute"
            style={{
              left: `${footprint.position.x * 100}%`,
              top: `${footprint.position.y * 100}%`,
              width: state === "current" ? "clamp(38px, 12cqmin, 19vmin)" : "clamp(22px, 6.5cqmin, 11vmin)",
              height: state === "current" ? "clamp(38px, 12cqmin, 19vmin)" : "clamp(22px, 6.5cqmin, 11vmin)",
              transform: `translate(-50%, -50%) rotate(${footprint.rotationDeg}deg)`,
            }}
          >
            <FootprintArt foot={footprint.foot} state={state} />
          </div>
        );
      })}

      {isPaused && (
        <motion.div
          className="absolute inset-0 flex flex-col items-center justify-center gap-[2vmin] bg-indigo-950/45 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <span className="text-[10vmin]" aria-hidden="true">
            ⏸
          </span>
          <span className="text-[3.4vmin] font-bold text-white drop-shadow-[0_3px_14px_rgba(20,15,60,0.4)]">توقف مؤقت</span>
        </motion.div>
      )}
    </div>
  );
}

function stageIdentity(stage: FootstepsStageRuntime): string {
  return `${stage.difficulty}:${stage.stageNumber}:${stage.footprints[0]?.id ?? ""}:${stage.startedAt ?? "null"}`;
}

function footprintVisualState(index: number, currentIndex: number): FootprintVisualState | null {
  if (index < currentIndex) return "completed";
  if (index === currentIndex) return "current";
  return null; // the rest of the path stays hidden on Display — task section 8
}

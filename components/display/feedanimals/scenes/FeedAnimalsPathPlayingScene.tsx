"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Animal,
  feedAnimalsObstacleRequiresJump,
  Food,
  getFeedAnimalsPathStage,
  sampleFeedAnimalsPathPosition,
  type FeedAnimalsPathLeg,
  type FeedAnimalsStageRuntime,
} from "@/lib/feedanimals";
import type { DisplayEventListener } from "@/components/display/events";
import { AnimalWalker, type AnimalWalkerState } from "../animals/AnimalWalker";
import { PathAnimalWalker } from "../animals/PathAnimalWalker";
import { WaterFeature } from "../environment/WaterFeature";
import { GoalArt } from "../food/GoalArt";
import { ObstacleArt } from "../obstacles/ObstacleArt";
import { SafariTrail } from "../path/SafariTrail";
import { facingForPathMovement } from "../path/pathAlignment";

interface FeedAnimalsPathPlayingSceneProps {
  stage: FeedAnimalsStageRuntime;
  childFirstName: string;
  onEvent: DisplayEventListener;
  isPaused?: boolean;
  onFinalActionSettled?: () => void;
}

/** How long the "walking" pose holds after each press, before settling back to idle — long enough to read as one clear step, short enough that a quick run of presses never looks stuck. */
const WALK_POSE_MS = 500;
/** How long a just-finished leg's animal takes to travel to the Safari gathering area before its transient sprite is removed. */
const GATHER_TRAVEL_MS = 900;

function initialFacingForLeg(leg: FeedAnimalsPathLeg | null): "left" | "right" {
  if (!leg) return "right";
  const start = sampleFeedAnimalsPathPosition(leg, 0).position;
  const next = sampleFeedAnimalsPathPosition(leg, Math.min(1, leg.totalSteps)).position;
  return facingForPathMovement(start, next, "right");
}

const ANIMAL_NAME_AR: Record<Animal, string> = {
  [Animal.MONKEY]: "القرد",
  [Animal.RABBIT]: "الأرنب",
  [Animal.PANDA]: "الباندا",
  [Animal.ELEPHANT]: "الفيل",
  [Animal.GIRAFFE]: "الزرافة",
};
// Bare (article-free) nouns — combined below as "لل" + noun, the correct written elision of "ل" ("to/for") + "الـ" (the definite article), e.g. "لل" + "موز" = "للموز".
const FOOD_NAME_BARE_AR: Record<Food, string> = {
  [Food.BANANA]: "موز",
  [Food.CARROT]: "جزر",
  [Food.BAMBOO]: "خيزران",
  [Food.WATERMELON]: "بطيخ",
  [Food.LEAVES]: "أوراق",
};

/** Fixed, hand-placed gathering-area slots along the upper-left edge — never overlapping the reserved bottom control strip or the top instruction band. */
function gatherSlot(index: number): { x: number; y: number } {
  return { x: 0.07, y: 0.14 + index * 0.09 };
}

interface GatherBurst {
  id: string;
  animal: Animal;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

/**
 * SAFARI ANIMAL ADVENTURE — the "control the animal along a hand-designed
 * route" mechanic's own core gameplay screen, generalized over every animal/
 * food/obstacle/multi-leg stage (originally Stage 1's monkey-only
 * prototype). Renders the REAL current stage.legIndex/pathProgressStep at
 * the engine's own sampled position (lib/feedanimals/pathStages.ts) — never
 * invents its own layout. No tappable UI here — THERAPIST = interaction
 * authority (see AnimalFoodMap.tsx's doc comment); the LEFT/RIGHT/JUMP pads
 * rendered at the bottom are the wall's own visual affordance for the child
 * to reach toward, driven purely by state diffing, never a click target
 * themselves.
 */
export function FeedAnimalsPathPlayingScene({ stage, childFirstName, onEvent, isPaused = false, onFinalActionSettled }: FeedAnimalsPathPlayingSceneProps) {
  const pathDef = getFeedAnimalsPathStage(stage.difficulty, stage.stageNumber);
  const activeLeg: FeedAnimalsPathLeg | null = pathDef ? pathDef.legs[Math.min(stage.legIndex, pathDef.legs.length - 1)] : null;

  const [walkState, setWalkState] = useState<AnimalWalkerState>("idle");
  const [facing, setFacing] = useState<"left" | "right">(() => initialFacingForLeg(activeLeg));
  const [padPulse, setPadPulse] = useState<{ direction: "left" | "right" | "jump"; token: number } | null>(null);
  const [arrived, setArrived] = useState(false);
  const [bursts, setBursts] = useState<GatherBurst[]>([]);

  const previousLegIndexRef = useRef(stage.legIndex);
  const previousStepRef = useRef(stage.pathProgressStep);
  const walkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announcedLegRef = useRef<number | null>(null);
  const arrivalFiredRef = useRef(false);
  const cuedObstacleKeyRef = useRef<string | null>(null);

  // Announce the active leg's own request once — on mount, and again every time a new leg's animal takes over (task's "one animal at a time," each with its own spoken request).
  useEffect(() => {
    if (!activeLeg || announcedLegRef.current === stage.legIndex) return;
    announcedLegRef.current = stage.legIndex;
    onEvent({ type: "feed_animals_path_request", timestamp: Date.now(), childName: childFirstName, animal: activeLeg.animal, food: activeLeg.food });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.legIndex]);

  useEffect(() => {
    if (!pathDef || !activeLeg) return;
    const prevLeg = previousLegIndexRef.current;
    const prevStep = previousStepRef.current;
    previousLegIndexRef.current = stage.legIndex;
    previousStepRef.current = stage.pathProgressStep;

    if (stage.legIndex > prevLeg) {
      // MULTI-ANIMAL STAGES — the previous leg's animal just reached ITS destination, but this isn't the stage's last leg. Local reward, then it joins the gathering area while the next animal's own leg begins.
      const finishedLeg = pathDef.legs[prevLeg];
      const wasJump = finishedLeg.obstacles.some((o) => o.atStep === finishedLeg.totalSteps && feedAnimalsObstacleRequiresJump(o.kind));
      onEvent({ type: "feed_animals_monkey_step", timestamp: Date.now(), direction: wasJump ? "jump" : "right", animal: finishedLeg.animal });
      onEvent({ type: "feed_animals_fed", timestamp: Date.now() });
      window.setTimeout(() => onEvent({ type: "feed_animals_animal_reaction", timestamp: Date.now(), animal: finishedLeg.animal }), 500);
      onEvent({ type: "feed_animals_leg_complete", timestamp: Date.now(), animal: finishedLeg.animal, legIndex: prevLeg, totalLegs: pathDef.legs.length });
      onEvent({ type: "feed_animals_correct", timestamp: Date.now(), correctCount: prevLeg + 1, totalRounds: pathDef.legs.length });

      const destination = finishedLeg.waypoints[finishedLeg.waypoints.length - 1];
      const slot = gatherSlot(prevLeg);
      const burstId = `leg-${prevLeg}-${Date.now()}`;
      setBursts((prev) => [...prev, { id: burstId, animal: finishedLeg.animal, fromX: destination.x, fromY: destination.y, toX: slot.x, toY: slot.y }]);
      window.setTimeout(() => setBursts((prev) => prev.filter((b) => b.id !== burstId)), GATHER_TRAVEL_MS + 100);

      cuedObstacleKeyRef.current = null;
      setWalkState("idle");
      setFacing(initialFacingForLeg(activeLeg));
      return;
    }

    if (stage.pathProgressStep === prevStep) return; // blocked-by-obstacle or unnecessary-jump no-op — no visible reaction, never a punishment.

    const movingForward = stage.pathProgressStep > prevStep;
    const crossedStep = stage.pathProgressStep;
    const direction: "left" | "right" | "jump" = !movingForward
      ? "left"
      : activeLeg.obstacles.some((o) => o.atStep === crossedStep && feedAnimalsObstacleRequiresJump(o.kind))
        ? "jump"
        : "right";

    const previousPosition = sampleFeedAnimalsPathPosition(activeLeg, prevStep).position;
    const currentPosition = sampleFeedAnimalsPathPosition(activeLeg, stage.pathProgressStep).position;
    setFacing((currentFacing) => facingForPathMovement(previousPosition, currentPosition, currentFacing));
    setPadPulse({ direction, token: Date.now() });
    onEvent({ type: "feed_animals_monkey_step", timestamp: Date.now(), direction, animal: activeLeg.animal });

    const isFinalArrival = stage.legIndex === pathDef.legs.length - 1 && stage.pathProgressStep >= activeLeg.totalSteps;
    if (isFinalArrival) {
      if (!arrivalFiredRef.current) {
        arrivalFiredRef.current = true;
        setArrived(true);
        setWalkState("celebrating");
        onEvent({ type: "feed_animals_fed", timestamp: Date.now() });
        window.setTimeout(() => onEvent({ type: "feed_animals_animal_reaction", timestamp: Date.now(), animal: activeLeg.animal }), 500);
        onEvent({ type: "feed_animals_correct", timestamp: Date.now(), correctCount: pathDef.legs.length, totalRounds: pathDef.legs.length });
        finalSettleTimerRef.current = setTimeout(() => onFinalActionSettled?.(), 1_100);
      }
      return;
    }

    setWalkState("walking");
    if (walkTimerRef.current) clearTimeout(walkTimerRef.current);
    walkTimerRef.current = setTimeout(() => setWalkState("idle"), WALK_POSE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.legIndex, stage.pathProgressStep]);

  // JUMP CUE — the first time the active animal is exactly one step from a jump-requiring obstacle, fire the spoken/visible "اقفز!" cue once (never repeated for the same obstacle).
  const upcomingObstacle = activeLeg?.obstacles.find((o) => o.atStep === stage.pathProgressStep + 1 && feedAnimalsObstacleRequiresJump(o.kind)) ?? null;
  useEffect(() => {
    if (!activeLeg || !upcomingObstacle) return;
    const key = `${stage.legIndex}:${upcomingObstacle.atStep}`;
    if (cuedObstacleKeyRef.current === key) return;
    cuedObstacleKeyRef.current = key;
    onEvent({ type: "feed_animals_jump_cue", timestamp: Date.now(), animal: activeLeg.animal });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.legIndex, stage.pathProgressStep, upcomingObstacle?.atStep]);

  useEffect(
    () => () => {
      if (walkTimerRef.current) clearTimeout(walkTimerRef.current);
      if (finalSettleTimerRef.current) clearTimeout(finalSettleTimerRef.current);
    },
    [],
  );

  const wasPausedRef = useRef(isPaused);
  useEffect(() => {
    if (isPaused && !wasPausedRef.current) onEvent({ type: "paused", timestamp: Date.now() });
    wasPausedRef.current = isPaused;
  }, [isPaused, onEvent]);

  if (!pathDef || !activeLeg) return null;

  const animalSample = sampleFeedAnimalsPathPosition(activeLeg, stage.pathProgressStep);
  const destination = activeLeg.waypoints[activeLeg.waypoints.length - 1];
  const isMultiLeg = pathDef.legs.length > 1;
  const legHasJump = activeLeg.obstacles.some((o) => feedAnimalsObstacleRequiresJump(o.kind));

  return (
    <div className="relative h-full w-full">
      {activeLeg.waterFeature && <WaterFeature feature={activeLeg.waterFeature} />}
      <SafariTrail leg={activeLeg} />

      {/* Obstacles — clear vector art, a soft pulsing glow only on the one the animal is actually approaching. */}
      {activeLeg.obstacles.map((obstacle, i) => {
        const sample = sampleFeedAnimalsPathPosition(activeLeg, obstacle.atStep);
        const cleared = stage.pathProgressStep >= obstacle.atStep;
        const active = !cleared && feedAnimalsObstacleRequiresJump(obstacle.kind) && obstacle.atStep === stage.pathProgressStep + 1;
        return (
          <div
            key={`${stage.legIndex}-obstacle-${i}`}
            className="absolute"
            style={{
              left: `${sample.position.x * 100}%`,
              top: `${sample.position.y * 100}%`,
              width: "clamp(56px, 12cqmin, 13vmin)",
              height: "clamp(36px, 7.5cqmin, 8.4vmin)",
              transform: "translate(-50%, -50%)",
            }}
          >
            <ObstacleArt kind={obstacle.kind} headingDeg={sample.headingDeg} active={active} cleared={cleared} />
          </div>
        );
      })}

      {/* Visible instruction — voice + text, never dominating the world. */}
      <div className="pointer-events-none absolute inset-x-0 top-[3%] flex justify-center px-6">
        <span className="rounded-full border border-white/25 bg-white/12 px-[3.6vmin] py-[1.4vmin] text-[3vmin] font-extrabold text-white shadow-[0_8px_28px_rgba(90,60,10,0.35)] backdrop-blur-sm">
          ساعد {ANIMAL_NAME_AR[activeLeg.animal]} يوصل لل{FOOD_NAME_BARE_AR[activeLeg.food]}!
        </span>
      </div>

      {/* Jump cue banner — only while a jump-requiring obstacle is the very next step. Anchored to the OBSTACLE's own on-screen position (never a fixed band) so it can never collide with the destination goal art on a short leg whose obstacle sits close to it. */}
      <AnimatePresence>
        {upcomingObstacle &&
          (() => {
            const cueSample = sampleFeedAnimalsPathPosition(activeLeg, upcomingObstacle.atStep);
            return (
              <motion.div
                className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-full justify-center"
                style={{ left: `${cueSample.position.x * 100}%`, top: `${Math.max(3, cueSample.position.y * 100 - 9)}%` }}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <span className="rounded-full bg-emerald-600/85 px-[3vmin] py-[1vmin] text-[3.4vmin] font-extrabold whitespace-nowrap text-white shadow-lg">اقفز!</span>
              </motion.div>
            );
          })()}
      </AnimatePresence>

      {/* Destination goal art. */}
      <div
        key={`goal-${stage.legIndex}`}
        className="absolute"
        style={{
          left: `${destination.x * 100}%`,
          top: `${destination.y * 100}%`,
          width: "clamp(70px, 15cqmin, 18vmin)",
          height: "clamp(70px, 15cqmin, 18vmin)",
          transform: "translate(-50%, -70%)",
        }}
      >
        <GoalArt food={activeLeg.food} celebrating={arrived} />
      </div>

      {/* Arrival particle burst — local to the destination, only on the FINAL leg's real arrival. */}
      <AnimatePresence>{arrived && <ArrivalBurst x={destination.x} y={destination.y} />}</AnimatePresence>

      {/* Safari gathering area — every animal whose own leg is already finished (task's "completed animals move to a visible gathering area"). */}
      {isMultiLeg &&
        pathDef.legs.slice(0, stage.legIndex).map((leg, i) => {
          const slot = gatherSlot(i);
          return (
            <div
              key={`gathered-${i}`}
              className="absolute"
              style={{
                left: `${slot.x * 100}%`,
                top: `${slot.y * 100}%`,
                width: "clamp(30px, 6.4cqmin, 7.4vmin)",
                height: "clamp(42px, 9cqmin, 10.4vmin)",
                transform: "translate(-50%, -50%)",
              }}
            >
              <AnimalWalker animal={leg.animal} state="idle" />
            </div>
          );
        })}

      {/* Transient burst — the just-finished animal traveling to its gathering slot. */}
      <AnimatePresence>
        {bursts.map((b) => (
          <motion.div
            key={b.id}
            className="absolute"
            style={{ width: "clamp(56px, 12cqmin, 14vmin)", height: "clamp(78px, 17cqmin, 20vmin)", transform: "translate(-50%, -80%)" }}
            initial={{ left: `${b.fromX * 100}%`, top: `${b.fromY * 100}%`, opacity: 1, scale: 1 }}
            animate={{ left: `${b.toX * 100}%`, top: `${b.toY * 100}%`, opacity: 0, scale: 0.35 }}
            exit={{ opacity: 0 }}
            transition={{ duration: GATHER_TRAVEL_MS / 1000, ease: "easeInOut" }}
          >
            <AnimalWalker animal={b.animal} state="celebrating" />
          </motion.div>
        ))}
      </AnimatePresence>

      {/* The active animal — sampled from the engine's own real progress, never a locally-invented position. Keyed by legIndex so a new leg's different animal fades in cleanly rather than sliding over from the previous one's finish line. */}
      <PathAnimalWalker
        key={`animal-${stage.legIndex}`}
        animal={activeLeg.animal}
        sample={animalSample}
        state={walkState}
        facing={facing}
        transitionSeconds={WALK_POSE_MS / 1000}
      />

      {/* Reachable control pads — the wall's own LEFT/RIGHT/JUMP affordance. Purely a visual/reaction surface here; the therapist's own tap on /control is the actual interaction authority. JUMP only ever renders when this leg genuinely has a jump-requiring obstacle. */}
      <ControlPadStrip pulse={padPulse} showJump={legHasJump} />

      {isPaused && (
        <motion.div
          className="absolute inset-0 flex flex-col items-center justify-center gap-[2vmin] bg-amber-950/35 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <span className="text-[10vmin]" aria-hidden="true">
            ⏸
          </span>
          <span className="text-[3.4vmin] font-bold text-white drop-shadow-[0_3px_14px_rgba(80,50,10,0.4)]">توقف مؤقت</span>
        </motion.div>
      )}
    </div>
  );
}

function ArrivalBurst({ x, y }: { x: number; y: number }) {
  const particles = Array.from({ length: 16 }, (_, i) => i);
  return (
    <div className="pointer-events-none absolute inset-0">
      <motion.span
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left: `${x * 100}%`, top: `${y * 100}%`, background: "radial-gradient(circle, rgba(255,214,140,0.55) 0%, rgba(255,214,140,0) 70%)" }}
        initial={{ width: "6vmin", height: "6vmin", opacity: 0 }}
        animate={{ width: "30vmin", height: "30vmin", opacity: [0, 0.85, 0] }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      />
      {particles.map((i) => {
        const angle = (i / particles.length) * Math.PI * 2;
        const isLeaf = i % 2 === 0;
        const spread = 30 + (i % 3) * 12;
        return (
          <motion.span
            key={i}
            className="absolute h-[1.6vmin] w-[1.6vmin] -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
            initial={{ x: 0, y: 0, opacity: 0, rotate: 0 }}
            animate={{ x: Math.cos(angle) * spread, y: Math.sin(angle) * spread - 10, opacity: [0, 1, 0], rotate: isLeaf ? 160 : 0 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          >
            {isLeaf ? (
              <svg viewBox="0 0 20 20" className="h-full w-full">
                <path d="M10 2 C16 4 18 10 14 16 C12 13 8 8 10 2 Z" fill="#7AAE4A" />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" className="h-full w-full">
                <path d="M10 1l2.4 5.2 5.6.6-4.2 3.9 1.2 5.6L10 13.4l-4.9 2.9 1.2-5.6-4.2-3.9 5.6-.6z" fill="#F7D373" />
              </svg>
            )}
          </motion.span>
        );
      })}
    </div>
  );
}

function ControlPadStrip({ pulse, showJump }: { pulse: { direction: "left" | "right" | "jump"; token: number } | null; showJump: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-[18%] items-center justify-between gap-[2.4vmin] px-[5vmin] pb-[1.5vmin]">
      <ControlPad kind="right" active={pulse?.direction === "right"} activeToken={pulse?.token} />
      {showJump && <ControlPad kind="jump" active={pulse?.direction === "jump"} activeToken={pulse?.token} />}
      <ControlPad kind="left" active={pulse?.direction === "left"} activeToken={pulse?.token} />
    </div>
  );
}

function ControlPad({ kind, active, activeToken }: { kind: "left" | "right" | "jump"; active: boolean; activeToken?: number }) {
  return (
    <motion.div
      key={active ? activeToken : "rest"}
      className="relative flex h-full w-[22vmin] max-w-[30%] items-center justify-center rounded-[3vmin] border-2"
      style={{
        borderColor: kind === "jump" ? "rgba(210,255,222,0.6)" : "rgba(255,244,220,0.55)",
        background:
          kind === "jump"
            ? "linear-gradient(180deg, rgba(50,130,80,0.6) 0%, rgba(20,70,45,0.68) 100%)"
            : "linear-gradient(180deg, rgba(150,100,50,0.55) 0%, rgba(90,60,28,0.65) 100%)",
        boxShadow: "inset 0 0.4vmin 1.2vmin rgba(255,220,160,0.25), 0 0.6vmin 1.4vmin rgba(40,25,10,0.35)",
      }}
      animate={active ? { scale: [1, 0.9, 1.03, 1] } : { scale: 1 }}
      transition={{ duration: 0.4 }}
    >
      <motion.div
        className="absolute inset-0 rounded-[3vmin]"
        style={{ background: "radial-gradient(circle, rgba(255,224,150,0.55) 0%, rgba(255,224,150,0) 70%)" }}
        animate={active ? { opacity: [0, 0.9, 0] } : { opacity: 0 }}
        transition={{ duration: 0.5 }}
      />
      {kind === "jump" ? (
        <svg viewBox="0 0 40 40" className="relative h-[7vmin] w-[7vmin]">
          <path d="M20 32 V12 M20 12 L12 20 M20 12 L28 20" fill="none" stroke="#E4FBEA" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 40 40" className="relative h-[8vmin] w-[8vmin]" style={{ transform: kind === "left" ? "scaleX(-1)" : undefined }}>
          <path d="M15 8 L29 20 L15 32" fill="none" stroke="#FBEBCF" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </motion.div>
  );
}

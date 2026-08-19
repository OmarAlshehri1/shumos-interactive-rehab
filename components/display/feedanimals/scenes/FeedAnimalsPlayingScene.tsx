"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { currentRound, type FeedAnimalsStageRuntime, type FeedRound } from "@/lib/feedanimals";
import type { DisplayEventListener } from "@/components/display/events";
import { AnimalArt } from "../animals/AnimalArt";
import { FoodArt } from "../food/FoodArt";

interface FeedAnimalsPlayingSceneProps {
  stage: FeedAnimalsStageRuntime;
  childFirstName: string;
  onEvent: DisplayEventListener;
  externalIncorrectSignal?: { foodChoiceId: string; token: number } | null;
  isPaused?: boolean;
  onFinalActionSettled?: () => void;
}

interface JustFed {
  round: FeedRound;
  choiceId: string;
  token: number;
  big: boolean;
}

/**
 * The core safari gameplay screen (task section 12, 26-27). Renders the
 * REAL current round at the engine's own normalized positions — never
 * invents its own layout, same "never guess the layout" discipline as every
 * other game. There is no tappable UI here — THERAPIST = interaction
 * authority; this scene is read-only, driven entirely by canonical state.
 *
 * A correct feed is derived by diffing `stage.rounds` against its previous
 * render (same technique Bubble Pop Wall's BubblePopPlayingScene uses) —
 * once detected, the chosen food arcs smoothly toward the animal (task
 * section 26) while the NEXT round's animal/choices are already showing
 * underneath, so the reward moment never blocks the next request. An
 * INCORRECT tap has no persistent per-choice field to diff, so
 * `externalIncorrectSignal` carries that separately, same pattern as every
 * other game's PlayingScene.
 */
export function FeedAnimalsPlayingScene({ stage, childFirstName, onEvent, externalIncorrectSignal, isPaused = false, onFinalActionSettled }: FeedAnimalsPlayingSceneProps) {
  const previousRoundsRef = useRef<FeedRound[]>(stage.rounds);
  const [justFed, setJustFed] = useState<JustFed | null>(null);

  useEffect(() => {
    const previous = previousRoundsRef.current;
    const newlyFedIndex = stage.rounds.findIndex((r, i) => r.fed && !previous[i]?.fed);
    previousRoundsRef.current = stage.rounds;
    if (newlyFedIndex === -1) return;

    const round = stage.rounds[newlyFedIndex];
    const choice = round.choices.find((c) => c.food === round.correctFood);
    if (!choice) return;

    // The final feed of a stage gets the larger local reward chain (task section 13's "final
    // target: larger local pop" principle, applied here) — same "was this the last one" shape as
    // Bubble Pop Wall's isFinalPop and Follow the Footsteps' isFinalStep.
    const isFinalRound = newlyFedIndex + 1 >= stage.rounds.length;
    setJustFed({ round, choiceId: choice.id, token: Date.now(), big: isFinalRound });
    onEvent({ type: "feed_animals_fed", timestamp: Date.now() });
    onEvent({ type: "feed_animals_correct", timestamp: Date.now(), correctCount: newlyFedIndex + 1, totalRounds: stage.rounds.length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.rounds]);

  const round = currentRound(stage);

  // Announces the CURRENT round's animal + requested food — task section
  // 12/30's core spoken instruction. Fires once when a new round becomes
  // active (mount, and every time currentRoundIndex advances).
  const announcedRoundIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!round || round.id === announcedRoundIdRef.current) return;
    announcedRoundIdRef.current = round.id;
    onEvent({ type: "feed_animals_request", timestamp: Date.now(), childName: childFirstName, animal: round.animal, food: round.correctFood });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.id]);

  const lastSeenIncorrectSignalRef = useRef(externalIncorrectSignal ?? null);
  useEffect(() => {
    if (!externalIncorrectSignal || externalIncorrectSignal === lastSeenIncorrectSignalRef.current) return;
    lastSeenIncorrectSignalRef.current = externalIncorrectSignal;
    onEvent({ type: "feed_animals_incorrect", timestamp: Date.now() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalIncorrectSignal]);

  // VOICE COVERAGE: the "توقف مؤقت" overlay below is visible Arabic text the
  // child can't be expected to read — speak it once on the false->true
  // transition, never on every render.
  const wasPausedRef = useRef(isPaused);
  useEffect(() => {
    if (isPaused && !wasPausedRef.current) onEvent({ type: "paused", timestamp: Date.now() });
    wasPausedRef.current = isPaused;
  }, [isPaused, onEvent]);

  const isWobbling = (choiceId: string) => externalIncorrectSignal?.foodChoiceId === choiceId;

  return (
    <div className="relative h-full w-full">
      {round && (
        <>
          <div
            className="absolute"
            style={{
              left: `${round.animalPosition.x * 100}%`,
              top: `${round.animalPosition.y * 100}%`,
              width: "clamp(90px, 20cqmin, 26vmin)",
              height: "clamp(90px, 20cqmin, 26vmin)",
              transform: "translate(-50%, -50%)",
            }}
          >
            <AnimalArt animal={round.animal} />
          </div>

          {round.choices.map((choice) => {
            const wobbling = isWobbling(choice.id);
            return (
              <motion.div
                key={choice.id}
                className="absolute"
                style={{
                  left: `${choice.position.x * 100}%`,
                  top: `${choice.position.y * 100}%`,
                  width: `clamp(28px, ${choice.size * 100}cqmin, 20vmin)`,
                  height: `clamp(28px, ${choice.size * 100}cqmin, 20vmin)`,
                  transform: "translate(-50%, -50%)",
                }}
                animate={wobbling ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
                transition={{ duration: 0.4 }}
              >
                <FoodArt food={choice.food} />
              </motion.div>
            );
          })}
        </>
      )}

      <AnimatePresence>
        {justFed && (
          <FoodDeliveryFx
            key={justFed.token}
            round={justFed.round}
            choiceId={justFed.choiceId}
            big={justFed.big}
            onEvent={onEvent}
            onDone={() => {
              const wasFinal = justFed.big;
              setJustFed(null);
              if (wasFinal) onFinalActionSettled?.();
            }}
          />
        )}
      </AnimatePresence>

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

/** How long the food's own arc takes to reach the animal — the moment the character-specific accent sound (task section 16) fires. */
const ARC_DURATION_MS = 700;
/** Delay + duration of the animal-arrival sparkle burst below — kept in sync with FULL_CHAIN_DURATION_MS. */
const SPARKLE_DELAY_MS = 550;
const SPARKLE_DURATION_MS = 750;
/** Total local reward chain length (food glow -> arc -> animal sparkles) — the unmount timer below
 * must never fire before this, or the sparkle tail gets cut off on every single correct feed (the
 * bug this pass fixes: the old 1050ms timer fired before the sparkle burst's own 1300ms finish). */
const FULL_CHAIN_DURATION_MS = SPARKLE_DELAY_MS + SPARKLE_DURATION_MS;

/**
 * FOOD-TO-ANIMAL DELIVERY (task section 12/20/26) — the main reward moment,
 * now explicitly the two connected beats task section 14 asks for: "I chose
 * correctly" (a glow/pulse + small burst at the FOOD's own position, the
 * instant the choice is confirmed) then "I helped the animal" (the arc,
 * the animal's own happy reaction, and a second, richer celebration around
 * the animal). No teleporting — always a smooth, visible arc.
 *
 * PRESENTATION-CONSISTENCY PASS: previously only 6 sparkles at the animal
 * and no feedback at all at the food's own position — short of the shared
 * "15-25 local particles" quality bar and missing the food-side half of the
 * two-beat reward the spec calls for. Also previously self-truncated: the
 * unmount timer (1050ms) fired BEFORE the sparkle burst's own animation
 * finished (delay 550ms + duration 750ms = 1300ms), cutting off the tail of
 * every single correct feed — not just a Stage Complete boundary issue.
 * Both fixed below; `big` (the final feed of a stage) scales the reward up
 * further, mirroring Bubble Pop Wall's BubblePopFx `big` and Follow the
 * Footsteps' StepStarBurst `big`.
 *
 * The celebrating <AnimalArt> rendered here must never `animate` a raw SVG
 * geometry attribute (`d`, `cx`, `cy`, `r`, ...) directly — Motion (v13, see
 * package.json) reliably threw "attribute d/cx: ... undefined" console
 * errors the instant such a keyframe animation mounted (QA-caught: 100%
 * reproducible for Monkey's mouth `d` and Panda's paw `cx`, independent of
 * duration/repeat — NOT an unmount race). Every celebrating flourish in
 * AnimalArt.tsx now animates a transform (`scaleY`, `x`, `rotate`) on a
 * wrapping `motion.g` instead, over a STATIC child path/circle — the same
 * safe pattern Rabbit's ear-wiggle and Giraffe's head-tilt already used.
 */
function FoodDeliveryFx({
  round,
  choiceId,
  big = false,
  onEvent,
  onDone,
}: {
  round: FeedRound;
  choiceId: string;
  big?: boolean;
  onEvent: DisplayEventListener;
  onDone: () => void;
}) {
  useEffect(() => {
    const doneTimer = setTimeout(onDone, FULL_CHAIN_DURATION_MS);
    // The character-specific accent (task section 16) fires the instant the food actually reaches
    // the animal, not when the choice is first made — a distinct sound for a distinct visual beat.
    const reactionTimer = setTimeout(() => onEvent({ type: "feed_animals_animal_reaction", timestamp: Date.now(), animal: round.animal }), ARC_DURATION_MS);
    return () => {
      clearTimeout(doneTimer);
      clearTimeout(reactionTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onDone]);

  const choice = round.choices.find((c) => c.id === choiceId);
  if (!choice) return null;

  const foodBurstCount = big ? 9 : 6;
  const foodBurst = Array.from({ length: foodBurstCount }, (_, i) => i);
  const sparkleCount = big ? 22 : 16;
  const sparkles = Array.from({ length: sparkleCount }, (_, i) => i);
  const animalGlowSize = big ? "30vmin" : "24vmin";

  return (
    <div className="pointer-events-none absolute inset-0">
      {/* BEAT 1 — "I chose correctly": a warm glow pulse + small leaf/star burst right at the
          chosen food's own position, the instant the correct choice is confirmed. */}
      <motion.span
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          left: `${choice.position.x * 100}%`,
          top: `${choice.position.y * 100}%`,
          background: "radial-gradient(circle, rgba(255,224,150,0.65) 0%, rgba(255,224,150,0) 70%)",
        }}
        initial={{ width: "4vmin", height: "4vmin", opacity: 0 }}
        animate={{ width: "16vmin", height: "16vmin", opacity: [0, 0.9, 0] }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      />
      {foodBurst.map((i) => {
        const angle = (i / foodBurst.length) * Math.PI * 2;
        return (
          <motion.span
            key={`food-burst-${i}`}
            className="absolute h-[0.9vmin] w-[0.9vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-100"
            style={{ left: `${choice.position.x * 100}%`, top: `${choice.position.y * 100}%`, boxShadow: "0 0 0.8vmin rgba(255,224,150,0.9)" }}
            initial={{ x: 0, y: 0, opacity: 0 }}
            animate={{ x: Math.cos(angle) * 26, y: Math.sin(angle) * 26, opacity: [0, 1, 0] }}
            transition={{ duration: 0.45, ease: "easeOut" }}
          />
        );
      })}

      {/* The animal, celebrating as it receives its food. */}
      <div
        className="absolute"
        style={{
          left: `${round.animalPosition.x * 100}%`,
          top: `${round.animalPosition.y * 100}%`,
          width: "clamp(90px, 20cqmin, 26vmin)",
          height: "clamp(90px, 20cqmin, 26vmin)",
          transform: "translate(-50%, -50%)",
        }}
      >
        <AnimalArt animal={round.animal} celebrating />
      </div>

      {/* The chosen food, arcing from its choice position to the animal. */}
      <motion.div
        className="absolute"
        style={{ width: `${choice.size * 100}cqmin`, height: `${choice.size * 100}cqmin`, maxWidth: "18vmin", maxHeight: "18vmin" }}
        initial={{ left: `${choice.position.x * 100}%`, top: `${choice.position.y * 100}%`, x: "-50%", y: "-50%", scale: 1, opacity: 1 }}
        animate={{
          left: [`${choice.position.x * 100}%`, `${round.animalPosition.x * 100}%`],
          top: [`${choice.position.y * 100}%`, `${choice.position.y * 100 - 8}%`, `${round.animalPosition.y * 100}%`],
          scale: [1, 1.15, 0.3],
          opacity: [1, 1, 0],
        }}
        transition={{ duration: ARC_DURATION_MS / 1000, ease: "easeInOut" }}
      >
        <FoodArt food={choice.food} />
      </motion.div>

      {/* BEAT 2 — "I helped the animal": a second, richer celebration once the food arrives —
          a soft arrival glow plus a wide stars/leaves sparkle burst around the animal. */}
      <motion.span
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          left: `${round.animalPosition.x * 100}%`,
          top: `${round.animalPosition.y * 100}%`,
          background: "radial-gradient(circle, rgba(255,214,140,0.5) 0%, rgba(255,214,140,0) 70%)",
        }}
        initial={{ width: "6vmin", height: "6vmin", opacity: 0 }}
        animate={{ width: animalGlowSize, height: animalGlowSize, opacity: [0, 0.8, 0] }}
        transition={{ duration: 0.6, delay: SPARKLE_DELAY_MS / 1000, ease: "easeOut" }}
      />
      {sparkles.map((i) => {
        const angle = (i / sparkles.length) * Math.PI * 2;
        const spread = 40 + (i % 3) * 10;
        return (
          <motion.span
            key={`sparkle-${i}`}
            className="absolute h-[1vmin] w-[1vmin] rounded-full bg-amber-200"
            style={{
              left: `${round.animalPosition.x * 100}%`,
              top: `${round.animalPosition.y * 100}%`,
              boxShadow: "0 0 1vmin rgba(255,214,140,0.9)",
            }}
            initial={{ x: 0, y: 0, opacity: 0 }}
            animate={{ x: Math.cos(angle) * spread, y: Math.sin(angle) * spread - 14, opacity: [0, 1, 0] }}
            transition={{ duration: SPARKLE_DURATION_MS / 1000, delay: SPARKLE_DELAY_MS / 1000, ease: "easeOut" }}
          />
        );
      })}
    </div>
  );
}

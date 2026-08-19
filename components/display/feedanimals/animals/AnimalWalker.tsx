"use client";

import { Animal } from "@/lib/feedanimals";
import { ElephantWalker } from "./ElephantWalker";
import { GiraffeWalker } from "./GiraffeWalker";
import { MonkeyWalker } from "./MonkeyWalker";
import { PandaWalker } from "./PandaWalker";
import { RabbitHopper, type AnimalWalkerState } from "./RabbitHopper";
import { walkerContactTranslationPercent } from "./walkerGeometry";

export type { AnimalWalkerState };

interface AnimalWalkerProps {
  animal: Animal;
  state: AnimalWalkerState;
  facing?: "left" | "right";
}

/**
 * SAFARI ANIMAL ADVENTURE — the path mechanic's own animal dispatcher, one
 * per-animal full-body walker component per hero character (task's "upgrade
 * all five animals to the same quality bar as Stage 1's monkey"). Every
 * walker shares the same three-state contract (idle/walking/celebrating)
 * and the same facing-flip convention so FeedAnimalsPathPlayingScene never
 * needs its own per-animal branching beyond this one switch.
 */
export function AnimalWalker({ animal, state, facing = "right" }: AnimalWalkerProps) {
  const contactTranslation = walkerContactTranslationPercent(animal, facing);
  const walker = (() => {
    switch (animal) {
      case Animal.RABBIT:
        return <RabbitHopper state={state} facing={facing} />;
      case Animal.PANDA:
        return <PandaWalker state={state} facing={facing} />;
      case Animal.ELEPHANT:
        return <ElephantWalker state={state} facing={facing} />;
      case Animal.GIRAFFE:
        return <GiraffeWalker state={state} facing={facing} />;
      case Animal.MONKEY:
      default:
        return <MonkeyWalker state={state} facing={facing} />;
    }
  })();

  return (
    <div
      className="h-full w-full overflow-visible"
      data-animal-walker={animal}
      style={{ transform: `translate(${contactTranslation.x}%, ${contactTranslation.y}%)` }}
    >
      {walker}
    </div>
  );
}

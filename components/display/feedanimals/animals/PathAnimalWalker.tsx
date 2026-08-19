"use client";

import { motion } from "motion/react";
import type { Animal, FeedAnimalsPathSample } from "@/lib/feedanimals";
import { AnimalWalker, type AnimalWalkerState } from "./AnimalWalker";
import { PATH_CONTACT_ANCHOR_STYLE, pathPositionStyle } from "../path/pathAlignment";

interface PathAnimalWalkerProps {
  animal: Animal;
  sample: FeedAnimalsPathSample;
  state: AnimalWalkerState;
  facing: "left" | "right";
  transitionSeconds: number;
}

/**
 * Keeps path movement, contact-point anchoring, and pose animation on three
 * separate elements so Motion never overwrites the feet-to-path transform.
 */
export function PathAnimalWalker({ animal, sample, state, facing, transitionSeconds }: PathAnimalWalkerProps) {
  const position = pathPositionStyle(sample.position);

  return (
    <motion.div
      className="absolute h-0 w-0"
      style={position}
      animate={position}
      transition={{ duration: transitionSeconds, ease: "easeInOut" }}
      data-path-animal-anchor="true"
      data-path-x={sample.position.x}
      data-path-y={sample.position.y}
      data-facing={facing}
    >
      <div
        className="absolute"
        style={{
          ...PATH_CONTACT_ANCHOR_STYLE,
          width: "clamp(60px, 13cqmin, 15vmin)",
          height: "clamp(84px, 18cqmin, 21vmin)",
        }}
        data-animal-contact-anchor="true"
      >
        <motion.div
          className="h-full w-full"
          style={{ transformOrigin: "50% 100%" }}
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: transitionSeconds, ease: "easeInOut" }}
        >
          <AnimalWalker animal={animal} state={state} facing={facing} />
        </motion.div>
      </div>
    </motion.div>
  );
}

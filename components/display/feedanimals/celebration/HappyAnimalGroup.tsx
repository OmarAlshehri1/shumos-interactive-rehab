"use client";

import { motion } from "motion/react";
import { AnimalArt } from "../animals/AnimalArt";
import { Animal } from "@/lib/feedanimals";

const GROUP: readonly Animal[] = [Animal.MONKEY, Animal.RABBIT, Animal.PANDA];

/** Stage 3's celebration (task section 47) — a small happy animal group appears together at the center of the wall. */
export function HappyAnimalGroup() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-[2vmin]" aria-hidden="true">
      {GROUP.map((animal, i) => (
        <motion.div
          key={animal}
          className="h-[13vmin] w-[13vmin]"
          initial={{ opacity: 0, y: 24, scale: 0.6 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 14, delay: i * 0.15 }}
        >
          <AnimalArt animal={animal} celebrating />
        </motion.div>
      ))}
    </div>
  );
}

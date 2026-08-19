"use client";

import { motion } from "motion/react";
import { AnimalArt } from "../animals/AnimalArt";
import { ANIMAL_ORDER } from "@/lib/feedanimals";

interface AnimalParadeProps {
  /** A bigger, more prominent parade for the session-complete finale (task section 49) than the plain stage-5 moment. */
  big?: boolean;
}

/**
 * Stage 5's celebration, and the session-complete finale's parade (task
 * section 47/48/49) — every animal in the cast briefly gathers together,
 * waving/bouncing/nodding. Kept short and lightweight per task section 48 —
 * no elaborate choreography, just each animal's own happy reaction playing
 * together.
 */
export function AnimalParade({ big = false }: AnimalParadeProps) {
  return (
    <div className={`pointer-events-none absolute inset-x-0 flex items-end justify-center gap-[1.6vmin] ${big ? "bottom-[6%]" : "bottom-[4%]"}`} aria-hidden="true">
      {ANIMAL_ORDER.map((animal, i) => (
        <motion.div
          key={animal}
          className={big ? "h-[13vmin] w-[13vmin]" : "h-[10vmin] w-[10vmin]"}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 190, damping: 15, delay: i * 0.12 }}
        >
          <AnimalArt animal={animal} celebrating />
        </motion.div>
      ))}
    </div>
  );
}

"use client";

import { motion } from "motion/react";

/** SAFARI ANIMAL ADVENTURE — the giraffe's own destination art, same quality bar as BananaBunch.tsx: a small leafy acacia-style tree top the giraffe reaches up to, a clear rounded green canopy on a short trunk. */
export function LeafyTree({ celebrating = false }: { celebrating?: boolean }) {
  return (
    <motion.div
      className="relative h-full w-full"
      animate={celebrating ? { scale: [1, 1.15, 1], rotate: [0, -4, 4, 0] } : { rotate: [0, 2, 0, -2, 0] }}
      transition={celebrating ? { duration: 0.7 } : { duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
      style={{ transformOrigin: "50% 95%" }}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full" style={{ filter: "drop-shadow(0 0.7vmin 1.1vmin rgba(40,30,10,0.35))" }} aria-hidden="true">
        {/* Trunk. */}
        <rect x="44" y="60" width="12" height="34" rx="4" fill="#5A4126" />
        {/* Canopy — flat acacia-style silhouette. */}
        <ellipse cx="50" cy="42" rx="44" ry="16" fill="#3F6B2E" />
        <ellipse cx="50" cy="30" rx="34" ry="20" fill="#6FAE53" />
        <ellipse cx="32" cy="34" rx="14" ry="10" fill="#8FCB6B" opacity="0.8" />
        <ellipse cx="68" cy="30" rx="12" ry="9" fill="#8FCB6B" opacity="0.75" />
        {/* A few loose leaves near the edge. */}
        <path d="M20 46 C24 40 30 40 32 44 C28 48 22 50 20 46 Z" fill="#7AAE4A" />
        <path d="M80 44 C76 38 70 38 68 42 C72 46 78 48 80 44 Z" fill="#7AAE4A" />
      </svg>
    </motion.div>
  );
}

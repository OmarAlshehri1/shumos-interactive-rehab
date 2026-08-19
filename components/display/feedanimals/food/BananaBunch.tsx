"use client";

import { motion } from "motion/react";

/**
 * SAFARI ANIMAL ADVENTURE PROTOTYPE — Stage 1's own destination art (task's
 * "redesign the banana... prefer a banana bunch hanging from a small
 * tree/branch"), deliberately separate from FoodArt.tsx's existing single
 * Banana (a tap-target icon used by the round-based mechanic elsewhere —
 * untouched). Bright yellow, a clear curved bunch silhouette, a small
 * branch/stem, simple highlight/shadow — legible from projector distance.
 */
export function BananaBunch({ celebrating = false }: { celebrating?: boolean }) {
  return (
    <motion.div
      className="relative h-full w-full"
      animate={celebrating ? { scale: [1, 1.18, 1], rotate: [0, -6, 6, 0] } : { rotate: [0, 2, 0, -2, 0] }}
      transition={celebrating ? { duration: 0.7 } : { duration: 4, repeat: Infinity, ease: "easeInOut" }}
      style={{ transformOrigin: "50% 0%" }}
    >
      <svg viewBox="0 0 100 110" className="h-full w-full" style={{ filter: "drop-shadow(0 0.7vmin 1.1vmin rgba(40,30,10,0.35))" }} aria-hidden="true">
        {/* Small branch. */}
        <path d="M20 6 Q50 0 80 6" stroke="#6B4226" strokeWidth="4.5" fill="none" strokeLinecap="round" />
        {/* Stem the bunch hangs from. */}
        <path d="M50 6 L50 18" stroke="#7A9B4E" strokeWidth="4" fill="none" strokeLinecap="round" />

        {/* Bunch — three overlapping bananas, clear curved silhouettes. */}
        <path
          d="M50 18 C34 22 24 40 28 60 C30 72 40 82 52 84 C55 84 56 80 53 78 C44 75 37 65 36 54 C35 42 41 28 54 22 C57 20 55 17 50 18 Z"
          fill="#F2C94C"
          stroke="#D9A62A"
          strokeWidth="1.6"
        />
        <path
          d="M58 18 C42 24 34 44 39 64 C42 76 52 85 63 86 C66 86 67 82 64 80 C55 77 47 67 45 56 C43 44 48 30 61 23 C64 21 62 17 58 18 Z"
          fill="#F6D468"
          stroke="#D9A62A"
          strokeWidth="1.6"
        />
        <path
          d="M66 18 C50 25 43 46 49 66 C53 78 63 87 74 87 C77 87 78 83 75 81 C66 78 58 68 56 57 C53 45 57 31 70 24 C73 22 71 18 66 18 Z"
          fill="#F2C94C"
          stroke="#D9A62A"
          strokeWidth="1.6"
        />

        {/* Highlights. */}
        <path d="M40 32 C34 42 32 52 34 60" stroke="#FCE29B" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity="0.75" />
        <path d="M62 28 C55 38 53 50 55 60" stroke="#FCE29B" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity="0.7" />
      </svg>
    </motion.div>
  );
}

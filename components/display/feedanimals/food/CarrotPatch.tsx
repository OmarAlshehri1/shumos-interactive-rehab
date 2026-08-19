"use client";

import { motion } from "motion/react";

/** SAFARI ANIMAL ADVENTURE — the rabbit's own destination art, same quality bar as BananaBunch.tsx: a small patch of carrots poking out of the soil with leafy tops, bright orange, legible from projector distance. */
export function CarrotPatch({ celebrating = false }: { celebrating?: boolean }) {
  return (
    <motion.div
      className="relative h-full w-full"
      animate={celebrating ? { scale: [1, 1.18, 1], rotate: [0, -5, 5, 0] } : { rotate: [0, 2, 0, -2, 0] }}
      transition={celebrating ? { duration: 0.7 } : { duration: 4, repeat: Infinity, ease: "easeInOut" }}
      style={{ transformOrigin: "50% 90%" }}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full" style={{ filter: "drop-shadow(0 0.7vmin 1.1vmin rgba(40,30,10,0.35))" }} aria-hidden="true">
        {/* Soil mound. */}
        <ellipse cx="50" cy="88" rx="34" ry="9" fill="#6B4A2E" />
        {/* Three carrots. */}
        <g>
          <path d="M32 88 L26 44 Q32 34 38 44 Z" fill="#F2924C" stroke="#D9752E" strokeWidth="1.4" />
          <path d="M28 44 C24 34 18 30 12 28 M28 44 C28 32 28 28 28 26" stroke="#5E9153" strokeWidth="3.4" fill="none" strokeLinecap="round" />
        </g>
        <g>
          <path d="M50 90 L42 30 Q50 16 58 30 Z" fill="#F2924C" stroke="#D9752E" strokeWidth="1.6" />
          <path d="M46 30 C42 16 34 10 26 8 M50 30 C50 14 50 8 50 4 M54 30 C58 16 66 10 74 8" stroke="#5E9153" strokeWidth="4" fill="none" strokeLinecap="round" />
        </g>
        <g>
          <path d="M68 88 L74 44 Q68 34 62 44 Z" fill="#F2924C" stroke="#D9752E" strokeWidth="1.4" />
          <path d="M72 44 C76 34 82 30 88 28 M72 44 C72 32 72 28 72 26" stroke="#5E9153" strokeWidth="3.4" fill="none" strokeLinecap="round" />
        </g>
      </svg>
    </motion.div>
  );
}

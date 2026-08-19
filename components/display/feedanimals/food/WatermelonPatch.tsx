"use client";

import { motion } from "motion/react";

/** SAFARI ANIMAL ADVENTURE — the elephant's own destination art, same quality bar as BananaBunch.tsx: a ripe watermelon resting at the edge of a small pond (task's "water/pleasant destination" flavor for the elephant's own stage), a clear round silhouette with a bright red slice cut into it. */
export function WatermelonPatch({ celebrating = false }: { celebrating?: boolean }) {
  return (
    <motion.div
      className="relative h-full w-full"
      animate={celebrating ? { scale: [1, 1.16, 1], rotate: [0, -5, 5, 0] } : { y: [0, -2, 0, 2, 0] }}
      transition={celebrating ? { duration: 0.7 } : { duration: 4, repeat: Infinity, ease: "easeInOut" }}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full" style={{ filter: "drop-shadow(0 0.7vmin 1.1vmin rgba(30,50,60,0.35))" }} aria-hidden="true">
        {/* Small pond puddle beneath. */}
        <ellipse cx="50" cy="86" rx="38" ry="9" fill="#5FA8C9" opacity="0.55" />
        <ellipse cx="50" cy="86" rx="26" ry="5.5" fill="#8FCBE3" opacity="0.6" />

        {/* Whole melon. */}
        <circle cx="30" cy="60" r="19" fill="#3A7743" />
        <path d="M22 52 Q30 46 38 52" stroke="#2E5F35" strokeWidth="2" fill="none" opacity="0.5" />
        <path d="M20 60 Q30 56 40 60" stroke="#2E5F35" strokeWidth="2" fill="none" opacity="0.5" />

        {/* Cut slice showing red flesh + seeds. */}
        <path d="M50 32 A38 38 0 0 1 88 60 L50 60 Z" fill="#4E9A57" stroke="#3A7743" strokeWidth="1.5" />
        <path d="M53 36 A33 33 0 0 1 83 60 L53 60 Z" fill="#EAF6E6" />
        <path d="M56 40 A28 28 0 0 1 78 60 L56 60 Z" fill="#F2555A" />
        <circle cx="63" cy="48" r="2" fill="#2B2B2B" />
        <circle cx="70" cy="52" r="2" fill="#2B2B2B" />
        <circle cx="66" cy="56" r="1.8" fill="#2B2B2B" />
      </svg>
    </motion.div>
  );
}

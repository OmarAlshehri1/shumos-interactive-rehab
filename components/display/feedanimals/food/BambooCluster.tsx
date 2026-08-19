"use client";

import { motion } from "motion/react";

/** SAFARI ANIMAL ADVENTURE — the panda's own destination art, same quality bar as BananaBunch.tsx: three tall bamboo stalks with leaf clusters, bright green, legible from projector distance. */
export function BambooCluster({ celebrating = false }: { celebrating?: boolean }) {
  return (
    <motion.div
      className="relative h-full w-full"
      animate={celebrating ? { scale: [1, 1.15, 1], rotate: [0, -4, 4, 0] } : { rotate: [0, 1.5, 0, -1.5, 0] }}
      transition={celebrating ? { duration: 0.7 } : { duration: 4.4, repeat: Infinity, ease: "easeInOut" }}
      style={{ transformOrigin: "50% 95%" }}
    >
      <svg viewBox="0 0 100 110" className="h-full w-full" style={{ filter: "drop-shadow(0 0.7vmin 1.1vmin rgba(40,30,10,0.35))" }} aria-hidden="true">
        <rect x="24" y="20" width="13" height="82" rx="6" fill="#8FC15C" stroke="#5E9153" strokeWidth="1.4" />
        <rect x="24" y="40" width="13" height="5" fill="#5E9153" />
        <rect x="24" y="64" width="13" height="5" fill="#5E9153" />
        <rect x="24" y="86" width="13" height="5" fill="#5E9153" />

        <rect x="43" y="6" width="14" height="96" rx="7" fill="#A6D172" stroke="#5E9153" strokeWidth="1.4" />
        <rect x="43" y="28" width="14" height="5" fill="#5E9153" />
        <rect x="43" y="52" width="14" height="5" fill="#5E9153" />
        <rect x="43" y="76" width="14" height="5" fill="#5E9153" />

        <rect x="63" y="24" width="13" height="78" rx="6" fill="#8FC15C" stroke="#5E9153" strokeWidth="1.4" />
        <rect x="63" y="44" width="13" height="5" fill="#5E9153" />
        <rect x="63" y="66" width="13" height="5" fill="#5E9153" />

        {/* Leaf clusters. */}
        <path d="M50 6 C40 -4 26 -4 18 2 C26 8 38 10 50 6 Z" fill="#7AAE4A" />
        <path d="M50 6 C60 -4 74 -4 82 2 C74 8 62 10 50 6 Z" fill="#7AAE4A" />
        <path d="M30 20 C22 14 12 14 6 18 C12 24 22 26 30 20 Z" fill="#7AAE4A" />
        <path d="M69 24 C77 18 87 18 93 22 C87 28 77 30 69 24 Z" fill="#7AAE4A" />
      </svg>
    </motion.div>
  );
}

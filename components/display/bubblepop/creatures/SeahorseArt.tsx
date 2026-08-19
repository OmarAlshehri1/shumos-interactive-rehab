"use client";

import { motion } from "motion/react";

interface SeahorseArtProps {
  className?: string;
  style?: React.CSSProperties;
}

/**
 * REAL SEAHORSE ART (task Part D) — a clearly recognizable S-curve body,
 * snouted head, dorsal fin, and a curled tail. Floats slowly, upright, with
 * a small independent sway so it reads as alive without ever looking fast
 * or busy.
 */
export function SeahorseArt({ className, style }: SeahorseArtProps) {
  return (
    <motion.svg
      viewBox="0 0 60 100"
      className={className}
      style={{ ...style, overflow: "visible" }}
      animate={{ rotate: [-4, 4, -4], y: [0, -3, 0] }}
      transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
      aria-hidden="true"
    >
      {/* Curled tail. */}
      <path
        d="M30 70 C30 82 44 82 44 92 C44 98 36 100 30 96"
        fill="none"
        stroke="#E0975A"
        strokeWidth="7"
        strokeLinecap="round"
      />
      {/* Body S-curve. */}
      <path
        d="M22 8 C10 8 8 20 16 26 C24 32 30 30 30 40 C30 52 14 50 14 64 C14 72 22 78 30 72"
        fill="none"
        stroke="#F2924C"
        strokeWidth="11"
        strokeLinecap="round"
      />
      {/* Dorsal fin. */}
      <motion.path
        d="M26 34 C34 32 38 38 34 44 C30 46 26 42 26 34 Z"
        fill="#E0975A"
        style={{ transformOrigin: "30px 38px" }}
        animate={{ rotate: [0, 10, 0] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Head + snout. */}
      <path d="M14 8 C6 8 2 14 4 20 C6 24 14 24 18 18 L26 14 L24 10 C21 8 17 7 14 8 Z" fill="#F2924C" />
      <circle cx="12" cy="12" r="1.8" fill="#1A1A1A" />
      {/* Little coronet. */}
      <path d="M16 4 L18 8 L14 8 Z" fill="#E0975A" />
    </motion.svg>
  );
}

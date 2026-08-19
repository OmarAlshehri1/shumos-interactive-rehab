"use client";

import { motion } from "motion/react";
import type { AnimalWalkerState } from "./RabbitHopper";

interface PandaWalkerProps {
  state: AnimalWalkerState;
  facing?: "left" | "right";
}

/**
 * SAFARI ANIMAL ADVENTURE — full-body original SVG panda, same quality bar
 * as MonkeyWalker.tsx. SLOWER, CUTE, PADDED steps (task's animal-personality
 * list): a gentle side-to-side waddle rather than a brisk alternating walk,
 * legs barely lifting, body rocking.
 */
export function PandaWalker({ state, facing = "right" }: PandaWalkerProps) {
  return (
    <div style={{ transform: facing === "left" ? "scaleX(-1)" : undefined }} className="h-full w-full">
      <motion.svg
        viewBox="0 0 100 140"
        className="h-full w-full overflow-visible"
        animate={
          state === "walking"
            ? { rotate: [0, -3, 0, 3, 0], y: [0, -1, 0, -1, 0] }
            : state === "celebrating"
              ? { rotate: [0, -5, 5, -3, 0], y: [0, -10, 0, -6, 0] }
              : { y: [0, -1.5, 0] }
        }
        transition={
          state === "walking"
            ? { duration: 0.9, repeat: Infinity, ease: "easeInOut" }
            : state === "celebrating"
              ? { duration: 1.1, repeat: 2 }
              : { duration: 3, repeat: Infinity, ease: "easeInOut" }
        }
        style={{ transformOrigin: "50px 130px", filter: "drop-shadow(0 0.8vmin 1.2vmin rgba(20,20,20,0.3))" }}
        aria-hidden="true"
      >
        {/* Back legs — small padded shuffle. */}
        <motion.g
          animate={state === "walking" ? { x: [0, -3, 0, 3, 0] } : undefined}
          transition={state === "walking" ? { duration: 0.9, repeat: Infinity, ease: "easeInOut" } : undefined}
        >
          <rect x="30" y="102" width="16" height="26" rx="7" fill="#2B2B2B" />
          <rect x="54" y="102" width="16" height="26" rx="7" fill="#2B2B2B" />
        </motion.g>

        {/* Body. */}
        <ellipse cx="50" cy="90" rx="28" ry="26" fill="#FAFAFA" stroke="#E4E4E4" strokeWidth="1" />

        {/* Arms. */}
        <motion.g
          style={{ transformOrigin: "26px 84px" }}
          animate={state === "walking" ? { rotate: [0, 6, 0, -6, 0] } : state === "celebrating" ? { rotate: [0, -18, 18, -18, 0] } : undefined}
          transition={state === "walking" ? { duration: 0.9, repeat: Infinity, ease: "easeInOut" } : state === "celebrating" ? { duration: 1.1, repeat: 1 } : undefined}
        >
          <rect x="18" y="78" width="14" height="24" rx="7" fill="#2B2B2B" />
        </motion.g>
        <motion.g
          style={{ transformOrigin: "74px 84px" }}
          animate={state === "walking" ? { rotate: [0, -6, 0, 6, 0] } : state === "celebrating" ? { rotate: [0, 18, -18, 18, 0] } : undefined}
          transition={state === "walking" ? { duration: 0.9, repeat: Infinity, ease: "easeInOut" } : state === "celebrating" ? { duration: 1.1, repeat: 1 } : undefined}
        >
          <rect x="68" y="78" width="14" height="24" rx="7" fill="#2B2B2B" />
        </motion.g>

        {/* Ears. */}
        <circle cx="28" cy="34" r="12" fill="#2B2B2B" />
        <circle cx="72" cy="34" r="12" fill="#2B2B2B" />

        {/* Head. */}
        <circle cx="50" cy="54" r="28" fill="#FAFAFA" stroke="#E4E4E4" strokeWidth="1" />

        {/* Eye patches. */}
        <ellipse cx="39" cy="52" rx="8.5" ry="10.5" fill="#2B2B2B" transform="rotate(-12 39 52)" />
        <ellipse cx="61" cy="52" rx="8.5" ry="10.5" fill="#2B2B2B" transform="rotate(12 61 52)" />
        <motion.g animate={state === "idle" ? { scaleY: [1, 1, 0.15, 1, 1] } : {}} transition={{ duration: 3.8, repeat: Infinity, times: [0, 0.5, 0.54, 0.58, 1] }} style={{ transformOrigin: "50px 53px" }}>
          <circle cx="40" cy="53" r="3.2" fill="white" />
          <circle cx="60" cy="53" r="3.2" fill="white" />
          <circle cx="40" cy="53" r="1.5" fill="#2B2B2B" />
          <circle cx="60" cy="53" r="1.5" fill="#2B2B2B" />
        </motion.g>

        {/* Nose + mouth. */}
        <ellipse cx="50" cy="65" rx="3" ry="2.2" fill="#2B2B2B" />
        <motion.g
          style={{ transformOrigin: "50px 68px" }}
          animate={state === "celebrating" ? { scaleY: [1, 1.5, 1] } : undefined}
          transition={state === "celebrating" ? { duration: 0.6 } : undefined}
        >
          <path d="M50 67 Q50 73 42 74 M50 67 Q50 73 58 74" stroke="#8a8a8a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </motion.g>
      </motion.svg>
    </div>
  );
}

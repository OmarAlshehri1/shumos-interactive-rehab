"use client";

import { motion } from "motion/react";
import type { AnimalWalkerState } from "./RabbitHopper";

interface GiraffeWalkerProps {
  state: AnimalWalkerState;
  facing?: "left" | "right";
}

/**
 * SAFARI ANIMAL ADVENTURE — full-body original SVG giraffe, same quality
 * bar as MonkeyWalker.tsx. LONGER, ELEGANT strides + neck/head movement
 * (task's animal-personality list): tall proportions, a long neck that
 * bobs gently with every step, long legs that stride wide.
 */
export function GiraffeWalker({ state, facing = "right" }: GiraffeWalkerProps) {
  return (
    <div style={{ transform: facing === "left" ? "scaleX(-1)" : undefined }} className="h-full w-full">
      <motion.svg
        viewBox="0 0 100 160"
        className="h-full w-full overflow-visible"
        style={{ filter: "drop-shadow(0 0.8vmin 1.2vmin rgba(120,80,20,0.35))" }}
        animate={state === "walking" ? { y: [0, -3, 0] } : state === "celebrating" ? { y: [0, -12, 0, -7, 0] } : { y: [0, -1.5, 0] }}
        transition={
          state === "walking"
            ? { duration: 0.7, repeat: Infinity, ease: "easeInOut" }
            : state === "celebrating"
              ? { duration: 1.1, repeat: 2 }
              : { duration: 3, repeat: Infinity, ease: "easeInOut" }
        }
        aria-hidden="true"
      >
        {/* Legs — long, wide alternating stride. */}
        <motion.g
          style={{ transformOrigin: "38px 108px" }}
          animate={state === "walking" ? { rotate: [-14, 14, -14] } : undefined}
          transition={state === "walking" ? { duration: 0.7, repeat: Infinity, ease: "easeInOut" } : undefined}
        >
          <rect x="33" y="108" width="10" height="38" rx="5" fill="#C98A3A" />
        </motion.g>
        <motion.g
          style={{ transformOrigin: "58px 108px" }}
          animate={state === "walking" ? { rotate: [14, -14, 14] } : undefined}
          transition={state === "walking" ? { duration: 0.7, repeat: Infinity, ease: "easeInOut" } : undefined}
        >
          <rect x="53" y="108" width="10" height="38" rx="5" fill="#F2C572" />
        </motion.g>

        {/* Body. */}
        <ellipse cx="48" cy="102" rx="24" ry="18" fill="#F2C572" />
        <circle cx="34" cy="94" r="3" fill="#C98A3A" opacity="0.7" />
        <circle cx="58" cy="98" r="2.4" fill="#C98A3A" opacity="0.7" />
        <circle cx="46" cy="108" r="2.6" fill="#C98A3A" opacity="0.7" />

        {/* Neck — bobs gently with every step, nods on celebrate. */}
        <motion.g
          style={{ transformOrigin: "50px 92px" }}
          animate={
            state === "walking"
              ? { rotate: [-3, 3, -3] }
              : state === "celebrating"
                ? { rotate: [0, -10, 8, -6, 0] }
                : { rotate: [0, -2, 0] }
          }
          transition={
            state === "walking"
              ? { duration: 0.7, repeat: Infinity, ease: "easeInOut" }
              : state === "celebrating"
                ? { duration: 1.1, repeat: 1 }
                : { duration: 2.8, repeat: Infinity, ease: "easeInOut" }
          }
        >
          <rect x="40" y="46" width="18" height="52" rx="8" fill="#F2C572" />
          <circle cx="45" cy="66" r="3.4" fill="#C98A3A" opacity="0.7" />
          <circle cx="53" cy="80" r="2.8" fill="#C98A3A" opacity="0.7" />

          {/* Ossicones. */}
          <rect x="38" y="6" width="4" height="14" rx="2" fill="#F2C572" />
          <circle cx="40" cy="5" r="4" fill="#C98A3A" />
          <rect x="58" y="6" width="4" height="14" rx="2" fill="#F2C572" />
          <circle cx="60" cy="5" r="4" fill="#C98A3A" />

          {/* Head. */}
          <ellipse cx="49" cy="34" rx="21" ry="24" fill="#F2C572" />
          <circle cx="34" cy="38" r="4" fill="#C98A3A" opacity="0.7" />
          <circle cx="64" cy="32" r="3.2" fill="#C98A3A" opacity="0.7" />
          <motion.g animate={state === "idle" ? { scaleY: [1, 1, 0.15, 1, 1] } : {}} transition={{ duration: 3.6, repeat: Infinity, times: [0, 0.5, 0.54, 0.58, 1] }} style={{ transformOrigin: "49px 30px" }}>
            <circle cx="39" cy="30" r="3.8" fill="#3A2415" />
            <circle cx="59" cy="30" r="3.8" fill="#3A2415" />
            <circle cx="40.2" cy="28.8" r="1" fill="white" />
            <circle cx="60.2" cy="28.8" r="1" fill="white" />
          </motion.g>
          <ellipse cx="49" cy="47" rx="11" ry="8" fill="#FBE3B8" />
          <path d="M42 49 Q49 53 56 49" stroke="#6B4226" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </motion.g>
      </motion.svg>
    </div>
  );
}

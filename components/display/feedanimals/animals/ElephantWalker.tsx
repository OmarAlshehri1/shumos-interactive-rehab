"use client";

import { motion } from "motion/react";
import type { AnimalWalkerState } from "./RabbitHopper";

interface ElephantWalkerProps {
  state: AnimalWalkerState;
  facing?: "left" | "right";
}

/**
 * SAFARI ANIMAL ADVENTURE — full-body original SVG elephant, same quality
 * bar as MonkeyWalker.tsx. GENTLE, HEAVIER ground steps + trunk movement
 * (task's animal-personality list): a slow, deliberate lumber, big ears
 * flapping, trunk swinging with every step.
 */
export function ElephantWalker({ state, facing = "right" }: ElephantWalkerProps) {
  return (
    <div style={{ transform: facing === "left" ? "scaleX(-1)" : undefined }} className="h-full w-full">
      <motion.svg
        viewBox="0 0 100 140"
        className="h-full w-full overflow-visible"
        style={{ filter: "drop-shadow(0 0.9vmin 1.3vmin rgba(50,60,70,0.4))" }}
        animate={state === "walking" ? { y: [0, -2, 0, -2, 0] } : state === "celebrating" ? { y: [0, -9, 0, -6, 0] } : { y: [0, -1.5, 0] }}
        transition={
          state === "walking"
            ? { duration: 0.9, repeat: Infinity, ease: "easeInOut" }
            : state === "celebrating"
              ? { duration: 1.1, repeat: 2 }
              : { duration: 3.2, repeat: Infinity, ease: "easeInOut" }
        }
        aria-hidden="true"
      >
        {/* Legs — heavy, alternating slowly. */}
        <motion.g
          style={{ transformOrigin: "38px 98px" }}
          animate={state === "walking" ? { rotate: [-9, 9, -9] } : undefined}
          transition={state === "walking" ? { duration: 0.9, repeat: Infinity, ease: "easeInOut" } : undefined}
        >
          <rect x="30" y="98" width="15" height="30" rx="6" fill="#AEB7C0" />
          <ellipse cx="37.5" cy="130" rx="9" ry="5" fill="#9AA3AD" />
        </motion.g>
        <motion.g
          style={{ transformOrigin: "62px 98px" }}
          animate={state === "walking" ? { rotate: [9, -9, 9] } : undefined}
          transition={state === "walking" ? { duration: 0.9, repeat: Infinity, ease: "easeInOut" } : undefined}
        >
          <rect x="55" y="98" width="15" height="30" rx="6" fill="#CBD3DB" />
          <ellipse cx="62.5" cy="130" rx="9" ry="5" fill="#B4BCC5" />
        </motion.g>

        {/* Body. */}
        <ellipse cx="50" cy="86" rx="30" ry="26" fill="#CBD3DB" />

        {/* Ears — flap with every step. */}
        <motion.ellipse
          cx="18"
          cy="68"
          rx="15"
          ry="19"
          fill="#B9C2CC"
          animate={{ rotate: state === "celebrating" ? [0, -10, 8, 0] : state === "walking" ? [0, -6, 0] : [0, -3, 0] }}
          transition={{ duration: state === "celebrating" ? 0.9 : state === "walking" ? 0.9 : 2.6, repeat: state === "celebrating" ? 2 : Infinity }}
          style={{ transformOrigin: "30px 68px" }}
        />
        <motion.ellipse
          cx="82"
          cy="68"
          rx="15"
          ry="19"
          fill="#B9C2CC"
          animate={{ rotate: state === "celebrating" ? [0, 10, -8, 0] : state === "walking" ? [0, 6, 0] : [0, 3, 0] }}
          transition={{ duration: state === "celebrating" ? 0.9 : state === "walking" ? 0.9 : 2.6, repeat: state === "celebrating" ? 2 : Infinity }}
          style={{ transformOrigin: "70px 68px" }}
        />

        {/* Head. */}
        <circle cx="50" cy="62" r="26" fill="#CBD3DB" />

        {/* Eyes. */}
        <circle cx="40" cy="56" r="3.6" fill="#3A2415" />
        <circle cx="60" cy="56" r="3.6" fill="#3A2415" />
        <circle cx="41.1" cy="54.8" r="1" fill="white" />
        <circle cx="61.1" cy="54.8" r="1" fill="white" />

        {/* Trunk — swings with each step, curls up on celebrate. */}
        <motion.g
          style={{ transformOrigin: "50px 72px" }}
          animate={
            state === "walking"
              ? { rotate: [-6, 8, -6] }
              : state === "celebrating"
                ? { rotate: [0, -18, 12, -14, 0] }
                : { rotate: [0, -4, 0] }
          }
          transition={
            state === "walking"
              ? { duration: 0.9, repeat: Infinity, ease: "easeInOut" }
              : state === "celebrating"
                ? { duration: 1.1, repeat: 1 }
                : { duration: 3, repeat: Infinity, ease: "easeInOut" }
          }
        >
          <path d="M50 72 Q50 86 44 94 Q40 100 45 106" stroke="#B9C2CC" strokeWidth="11" strokeLinecap="round" fill="none" />
        </motion.g>

        {/* Tusks. */}
        <path d="M40 78 Q36 84 38 90" stroke="#F4EFE6" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M60 78 Q64 84 62 90" stroke="#F4EFE6" strokeWidth="4" fill="none" strokeLinecap="round" />
      </motion.svg>
    </div>
  );
}

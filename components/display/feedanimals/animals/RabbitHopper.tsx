"use client";

import { motion } from "motion/react";

export type AnimalWalkerState = "idle" | "walking" | "celebrating";

interface RabbitHopperProps {
  state: AnimalWalkerState;
  facing?: "left" | "right";
}

/**
 * SAFARI ANIMAL ADVENTURE — full-body original SVG rabbit, same quality bar
 * as MonkeyWalker.tsx. HOP-BASED movement (task's animal-personality list):
 * "walking" is really a repeated hop (both legs together, whole body rises),
 * never an alternating walk-cycle, with the long ears reacting to each hop.
 */
export function RabbitHopper({ state, facing = "right" }: RabbitHopperProps) {
  return (
    <div style={{ transform: facing === "left" ? "scaleX(-1)" : undefined }} className="h-full w-full">
      <motion.svg
        viewBox="0 0 100 140"
        className="h-full w-full overflow-visible"
        style={{ filter: "drop-shadow(0 0.8vmin 1.2vmin rgba(50,30,10,0.35))" }}
        animate={state === "walking" ? { y: [0, -16, 0] } : state === "celebrating" ? { y: [0, -20, 0, -12, 0] } : { y: [0, -1.5, 0] }}
        transition={
          state === "walking"
            ? { duration: 0.42, repeat: Infinity, ease: "easeOut" }
            : state === "celebrating"
              ? { duration: 1.1, repeat: 2 }
              : { duration: 2.6, repeat: Infinity, ease: "easeInOut" }
        }
        aria-hidden="true"
      >
        {/* Puffy tail. */}
        <circle cx="66" cy="98" r="9" fill="#FBF3E8" />

        {/* Back legs — hop together, never alternating. */}
        <motion.g
          style={{ transformOrigin: "50px 100px" }}
          animate={state === "walking" ? { rotate: [0, -22, 0] } : state === "celebrating" ? { rotate: [0, -18, 0] } : { rotate: 0 }}
          transition={state === "walking" ? { duration: 0.42, repeat: Infinity, ease: "easeOut" } : { duration: 0.8, repeat: state === "celebrating" ? 1 : 0 }}
        >
          <ellipse cx="36" cy="112" rx="11" ry="16" fill="#F3E9DD" />
          <ellipse cx="64" cy="112" rx="11" ry="16" fill="#F3E9DD" />
        </motion.g>

        {/* Front paws. */}
        <ellipse cx="38" cy="98" rx="6" ry="8" fill="#FBF3E8" />
        <ellipse cx="62" cy="98" rx="6" ry="8" fill="#FBF3E8" />

        {/* Body. */}
        <ellipse cx="50" cy="86" rx="24" ry="26" fill="#FBF3E8" />

        {/* Ears — react to each hop. */}
        <motion.g
          style={{ transformOrigin: "40px 46px" }}
          animate={state === "walking" ? { rotate: [0, -14, 0] } : state === "celebrating" ? { rotate: [0, -22, 14, 0] } : { rotate: [0, -3, 0] }}
          transition={state === "walking" ? { duration: 0.42, repeat: Infinity, ease: "easeOut" } : { duration: state === "celebrating" ? 1.1 : 2.4, repeat: state === "celebrating" ? 2 : Infinity }}
        >
          <ellipse cx="40" cy="20" rx="9" ry="26" fill="#FBF3E8" />
          <ellipse cx="40" cy="22" rx="4.4" ry="19" fill="#F2A9B8" />
        </motion.g>
        <motion.g
          style={{ transformOrigin: "60px 46px" }}
          animate={state === "walking" ? { rotate: [0, 14, 0] } : state === "celebrating" ? { rotate: [0, 22, -14, 0] } : { rotate: [0, 3, 0] }}
          transition={state === "walking" ? { duration: 0.42, repeat: Infinity, ease: "easeOut" } : { duration: state === "celebrating" ? 1.1 : 2.4, repeat: state === "celebrating" ? 2 : Infinity }}
        >
          <ellipse cx="60" cy="20" rx="9" ry="26" fill="#FBF3E8" />
          <ellipse cx="60" cy="22" rx="4.4" ry="19" fill="#F2A9B8" />
        </motion.g>

        {/* Head. */}
        <circle cx="50" cy="58" r="24" fill="#FBF3E8" />
        {/* Cheeks. */}
        <circle cx="35" cy="62" r="5.4" fill="#F8D3D8" opacity="0.8" />
        <circle cx="65" cy="62" r="5.4" fill="#F8D3D8" opacity="0.8" />
        {/* Eyes. */}
        <motion.g animate={state === "idle" ? { scaleY: [1, 1, 0.1, 1, 1] } : {}} transition={{ duration: 3.4, repeat: Infinity, times: [0, 0.5, 0.54, 0.58, 1] }} style={{ transformOrigin: "50px 56px" }}>
          <circle cx="42" cy="56" r="3.6" fill="#3A2415" />
          <circle cx="58" cy="56" r="3.6" fill="#3A2415" />
          <circle cx="43.1" cy="54.8" r="1" fill="white" />
          <circle cx="59.1" cy="54.8" r="1" fill="white" />
        </motion.g>
        {/* Nose + mouth. */}
        <path d="M46 65 L54 65 L50 69 Z" fill="#E88A9A" />
        <motion.g
          style={{ transformOrigin: "50px 69px" }}
          animate={state === "celebrating" ? { scaleY: [1, 1.5, 1] } : undefined}
          transition={state === "celebrating" ? { duration: 0.6 } : undefined}
        >
          <path d="M50 69 Q50 73 44 74 M50 69 Q50 73 56 74" stroke="#6B4226" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </motion.g>
      </motion.svg>
    </div>
  );
}

"use client";

import { motion } from "motion/react";

export type MonkeyWalkerState = "idle" | "walking" | "celebrating";

interface MonkeyWalkerProps {
  state: MonkeyWalkerState;
  /** Which way the monkey is currently traveling — flips the whole figure so it never "moonwalks" backward (task's explicit requirement). Defaults to facing right, this game's forward/RIGHT direction. */
  facing?: "left" | "right";
}

/**
 * SAFARI ANIMAL ADVENTURE PROTOTYPE — a full-body, original SVG monkey
 * (task's explicit "redesign the monkey properly... head, ears, face, eyes,
 * body, arms, legs, curved tail"), deliberately separate from AnimalArt.tsx's
 * existing Monkey (a head-and-shoulders bust used by the round-based
 * mechanic's other stages — untouched, still used there). Three states:
 * idle (blink + tail sway + gentle breathing), walking (arms/legs
 * alternate, gentle body bob), celebrating (happy jump + clap). No skeletal
 * rigging — simple SVG groups + Motion transforms, same lightweight
 * approach as every other animal in this game.
 */
export function MonkeyWalker({ state, facing = "right" }: MonkeyWalkerProps) {
  return (
    <div style={{ transform: facing === "left" ? "scaleX(-1)" : undefined }} className="h-full w-full">
      <motion.svg
        viewBox="0 0 100 140"
        className="h-full w-full overflow-visible"
        style={{ filter: "drop-shadow(0 0.8vmin 1.2vmin rgba(50,30,10,0.4))" }}
        animate={state === "walking" ? { y: [0, -3, 0, -1.5, 0] } : state === "celebrating" ? { y: [0, -14, 0, -8, 0] } : { y: [0, -1.5, 0] }}
        transition={
          state === "walking"
            ? { duration: 0.55, repeat: Infinity, ease: "easeInOut" }
            : state === "celebrating"
              ? { duration: 1.1, repeat: 1 }
              : { duration: 2.8, repeat: Infinity, ease: "easeInOut" }
        }
        aria-hidden="true"
      >
        {/* Curved tail — a smooth swoosh from the lower back, swaying at idle, flicking while walking. */}
        <motion.path
          d="M60 92 Q82 90 86 74 Q90 58 76 50"
          fill="none"
          stroke="#8C5A3A"
          strokeWidth="7"
          strokeLinecap="round"
          style={{ transformOrigin: "60px 92px" }}
          animate={
            state === "walking"
              ? { rotate: [0, 8, -6, 0] }
              : state === "celebrating"
                ? { rotate: [0, 14, -10, 8, 0] }
                : { rotate: [0, -4, 0] }
          }
          transition={
            state === "walking"
              ? { duration: 0.55, repeat: Infinity, ease: "easeInOut" }
              : state === "celebrating"
                ? { duration: 1.1, repeat: 1 }
                : { duration: 3.4, repeat: Infinity, ease: "easeInOut" }
          }
        />

        {/* Back leg. */}
        <motion.g
          style={{ transformOrigin: "40px 96px" }}
          animate={state === "walking" ? { rotate: [-16, 16, -16] } : state === "celebrating" ? { rotate: [0, -12, 0] } : { rotate: 0 }}
          transition={state === "walking" ? { duration: 0.55, repeat: Infinity, ease: "easeInOut" } : { duration: 0.8, repeat: state === "celebrating" ? 1 : 0 }}
        >
          <rect x="34" y="96" width="13" height="30" rx="6.5" fill="#7A4B2E" />
          <ellipse cx="40.5" cy="128" rx="8" ry="5" fill="#5E3A22" />
        </motion.g>

        {/* Front leg. */}
        <motion.g
          style={{ transformOrigin: "58px 96px" }}
          animate={state === "walking" ? { rotate: [16, -16, 16] } : state === "celebrating" ? { rotate: [0, 12, 0] } : { rotate: 0 }}
          transition={state === "walking" ? { duration: 0.55, repeat: Infinity, ease: "easeInOut" } : { duration: 0.8, repeat: state === "celebrating" ? 1 : 0 }}
        >
          <rect x="53" y="96" width="13" height="30" rx="6.5" fill="#8C5A3A" />
          <ellipse cx="59.5" cy="128" rx="8" ry="5" fill="#6B4226" />
        </motion.g>

        {/* Body. */}
        <ellipse cx="50" cy="82" rx="26" ry="24" fill="#8C5A3A" />
        <ellipse cx="50" cy="86" rx="16" ry="17" fill="#E8CBA6" />

        {/* Back arm. */}
        <motion.g
          style={{ transformOrigin: "28px 70px" }}
          animate={
            state === "walking"
              ? { rotate: [18, -18, 18] }
              : state === "celebrating"
                ? { rotate: [0, -140, -100, -140, 0] }
                : { rotate: [0, -4, 0] }
          }
          transition={
            state === "walking"
              ? { duration: 0.55, repeat: Infinity, ease: "easeInOut" }
              : state === "celebrating"
                ? { duration: 1.1, repeat: 1 }
                : { duration: 3, repeat: Infinity, ease: "easeInOut" }
          }
        >
          <rect x="22" y="70" width="11" height="26" rx="5.5" fill="#7A4B2E" />
          <circle cx="27.5" cy="97" r="6.5" fill="#5E3A22" />
        </motion.g>

        {/* Front arm. */}
        <motion.g
          style={{ transformOrigin: "72px 70px" }}
          animate={
            state === "walking"
              ? { rotate: [-18, 18, -18] }
              : state === "celebrating"
                ? { rotate: [0, 140, 100, 140, 0] }
                : { rotate: [0, 5, 0] }
          }
          transition={
            state === "walking"
              ? { duration: 0.55, repeat: Infinity, ease: "easeInOut" }
              : state === "celebrating"
                ? { duration: 1.1, repeat: 1 }
                : { duration: 3, repeat: Infinity, ease: "easeInOut" }
          }
        >
          <rect x="67" y="70" width="11" height="26" rx="5.5" fill="#8C5A3A" />
          <circle cx="72.5" cy="97" r="6.5" fill="#6B4226" />
        </motion.g>

        {/* Ears. */}
        <circle cx="27" cy="34" r="12" fill="#8C5A3A" />
        <circle cx="73" cy="34" r="12" fill="#8C5A3A" />
        <circle cx="27" cy="34" r="6.4" fill="#C99B72" />
        <circle cx="73" cy="34" r="6.4" fill="#C99B72" />

        {/* Head. */}
        <circle cx="50" cy="40" r="27" fill="#8C5A3A" />
        <ellipse cx="50" cy="48" rx="17" ry="14" fill="#E8CBA6" />

        {/* Eyes — quick blink at idle, wide/happy while celebrating. */}
        <motion.g animate={state === "idle" ? { scaleY: [1, 1, 0.1, 1, 1] } : {}} transition={{ duration: 3.6, repeat: Infinity, times: [0, 0.46, 0.5, 0.54, 1] }} style={{ transformOrigin: "50px 38px" }}>
          <circle cx="41" cy="38" r="3.8" fill="#3A2415" />
          <circle cx="59" cy="38" r="3.8" fill="#3A2415" />
          <circle cx="42.2" cy="36.8" r="1.1" fill="white" />
          <circle cx="60.2" cy="36.8" r="1.1" fill="white" />
        </motion.g>

        {/* Nose + mouth. */}
        <ellipse cx="45.5" cy="50" rx="2" ry="1.5" fill="#6B4226" />
        <ellipse cx="54.5" cy="50" rx="2" ry="1.5" fill="#6B4226" />
        <motion.g
          style={{ transformOrigin: "50px 56px" }}
          animate={state === "celebrating" ? { scaleY: [1, 1.7, 1] } : undefined}
          transition={state === "celebrating" ? { duration: 0.6 } : undefined}
        >
          <path d="M41 55 Q50 62 59 55" stroke="#6B4226" strokeWidth="2" fill="none" strokeLinecap="round" />
        </motion.g>
      </motion.svg>
    </div>
  );
}

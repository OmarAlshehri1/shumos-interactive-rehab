"use client";

import { motion } from "motion/react";
import { BalloonColor } from "@/lib/game";
import { BALLOON_COLOR_THEME } from "../colorPalette";
import { BalloonArt } from "../balloon/BalloonArt";

interface RisingBalloonSpec {
  color: BalloonColor;
  left: string;
  size: string;
  delay: number;
}

/** Fixed, hand-placed set (not randomized — see Environment.tsx's own rationale) so this is reproducible and never causes a hydration mismatch. */
const BALLOON_SET: readonly RisingBalloonSpec[] = [
  { color: BalloonColor.YELLOW, left: "20%", size: "8vmin", delay: 0 },
  { color: BalloonColor.BLUE, left: "37%", size: "9.5vmin", delay: 0.14 },
  { color: BalloonColor.PURPLE, left: "54%", size: "7.5vmin", delay: 0.28 },
  { color: BalloonColor.RED, left: "70%", size: "9vmin", delay: 0.08 },
  { color: BalloonColor.GREEN, left: "84%", size: "7vmin", delay: 0.22 },
];

/** TASK 9 — the Stage 2/3 celebration language: several balloons rising with a gentle float. `count` scales how full the moment feels (Stage 2: a few; Stage 3: the whole set). */
export function RisingBalloons({ count = 3 }: { count?: number }) {
  const balloons = BALLOON_SET.slice(0, count);
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {balloons.map((b, i) => (
        <motion.div
          key={i}
          className="absolute bottom-[8%]"
          style={{ left: b.left, width: b.size, height: b.size }}
          initial={{ y: 0, opacity: 0 }}
          animate={{ y: "-72vh", opacity: [0, 1, 1, 0] }}
          transition={{ duration: 2.4, delay: b.delay, ease: "easeIn" }}
        >
          <BalloonArt theme={BALLOON_COLOR_THEME[b.color]} />
        </motion.div>
      ))}
    </div>
  );
}

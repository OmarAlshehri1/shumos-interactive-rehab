"use client";

import { motion } from "motion/react";
import type { FeedAnimalsWaterFeature } from "@/lib/feedanimals";

/** SAFARI ANIMAL ADVENTURE — a purely decorative pond/river the hand-authored route bends around (task's "the route should visibly go AROUND it" / "a visually strong river environment"), gently shimmering. Never gameplay-gating. */
export function WaterFeature({ feature }: { feature: FeedAnimalsWaterFeature }) {
  const widthPct = feature.rx * 2 * 100;
  const heightPct = feature.ry * 2 * 100;
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: `${feature.cx * 100}%`,
        top: `${feature.cy * 100}%`,
        width: `${widthPct}%`,
        height: `${heightPct}%`,
        transform: "translate(-50%, -50%)",
      }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 100" className="h-full w-full" preserveAspectRatio="none">
        <ellipse cx="50" cy="50" rx="48" ry="46" fill="#3F7D9C" opacity="0.55" />
        <ellipse cx="50" cy="50" rx="40" ry="38" fill="#5FA8C9" opacity="0.6" />
        <motion.ellipse
          cx="50"
          cy="48"
          rx="30"
          ry="26"
          fill="#8FCBE3"
          opacity="0.55"
          animate={{ opacity: [0.4, 0.65, 0.4] }}
          transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
        />
      </svg>
    </div>
  );
}

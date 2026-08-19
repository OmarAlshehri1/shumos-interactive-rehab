"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import type { DisplayEventListener } from "@/components/display/events";

interface SpacePilotReadyPositionSceneProps {
  onEvent: DisplayEventListener;
}

/**
 * Space Pilot's own dedicated READY moment (task's "After Welcome: separate
 * Ready moment. Explain simply: استخدم الأسهم لتحريك الصاروخ. Show UP/DOWN
 * control concept. Do not crowd title + instruction + controls"). Same
 * therapist-confirms-readiness model as the Bubble Pop Wall equivalent, but
 * this game's payload is the control CONCEPT itself, not just a calm marker
 * — the child needs to see what the reachable arrows look like before
 * meeting the real ones at the bottom of the wall during PLAYING.
 */
export function SpacePilotReadyPositionScene({ onEvent }: SpacePilotReadyPositionSceneProps) {
  const hasFired = useRef(false);
  useEffect(() => {
    if (hasFired.current) return;
    hasFired.current = true;
    onEvent({ type: "space_pilot_ready_position", timestamp: Date.now() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-[5vmin] px-8 text-center">
      <motion.h2
        className="text-[6vmin] leading-tight font-extrabold text-white drop-shadow-[0_4px_18px_rgba(10,10,40,0.6)]"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        استخدم الأسهم لتحريك الصاروخ
      </motion.h2>

      <motion.div
        className="flex items-center gap-[4vmin]"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: "easeOut", delay: 0.25 }}
      >
        <ArrowConcept direction="up" />
        <ArrowConcept direction="down" />
      </motion.div>

      <motion.p
        className="max-w-[46vw] text-[2.8vmin] leading-relaxed font-medium text-white/90"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.5 }}
      >
        قف قدام الشاشة، وخلك جاهز!
      </motion.p>
    </div>
  );
}

function ArrowConcept({ direction }: { direction: "up" | "down" }) {
  return (
    <motion.div
      className="flex h-[14vmin] w-[14vmin] items-center justify-center rounded-3xl border-2 border-indigo-300/50"
      style={{ background: "linear-gradient(180deg, rgba(99,102,241,0.4) 0%, rgba(30,27,75,0.6) 100%)" }}
      animate={{ y: direction === "up" ? [0, -6, 0] : [0, 6, 0] }}
      transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
    >
      <svg viewBox="0 0 24 24" className="h-[45%] w-[45%]" fill="none" stroke="#E0E7FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        {direction === "up" ? <path d="M6 15l6-6 6 6" /> : <path d="M6 9l6 6 6-6" />}
      </svg>
    </motion.div>
  );
}

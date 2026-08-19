"use client";

import { motion } from "motion/react";

export interface LaneControlsProps {
  /** MEDIUM/ADVANCED add a third, central FIRE pad — task's "Controls: UP, FIRE, DOWN. All remain large and reachable at the bottom of the WALL. Use a proper spaceship control-pad design. No emoji." */
  showFire?: boolean;
}

/**
 * REACHABLE CONTROLS (task's "the child cannot reach the whole wall...
 * UP/DOWN controls stay LARGE and LOW... should look like part of the
 * spacecraft interface, not web buttons") — large illuminated spaceship
 * control pads, fixed at the bottom of the wall regardless of everything
 * else happening above them.
 *
 * DISPLAY AUTHORITY: purely presentational, same "no tappable target
 * mutates canonical state on /display" convention Bubble Pop Wall's
 * StationDock already establishes (see that file's doc comment) — the
 * actual UP/FIRE/DOWN press always comes from the therapist's mirrored
 * controls (components/control/spacepilot/live/LaneControlBar.tsx). A
 * light press-scale here is purely local visual feedback, wired to no-op.
 */
export function LaneControls({ showFire = false }: LaneControlsProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-[16%] items-end justify-center gap-[4vmin] pb-[3vh]">
      <ControlPad direction="up" />
      {showFire && <FirePad />}
      <ControlPad direction="down" />
    </div>
  );
}

function ControlPad({ direction }: { direction: "up" | "down" }) {
  return (
    <motion.div
      className="flex aspect-square h-full items-center justify-center rounded-3xl border-2 border-indigo-300/40 shadow-[0_0_24px_rgba(99,102,241,0.35)]"
      style={{ background: "linear-gradient(180deg, rgba(99,102,241,0.35) 0%, rgba(30,27,75,0.55) 100%)" }}
      animate={{ opacity: [0.85, 1, 0.85] }}
      transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: direction === "down" ? 0.3 : 0 }}
    >
      <svg viewBox="0 0 24 24" className="h-[42%] w-[42%]" fill="none" stroke="#E0E7FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        {direction === "up" ? <path d="M6 15l6-6 6 6" /> : <path d="M6 9l6 6 6-6" />}
      </svg>
    </motion.div>
  );
}

function FirePad() {
  return (
    <motion.div
      className="flex aspect-square h-full items-center justify-center rounded-3xl border-2 border-rose-300/50 shadow-[0_0_24px_rgba(244,63,94,0.4)]"
      style={{ background: "linear-gradient(180deg, rgba(244,63,94,0.35) 0%, rgba(76,5,25,0.6) 100%)" }}
      animate={{ opacity: [0.85, 1, 0.85] }}
      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.15 }}
    >
      <svg viewBox="0 0 24 24" className="h-[46%] w-[46%]" fill="#FEF2F2" stroke="none">
        <path d="M13 2 L4 14 L11 14 L10 22 L20 9 L13 9 Z" />
      </svg>
    </motion.div>
  );
}

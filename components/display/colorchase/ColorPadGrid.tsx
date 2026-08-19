"use client";

import { AnimatePresence, motion } from "motion/react";
import { PAD_IDS, type ChaseColor, type ColorChaseStageRuntime, type PadId } from "@/lib/colorchase";
import { CHASE_COLOR_HEX } from "./colorPalette";

export function ColorPadGrid({ stage, successPad, successColor = null, finalSuccess = false, feedbackPad }: { stage: ColorChaseStageRuntime; successPad: PadId | null; successColor?: ChaseColor | null; finalSuccess?: boolean; feedbackPad: { padId: PadId; kind: "wrong" | "danger"; token: number } | null }) {
  const current = stage.plan.steps[stage.currentStepIndex] ?? null;
  return (
    <div className="absolute inset-x-[14%] top-[21%] bottom-[16%] grid grid-cols-3 gap-[4vmin] [perspective:900px]">
      {PAD_IDS.map((padId) => {
        const distractor = current?.distractors.find((candidate) => candidate.padId === padId);
        const color = successPad === padId && successColor ? successColor : current?.correctPadId === padId ? current.targetColor : distractor?.color ?? null;
        const danger = stage.plan.dangerPadIds.includes(padId);
        const bright = color !== null;
        const hex = color ? CHASE_COLOR_HEX[color] : "#50618F";
        const feedback = feedbackPad?.padId === padId ? feedbackPad.kind : null;
        return (
          <motion.div
            key={padId}
            data-color-chase-pad={padId}
            className="relative min-h-0 rounded-[2.4vmin] border-[0.35vmin]"
            style={{
              borderColor: danger ? "rgba(255,142,81,.8)" : bright ? `${hex}DD` : "rgba(145,166,222,.22)",
              background: danger
                ? "radial-gradient(circle, rgba(255,103,73,.34), rgba(77,20,58,.68))"
                : bright
                  ? `radial-gradient(circle at 50% 36%, ${hex}EE 0%, ${hex}A8 45%, ${hex}45 100%)`
                  : "linear-gradient(150deg, rgba(102,126,190,.16), rgba(40,53,104,.28))",
              boxShadow: danger
                ? "0 0 2.8vmin rgba(255,92,71,.35), inset 0 0 2.6vmin rgba(255,204,153,.2)"
                : bright
                  ? `0 0 4.6vmin ${hex}9A, inset 0 0 2vmin rgba(255,255,255,.58), 0 2vmin 3vmin rgba(0,0,20,.35)`
                  : "inset 0 0 2.4vmin rgba(137,160,224,.12), 0 1.3vmin 2vmin rgba(0,0,20,.25)",
            }}
            animate={feedback === "wrong" ? { x: [0, -8, 8, -5, 0], opacity: [1, 0.55, 1] } : feedback === "danger" ? { scale: [1, 0.93, 1.03, 1] } : { scale: bright || danger ? [1, 1.025, 1] : 1 }}
            transition={feedback ? { duration: 0.45 } : { duration: 2.1, repeat: bright || danger ? Infinity : 0, ease: "easeInOut" }}
          >
            <div className="absolute inset-[8%] rounded-[1.8vmin] border border-white/15 bg-gradient-to-br from-white/16 to-transparent" />
            {danger && <DangerOrb />}
            {bright && <div className="absolute inset-x-[16%] bottom-[-12%] h-[24%] rounded-full blur-[1.8vmin]" style={{ background: `${hex}82` }} />}
            <AnimatePresence>{successPad === padId && <PadSuccessBurst color={hex} final={finalSuccess} />}</AnimatePresence>
            <span className="absolute right-[8%] bottom-[5%] text-[1.35vmin] font-bold tracking-wider text-white/25">{padId.replace("PAD_", "")}</span>
          </motion.div>
        );
      })}
    </div>
  );
}

function DangerOrb() {
  return (
    <motion.svg viewBox="0 0 100 100" className="absolute inset-[20%] h-[60%] w-[60%]" animate={{ rotate: [0, 8, -8, 0] }} transition={{ duration: 2.4, repeat: Infinity }} aria-hidden="true">
      <defs><radialGradient id="danger-orb"><stop offset="0" stopColor="#FFD79A" /><stop offset=".35" stopColor="#FF6B52" /><stop offset="1" stopColor="#8A235B" /></radialGradient></defs>
      <circle cx="50" cy="52" r="29" fill="url(#danger-orb)" stroke="#FFD5A3" strokeWidth="4" />
      {Array.from({ length: 8 }, (_, index) => {
        const angle = (index / 8) * Math.PI * 2;
        return <circle key={index} cx={50 + Math.cos(angle) * 38} cy={52 + Math.sin(angle) * 38} r="5" fill="#FF9D66" />;
      })}
      <path d="M50 35v24" stroke="white" strokeWidth="8" strokeLinecap="round" /><circle cx="50" cy="70" r="5" fill="white" />
    </motion.svg>
  );
}

function PadSuccessBurst({ color, final }: { color: string; final: boolean }) {
  const particleCount = final ? 22 : 12;
  return (
    <motion.div className="pointer-events-none absolute inset-0" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.span className="absolute inset-[5%] rounded-[2vmin] border-[0.7vmin]" style={{ borderColor: color }} initial={{ scale: 0.4, opacity: 1 }} animate={{ scale: 1.45, opacity: 0 }} transition={{ duration: 0.75 }} />
      {Array.from({ length: particleCount }, (_, index) => {
        const angle = (index / particleCount) * Math.PI * 2;
        return <motion.span key={index} className="absolute top-1/2 left-1/2 h-[1.2vmin] w-[1.2vmin] rounded-full" style={{ background: index % 2 ? color : "white" }} initial={{ x: 0, y: 0, opacity: 1 }} animate={{ x: Math.cos(angle) * 55, y: Math.sin(angle) * 42, opacity: 0 }} transition={{ duration: 0.8 }} />;
      })}
      {final && <motion.span className="absolute inset-[-12%] rounded-[2.8vmin] border-[.8vmin] border-white/90" initial={{ scale: .45, opacity: 1 }} animate={{ scale: 1.75, opacity: 0 }} transition={{ duration: .95, ease: "easeOut" }} />}
    </motion.div>
  );
}

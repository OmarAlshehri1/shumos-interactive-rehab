"use client";

import { motion } from "motion/react";

export function FinalRocketPayoff() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden="true" data-final-rocket-payoff>
      <motion.div
        className="absolute top-1/2 left-[68%] h-[12vmin] w-[12vmin] -translate-x-1/2 -translate-y-1/2 rounded-full border-[.8vmin] border-cyan-100"
        initial={{ scale: 0.25, opacity: 1 }}
        animate={{ scale: 3.1, opacity: 0 }}
        transition={{ duration: 1.05, ease: "easeOut" }}
      />
      {Array.from({ length: 22 }, (_, index) => {
        const angle = (index / 22) * Math.PI * 2;
        return (
          <motion.span
            key={index}
            className="absolute top-1/2 left-[68%] h-[1vmin] w-[1vmin] rounded-full bg-white shadow-[0_0_1.2vmin_#67e8f9]"
            initial={{ x: 0, y: 0, opacity: 1, scale: 0.6 }}
            animate={{ x: Math.cos(angle) * (70 + (index % 4) * 18), y: Math.sin(angle) * (52 + (index % 3) * 14), opacity: 0, scale: 1.5 }}
            transition={{ duration: 1.05, ease: "easeOut" }}
          />
        );
      })}
    </div>
  );
}

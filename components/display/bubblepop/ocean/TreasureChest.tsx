"use client";

import { motion } from "motion/react";
import { BubbleTreasureMode } from "@/lib/bubblepop";

interface TreasureChestProps {
  /** How many missions have been correctly popped toward the chest so far. */
  completed: number;
  /** Total missions this stage counts toward the chest (== stage.bubbles.length). */
  total: number;
  /** A fresh token whenever the chest should play its "just opened" celebration (the stage's final correct pop) — never replayed from stale state (task section 18/21). */
  openedToken: string | null;
  /** PEARLS (Medium 5) or KEYS (Advanced 5's showcase finale) — a skin on the SAME progress mechanic, never a second economy (task section 12). */
  currency: BubbleTreasureMode;
}

const CURRENCY_HEX: Record<BubbleTreasureMode, string> = {
  [BubbleTreasureMode.NONE]: "#FFD68C",
  [BubbleTreasureMode.PEARLS]: "#EAF6FF",
  [BubbleTreasureMode.KEYS]: "#FFD24A",
};

/**
 * THE TREASURE CHEST (task section 12/13, Part F/G) — glows brighter with
 * every correct pop, shows a row of earned pearls/keys, then bursts open
 * with a stronger celebration on the stage's final correct answer. Small
 * and tucked to the side so it never competes with the prompt, stations, or
 * the mission bubble (task section 11's "must never block... for long").
 * Advanced 5's KEYS mode gets the showcase-tier finale (task Part G): extra
 * sea stars and a sweep of golden light alongside the usual pearls/bubbles.
 */
export function TreasureChest({ completed, total, openedToken, currency }: TreasureChestProps) {
  const progress = total > 0 ? Math.min(1, Math.max(0, completed / total)) : 0;
  const glow = 0.25 + progress * 0.75;
  const hex = CURRENCY_HEX[currency];
  const isKeys = currency === BubbleTreasureMode.KEYS;

  return (
    <div className="pointer-events-none absolute bottom-[26%] left-[3%] flex flex-col items-center gap-[1vmin]" aria-hidden="true">
      {total > 0 && (
        <div className="flex gap-[0.6vmin]" style={{ maxWidth: "16vmin" }}>
          {Array.from({ length: total }, (_, i) => (
            <RewardDot key={i} filled={i < completed} hex={hex} isKeys={isKeys} />
          ))}
        </div>
      )}

      <div className="relative h-[11vmin] w-[11vmin]">
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ background: `radial-gradient(circle, ${hex}E6 0%, ${hex}00 70%)` }}
          animate={{ opacity: glow, scale: 0.85 + glow * 0.3 }}
          transition={{ duration: 0.4 }}
        />

        <svg viewBox="0 0 100 100" className="relative h-full w-full" style={{ filter: "drop-shadow(0 0.6vmin 1vmin rgba(0,20,30,0.4))" }}>
          <rect x="14" y="46" width="72" height="40" rx="6" fill="#8A5A34" stroke="#5C3A1F" strokeWidth="2.5" />
          <rect x="14" y="60" width="72" height="6" fill="#5C3A1F" opacity="0.6" />
          <circle cx="50" cy="62" r="4.5" fill={hex} stroke="#5C3A1F" strokeWidth="1.5" />
          <motion.path
            d="M14 46 C14 30 30 20 50 20 C70 20 86 30 86 46 Z"
            fill="#A8703F"
            stroke="#5C3A1F"
            strokeWidth="2.5"
            style={{ transformOrigin: "50px 46px" }}
            animate={openedToken ? { rotate: [-2, -55, -2] } : { rotate: -2 }}
            transition={{ duration: 1.1, ease: "easeInOut" }}
          />
        </svg>

        {openedToken && (
          <motion.div key={openedToken} className="absolute inset-0" initial="hidden" animate="visible" variants={{ hidden: {}, visible: {} }}>
            {Array.from({ length: isKeys ? 20 : 14 }, (_, i) => {
              const count = isKeys ? 20 : 14;
              const angle = (i / count) * Math.PI * 2;
              const spread = 60 + (i % 3) * 12;
              return (
                <motion.span
                  key={`spark-${i}`}
                  className="absolute top-1/3 left-1/2 h-[1.4vmin] w-[1.4vmin] -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{ background: i % 2 === 0 ? hex : "#FFFFFF", boxShadow: `0 0 0.8vmin ${hex}CC` }}
                  initial={{ x: 0, y: 0, opacity: 1, scale: 0.6 }}
                  animate={{ x: Math.cos(angle) * spread, y: Math.sin(angle) * spread - 30, opacity: 0, scale: 1.1 }}
                  transition={{ duration: 1.1, delay: 0.35, ease: "easeOut" }}
                />
              );
            })}

            {/* Showcase finale extras (task Advanced 5) — sea stars + a sweep of golden light. */}
            {isKeys && (
              <>
                {Array.from({ length: 5 }, (_, i) => {
                  const angle = (i / 5) * Math.PI * 2 + Math.PI / 5;
                  return (
                    <motion.span
                      key={`star-${i}`}
                      className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2"
                      initial={{ x: 0, y: 0, opacity: 1, scale: 0.3, rotate: 0 }}
                      animate={{ x: Math.cos(angle) * 46, y: Math.sin(angle) * 46 - 22, opacity: 0, scale: 1, rotate: 90 }}
                      transition={{ duration: 1.2, delay: 0.45, ease: "easeOut" }}
                    >
                      <svg viewBox="0 0 24 24" className="h-[2.4vmin] w-[2.4vmin]" fill="#FFD24A">
                        <path d="M12 1.5l2.9 6.3 6.9.7-5.2 4.7 1.5 6.8L12 16.7l-6.1 3.3 1.5-6.8-5.2-4.7 6.9-.7z" />
                      </svg>
                    </motion.span>
                  );
                })}
                <motion.span
                  className="absolute top-1/2 left-1/2 h-[2vmin] w-[2vmin] -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{ background: "radial-gradient(circle, rgba(255,240,200,1) 0%, rgba(255,210,74,0) 70%)" }}
                  initial={{ opacity: 0.9, scale: 1 }}
                  animate={{ opacity: 0, scale: 14 }}
                  transition={{ duration: 0.9, ease: "easeOut" }}
                />
              </>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}

function RewardDot({ filled, hex, isKeys }: { filled: boolean; hex: string; isKeys: boolean }) {
  if (isKeys) {
    return (
      <svg viewBox="0 0 24 24" className="h-[1.6vmin] w-[1.6vmin]" style={{ opacity: filled ? 1 : 0.3 }} fill={filled ? hex : "none"} stroke={hex} strokeWidth="1.5">
        <circle cx="8" cy="8" r="5" />
        <path d="M11.5 11.5L20 20M16 16l3-3M19 19l2.5-2.5" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <span
      className="block h-[1.6vmin] w-[1.6vmin] rounded-full border"
      style={{ background: filled ? hex : "transparent", borderColor: hex, opacity: filled ? 1 : 0.45 }}
    />
  );
}

"use client";

import { motion } from "motion/react";

/**
 * ADVANCED's friendly alien spacecraft (task's "Add friendly/cartoon alien
 * spacecraft. NOT scary enemies... a navigation moment," never a FIRE
 * target). A rounded cartoon saucer with a soft dome and cheerful pulsing
 * running lights — deliberately warm/cute, not threatening. Always just
 * passes through on its own gentle bob; there is no "outcome" prop because
 * an alien encounter never resolves to anything but PASSED.
 */
export function AlienShipArt() {
  return (
    <motion.div className="relative h-full w-full" animate={{ y: [0, -6, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}>
      <svg viewBox="0 0 100 70" className="relative h-full w-full" style={{ filter: "drop-shadow(0 0 8px rgba(129,140,248,0.6))" }}>
        <defs>
          <radialGradient id="sp-alien-dome" cx="40%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#F0FDF4" />
            <stop offset="55%" stopColor="#86EFAC" />
            <stop offset="100%" stopColor="#22C55E" />
          </radialGradient>
          <linearGradient id="sp-alien-hull" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#C7D2FE" />
            <stop offset="60%" stopColor="#818CF8" />
            <stop offset="100%" stopColor="#4F46E5" />
          </linearGradient>
        </defs>

        {/* Saucer hull. */}
        <ellipse cx="50" cy="42" rx="46" ry="16" fill="url(#sp-alien-hull)" stroke="#3730A3" strokeWidth="2" />
        {/* Dome. */}
        <path d="M28 34 C 30 14, 70 14, 72 34 Z" fill="url(#sp-alien-dome)" stroke="#166534" strokeWidth="1.5" />
        {/* Cute porthole occupant glow. */}
        <circle cx="50" cy="27" r="7" fill="#FEF9C3" opacity="0.9" />

        {/* Running lights. */}
        {[18, 36, 50, 64, 82].map((cx, i) => (
          <motion.circle
            key={cx}
            cx={cx}
            cy="46"
            r="3"
            fill="#FDE68A"
            initial={{ opacity: 0.3 }}
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.18, ease: "easeInOut" }}
          />
        ))}

        {/* Soft underglow beam. */}
        <motion.ellipse
          cx="50"
          cy="58"
          rx="20"
          ry="5"
          fill="#A7F3D0"
          initial={{ opacity: 0.25 }}
          animate={{ opacity: [0.2, 0.45, 0.2] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
      </svg>
    </motion.div>
  );
}

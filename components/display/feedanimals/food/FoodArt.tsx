"use client";

import { motion } from "motion/react";
import { Food } from "@/lib/feedanimals";

interface FoodArtProps {
  food: Food;
}

/**
 * Custom SVG food art (task section 11) — large, colorful, recognizable,
 * never emoji as gameplay art. TASK 13: every food renders with the SAME
 * visual weight and the same gentle idle float regardless of whether it's
 * the correct choice — no glow/ring here ever hints at "this one" to the
 * child; that comes from Mariam's spoken request only (mirrors Bubble Pop
 * Wall's BubbleArt.tsx doc comment).
 */
export function FoodArt({ food }: FoodArtProps) {
  return (
    <motion.div
      className="relative h-full w-full"
      animate={{ y: [0, -3, 0, 2, 0], rotate: [0, 2, 0, -2, 0] }}
      transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
    >
      {food === Food.BANANA && <Banana />}
      {food === Food.CARROT && <Carrot />}
      {food === Food.BAMBOO && <Bamboo />}
      {food === Food.WATERMELON && <Watermelon />}
      {food === Food.LEAVES && <Leaves />}
    </motion.div>
  );
}

const SHADOW = { filter: "drop-shadow(0 0.5vmin 0.9vmin rgba(40,30,10,0.32))" } as const;

function Banana() {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" style={SHADOW} aria-hidden="true">
      <path
        d="M30 78 C20 68 20 46 34 30 C42 21 54 16 64 15 C67 15 68 18 66 20 C56 24 46 30 40 40 C32 53 33 66 42 74 C44 76 43 80 40 80 C36 80 32 80 30 78 Z"
        fill="#F2C94C"
        stroke="#D9A62A"
        strokeWidth="1.5"
      />
      <path d="M62 16 C66 14 71 15 73 19 C74 21 72 23 70 22 C68 21 65 20 63 20 Z" fill="#7A9B4E" />
      <path d="M36 40 C42 32 50 27 58 24" stroke="#FCE29B" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

function Carrot() {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" style={SHADOW} aria-hidden="true">
      <path d="M50 24 L64 80 Q50 92 36 80 Z" fill="#F2924C" stroke="#D9752E" strokeWidth="1.5" />
      <path d="M44 40 L56 40 M42 52 L58 52 M44 64 L56 64" stroke="#D9752E" strokeWidth="1.6" opacity="0.6" strokeLinecap="round" />
      <path d="M50 24 C46 12 40 8 34 6 M50 24 C50 10 50 6 50 4 M50 24 C54 12 60 8 66 6" stroke="#5E9153" strokeWidth="4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function Bamboo() {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" style={SHADOW} aria-hidden="true">
      <rect x="30" y="14" width="14" height="74" rx="6" fill="#8FC15C" stroke="#5E9153" strokeWidth="1.5" />
      <rect x="30" y="34" width="14" height="5" fill="#5E9153" />
      <rect x="30" y="58" width="14" height="5" fill="#5E9153" />
      <rect x="54" y="26" width="14" height="62" rx="6" fill="#A6D172" stroke="#5E9153" strokeWidth="1.5" />
      <rect x="54" y="46" width="14" height="5" fill="#5E9153" />
      <rect x="54" y="68" width="14" height="5" fill="#5E9153" />
      <path d="M37 14 C30 6 20 6 14 10 C20 14 28 16 37 14 Z" fill="#7AAE4A" />
      <path d="M61 26 C68 18 78 18 84 22 C78 26 70 28 61 26 Z" fill="#7AAE4A" />
    </svg>
  );
}

function Watermelon() {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" style={SHADOW} aria-hidden="true">
      <path d="M12 46 A38 38 0 0 0 88 46 Z" fill="#4E9A57" stroke="#3A7743" strokeWidth="1.5" />
      <path d="M18 46 A32 32 0 0 0 82 46 Z" fill="#EAF6E6" />
      <path d="M24 46 A26 26 0 0 0 76 46 Z" fill="#F2555A" />
      <circle cx="42" cy="38" r="2.4" fill="#2B2B2B" />
      <circle cx="52" cy="34" r="2.4" fill="#2B2B2B" />
      <circle cx="60" cy="40" r="2.4" fill="#2B2B2B" />
      <circle cx="46" cy="30" r="2" fill="#2B2B2B" />
    </svg>
  );
}

function Leaves() {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" style={SHADOW} aria-hidden="true">
      <path d="M50 20 C68 24 78 42 72 62 C64 58 52 48 50 20 Z" fill="#6FAE53" stroke="#4E8639" strokeWidth="1.4" />
      <path d="M50 20 C32 24 22 42 28 62 C36 58 48 48 50 20 Z" fill="#8FCB6B" stroke="#4E8639" strokeWidth="1.4" />
      <path d="M50 26 C56 40 58 52 55 68" stroke="#4E8639" strokeWidth="1.4" fill="none" opacity="0.7" />
      <path d="M50 26 C44 40 42 52 45 68" stroke="#4E8639" strokeWidth="1.4" fill="none" opacity="0.7" />
      <path d="M46 68 Q50 82 54 68" fill="#7AAE4A" />
    </svg>
  );
}

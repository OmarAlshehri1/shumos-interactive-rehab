"use client";

import { AnimatePresence, motion } from "motion/react";
import { type BubbleColor, type BubbleShape } from "@/lib/bubblepop";
import { BUBBLE_COLOR_HEX, BUBBLE_COLOR_NAME_AR, bubbleColorShapeCueAr } from "../bubbleColors";
import { ShapeGlyph } from "../ShapeGlyph";

interface MissionStepVisual {
  color: BubbleColor;
  shape?: BubbleShape | null;
}

interface MissionPromptProps extends MissionStepVisual {
  /** Set only on the FIRST bubble of a two-step sequence mission (task Part G's "المهمة المزدوجة") — shows both steps together, e.g. "أزرق ← ثم ← أصفر" (task: "visible prompt shows both"). */
  next?: MissionStepVisual | null;
}

/**
 * VISIBLE + SPOKEN MISSION (task section 3/4, Phase 2 Part C/G) — the
 * CURRENT request shown in upper-center, large Arabic text plus a matching
 * color swatch (and a shape glyph for a color+shape mission), so the child
 * never has to rely on voice alone. Stays mounted for as long as a mission is
 * active (task's "keep the prompt visible until success") — the parent only
 * unmounts/replaces it when the target actually changes.
 */
export function MissionPrompt({ color, shape, next }: MissionPromptProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[3%] flex justify-center px-6">
      <AnimatePresence mode="wait">
        <motion.div
          key={`${color}-${shape ?? ""}-${next?.color ?? ""}-${next?.shape ?? ""}`}
          className="flex items-center gap-[2.4vmin] rounded-full border border-white/25 bg-white/12 px-[4.2vmin] py-[1.6vmin] shadow-[0_8px_28px_rgba(6,40,61,0.35)] backdrop-blur-sm"
          initial={{ opacity: 0, y: -14, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 220, damping: 18 }}
        >
          <MissionStepPill color={color} shape={shape} />
          {next && (
            <>
              <span className="text-[3.2vmin] font-bold text-white/70" aria-hidden="true">
                ←
              </span>
              <MissionStepPill color={next.color} shape={next.shape} muted />
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function MissionStepPill({ color, shape, muted = false }: MissionStepVisual & { muted?: boolean }) {
  const hex = BUBBLE_COLOR_HEX[color];
  const label = shape ? bubbleColorShapeCueAr(color, shape) : `فرقع ${BUBBLE_COLOR_NAME_AR[color]}!`;
  return (
    <span className="flex items-center gap-[1.4vmin]" style={{ opacity: muted ? 0.6 : 1 }}>
      <span className="relative h-[5vmin] w-[5vmin] shrink-0 rounded-full border border-white/60" style={{ background: hex, boxShadow: `0 0 2.4vmin ${hex}` }}>
        {shape && (
          <span className="absolute inset-0 flex items-center justify-center">
            <ShapeGlyph shape={shape} className="h-[62%] w-[62%]" fill="white" />
          </span>
        )}
      </span>
      <span className="text-[4vmin] leading-none font-extrabold text-white drop-shadow-[0_3px_12px_rgba(6,40,61,0.5)]">{label}</span>
    </span>
  );
}

"use client";

import { motion } from "motion/react";

interface SpacePilotReadyPositionOverlayProps {
  onChildReady: () => void;
  onRequestEndSession: () => void;
}

/**
 * WALL-PROJECTION READY POSITION — Space Pilot's own analogue to the floor
 * games' StartZoneOverlay / Bubble Pop Wall's ReadyPositionOverlay, shown at
 * GameState.START_ZONE. Same therapist-authoritative model: no camera/wall
 * sensor, the therapist visually confirms the child is standing back from
 * the projected wall and taps "الطفل جاهز" themselves.
 */
export function SpacePilotReadyPositionOverlay({ onChildReady, onRequestEndSession }: SpacePilotReadyPositionOverlayProps) {
  return (
    <motion.div
      className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-white/97 px-6 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <button
        type="button"
        onClick={onRequestEndSession}
        className="absolute top-4 end-4 min-h-11 touch-manipulation rounded-full px-4 py-2 text-sm font-semibold text-rose-400 transition-colors active:text-rose-600"
      >
        إنهاء الجلسة
      </button>

      <div className="flex flex-col items-center gap-2 text-center">
        <span className="text-4xl" aria-hidden="true">
          🙆
        </span>
        <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">بانتظار وقوف الطفل مقابل الجدار</h2>
        <p className="max-w-xs text-sm leading-relaxed text-slate-500">تأكد من وقوف الطفل في مكان آمن مقابل الشاشة، مستعدًا لتحريك الصاروخ.</p>
      </div>

      <button
        type="button"
        onClick={onChildReady}
        className="min-h-16 w-full max-w-xs touch-manipulation rounded-2xl bg-indigo-600 text-xl font-bold text-white shadow-lg shadow-indigo-900/15 transition-all active:scale-[0.98]"
      >
        الطفل جاهز ✓
      </button>
    </motion.div>
  );
}

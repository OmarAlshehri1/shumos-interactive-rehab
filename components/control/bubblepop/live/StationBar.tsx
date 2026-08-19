"use client";

import { currentTargetId, getBubbleStagePlan, type BubbleColor, type BubblePopStageRuntime, type BubbleShape } from "@/lib/bubblepop";
import { BUBBLE_COLOR_HEX } from "../copy";

interface StationBarProps {
  stage: BubblePopStageRuntime;
  disabled: boolean;
  offline?: boolean;
  onConfirm: (color: BubbleColor, shape?: BubbleShape) => void;
}

/**
 * THERAPIST STATION BAR (task section 1/2/5, Phase 2 Part G) — replaces the
 * old per-bubble BubbleMap now that the child's interaction target is a
 * fixed STATION, not a specific bubble on a scattered field. Mirrors the
 * SAME station set /display renders in its own dock: a fixed color palette
 * for a plain mission (getBubbleStagePlan's `stations`), or the CURRENT
 * mission's own per-mission (color, shape) candidate token set for a
 * color+shape mission (`target.stationTokens`) — task section 14's single
 * source of truth either way.
 *
 * TASK 33: the current mission's station gets a small therapist-side ring so
 * the therapist always knows which one to confirm — same convention the old
 * BubbleMap used for its current-target bubble. The CHILD-facing /display
 * never highlights a station this way (task section 4's "do NOT highlight
 * the correct answer station before selection").
 */
export function StationBar({ stage, disabled, offline, onConfirm }: StationBarProps) {
  const targetId = currentTargetId(stage);
  const target = stage.bubbles.find((b) => b.id === targetId) ?? null;
  const plan = getBubbleStagePlan(stage.difficulty, stage.stageNumber);

  const items: { key: string; color: BubbleColor; shape?: BubbleShape; isCurrent: boolean }[] =
    target?.requiresShape && target.stationTokens.length > 0
      ? target.stationTokens.map((t, i) => ({
          key: `${t.color}-${t.shape}-${i}`,
          color: t.color,
          shape: t.shape,
          isCurrent: t.color === target.color && t.shape === target.shape,
        }))
      : plan.stations.map((color) => ({ key: color, color, isCurrent: color === target?.color }));

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div
        className="relative flex min-h-0 flex-1 flex-wrap items-center justify-center gap-3 rounded-3xl border-2 border-slate-200 bg-gradient-to-b from-sky-950 to-cyan-950 p-4 transition-opacity"
        style={{ opacity: disabled ? 0.6 : 1 }}
      >
        {offline && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <span className="rounded-full bg-slate-900/80 px-4 py-2 text-sm font-bold text-white shadow-lg">غير متصل</span>
          </div>
        )}

        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            disabled={disabled}
            aria-label={item.isCurrent ? "current-station-target" : `station-${item.color.toLowerCase()}${item.shape ? `-${item.shape.toLowerCase()}` : ""}`}
            onClick={() => onConfirm(item.color, item.shape)}
            className={`relative flex aspect-square min-w-0 flex-1 touch-manipulation flex-col items-center justify-center gap-1 rounded-full border-2 shadow-md transition-transform duration-150 select-none active:scale-90 disabled:cursor-not-allowed ${
              item.isCurrent ? "border-white shadow-[0_0_18px_rgba(255,255,255,0.65)]" : "border-white/30"
            }`}
            style={{ maxWidth: items.length > 4 ? "22%" : "34%" }}
          >
            <span
              className="block h-[70%] w-[70%] rounded-full"
              style={{ background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.6), ${BUBBLE_COLOR_HEX[item.color]} 68%)` }}
            />
            {item.shape && (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <ShapeGlyph shape={item.shape} />
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-slate-400">
        <span>الطفل يضغط لؤلؤة اللون أمام الجدار — اضغط نفس اللؤلؤة هنا لتأكيدها</span>
      </div>
    </div>
  );
}

/** Compact shape glyph — deliberately duplicated from components/display/bubblepop/ShapeGlyph.tsx rather than imported, same "control never depends on the display component layer" convention this game's platform already follows. */
function ShapeGlyph({ shape }: { shape: BubbleShape }) {
  const common = { className: "h-[34%] w-[34%]", fill: "rgba(255,255,255,0.95)" } as const;
  switch (shape) {
    case "STAR":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M12 1.5l2.9 6.3 6.9.7-5.2 4.7 1.5 6.8L12 16.7l-6.1 3.3 1.5-6.8-5.2-4.7 6.9-.7z" />
        </svg>
      );
    case "HEART":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M12 21s-7.5-4.6-10-9.3C0.4 8.1 2.4 4.5 6 4.5c2 0 3.6 1.1 4.5 2.7C11.4 5.6 13 4.5 15 4.5c3.6 0 5.6 3.6 4 7.2C19.5 16.4 12 21 12 21z" />
        </svg>
      );
    case "TRIANGLE":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M12 3l10 18H2z" />
        </svg>
      );
    case "DIAMOND":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M12 2l6 8-6 12-6-12z" />
        </svg>
      );
    default:
      return null;
  }
}

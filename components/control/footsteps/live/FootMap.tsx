"use client";

import { useEffect, useState } from "react";
import { Foot, type Footprint, type RouteCheckpoint, type RouteObstacle, START_ZONE } from "@/lib/footsteps";
import { ObstacleArt } from "@/components/display/footsteps/obstacles/ObstacleArt";

interface FootMapProps {
  footprints: Footprint[];
  checkpoints: RouteCheckpoint[];
  obstacles: RouteObstacle[];
  destination: { x: number; y: number };
  /** The next-to-confirm target's index — only this one is tappable. */
  currentIndex: number;
  disabled: boolean;
  offline?: boolean;
  onConfirm: () => void;
}

/**
 * THERAPIST LIVE MAP — shows the SAME canonical path /display renders:
 * completed footprints (behind the child), the current (confirmable)
 * target, a soft preview of the next one, checkpoint stars, cosmic
 * obstacles, and the destination star — so the therapist never has to guess
 * which step to confirm (task section 18). Same normalized-coordinate/
 * orientation convention as Balloon Quest's BalloonMap.tsx: y=1 is the near/
 * child edge, and the Start Zone rectangle comes from the exact same
 * lib/game/startZone.ts constant /display uses.
 *
 * STEP CONFIRMATION: only the target at `currentIndex` is tappable — ONE
 * footprint, ONE confirmation (the old SINGLE/PAIR two-feet-at-once mechanic
 * was removed). Tapping a future preview is a no-op — never penalizes the
 * child — but gives the therapist a gentle nudge on the actual current
 * target instead of silently doing nothing.
 */
export function FootMap({ footprints, checkpoints, obstacles, destination, currentIndex, disabled, offline, onConfirm }: FootMapProps) {
  const [nudge, setNudge] = useState(0);

  useEffect(() => {
    if (nudge === 0) return;
    const timer = setTimeout(() => setNudge(0), 420);
    return () => clearTimeout(timer);
  }, [nudge]);

  const currentFootprint = footprints.find((f) => f.index === currentIndex) ?? null;
  const otherFootprints = footprints.filter((f) => f.index !== currentIndex);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div
        className="relative min-h-0 flex-1 overflow-hidden rounded-3xl border-2 border-slate-200 bg-gradient-to-b from-indigo-950 to-slate-900 transition-opacity"
        style={{ containerType: "size", opacity: disabled ? 0.6 : 1 }}
      >
        {/* Faint starfield backdrop so the map reads as "the cosmic floor," not a plain dark rectangle. */}
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{ backgroundImage: "radial-gradient(1px 1px at 20% 30%, white, transparent), radial-gradient(1px 1px at 60% 70%, white, transparent), radial-gradient(1px 1px at 80% 20%, white, transparent), radial-gradient(1px 1px at 40% 85%, white, transparent)" }}
        />

        <div
          className="pointer-events-none absolute flex items-center justify-center rounded-lg border-2 border-dashed border-white/50 bg-white/10"
          style={{
            left: `${START_ZONE.xMin * 100}%`,
            top: `${START_ZONE.yMin * 100}%`,
            width: `${(START_ZONE.xMax - START_ZONE.xMin) * 100}%`,
            height: `${(START_ZONE.yMax - START_ZONE.yMin) * 100}%`,
          }}
        >
          <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold whitespace-nowrap text-indigo-700 shadow-sm">مكان الطفل</span>
        </div>

        {/* JOURNEY REDESIGN — checkpoint stars: smaller/dimmer than the destination until reached. */}
        {checkpoints.map((checkpoint) => {
          const reached = currentIndex > checkpoint.afterTargetIndex;
          return (
            <div
              key={checkpoint.id}
              className="pointer-events-none absolute flex items-center justify-center"
              style={{ left: `${checkpoint.position.x * 100}%`, top: `${checkpoint.position.y * 100}%`, transform: "translate(-50%, -50%)" }}
            >
              <span
                className="text-[clamp(11px,2.6cqmin,17px)] transition-opacity"
                style={{ opacity: reached ? 1 : 0.4 }}
                aria-hidden="true"
              >
                ⭐
              </span>
            </div>
          );
        })}

        {/* نجمة الهدف */}
        <div
          className="pointer-events-none absolute flex items-center justify-center"
          style={{ left: `${destination.x * 100}%`, top: `${destination.y * 100}%`, transform: "translate(-50%, -50%)" }}
        >
          <span className="text-[clamp(16px,4cqmin,26px)]" aria-hidden="true">
            ⭐
          </span>
        </div>

        {/* ROUTE ARCHITECTURE REWRITE — every cosmic obstacle on this stage's route, dimmed until it's the CURRENT one, same "therapist sees the full route" philosophy as checkpoints above. */}
        {obstacles.map((obstacle) => {
          const isActive = obstacle.afterTargetIndex + 1 === currentIndex;
          const isCleared = currentIndex > obstacle.afterTargetIndex + 1;
          return (
            <div
              key={obstacle.id}
              className="pointer-events-none absolute"
              style={{
                left: `${obstacle.position.x * 100}%`,
                top: `${obstacle.position.y * 100}%`,
                width: "clamp(20px, 7cqmin, 13vmin)",
                height: "clamp(20px, 7cqmin, 13vmin)",
                transform: `translate(-50%, -50%) rotate(${obstacle.rotationDeg}deg)`,
                opacity: isCleared ? 0.3 : isActive ? 1 : 0.55,
              }}
            >
              <ObstacleArt kind={obstacle.kind} />
            </div>
          );
        })}

        {offline && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <span className="rounded-full bg-slate-900/80 px-4 py-2 text-sm font-bold text-white shadow-lg">غير متصل</span>
          </div>
        )}

        {otherFootprints.map((footprint) => {
          const isCompleted = footprint.index < currentIndex;
          const isNextPreview = footprint.index === currentIndex + 1;
          const style: React.CSSProperties = {
            position: "absolute",
            left: `${footprint.position.x * 100}%`,
            top: `${footprint.position.y * 100}%`,
            width: "clamp(30px, 10cqmin, 20vmin)",
            height: "clamp(30px, 10cqmin, 20vmin)",
            transform: `translate(-50%, -50%) rotate(${footprint.rotationDeg}deg)`,
          };

          return (
            <div
              key={footprint.id}
              style={style}
              onClick={!disabled && footprint.index > currentIndex ? () => setNudge((n) => n + 1) : undefined}
              className={`flex items-center justify-center rounded-[40%] ${footprint.index > currentIndex ? "cursor-pointer" : ""}`}
            >
              <span
                className="flex h-full w-full items-center justify-center rounded-[40%]"
                style={{
                  background: isCompleted ? "rgba(148,163,255,0.35)" : isNextPreview ? "rgba(148,163,255,0.22)" : "rgba(148,163,255,0.1)",
                  border: isCompleted ? "1px solid rgba(216,225,255,0.5)" : "1px dashed rgba(216,225,255,0.3)",
                }}
              >
                <FootIcon foot={footprint.foot} dim={!isCompleted} />
              </span>
            </div>
          );
        })}

        {/* The current target — ONE footprint, ONE tappable confirm button (the old SINGLE/PAIR two-feet-at-once mechanic was removed). */}
        {currentFootprint && (
          <button
            key={`current-${currentIndex}`}
            type="button"
            disabled={disabled}
            aria-label={`current-footprint-${currentFootprint.foot.toLowerCase()}`}
            onClick={onConfirm}
            style={{
              position: "absolute",
              left: `${currentFootprint.position.x * 100}%`,
              top: `${currentFootprint.position.y * 100}%`,
              width: "clamp(30px, 10cqmin, 20vmin)",
              height: "clamp(30px, 10cqmin, 20vmin)",
              transform: "translate(-50%, -50%)",
            }}
            className={`touch-manipulation rounded-[40%] border-2 border-white shadow-[0_0_18px_rgba(255,255,255,0.55)] transition-transform duration-150 select-none active:scale-90 disabled:cursor-not-allowed ${
              nudge ? "animate-[bq-control-shake_0.4s_ease-in-out]" : ""
            }`}
          >
            <span className="flex h-full w-full items-center justify-center gap-1 rounded-[40%] bg-amber-300">
              <FootIcon foot={currentFootprint.foot} />
            </span>
          </button>
        )}
      </div>

      <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-slate-400">
        <span>جهة الطفل</span>
        <svg viewBox="0 0 20 20" className="h-3 w-3 fill-slate-400">
          <path d="M10 14 4 8l1.4-1.4L10 11.2l4.6-4.6L16 8z" />
        </svg>
      </div>
    </div>
  );
}

function FootIcon({ foot, dim }: { foot: Foot; dim?: boolean }) {
  return (
    <svg viewBox="0 0 24 34" className="h-[55%] w-auto" style={{ opacity: dim ? 0.65 : 1 }} aria-hidden="true">
      <path
        d="M12 2c3.5 0 5.5 3 5.5 7 0 2.4-.8 3.6-.4 6.2.4 2.6 2 5 2 9 0 4.6-2.8 8-7.1 8S5 28.8 5 24.2c0-4 1.6-6.4 2-9 .4-2.6-.4-3.8-.4-6.2 0-4 2-7 5.4-7Z"
        fill={foot === Foot.LEFT ? "#F0B429" : "#6EE7F0"}
      />
    </svg>
  );
}

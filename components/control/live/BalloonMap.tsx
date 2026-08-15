"use client";

import type { Balloon } from "@/lib/game";
import { START_ZONE } from "@/lib/game";
import { BALLOON_COLOR_THEME } from "@/components/display/colorPalette";

interface IncorrectSignal {
  balloonId: string;
  token: number;
}

interface BalloonMapProps {
  balloons: Balloon[];
  incorrectSignal: IncorrectSignal | null;
  disabled: boolean;
  /**
   * TASK 8: true specifically when disabled because Firebase isn't
   * connected — shows an explicit "غير متصل" label on the map itself, not
   * just a dimmed/disabled button state, so the therapist never mistakes
   * "can't tap right now" for "tapped, but nothing happened." See the
   * report's "Offline-action behavior" section: Firebase would otherwise
   * queue a tap locally and silently replay it once reconnected, which is
   * unsafe for a therapist physically watching the child react in real time.
   */
  offline?: boolean;
  onSelect: (balloonId: string) => void;
}

/**
 * Renders the CURRENT stage's actual balloons — same ids, colors,
 * normalized (x, y) positions, and popped state the engine generated for
 * this session (the exact same StageRuntime /display would render, if it
 * were connected — see Task 6). Never invents its own layout or snaps
 * balloons to a grid: position/size come straight from lib/game, exactly
 * like components/display/balloon/BalloonField.tsx does for the projector.
 *
 * MAP ORIENTATION ASSUMPTION (see Task 5 report for the full rationale):
 * this map assumes the projected image's normalized (x, y) maps directly
 * onto this card's (x, y) with no rotation or mirroring. y=1 (the bottom of
 * this card) is the near/front edge — the same "lower half of the image"
 * convention lib/game/stageGenerator.ts already uses for PlayArea.FRONT.
 * The "جهة الطفل" caption below the map marks that edge explicitly. This is
 * a documented assumption, not a verified physical mapping — there is no
 * real projector to test against yet, so Task 6 or the physical
 * installation should confirm/correct it, not silently rotate this file.
 *
 * TASK 8.2: the Start Zone rectangle below is positioned from the exact
 * same lib/game/startZone.ts constant /display's projected marker uses —
 * this map and the projector floor can never draw the zone in different
 * places, because there is only ever one place the number comes from. This
 * doubles as this map's own orientation anchor: "مكان الطفل" sits at the
 * same near/bottom edge "جهة الطفل" already pointed to.
 */
export function BalloonMap({ balloons, incorrectSignal, disabled, offline, onSelect }: BalloonMapProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div
        className={`relative min-h-0 flex-1 overflow-hidden rounded-3xl border-2 border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100 transition-opacity ${
          disabled ? "opacity-60" : ""
        }`}
        style={{ containerType: "size" }}
      >
        {/* Subtle front-edge cue, purely visual — never intercepts taps. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[15%] bg-gradient-to-t from-teal-500/10 to-transparent" />

        {/* TASK 8.2: Start Zone — unmistakable but deliberately not dominant (a thin dashed outline + small label, not a solid fill). */}
        <div
          className="pointer-events-none absolute flex items-center justify-center rounded-lg border-2 border-dashed border-teal-500/60 bg-teal-500/10"
          style={{
            left: `${START_ZONE.xMin * 100}%`,
            top: `${START_ZONE.yMin * 100}%`,
            width: `${(START_ZONE.xMax - START_ZONE.xMin) * 100}%`,
            height: `${(START_ZONE.yMax - START_ZONE.yMin) * 100}%`,
          }}
        >
          <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold whitespace-nowrap text-teal-700 shadow-sm">
            مكان الطفل
          </span>
        </div>

        {offline && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <span className="rounded-full bg-slate-900/80 px-4 py-2 text-sm font-bold text-white shadow-lg">غير متصل</span>
          </div>
        )}

        {balloons.map((balloon) => {
          const theme = BALLOON_COLOR_THEME[balloon.color];
          const shaking = incorrectSignal?.balloonId === balloon.id;
          const style: React.CSSProperties = {
            position: "absolute",
            left: `${balloon.position.x * 100}%`,
            top: `${balloon.position.y * 100}%`,
            width: `clamp(44px, ${balloon.size * 100}cqmin, 30vmin)`,
            height: `clamp(44px, ${balloon.size * 100}cqmin, 30vmin)`,
            transform: "translate(-50%, -50%)",
          };

          if (balloon.isPopped) {
            return (
              <div key={balloon.id} style={style} className="flex items-center justify-center rounded-full bg-white/70">
                <svg viewBox="0 0 20 20" className="h-[45%] w-[45%] fill-emerald-500">
                  <path d="M8 13.5 4.5 10l1.4-1.4L8 10.7l6.1-6.1L15.5 6z" />
                </svg>
              </div>
            );
          }

          return (
            <button
              key={balloon.id}
              type="button"
              disabled={disabled}
              aria-label={`balloon-${balloon.color.toLowerCase()}`}
              onClick={() => onSelect(balloon.id)}
              style={style}
              className={`touch-manipulation rounded-full border-2 border-black/10 shadow-sm transition-transform duration-150 select-none active:scale-90 disabled:cursor-not-allowed ${
                shaking ? "animate-[bq-control-shake_0.4s_ease-in-out]" : ""
              }`}
            >
              <span className="block h-full w-full rounded-full" style={{ backgroundColor: theme.base }} />
            </button>
          );
        })}
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

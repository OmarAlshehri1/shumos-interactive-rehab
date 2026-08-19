"use client";

import { currentRound, type FeedAnimalsStageRuntime } from "@/lib/feedanimals";
import { FOOD_NAME_AR } from "../copy";

interface AnimalFoodMapProps {
  stage: FeedAnimalsStageRuntime;
  disabled: boolean;
  offline?: boolean;
  onConfirm: (foodChoiceId: string) => void;
}

const FOOD_HEX: Record<string, string> = {
  BANANA: "#F2C94C",
  CARROT: "#F2924C",
  BAMBOO: "#8FC15C",
  WATERMELON: "#F2555A",
  LEAVES: "#6FAE53",
};

/**
 * THERAPIST LIVE MAP (task section 24) — shows the animal, the requested
 * food, every food choice, and their exact wall positions, all for the
 * CURRENT active round. Every food choice is a real tappable button (same
 * "therapist confirms the child's selection, engine alone decides correct/
 * incorrect" model as Bubble Pop Wall's BubbleMap). The correct choice is
 * clearly marked for the therapist only (a ring + label) — DISPLAY never
 * shows this (see FeedAnimalsPlayingScene's doc comment), keeping the
 * matching challenge genuine for the child.
 */
export function AnimalFoodMap({ stage, disabled, offline, onConfirm }: AnimalFoodMapProps) {
  const round = currentRound(stage);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div
        className="relative min-h-0 flex-1 overflow-hidden rounded-3xl border-2 border-slate-200 bg-gradient-to-b from-amber-200 to-amber-700 transition-opacity"
        style={{ containerType: "size", opacity: disabled ? 0.6 : 1 }}
      >
        {/* Wall orientation cues — deliberately faint, never competing with the map content. */}
        <span className="pointer-events-none absolute inset-x-0 top-1.5 text-center text-[10px] font-bold tracking-wide text-amber-950/40">أعلى الجدار</span>
        <span className="pointer-events-none absolute inset-x-0 bottom-1.5 text-center text-[10px] font-bold tracking-wide text-amber-950/40">أسفل الجدار</span>
        <span className="pointer-events-none absolute top-1/2 start-1.5 -translate-y-1/2 text-[10px] font-bold text-amber-950/30">يمين</span>
        <span className="pointer-events-none absolute top-1/2 end-1.5 -translate-y-1/2 text-[10px] font-bold text-amber-950/30">يسار</span>

        {offline && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <span className="rounded-full bg-slate-900/80 px-4 py-2 text-sm font-bold text-white shadow-lg">غير متصل</span>
          </div>
        )}

        {round && (
          <>
            {/* The animal — never tappable, purely a positional/context reference for the therapist. */}
            <div
              className="absolute flex items-center justify-center rounded-full border-2 border-white/50 bg-white/20 text-[10px] font-bold text-white"
              style={{
                left: `${round.animalPosition.x * 100}%`,
                top: `${round.animalPosition.y * 100}%`,
                width: "clamp(50px, 22cqmin, 20vmin)",
                height: "clamp(50px, 22cqmin, 20vmin)",
                transform: "translate(-50%, -50%)",
              }}
            >
              🐾
            </div>

            {round.choices.map((choice) => {
              const isCorrect = choice.food === round.correctFood;
              return (
                <button
                  key={choice.id}
                  type="button"
                  disabled={disabled}
                  aria-label={isCorrect ? "correct-food-choice" : `food-${choice.food.toLowerCase()}`}
                  onClick={() => onConfirm(choice.id)}
                  style={{
                    position: "absolute",
                    left: `${choice.position.x * 100}%`,
                    top: `${choice.position.y * 100}%`,
                    width: `clamp(30px, ${choice.size * 100}cqmin, 22vmin)`,
                    height: `clamp(30px, ${choice.size * 100}cqmin, 22vmin)`,
                    transform: "translate(-50%, -50%)",
                  }}
                  className={`touch-manipulation rounded-full border-2 shadow-sm transition-transform duration-150 select-none active:scale-90 disabled:cursor-not-allowed ${
                    isCorrect ? "border-white shadow-[0_0_14px_rgba(255,255,255,0.75)]" : "border-white/30"
                  }`}
                >
                  <span
                    className="block h-full w-full rounded-full"
                    style={{ background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.6), ${FOOD_HEX[choice.food]} 65%)` }}
                  />
                </button>
              );
            })}
          </>
        )}
      </div>

      <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-slate-400">
        {round ? <span>الحلقة المطلوبة: {FOOD_NAME_AR[round.correctFood]} (محددة بحلقة بيضاء)</span> : <span>الطفل يقف مقابل الجدار</span>}
      </div>
    </div>
  );
}

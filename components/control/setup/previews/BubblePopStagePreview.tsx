"use client";

import { useMemo } from "react";
import { BubbleMovementMode, BubbleTreasureMode, getBubbleStagePlan, type Difficulty, type StageNumber } from "@/lib/bubblepop";
import { BUBBLE_COLOR_HEX } from "@/components/control/bubblepop/copy";

interface BubblePopStagePreviewProps {
  difficulty: Difficulty;
  stageNumber: StageNumber;
}

const LANE_Y_BY_COUNT: Record<1 | 2 | 3, readonly number[]> = {
  1: [0.34],
  2: [0.22, 0.42],
  3: [0.16, 0.32, 0.48],
};

/**
 * THERAPIST SETUP SIMPLIFICATION — non-interactive miniature of a real
 * Bubble Pop Wall stage (task section 14/Part H's single source of truth:
 * reads the SAME getBubbleStagePlan the real session/generator uses, never
 * a decorative stand-in). Shows the station dock (or, for a color+shape
 * stage, a small candidate-token grid), a sample bubble per lane with a
 * direction arrow — direction per LANE for DUAL_CURRENT stages, per mission
 * index otherwise — a sequence link for a two-step stage, and this stage's
 * decorations (fish/turtle/jellyfish/seahorse/treasure) — so all 15 Stage
 * Cards read as 15 genuinely different stages, not "same layout, more dots."
 */
export function BubblePopStagePreview({ difficulty, stageNumber }: BubblePopStagePreviewProps) {
  const plan = useMemo(() => getBubbleStagePlan(difficulty, stageNumber), [difficulty, stageNumber]);
  const lanes = LANE_Y_BY_COUNT[plan.laneCount];
  const isSequence = plan.sequenceLength === 2;

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden bg-gradient-to-b from-sky-950 to-cyan-950"
      style={{ containerType: "size" }}
      aria-hidden="true"
    >
      {/* Sample bubbles, one per lane, with a direction arrow. */}
      {lanes.map((laneY, i) => {
        const color = plan.stations[i % plan.stations.length];
        const goesRightToLeft =
          plan.movementMode === BubbleMovementMode.DUAL_CURRENT
            ? i % 2 === 0
            : plan.movementMode === BubbleMovementMode.ALTERNATING
              ? i % 2 === 0
              : plan.movementMode === BubbleMovementMode.RIGHT_TO_LEFT;
        const bubbleX = goesRightToLeft ? 68 : 32;
        return (
          <div key={i} className="absolute" style={{ left: `${bubbleX}%`, top: `${laneY * 100}%`, transform: "translate(-50%, -50%)" }}>
            <span
              className="block rounded-full border border-white/30"
              style={{
                width: "16cqmin",
                height: "16cqmin",
                background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.6), ${BUBBLE_COLOR_HEX[color]} 68%)`,
              }}
            />
            <span
              className="absolute top-1/2 text-[9px] font-bold text-white/70"
              style={{ [goesRightToLeft ? "right" : "left"]: "100%", transform: "translateY(-50%)" }}
            >
              {goesRightToLeft ? "←" : "→"}
            </span>
            {isSequence && i === 0 && (
              <span className="absolute top-1/2 text-[10px] font-bold text-white/80" style={{ left: "130%", transform: "translateY(-50%)" }}>
                ⋯
              </span>
            )}
          </div>
        );
      })}

      {/* Friendly fish. */}
      {plan.seaLife.fish !== "NONE" &&
        (plan.seaLife.fish === "SCHOOL" ? [12, 30, 76, 88] : [18, 78]).map((x, i) => (
          <span
            key={i}
            className="absolute rounded-[45%] opacity-80"
            style={{ left: `${x}%`, top: `${10 + (i % 2) * 8}%`, width: "8%", height: "5%", background: "#F2C94C" }}
          />
        ))}

      {/* Turtle. */}
      {plan.seaLife.turtle && (
        <span className="absolute rounded-[50%] opacity-80" style={{ left: "50%", top: "10%", width: "12%", height: "8%", background: "#4E9A6E" }} />
      )}

      {/* Jellyfish — a small dome + trailing lines. */}
      {plan.seaLife.jellyfish && (
        <span className="absolute opacity-85" style={{ left: "44%", top: "8%", width: "12%", height: "16%" }}>
          <span className="block h-[55%] w-full rounded-t-full" style={{ background: "rgba(220,190,255,0.75)" }} />
        </span>
      )}

      {/* Seahorse — a thin curved silhouette. */}
      {plan.seaLife.seahorse && (
        <span
          className="absolute opacity-85"
          style={{ left: "62%", top: "12%", width: "5%", height: "14%", background: "#F2924C", borderRadius: "40% 40% 50% 10%" }}
        />
      )}

      {/* Treasure/key chest. */}
      {plan.treasureMode !== BubbleTreasureMode.NONE && (
        <div className="absolute" style={{ left: "8%", bottom: "22%", width: "14%", height: "12%" }}>
          <div
            className="h-full w-full rounded-sm border"
            style={{
              background: "#8A5A34",
              borderColor: plan.treasureMode === BubbleTreasureMode.KEYS ? "#FFD24A" : "#B98F5F",
              boxShadow: plan.treasureMode === BubbleTreasureMode.KEYS ? "0 0 6px rgba(255,210,74,0.7)" : "none",
            }}
          />
        </div>
      )}

      {/* Station dock — fixed reachable row for a plain color stage, or a candidate token grid for a color+shape stage (task Part G). */}
      <div className="absolute inset-x-0 bottom-0 flex h-[22%] flex-wrap items-end justify-center gap-[3%] pb-[6%]">
        {(plan.missionMode === "COLOR_AND_SHAPE" || plan.mixedMode
          ? Array.from({ length: plan.stationCount }, (_, i) => plan.stations[i % plan.stations.length])
          : plan.stations
        ).map((color, i) => (
          <span
            key={`${color}-${i}`}
            className="rounded-full border border-white/40"
            style={{
              width: plan.stationCount > 4 ? "13%" : "18%",
              height: "70%",
              background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.6), ${BUBBLE_COLOR_HEX[color]} 68%)`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

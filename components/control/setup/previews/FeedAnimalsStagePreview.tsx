"use client";

import { useMemo } from "react";
import { feedAnimalsObstacleRequiresJump, getFeedAnimalsPathStage, type Difficulty, type FeedAnimalsPathStageDefinition, type StageNumber } from "@/lib/feedanimals";
import { buildArcLengthTable, buildWaypointCenterline, sampleAtDistance } from "@/lib/feedanimals/pathCurve";
import { getFeedAnimalsStagePreset } from "@/lib/control/feedanimals/stagePreset";

interface FeedAnimalsStagePreviewProps {
  difficulty: Difficulty;
  stageNumber: StageNumber;
}

const PREVIEW_TRAIL_POINTS = 14;

const ANIMAL_DOT: Record<string, string> = { MONKEY: "#8C5A3A", RABBIT: "#F3E9DD", PANDA: "#2B2B2B", ELEPHANT: "#CBD3DB", GIRAFFE: "#F2C572" };
const FOOD_HEX: Record<string, string> = {
  BANANA: "#F2C94C",
  CARROT: "#F2924C",
  BAMBOO: "#8FC15C",
  WATERMELON: "#F2555A",
  LEAVES: "#6FAE53",
};

/**
 * SAFARI ANIMAL ADVENTURE — every Stage Card's miniature: every leg's own
 * trail from its animal's start to its destination (task's "the previews
 * must come from the same stage definitions used by gameplay" — never a
 * decorative stand-in), built from the exact same hand-authored waypoints
 * the real stage uses (lib/feedanimals/pathStages.ts). Multi-animal stages
 * (Medium 5 / Advanced 4 / Advanced 5) render every leg's trail at once so
 * the therapist sees the whole mission at a glance. Obstacles render as
 * small warning marks; a jump-requiring one is visually distinct from a
 * decorative rock.
 */
function FeedAnimalsPathStagePreview({ pathDef }: { pathDef: FeedAnimalsPathStageDefinition }) {
  const legTrails = useMemo(
    () =>
      pathDef.legs.map((leg) => {
        const table = buildArcLengthTable(buildWaypointCenterline(leg.waypoints));
        return Array.from({ length: PREVIEW_TRAIL_POINTS }, (_, i) => sampleAtDistance(table, table.totalLength * (i / (PREVIEW_TRAIL_POINTS - 1))).position);
      }),
    [pathDef.legs],
  );

  return (
    <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-amber-200 to-amber-700" aria-hidden="true">
      {pathDef.legs.map((leg, legIndex) => {
        const trail = legTrails[legIndex];
        const start = leg.waypoints[0];
        const destination = leg.waypoints[leg.waypoints.length - 1];
        return (
          <div key={legIndex}>
            {trail.map((p, i) => (
              <span key={i} className="absolute h-[3.4%] w-[3.4%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/30" style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }} />
            ))}
            {leg.obstacles.map((o, i) => {
              const table = buildArcLengthTable(buildWaypointCenterline(leg.waypoints));
              const sample = sampleAtDistance(table, table.totalLength * (o.atStep / leg.totalSteps));
              const jump = feedAnimalsObstacleRequiresJump(o.kind);
              return (
                <span
                  key={i}
                  className="absolute -translate-x-1/2 -translate-y-1/2 rounded-sm"
                  style={{
                    left: `${sample.position.x * 100}%`,
                    top: `${sample.position.y * 100}%`,
                    width: "6%",
                    height: "6%",
                    background: jump ? "#B23A2E" : "#8C7A63",
                    opacity: 0.85,
                  }}
                />
              );
            })}
            <div
              className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white/70"
              style={{ left: `${start.x * 100}%`, top: `${start.y * 100}%`, width: "16%", height: "16%", background: ANIMAL_DOT[leg.animal] ?? "#8C5A3A" }}
            />
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/70"
              style={{ left: `${destination.x * 100}%`, top: `${destination.y * 100}%`, width: "13%", height: "13%", background: FOOD_HEX[leg.food] ?? "#F2C94C" }}
            />
          </div>
        );
      })}
    </div>
  );
}

/**
 * THERAPIST SETUP SIMPLIFICATION — non-interactive miniature of a real Feed
 * the Animals stage, so a therapist can see roughly what the wall will look
 * like before starting it. Every one of the 15 stages is a hand-designed
 * path stage today (see pathStages.ts) — the round-based branch below stays
 * only as a dormant fallback (getFeedAnimalsStagePreset/generateFeedStage
 * still exist and still work) and is never actually reached in practice.
 */
export function FeedAnimalsStagePreview({ difficulty, stageNumber }: FeedAnimalsStagePreviewProps) {
  // Both hooks below must always run unconditionally (Rules of Hooks) — getFeedAnimalsStagePreset is cheap even when its result ends up unused on the path branch.
  const pathDef = getFeedAnimalsPathStage(difficulty, stageNumber);
  const preset = useMemo(() => getFeedAnimalsStagePreset(difficulty, stageNumber), [difficulty, stageNumber]);
  if (pathDef) return <FeedAnimalsPathStagePreview pathDef={pathDef} />;
  const round = preset.stage.rounds[0];

  return (
    <div
      className="pointer-events-none absolute inset-0 bg-gradient-to-b from-amber-200 to-amber-700"
      style={{ containerType: "size" }}
      aria-hidden="true"
    >
      {round && (
        <>
          {/* The animal — same 🐾 positional reference AnimalFoodMap uses. */}
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
              <span
                key={choice.id}
                className={`absolute rounded-full border-2 shadow-sm ${
                  isCorrect ? "border-white shadow-[0_0_14px_rgba(255,255,255,0.75)]" : "border-white/30"
                }`}
                style={{
                  left: `${choice.position.x * 100}%`,
                  top: `${choice.position.y * 100}%`,
                  width: `clamp(30px, ${choice.size * 100}cqmin, 22vmin)`,
                  height: `clamp(30px, ${choice.size * 100}cqmin, 22vmin)`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <span
                  className="block h-full w-full rounded-full"
                  style={{ background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.6), ${FOOD_HEX[choice.food]} 65%)` }}
                />
              </span>
            );
          })}
        </>
      )}
    </div>
  );
}

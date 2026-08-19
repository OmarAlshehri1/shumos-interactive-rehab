"use client";

import { buildArcLengthTable, buildWaypointCenterline, sampleAtDistance } from "@/lib/feedanimals/pathCurve";
import { feedAnimalsObstacleRequiresJump, getFeedAnimalsPathLeg, getFeedAnimalsPathStage, sampleFeedAnimalsPathPosition, type FeedAnimalsStageRuntime } from "@/lib/feedanimals";
import { ANIMAL_NAME_AR, FOOD_NAME_AR } from "../copy";

interface AnimalPathMapProps {
  stage: FeedAnimalsStageRuntime;
  disabled: boolean;
  offline?: boolean;
  onMove: (direction: "left" | "right" | "jump") => void;
}

const TRAIL_POINT_COUNT = 24;

const ANIMAL_DOT: Record<string, string> = { MONKEY: "#8C5A3A", RABBIT: "#F3E9DD", PANDA: "#2B2B2B", ELEPHANT: "#CBD3DB", GIRAFFE: "#F2C572" };
const FOOD_DOT: Record<string, string> = { BANANA: "#F2C94C", CARROT: "#F2924C", BAMBOO: "#8FC15C", WATERMELON: "#F2555A", LEAVES: "#6FAE53" };

/**
 * SAFARI ANIMAL ADVENTURE — the path mechanic's own therapist live view, the
 * direct equivalent of AnimalFoodMap.tsx for a "path" stage: a compact read
 * of the route/animal/destination/obstacles/progress (task's "therapist
 * should see: route, progress, obstacles, destination, current required
 * action") plus LEFT/RIGHT buttons and — only when the ACTIVE leg actually
 * has a jump-requiring obstacle ahead — a JUMP button (task's "don't show
 * unnecessary controls"). Generalized over every animal/leg since this same
 * component now drives all 15 stages, not just Stage 1's monkey.
 */
export function AnimalPathMap({ stage, disabled, offline, onMove }: AnimalPathMapProps) {
  const pathDef = getFeedAnimalsPathStage(stage.difficulty, stage.stageNumber);
  if (!pathDef) return null;
  const activeLeg = getFeedAnimalsPathLeg(pathDef, stage.legIndex);

  const table = buildArcLengthTable(buildWaypointCenterline(activeLeg.waypoints));
  const trailPoints = Array.from({ length: TRAIL_POINT_COUNT }, (_, i) => sampleAtDistance(table, table.totalLength * (i / (TRAIL_POINT_COUNT - 1))).position);
  const animalSample = sampleFeedAnimalsPathPosition(activeLeg, stage.pathProgressStep);
  const destination = activeLeg.waypoints[activeLeg.waypoints.length - 1];

  const nextObstacle = activeLeg.obstacles.find((o) => o.atStep === stage.pathProgressStep + 1 && feedAnimalsObstacleRequiresJump(o.kind));
  const legHasJump = activeLeg.obstacles.some((o) => feedAnimalsObstacleRequiresJump(o.kind));
  const isMultiLeg = pathDef.legs.length > 1;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {isMultiLeg && (
        <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-500">
          <span>
            {ANIMAL_NAME_AR[activeLeg.animal]} · حيوان {stage.legIndex + 1} من {pathDef.legs.length}
          </span>
        </div>
      )}

      <div
        className="relative min-h-0 flex-1 overflow-hidden rounded-3xl border-2 border-slate-200 bg-gradient-to-b from-amber-200 to-amber-700 transition-opacity"
        style={{ opacity: disabled ? 0.6 : 1 }}
      >
        {offline && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <span className="rounded-full bg-slate-900/80 px-4 py-2 text-sm font-bold text-white shadow-lg">غير متصل</span>
          </div>
        )}

        {/* The trail. */}
        {trailPoints.map((p, i) => (
          <span
            key={i}
            className="absolute h-[5%] w-[5%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/25"
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
          />
        ))}

        {/* Obstacles. */}
        {activeLeg.obstacles.map((o, i) => {
          const sample = sampleFeedAnimalsPathPosition(activeLeg, o.atStep);
          return (
            <div
              key={i}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white/50 bg-amber-950/50 text-[9px] font-bold text-white"
              style={{ left: `${sample.position.x * 100}%`, top: `${sample.position.y * 100}%`, width: "10%", height: "10%" }}
            >
              {feedAnimalsObstacleRequiresJump(o.kind) ? "!" : ""}
            </div>
          );
        })}

        {/* Destination. */}
        <div
          className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white/60 text-[9px] font-bold text-amber-900"
          style={{
            left: `${destination.x * 100}%`,
            top: `${destination.y * 100}%`,
            width: "12%",
            height: "12%",
            background: FOOD_DOT[activeLeg.food] ?? "#F2C94C",
          }}
        />

        {/* The animal — the therapist's own read of the real live position. */}
        <div
          className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white/70 text-[9px] font-bold text-white"
          style={{
            left: `${animalSample.position.x * 100}%`,
            top: `${animalSample.position.y * 100}%`,
            width: "13%",
            height: "13%",
            background: ANIMAL_DOT[activeLeg.animal] ?? "#8C5A3A",
          }}
        />
      </div>

      <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-slate-400">
        <span>{FOOD_NAME_AR[activeLeg.food]}</span>
        <span dir="ltr">
          {stage.pathProgressStep} / {activeLeg.totalSteps}
        </span>
        {nextObstacle && <span className="font-semibold text-amber-600">اقفز!</span>}
      </div>

      <div className="flex gap-2.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onMove("right")}
          className="flex min-h-16 flex-1 touch-manipulation items-center justify-center gap-2 rounded-2xl bg-amber-600 text-lg font-bold text-white shadow-sm shadow-amber-900/15 transition-all active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
        >
          يمين
          <ArrowIcon direction="right" />
        </button>
        {legHasJump && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onMove("jump")}
            className="flex min-h-16 flex-1 touch-manipulation items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-lg font-bold text-white shadow-sm shadow-emerald-900/15 transition-all active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            قفز
            <JumpIcon />
          </button>
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onMove("left")}
          className="flex min-h-16 flex-1 touch-manipulation items-center justify-center gap-2 rounded-2xl bg-amber-600 text-lg font-bold text-white shadow-sm shadow-amber-900/15 transition-all active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
        >
          <ArrowIcon direction="left" />
          يسار
        </button>
      </div>
    </div>
  );
}

function ArrowIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" style={{ transform: direction === "left" ? "scaleX(-1)" : undefined }} aria-hidden="true">
      <path d="M9 5l7 7-7 7" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function JumpIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path d="M12 4v11M12 4l-4 4M12 4l4 4" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 19h12" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

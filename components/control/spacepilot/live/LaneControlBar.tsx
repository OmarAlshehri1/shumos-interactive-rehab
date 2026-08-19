"use client";

import { useEffect, useState } from "react";
import {
  EncounterType,
  FIRE_COOLDOWN_MS,
  isEncounterStage,
  StarLane,
  stageIncomingLane,
  stageIncomingType,
  stageUpgradeLevel,
  type SpacePilotAnyStageRuntime,
} from "@/lib/spacepilot";
import { STAR_LANE_NAME_AR } from "../copy";

interface LaneControlBarProps {
  stage: SpacePilotAnyStageRuntime;
  disabled: boolean;
  offline?: boolean;
  onMove: (direction: "UP" | "DOWN") => void;
  onFire?: () => void;
}

const LANE_ROWS: readonly StarLane[] = [StarLane.TOP, StarLane.MIDDLE, StarLane.BOTTOM];

const INCOMING_TYPE_LABEL_AR: Record<EncounterType, string> = {
  [EncounterType.STAR]: "⭐ نجمة",
  [EncounterType.ASTEROID]: "☄️ نيزك",
  [EncounterType.ALIEN]: "🛸 سفينة صديقة",
};

/**
 * THERAPIST LANE BAR (task's "Therapist controls may mirror UP/DOWN for
 * QA/authority... preserve the platform's existing controller-authoritative
 * architecture") — the same "mirrors what /display shows the child, but the
 * THERAPIST is the one actually pressing it" model as Bubble Pop Wall's
 * StationBar, since /display never mutates canonical state directly (see
 * that component's own doc comment). MEDIUM/ADVANCED add a third FIRE pad
 * (task's "CONTROL SCREEN — therapist should clearly see... FIRE
 * availability") — a short cooldown greys it out right after a shot so the
 * therapist never wonders why a rapid second tap did nothing.
 */
export function LaneControlBar({ stage, disabled, offline, onMove, onFire }: LaneControlBarProps) {
  const incomingLane = stageIncomingLane(stage);
  const incomingType = stageIncomingType(stage);
  const hasFire = isEncounterStage(stage);
  const lastFiredAt = isEncounterStage(stage) ? stage.lastFiredAt : null;

  // A short cooldown greys the FIRE pad out right after a shot (task's
  // "FIRE availability") — ticked via a timeout rather than read from
  // Date.now() directly during render, so this stays a pure render.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (lastFiredAt === null) return;
    const remaining = lastFiredAt + FIRE_COOLDOWN_MS - Date.now();
    if (remaining <= 0) return;
    const timer = setTimeout(() => setNowTick(Date.now()), remaining + 20);
    return () => clearTimeout(timer);
  }, [lastFiredAt]);
  const fireOnCooldown = lastFiredAt !== null && nowTick - lastFiredAt < FIRE_COOLDOWN_MS;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div
        className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-4 rounded-3xl border-2 border-slate-200 bg-gradient-to-b from-[#0b1030] to-[#161c4a] p-4 transition-opacity"
        style={{ opacity: disabled ? 0.6 : 1 }}
      >
        {offline && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <span className="rounded-full bg-slate-900/80 px-4 py-2 text-sm font-bold text-white shadow-lg">غير متصل</span>
          </div>
        )}

        <div className="flex flex-col items-center gap-1">
          {incomingLane ? (
            <span className="rounded-full bg-amber-400/20 px-4 py-1.5 text-sm font-bold text-amber-200">
              {INCOMING_TYPE_LABEL_AR[incomingType]} القادم: {STAR_LANE_NAME_AR[incomingLane]}
            </span>
          ) : (
            <span className="rounded-full bg-emerald-400/20 px-4 py-1.5 text-sm font-bold text-emerald-200">اكتملت جميع الأهداف</span>
          )}
          <span className="text-xs font-semibold text-indigo-200">مسار الصاروخ الحالي: {STAR_LANE_NAME_AR[stage.rocketLane]}</span>
          <span className="text-xs font-semibold text-indigo-200/80">مستوى ترقية الصاروخ: {stageUpgradeLevel(stage)}</span>
        </div>

        <div className="flex flex-col items-center gap-1.5">
          {LANE_ROWS.map((lane) => (
            <div
              key={lane}
              className={`flex h-9 w-40 items-center justify-center rounded-xl text-xs font-bold transition-colors sm:w-56 ${
                stage.rocketLane === lane ? "bg-indigo-500/40 text-white ring-2 ring-indigo-300" : "bg-white/5 text-indigo-200/60"
              }`}
            >
              {stage.rocketLane === lane ? "🚀 " : ""}
              {STAR_LANE_NAME_AR[lane]}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-6">
          <button
            type="button"
            disabled={disabled}
            aria-label="lane-up"
            onClick={() => onMove("UP")}
            className="flex h-16 w-16 touch-manipulation items-center justify-center rounded-2xl border-2 border-indigo-300/50 bg-indigo-500/30 text-3xl font-bold text-white shadow-lg transition-transform active:scale-90 disabled:cursor-not-allowed sm:h-20 sm:w-20"
          >
            ▲
          </button>
          {hasFire && (
            <button
              type="button"
              disabled={disabled || fireOnCooldown}
              aria-label="fire"
              onClick={onFire}
              className="flex h-16 w-16 touch-manipulation items-center justify-center rounded-2xl border-2 border-rose-300/50 bg-rose-500/30 text-xs font-bold text-white shadow-lg transition-transform active:scale-90 disabled:cursor-not-allowed disabled:opacity-40 sm:h-20 sm:w-20"
            >
              إطلاق
            </button>
          )}
          <button
            type="button"
            disabled={disabled}
            aria-label="lane-down"
            onClick={() => onMove("DOWN")}
            className="flex h-16 w-16 touch-manipulation items-center justify-center rounded-2xl border-2 border-indigo-300/50 bg-indigo-500/30 text-3xl font-bold text-white shadow-lg transition-transform active:scale-90 disabled:cursor-not-allowed sm:h-20 sm:w-20"
          >
            ▼
          </button>
        </div>
      </div>

      <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-slate-400">
        <span>الطفل يضغط أزرار الصاروخ أمام الجدار — اضغط نفس الزر هنا لتأكيده</span>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { formatDurationClock } from "@/components/display/copy";

interface LiveProgressProps {
  correctCount: number;
  totalTargets: number;
  incorrectCount: number;
  sessionStartedAt: number;
}

/**
 * Ticks a plain wall-clock "time since session start" every second. The
 * engine only tracks pause-excluded duration per-stage (StageRuntime), not
 * a session-wide equivalent, and this file doesn't touch lib/game — so this
 * is intentionally simple elapsed time, not a pause-aware clock.
 */
function useElapsedLabel(sessionStartedAt: number): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  return formatDurationClock(now - sessionStartedAt);
}

export function LiveProgress({ correctCount, totalTargets, incorrectCount, sessionStartedAt }: LiveProgressProps) {
  const elapsed = useElapsedLabel(sessionStartedAt);
  const progressPercent = totalTargets === 0 ? 0 : Math.min(100, (correctCount / totalTargets) * 100);

  return (
    <div className="flex flex-col gap-3 px-4 sm:px-6">
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-teal-600 transition-all duration-300 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 font-semibold text-slate-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span dir="ltr">
              {correctCount} / {totalTargets}
            </span>
          </span>
          {incorrectCount > 0 && (
            <span className="flex items-center gap-1.5 font-medium text-slate-400">
              <span className="h-2 w-2 rounded-full bg-slate-300" />
              {incorrectCount}
            </span>
          )}
        </div>
        <span className="font-mono text-sm text-slate-400" dir="ltr">
          {elapsed}
        </span>
      </div>
    </div>
  );
}

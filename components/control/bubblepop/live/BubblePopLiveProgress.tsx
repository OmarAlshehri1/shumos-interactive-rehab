"use client";

import { useEffect, useState } from "react";
import { formatDurationClock } from "@/components/display/copy";

interface BubblePopLiveProgressProps {
  currentTargetIndex: number;
  totalTargets: number;
  sessionStartedAt: number;
}

function useElapsedLabel(sessionStartedAt: number): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  return formatDurationClock(now - sessionStartedAt);
}

export function BubblePopLiveProgress({ currentTargetIndex, totalTargets, sessionStartedAt }: BubblePopLiveProgressProps) {
  const elapsed = useElapsedLabel(sessionStartedAt);
  const progressPercent = totalTargets === 0 ? 0 : Math.min(100, (currentTargetIndex / totalTargets) * 100);

  return (
    <div className="flex flex-col gap-3 px-4 sm:px-6">
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-cyan-600 transition-all duration-300 ease-out" style={{ width: `${progressPercent}%` }} />
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 font-semibold text-slate-700">
          <span className="h-2 w-2 rounded-full bg-cyan-500" />
          <span dir="ltr">
            {currentTargetIndex} / {totalTargets}
          </span>
        </span>
        <span className="font-mono text-sm text-slate-400" dir="ltr">
          {elapsed}
        </span>
      </div>
    </div>
  );
}

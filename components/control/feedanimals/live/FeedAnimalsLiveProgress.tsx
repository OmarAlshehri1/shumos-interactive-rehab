"use client";

import { useEffect, useState } from "react";
import { formatDurationClock } from "@/components/display/copy";

interface FeedAnimalsLiveProgressProps {
  currentRoundIndex: number;
  totalRounds: number;
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

export function FeedAnimalsLiveProgress({ currentRoundIndex, totalRounds, sessionStartedAt }: FeedAnimalsLiveProgressProps) {
  const elapsed = useElapsedLabel(sessionStartedAt);
  const progressPercent = totalRounds === 0 ? 0 : Math.min(100, (currentRoundIndex / totalRounds) * 100);

  return (
    <div className="flex flex-col gap-3 px-4 sm:px-6">
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-amber-600 transition-all duration-300 ease-out" style={{ width: `${progressPercent}%` }} />
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 font-semibold text-slate-700">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          <span dir="ltr">
            {currentRoundIndex} / {totalRounds}
          </span>
        </span>
        <span className="font-mono text-sm text-slate-400" dir="ltr">
          {elapsed}
        </span>
      </div>
    </div>
  );
}

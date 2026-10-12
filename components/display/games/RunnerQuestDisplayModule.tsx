"use client";

import type { RunnerLiveSession } from "@/lib/runnerquest3d/live";
import { RunnerQuestLiveDisplay } from "../runnerquest3d/RunnerQuestLiveDisplay";
import type { SharedGameDisplayProps } from "../gameDisplayRegistry";

/** Display-registry module for `runner-quest-3d`: renders the live Firebase session, read-only. No audio events are consumed. */
export function RunnerQuestDisplayModule({ session }: SharedGameDisplayProps) {
  return <RunnerQuestLiveDisplay session={session as unknown as RunnerLiveSession} />;
}

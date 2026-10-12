"use client";

import { useMemo } from "react";
import { decodeAcceptedState, type BuildQuestLiveSession } from "@/lib/buildquest3d/cloudState";
import { useControlAlive } from "@/lib/liveGame/useControlAlive";
import type { SharedGameDisplayProps } from "../gameDisplayRegistry";
import { BuildQuestDisplayView } from "../buildquest3d/BuildQuestDisplay";

const NOOP = () => {};

/**
 * Display-registry module for `build-quest-3d`: renders the accepted state of the shared live session, read-only.
 * The Display never writes game state. "Control connected" means the Control's heartbeat kept changing in the last
 * 15 s, measured with this device's own clock only (no cross-device clock comparison).
 */
export function BuildQuestDisplayModule({ session }: SharedGameDisplayProps) {
  const live = session as unknown as BuildQuestLiveSession;
  const alive = useControlAlive(live.build3.heartbeatAt);
  const state = useMemo(() => decodeAcceptedState(live), [live]);
  return <BuildQuestDisplayView state={state} connected={alive} send={NOOP} />;
}

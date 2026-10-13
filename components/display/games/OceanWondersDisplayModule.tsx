'use client';
import { useMemo } from 'react';
import { decode, type OceanWondersLiveSession } from '@/lib/oceanwonders/live';
import { useControlAlive } from '@/lib/liveGame/useControlAlive';
import type { SharedGameDisplayProps } from '../gameDisplayRegistry';
import { OceanWondersView } from '../oceanwonders3d/OceanWondersView';

/** Display-registry module for `ocean-wonders-3d`: renders the live shared session, read-only. */
export function OceanWondersDisplayModule({ session, muted }: SharedGameDisplayProps) {
  const live = session as unknown as OceanWondersLiveSession;
  const state = useMemo(() => decode(live), [live]);
  const alive = useControlAlive(live.ow3?.heartbeatAt);
  return state ? <OceanWondersView state={state} full connected={alive} muted={muted} /> : null;
}

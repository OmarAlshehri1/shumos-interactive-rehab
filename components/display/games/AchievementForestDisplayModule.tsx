'use client';
import { useMemo } from 'react';
import { decode, type AchievementForestLiveSession } from '@/lib/achievementforest/live';
import { useControlAlive } from '@/lib/liveGame/useControlAlive';
import type { SharedGameDisplayProps } from '../gameDisplayRegistry';
import { AchievementForestView } from '../achievementforest3d/AchievementForestView';

/** Display-registry module for `achievement-forest-3d`: renders the live shared session, read-only. */
export function AchievementForestDisplayModule({ session, muted }: SharedGameDisplayProps) {
  const live = session as unknown as AchievementForestLiveSession;
  const state = useMemo(() => decode(live), [live]);
  const alive = useControlAlive(live.af3?.heartbeatAt);
  return state ? <AchievementForestView state={state} full connected={alive} muted={muted} /> : null;
}

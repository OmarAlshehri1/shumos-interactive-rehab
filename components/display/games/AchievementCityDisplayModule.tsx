'use client';
import { useMemo } from 'react';
import { decode, type AchievementCityLiveSession } from '@/lib/achievementcity/live';
import { useControlAlive } from '@/lib/liveGame/useControlAlive';
import type { SharedGameDisplayProps } from '../gameDisplayRegistry';
import { AchievementCityView } from '../achievementcity3d/AchievementCityView';

/** Display-registry module for `achievement-city-3d`: renders the live shared session, read-only. */
export function AchievementCityDisplayModule({ session, muted }: SharedGameDisplayProps) {
  const live = session as unknown as AchievementCityLiveSession;
  const state = useMemo(() => decode(live), [live]);
  const alive = useControlAlive(live.ac3?.heartbeatAt);
  return state ? <AchievementCityView state={state} full connected={alive} muted={muted} /> : null;
}

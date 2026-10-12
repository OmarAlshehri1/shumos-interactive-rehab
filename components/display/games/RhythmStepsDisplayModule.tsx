'use client';
import { useMemo } from 'react';
import { decode, type RhythmLiveSession } from '@/lib/rhythmsteps3d/live';
import { useControlAlive } from '@/lib/liveGame/useControlAlive';
import type { SharedGameDisplayProps } from '../gameDisplayRegistry';
import { RhythmView } from '../rhythmsteps3d/RhythmView';

export function RhythmStepsDisplayModule({ session }: SharedGameDisplayProps) {
  const live = session as unknown as RhythmLiveSession;
  const state = useMemo(() => decode(live), [live]);
  const alive = useControlAlive(live.rs3?.heartbeatAt);
  return state ? <RhythmView state={state} full connected={alive} /> : null;
}

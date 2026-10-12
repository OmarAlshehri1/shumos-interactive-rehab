'use client';
import { useMemo } from 'react';
import { decode, type HexLiveSession } from '@/lib/safehexarena3d/live';
import { useControlAlive } from '@/lib/liveGame/useControlAlive';
import type { SharedGameDisplayProps } from '../gameDisplayRegistry';
import { HexView } from '../safehexarena3d/HexView';

export function SafeHexDisplayModule({ session }: SharedGameDisplayProps) {
  const live = session as HexLiveSession;
  const state = useMemo(() => decode(live), [live]);
  const alive = useControlAlive(live.hex3?.heartbeatAt);
  return state ? <HexView state={state} full connected={alive} /> : null;
}

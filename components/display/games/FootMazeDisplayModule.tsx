'use client';
import { useMemo } from 'react';
import { decode, type FootMazeLiveSession } from '@/lib/footmaze3d/live';
import { useControlAlive } from '@/lib/liveGame/useControlAlive';
import type { SharedGameDisplayProps } from '../gameDisplayRegistry';
import { FootMazeView } from '../footmaze3d/FootMazeView';

/** Display-registry module for `foot-maze-3d`: renders the live shared session, read-only. */
export function FootMazeDisplayModule({ session, muted }: SharedGameDisplayProps) {
  const live = session as unknown as FootMazeLiveSession;
  const state = useMemo(() => decode(live), [live]);
  const alive = useControlAlive(live.fm3?.heartbeatAt);
  return state ? <FootMazeView state={state} full connected={alive} muted={muted} /> : null;
}

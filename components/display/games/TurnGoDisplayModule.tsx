'use client';
import { useMemo } from 'react';
import { decode, type TurnGoLiveSession } from '@/lib/turngo3d/live';
import { useControlAlive } from '@/lib/liveGame/useControlAlive';
import type { SharedGameDisplayProps } from '../gameDisplayRegistry';
import { TurnGoView } from '../turngo3d/TurnGoView';

/** Display-registry module for `turn-and-go-3d`: renders the live shared session, read-only. */
export function TurnGoDisplayModule({ session, muted }: SharedGameDisplayProps) {
  const live = session as unknown as TurnGoLiveSession;
  const state = useMemo(() => decode(live), [live]);
  const alive = useControlAlive(live.tg3?.heartbeatAt);
  return state ? <TurnGoView state={state} full connected={alive} muted={muted} /> : null;
}

'use client';
import { useMemo } from 'react';
import { decode, type BodySequenceLiveSession } from '@/lib/bodysequence3d/live';
import { useControlAlive } from '@/lib/liveGame/useControlAlive';
import type { SharedGameDisplayProps } from '../gameDisplayRegistry';
import { BodySequenceView } from '../bodysequence3d/BodySequenceView';

/** Display-registry module for `body-sequence-3d`: renders the live shared session, read-only. */
export function BodySequenceDisplayModule({ session, muted }: SharedGameDisplayProps) {
  const live = session as unknown as BodySequenceLiveSession;
  const state = useMemo(() => decode(live), [live]);
  const alive = useControlAlive(live.bs3?.heartbeatAt);
  return state ? <BodySequenceView state={state} full connected={alive} muted={muted} /> : null;
}

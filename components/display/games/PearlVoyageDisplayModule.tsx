'use client';
import { useMemo } from 'react';
import { decode, type PearlLiveSession } from '@/lib/pearlvoyage3d/live';
import { useControlAlive } from '@/lib/liveGame/useControlAlive';
import type { SharedGameDisplayProps } from '../gameDisplayRegistry';
import { PearlVoyageView } from '../pearlvoyage3d/PearlVoyageView';

/** Read-only child display for Pearl Voyage 3D: decodes the shared record and never writes anything back. */
export function PearlVoyageDisplayModule({ session, muted }: SharedGameDisplayProps) {
    const live = session as PearlLiveSession;
    const state = useMemo(() => decode(live), [live]);
    const alive = useControlAlive(live.pv3?.heartbeatAt);
    return state ? <PearlVoyageView state={state} full connected={alive} muted={muted} /> : null;
}

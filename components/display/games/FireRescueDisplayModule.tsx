'use client';
import { useMemo } from 'react';
import { decode, type FireLiveSession } from '@/lib/firerescue3d/live';
import { useControlAlive } from '@/lib/liveGame/useControlAlive';
import type { SharedGameDisplayProps } from '../gameDisplayRegistry';
import { FireRescueView } from '../firerescue3d/FireRescueView';
export function FireRescueDisplayModule({ session, muted }: SharedGameDisplayProps) { const live = session as FireLiveSession; const state = useMemo(() => decode(live), [live]); const alive = useControlAlive(live.fr3?.heartbeatAt); return state ? <FireRescueView state={state} full connected={alive} muted={muted}/> : null; }

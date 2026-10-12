'use client';
import { decode, type MirrorLiveSession } from '@/lib/mirrorquest3d/live';
import { useControlAlive } from '@/lib/liveGame/useControlAlive';
import type { SharedGameDisplayProps } from '../gameDisplayRegistry';
import { MirrorView } from '../mirrorquest3d/MirrorView';
export function MirrorQuestDisplayModule({session}:SharedGameDisplayProps){const live=session as MirrorLiveSession, state=decode(live),alive=useControlAlive(live.mirror3?.heartbeatAt);return state?<MirrorView state={state} full connected={alive}/>:null;}

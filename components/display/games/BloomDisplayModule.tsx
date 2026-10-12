'use client';
import { decode, type BloomLiveSession } from '@/lib/bloomingworld3d/live';
import { useControlAlive } from '@/lib/liveGame/useControlAlive';
import type { SharedGameDisplayProps } from '../gameDisplayRegistry';
import { GardenView } from '../bloomingworld3d/GardenView';
export function BloomDisplayModule({session,muted}:SharedGameDisplayProps){const live=session as BloomLiveSession;const state=decode(live);const alive=useControlAlive(live.bw3?.heartbeatAt);return state?<GardenView state={state} full connected={alive} muted={muted}/>:null;}

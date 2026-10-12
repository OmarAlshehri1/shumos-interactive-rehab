'use client';
import {decode,type HarvestLiveSession} from '@/lib/harvestvalley3d/live';
import {useControlAlive} from '@/lib/liveGame/useControlAlive';
import type {SharedGameDisplayProps} from '../gameDisplayRegistry';
import {FarmView} from '../harvestvalley3d/FarmView';
export function HarvestDisplayModule({session,muted}:SharedGameDisplayProps){const live=session as HarvestLiveSession,state=decode(live),alive=useControlAlive(live.hv3?.heartbeatAt);return state?<FarmView state={state} full connected={alive} muted={muted}/>:null;}

'use client';
import {decode,type CastleLiveSession} from '@/lib/castlelegends3d/live';
import {useControlAlive} from '@/lib/liveGame/useControlAlive';
import type {SharedGameDisplayProps} from '../gameDisplayRegistry';
import {CastleView} from '@/components/castlelegends3d/CastleView';
export function CastleLegendsDisplayModule({session,muted}:SharedGameDisplayProps){const live=session as CastleLiveSession,state=decode(live),alive=useControlAlive(live.castle3?.heartbeatAt);return state?<CastleView state={state} full connected={alive} muted={muted}/>:null;}

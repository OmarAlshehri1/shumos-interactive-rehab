'use client';
import { useMemo } from 'react';
import { decode, type DomeLiveSession } from '@/lib/bubblepopwall3d/live';
import { useControlAlive } from '@/lib/liveGame/useControlAlive';
import { DomeView } from '../bubblepopwall3d/DomeView';
import { BubblePopWallDisplay } from './BubblePopWallDisplay';
import type { BubblePopSessionState } from '@/lib/bubblepop';
import type { SharedGameDisplayProps } from '../gameDisplayRegistry';
export function BubblePopDomeDisplayRouter(props:SharedGameDisplayProps){
  return (props.session as {engine?:string}).engine==='dome3'?<DomeDisplay session={props.session as DomeLiveSession} muted={props.muted}/>:<BubblePopWallDisplay {...props} session={props.session as BubblePopSessionState}/>;
}
function DomeDisplay({session,muted}:{session:DomeLiveSession;muted?:boolean}){const state=useMemo(()=>decode(session),[session]);const alive=useControlAlive(session.dome3.heartbeatAt);return state?<DomeView state={state} full connected={alive} muted={muted}/>:null;}

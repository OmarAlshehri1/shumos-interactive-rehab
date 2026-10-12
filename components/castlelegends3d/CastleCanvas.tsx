'use client';
import {useEffect,useRef,useState} from 'react';
import type {State} from '@/lib/castlelegends3d/engine';
import {createCastleScene} from './scene';
export function CastleCanvas({state}:{state:State}){
 const canvas=useRef<HTMLCanvasElement>(null),latest=useRef(state);const [error,setError]=useState('');
 useEffect(()=>{latest.current=state;},[state]);
 useEffect(()=>{if(!canvas.current)return;let studio:ReturnType<typeof createCastleScene>;try{studio=createCastleScene(canvas.current,latest.current);}catch(e){queueMicrotask(()=>setError(`تعذّر فتح العرض ثلاثي الأبعاد: ${String(e)}`));return;}queueMicrotask(()=>setError(''));let frame=0,previous=performance.now(),lastStats=0;const animate=(now:number)=>{studio.draw(latest.current,Math.min(.1,(now-previous)/1000));previous=now;if(now-lastStats>1000&&canvas.current){canvas.current.dataset.metrics=JSON.stringify(studio.stats());lastStats=now;}frame=requestAnimationFrame(animate);};frame=requestAnimationFrame(animate);return()=>{cancelAnimationFrame(frame);studio.dispose();};},[state.stage,state.config.quality]);
 return error?<p role="alert">{error}</p>:<canvas ref={canvas} aria-label="البطل يسير نحو القلعة ومدرب ثلاثي الأبعاد يعرض الحركة المطلوبة"/>;
}

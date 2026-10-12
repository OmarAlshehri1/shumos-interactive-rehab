'use client';
import { useEffect, useRef, useState } from 'react';
import type { State } from '@/lib/mirrorquest3d/engine';
import { createStudio } from './scene';
export function MirrorCanvas({ state }: { state: State }) {
  const canvas=useRef<HTMLCanvasElement>(null), latest=useRef(state);
  const [error,setError]=useState(false);
  useEffect(()=>{latest.current=state;},[state]);
  useEffect(()=>{
    if(!canvas.current)return;
    let studio:ReturnType<typeof createStudio>;
    try{studio=createStudio(canvas.current,latest.current);}catch{queueMicrotask(()=>setError(true));return;}
    queueMicrotask(()=>setError(false));
    let frame=0,prev=performance.now(),lastStats=0;
    const animate=(now:number)=>{studio.draw(latest.current,Math.min(.1,(now-prev)/1000));if(now-lastStats>1000&&canvas.current){canvas.current.dataset.metrics=JSON.stringify(studio.stats());lastStats=now;}prev=now;frame=requestAnimationFrame(animate);};
    frame=requestAnimationFrame(animate);
    return()=>{cancelAnimationFrame(frame);studio.dispose();};
  },[state.config.character,state.config.quality]);
  return error?<p role="alert">تعذّر تشغيل العرض ثلاثي الأبعاد. جرّب متصفحًا يدعم WebGL.</p>:<canvas ref={canvas} aria-label="شخصيتان ثلاثيتا الأبعاد مع ظل الحركة المطلوبة" style={{width:'100%',height:'100%',display:'block'}} />;
}

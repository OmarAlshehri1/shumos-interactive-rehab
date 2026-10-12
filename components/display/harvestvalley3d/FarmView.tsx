'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { progress, type State } from '@/lib/harvestvalley3d/engine';
import { createFarm, type SceneStats } from './scene';
import styles from './farm.module.css';
import { FarmAudio } from '@/lib/harvestvalley3d/audio';
export function FarmView({state,full=false,connected=true,muted=true}:{state:State;full?:boolean;connected?:boolean;muted?:boolean}){
 const host=useRef<HTMLDivElement>(null);const runtime=useRef<ReturnType<typeof createFarm>|null>(null);const latest=useRef(state);const [error,setError]=useState(false);const [stats,setStats]=useState<SceneStats|null>(null);const [audioUnlocked,setAudioUnlocked]=useState(false);const audio=useRef<FarmAudio|null>(null);const heard=useRef(0);
 useEffect(()=>{latest.current=state;runtime.current?.update(connected?state:{...state,status:'paused'});},[state,connected]);
 const key=`${state.stage}:${state.sessionId}:${'WALL'}:${state.config.fieldSize}:${16}:${9}:${state.config.quality}:${state.config.headerWidth}:${state.config.contrast}`;
 useEffect(()=>{if(!host.current)return;queueMicrotask(()=>setStats(null));try{runtime.current=createFarm(host.current,{...latest.current,config:{...latest.current.config,quality:full?latest.current.config.quality:'low'}},setStats);}catch{queueMicrotask(()=>setError(true));}return()=>{runtime.current?.dispose();runtime.current=null;};},[key,full]);
 useEffect(()=>{audio.current?.configure(audioUnlocked&&!muted&&state.config.audio&&connected&&state.status!=='paused'&&state.status!=='ended',state.config.volume);const count=state.cut.length;if(count>heard.current)audio.current?.harvest(progress(state)===100);heard.current=count;audio.current?.driving(state.status==='running'&&connected?state.vehicle.speed:0);},[state,audioUnlocked,muted,connected]);
 useEffect(()=>()=>{audio.current?.dispose();},[]);
 const unlock=()=>{audio.current??=new FarmAudio();void audio.current.unlock().then(()=>setAudioUnlocked(true));};
 return <div data-testid="hv-view" data-stage={state.stage} data-status={state.status} data-progress={progress(state)} data-projection={'WALL'} data-fps={stats?.fps} data-calls={stats?.calls} data-triangles={stats?.triangles} data-geometries={stats?.geometries} data-textures={stats?.textures} data-gpu={stats?.gpu} data-cut={state.cut.length} className={`${styles.garden} ${full?styles.full:''}`} style={{aspectRatio:`${16}/${9}`,"--garden-aspect":16/9} as CSSProperties}>
  <div ref={host} className={styles.canvas}/>{error&&<div className={styles.notice}>تعذّر تشغيل العرض ثلاثي الأبعاد. تحقّق من دعم WebGL.</div>}
  <div className={styles.top} style={{insetInline:`${0.05*100}%`}}><span>SHUMOS CARE <small>HARVEST VALLEY</small></span><span>موسم الحصاد · {Math.floor(state.stage/3)+1} / {state.stage%3+1}</span></div>
  <div className={styles.bottom} style={{insetInline:`${0.05*100}%`}}><div><small>صفًّا بعد صف</small><h2>{progress(state)===100?'اكتمل حصادك!':'موسم الحصاد'}</h2></div><div className={styles.progress}><b>{progress(state)}<small>%</small></b><div><i style={{width:`${progress(state)}%`}}/></div></div></div>
  {(!connected||state.status==='paused')&&<div className={styles.notice}>{!connected?'بانتظار اتصال المعالج':'استراحة هادئة'}</div>}
  {state.status==='ready'&&<div className={styles.ready}>حقلك ينتظرك <small>يبدأ المعالج عندما تكون مستعدًا</small></div>}
  {state.status==='ended'&&<div className={styles.ready}>شكرًا لك يا صديقي</div>}
  {full&&state.config.audio&&!muted&&!audioUnlocked&&<button className={styles.sound} onClick={unlock}>تفعيل الأصوات الهادئة</button>}

 </div>;
}

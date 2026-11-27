'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { progress, regionUV, STAGES, type State } from '@/lib/bloomingworld3d/engine';
import { createGarden, type SceneStats } from './scene';
import styles from './garden.module.css';
import { GardenAudio } from '@/lib/bloomingworld3d/audio';
export function GardenView({state,full=false,connected=true,muted=true}:{state:State;full?:boolean;connected?:boolean;muted?:boolean}){
 const host=useRef<HTMLDivElement>(null);const runtime=useRef<ReturnType<typeof createGarden>|null>(null);const latest=useRef(state);const [error,setError]=useState(false);const [stats,setStats]=useState<SceneStats|null>(null);const [audioUnlocked,setAudioUnlocked]=useState(false);const audio=useRef<GardenAudio|null>(null);const heard=useRef(0);
 useEffect(()=>{latest.current=state;runtime.current?.update(connected?state:{...state,status:'paused'});},[state,connected]);
 const key=`${state.stage}:${state.epoch}:${state.config.projection}:${state.regions.length}:${state.config.width}:${state.config.height}:${state.config.quality}:${state.config.grid}`;
 useEffect(()=>{if(!host.current)return;queueMicrotask(()=>setStats(null));try{runtime.current=createGarden(host.current,latest.current,setStats);}catch{queueMicrotask(()=>setError(true));}return()=>{runtime.current?.dispose();runtime.current=null;};},[key]);
 useEffect(()=>{audio.current?.configure(audioUnlocked&&!muted&&state.config.audio&&connected&&state.status!=='paused'&&state.status!=='ended',state.config.volume);const count=state.regions.reduce((a,r)=>a+r.hits,0)+state.repeats;if(count>heard.current)audio.current?.bloom(progress(state)===100);heard.current=count;},[state,audioUnlocked,muted,connected]);
 useEffect(()=>()=>{audio.current?.dispose();},[]);
 const unlock=()=>{audio.current??=new GardenAudio();void audio.current.unlock().then(()=>setAudioUnlocked(true));};
 return <div data-testid="bw-view" data-stage={state.stage} data-status={state.status} data-progress={progress(state)} data-projection={state.config.projection} data-fps={stats?.fps} data-calls={stats?.calls} data-triangles={stats?.triangles} data-geometries={stats?.geometries} data-textures={stats?.textures} className={`${styles.garden} ${full?styles.full:''}`} style={{aspectRatio:`${state.config.width}/${state.config.height}`,"--garden-aspect":state.config.width/state.config.height} as CSSProperties}>
  <div ref={host} className={styles.canvas}/>{error&&<div className={styles.notice}>تعذّر تشغيل العرض ثلاثي الأبعاد. تحقّق من دعم WebGL.</div>}
  <div className={styles.top} style={{insetInline:`${state.config.margin*100}%`}}><span>SHUMOS CARE <small>THE AWAKENING GARDEN</small></span><span>{state.config.projection==='WALL'?'حديقة الجدار':'حديقة الأرض'} · {STAGES[state.stage].level} / {STAGES[state.stage].stage}</span></div>
  <div className={styles.bottom} style={{insetInline:`${state.config.margin*100}%`}}><div><small>زهرةً بعد زهرة</small><h2>{progress(state)===100?'أزهرت حديقتك!':'الحديقة التي تستيقظ'}</h2></div><div className={styles.progress}><b>{progress(state)}<small>%</small></b><div><i style={{width:`${progress(state)}%`}}/></div></div></div>
  {connected && state.status==='running' && state.activation && <div className={styles.activation} style={{left:`${regionUV(state.activation.id,state.regions.length,state.config.movementRange,state.config.margin).x*100}%`,top:`${regionUV(state.activation.id,state.regions.length,state.config.movementRange,state.config.margin).y*100}%`}}><span>المنطقة {state.activation.id+1}</span><progress aria-label="إزهار الهدف خلال ثانيتين" max={2000} value={state.activation.elapsedMs}/></div>}
  {(!connected||state.status==='paused')&&<div className={styles.notice}>{!connected?'بانتظار اتصال المعالج':'استراحة هادئة'}</div>}
  {state.status==='ready'&&<div className={styles.ready}>حديقتك تنتظرك <small>يبدأ المعالج عندما تكون مستعدًا</small></div>}
  {state.status==='ended'&&<div className={styles.ready}>شكرًا لك يا صديقي</div>}
  {full&&state.config.audio&&!muted&&!audioUnlocked&&<button className={styles.sound} onClick={unlock}>تفعيل الأصوات الهادئة</button>}

 </div>;
}

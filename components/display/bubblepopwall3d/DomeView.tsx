'use client';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { activeHand, INSTRUCTION, kindOf, STAGES, summary, type State } from '@/lib/bubblepopwall3d/engine';
import { DomeAudio } from '@/lib/bubblepopwall3d/audio';
import styles from './dome.module.css';
const DomeScene=dynamic(()=>import('./DomeScene').then(m=>m.DomeScene),{ssr:false});
export function DomeView({state:s,full=false,connected=true,muted=false}:{state:State;full?:boolean;connected?:boolean;muted?:boolean}){
  const audio=useRef<DomeAudio|null>(null),seen=useRef(0),accepted=useRef(false),[unlocked,setUnlocked]=useState(false);
  useEffect(()=>{audio.current=new DomeAudio();return()=>audio.current?.dispose();},[]);
  const n=summary(s).completed;
  useEffect(()=>{audio.current?.volume(unlocked&&!muted&&s.config.sound&&connected&&s.status==='running',s.config.volume);},[unlocked,s.config.sound,s.config.volume,connected,s.status,muted]);
  useEffect(()=>{if(s.accepted&&!accepted.current&&s.config.sound&&unlocked&&!muted)audio.current?.tone(false,s.config.volume);accepted.current=s.accepted;},[s.accepted,s.config.sound,s.config.volume,unlocked,muted]);
  useEffect(()=>{if(n>seen.current&&s.config.sound&&unlocked&&!muted)audio.current?.tone(true,s.config.volume);seen.current=n;},[n,s.config.sound,s.config.volume,unlocked,muted]);
  const frozen=!connected||s.status==='paused';
  return <section className={`${styles.view} ${full?styles.full:''} ${s.config.highContrast?styles.high:''}`} lang="ar" dir="rtl" data-testid="dome-display" data-seq={s.seq} data-audio={unlocked&&!muted&&s.config.sound?"unlocked":"muted"} data-stage={s.stage} data-objective={s.objective} data-status={s.status} data-completed={n} data-session={s.sessionId}>
    <DomeScene state={frozen?{...s,status:'paused'}:s}/>
    <div className={styles.hud}>
      <header className={styles.top}><div><div className={styles.brand} dir="ltr">SHUMOS CARE · THE WONDER DOME</div><h1 className={styles.title}>قبة العجائب</h1><span className={styles.sub}>كل حركة تفتح عالمًا صغيرًا</span></div><div className={styles.pill}>{['اكتشف','وجّه','نسّق'][Math.floor(s.stage/3)]} · {s.stage%3+1} / 3</div></header>
      <footer className={styles.bottom}>{(kindOf(s)==='guide'||kindOf(s)==='hold')&&<div className={styles.meter} role="progressbar" aria-label="ضوء العالم" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((kindOf(s)==='guide'?s.pathProgress:Math.min(1,s.hold/s.config.holdMs))*100)}><span style={{width:`${(kindOf(s)==='guide'?s.pathProgress:Math.min(1,s.hold/s.config.holdMs))*100}%`}}/></div>}<div className={styles.instruction}>{kindOf(s)==='neutral'?'☆ ':kindOf(s)==='guide'?'↝ ':kindOf(s)==='hold'?'◉ ':'✧ '}{INSTRUCTION[kindOf(s)]}</div><div className={styles.sub}>{activeHand(s)==='RIGHT_HAND'?'اليد اليمنى':'اليد اليسرى'} · {STAGES[s.stage].name}</div><div className={styles.stars} aria-label={`${s.completed.length} من 9 مراحل`}>{STAGES.map((_,i)=><span key={i} className={`${styles.star} ${s.completed.includes(i)?styles.lit:''}`}>{s.completed.includes(i)?'✦':'◇'}</span>)}</div></footer>
    </div>
    {(frozen||s.status==='ready'||s.status==='stage-complete'||s.status==='ended')&&<div className={`${styles.overlay} ${s.status==='stage-complete'&&!frozen?styles.celebration:''}`}><h2>{!connected?'ننتظر المعالج':s.status==='paused'?'استراحة هادئة':s.status==='ready'?'عالمك ينتظرك':s.status==='ended'?'أضأت قبة العجائب':'عالم جديد ينبض بالحياة'}</h2><p>{s.status==='ended'?`${n} عوالم مضيئة · ${s.completed.length} مراحل مكتملة`:'✧'}</p></div>}
    {s.config.sound&&<button className={styles.sound} disabled={muted} onClick={()=>{if(unlocked){setUnlocked(false);audio.current?.dispose();audio.current=new DomeAudio();}else{void audio.current?.unlock().then(()=>{setUnlocked(true);audio.current?.tone(false,s.config.volume);});}}}>{muted?'الصوت مكتوم':unlocked?'كتم الصوت':'تفعيل الصوت ♫'}</button>}
  </section>;
}

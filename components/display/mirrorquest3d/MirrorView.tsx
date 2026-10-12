'use client';
import { useEffect, useState } from 'react';
import { STAGES, target, type State } from '@/lib/mirrorquest3d/engine';
import { MirrorCanvas } from './MirrorCanvas';
import styles from './mirror.module.css';
export function MirrorView({state,full=false,connected=true}:{state:State;full?:boolean;connected?:boolean}) {
 const [celebrating,setCelebrating]=useState(false);
 useEffect(()=>{if(!state.accepted.length)return;queueMicrotask(()=>setCelebrating(true));const t=setTimeout(()=>setCelebrating(false),1400);return()=>clearTimeout(t);},[state.accepted.length]);
 const p=target(state), feedback=state.feedback==='matched'?'✓ أحسنت، اثبت قليلًا':state.feedback==='near'?'◌ اقتربت من الحركة':'◇ اتبع صديقك بهدوء';
 return <section className={`${styles.world} ${full?styles.full:''}`} lang="ar" dir="rtl" data-status={state.status} data-stage={state.stage} data-pose={state.pose} data-feedback={state.feedback} data-accepted={state.accepted.length}>
  <div className={styles.canvas}><MirrorCanvas state={state}/></div>
  <div className={styles.badge}>المستوى {STAGES[state.stage].level} · المرحلة {state.stage%3+1}</div><div className={styles.brand}>SHUMOS CARE</div>
  <div className={styles.hud}><div className={styles.eyebrow}>MIRROR QUEST</div><div className={styles.instruction}>{p.text}</div><div className={styles.track}><div className={styles.fill} style={{width:`${Math.min(100,state.hold/state.config.holdMs*100)}%`}}/></div><div className={styles.feedback} aria-live="polite">{celebrating?'✓ حركة جميلة، أحسنت!':feedback}</div></div>
  <div className={`${styles.label} ${styles.player}`}>أنت<div className={styles.small}>YOUR MIRROR</div></div><div className={`${styles.label} ${styles.teacher}`}>صديقك<div className={styles.small}>FOLLOW ME</div></div>
  {(!connected||state.status==='paused'||state.status==='stage-complete'||state.status==='ended')&&<div className={styles.overlay}><h2>{!connected?'بانتظار المعالج':state.status==='paused'?'وقت الراحة':state.status==='ended'?'رحلة رائعة!':'أحسنت!'}</h2><p>{state.status==='stage-complete'?'أكملت هذه المرحلة بهدوء':'خذ وقتك، نحن معك'}</p></div>}
 </section>;
}

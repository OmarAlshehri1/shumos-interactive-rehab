'use client';
import {CastleCanvas} from './CastleCanvas';
import {STAGES,ENEMIES} from '@/lib/castlelegends3d/curriculum';
import {exercise,type State} from '@/lib/castlelegends3d/engine';
import {useCastleAudio} from './useAudio';
import styles from './castle.module.css';
export function Crest(){return <svg viewBox="0 0 48 56" aria-hidden="true"><path d="M5 4h38v28L24 51 5 32Z" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M15 31V19h5v-7h8v7h5v12M12 32h24M21 31v-8h6v8" fill="none" stroke="currentColor" strokeWidth="2"/><path d="m24 5 2 4h-4Z" fill="currentColor"/></svg>;}
export function CastleView({state:s,full=false,connected=true,muted=false}:{state:State;full?:boolean;connected?:boolean;muted?:boolean}){
 const stage=STAGES[s.stage],enemy=ENEMIES[stage.enemies[s.encounter]],prompt=exercise(s),audio=useCastleAudio(s,muted),combat=['encounter','attack','defeat'].includes(s.phase),done=s.status==='stage-complete'||s.status==='ended';
 const notice=!connected?'بانتظار اتصال المعالج':s.status==='paused'?'استراحة البطل':s.status==='ready'?'رحلتك إلى قلعة النور':s.phase==='intro'?stage.chapter:s.phase==='victory'||done?stage.reward:null;
 return <section className={`${styles.viewport} ${full?styles.full:''}`} dir="rtl" lang="ar" data-castle-state={s.status} data-castle-phase={s.phase} data-castle-stage={s.stage+1}>
 <CastleCanvas state={!connected?{...s,status:'paused'}:s}/><div className={styles.vignette}/>
 <header className={styles.sceneHeader}><div className={styles.wordmark}><Crest/><div><span>SHUMOS CASTLE LEGENDS</span><strong>أسطورة قلعة شموس</strong></div></div><div className={styles.chapter}><span>الفصل {Math.floor(s.stage/3)+1} · {stage.chapter}</span><strong>{stage.name}</strong></div></header>
 {combat&&<div className={styles.enemy} aria-label={`${enemy.name}: ${s.health} من ${s.maxHealth}`}><div><span>{enemy.name}</span><small>الجولة {Math.min(stage.phases,Math.floor((s.maxHealth-s.health)/s.config.repetitions)+1)} / {stage.phases}</small></div><div className={styles.health}><i style={{width:`${s.health/s.maxHealth*100}%`}}/></div><small>{s.health} / {s.maxHealth}</small></div>}
 {notice&&<div className={styles.cinematic}><span className={styles.eyebrow}>رحلة صغيرة · أسطورة كبيرة</span><h2>{notice}</h2><p>{done?'كل حركة كانت خطوة إلى النور':s.status==='paused'||!connected?'خذ وقتك، نكمل عندما تكون مستعدًا':'يسير بطلك تلقائيًا. حركتك تمنحه القوة.'}</p>{done&&<div className={styles.medal}>✧</div>}</div>}
 <div className={styles.instructorLabel}><span>دليل الحركة</span><small>{s.config.presentation==='seated'?'عرض جالس':'عرض واقف'} · اليمين واليسار للشخصية</small></div>
 <div className={styles.instructorLegend}><i/> الطرف المطلوب <b/> تأكيد المعالج</div>
 <div className={styles.prompt}><span className={styles.promptEyebrow}>{combat?'ساعد بطلك بالحركة':'على طريق المغامرة'}</span><strong>{combat?prompt.name:s.phase==='travel'?'البطل يتقدّم… استعد للحركة التالية':'خطوة مريحة، إنجاز جديد'}</strong><p>{combat?s.config.holdSeconds?`ثبات اختياري ${s.config.holdSeconds} ثوانٍ بتوجيه المعالج`:'كرّر الحركة براحة؛ المعالج يؤكد نجاحها':'لا تحتاج إلى توجيه البطل أو الضغط على أزرار'}</p>{s.config.mat&&combat&&<small>هدف الحصيرة: {({blue:'الدائرة الزرقاء',orange:'الدائرة البرتقالية',green:'الدائرة الخضراء'})[s.config.matTarget]} · يحدده المعالج</small>}</div>
 <footer className={styles.sceneFooter}><div className={styles.journey}>{STAGES.map((_,i)=><span key={i} className={s.completed.includes(i)?styles.achieved:i===s.stage?styles.current:''}>{i+1}</span>)}</div><span>{s.encounter+1} / {stage.enemies.length} مواجهات</span><button onClick={()=>void audio.enable()} disabled={audio.enabled} aria-label="تفعيل صوت شاشة العرض">{audio.enabled?(s.config.muted||muted?'الصوت مكتوم':'♫ الصوت مفعّل'):'♫ تفعيل الصوت'}</button></footer>
 </section>;
}

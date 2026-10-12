'use client';
import {useLibraryLaunchAdapter} from '@/components/control/library/launch/LibraryLaunchBoundary';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { isRealtimeEnabled } from '@/lib/realtime/firebaseClient';
import { activeHand, count, INSTRUCTION, kindOf, objectiveKey, pathPoint, radiusOf, STAGES, summary, targetOf, type Command, type Config, type State } from '@/lib/bubblepopwall3d/engine';
import { useDomeSession } from '@/lib/bubblepopwall3d/useSession';
import styles from './control.module.css';

export function DomeControl(){return isRealtimeEnabled()?<LiveControl/>:<main className={styles.page} dir="rtl"><h1>قبة العجائب</h1><p>يلزم إعداد اتصال منصة شموس المشتركة لفتح جلسة متزامنة.</p><Link href="/control">مكتبة الأنشطة</Link></main>;}
function LiveControl(){const runtime=useDomeSession();return runtime.state?<DomePanel state={runtime.state} send={runtime.send} runtime={runtime}/>:<main className={styles.page} dir="rtl"><h1>قبة العجائب</h1><p role="status">{runtime.error??(runtime.blocked?'الجلسة تعمل في نافذة أخرى؛ أغلقها وانتظر قبل المحاولة.':'جاري تجهيز الجلسة…')}</p><button onClick={runtime.claimOwnership}>طلب التحكم</button><Link href="/control">مكتبة الأنشطة</Link></main>;}
export function DomePanel({state:s,send,runtime}:{state:State;send:(c:Command)=>void;runtime?:ReturnType<typeof useDomeSession>}){
  const seq=useRef(0),map=useRef<SVGSVGElement>(null),target=targetOf(s),kind=kindOf(s),sum=summary(s);
  const can=!runtime||runtime.connected&&runtime.displayConnected&&!runtime.blocked,live=s.status==='running';
  useLibraryLaunchAdapter('bubble-pop-wall',{modes:['MANUAL','RIGHT_HAND','LEFT_HAND','DUAL_HAND'],apply:mode=>{if(!can||!['ready','paused','stage-complete'].includes(s.status)||(s.stage===7&&mode!=='MANUAL'&&mode!=='DUAL_HAND'))return false;send({type:'configure',config:{hand:mode==='LEFT_HAND'?'LEFT_HAND':mode==='DUAL_HAND'?'ALTERNATE':'RIGHT_HAND'}});send({type:mode==='MANUAL'?'manual':'sensorMode'});return true;}});
  // Stage 8 explicitly alternates hands; a single selected hand must never silently admit the other device.
  useEffect(()=>{if(s.stage===7&&s.input==='sensor'&&s.config.hand!=='ALTERNATE')send({type:'manual'});},[s.stage,s.input,s.config.hand,send]);
  const config=(patch:Partial<Config>)=>send({type:'configure',config:patch});
  const move=(x:number,y:number)=>send({type:'move',point:{x,y},source:'manual',seq:++seq.current,hand:activeHand(s),key:objectiveKey(s)});
  const pointer=(e:React.PointerEvent<SVGSVGElement>)=>{const r=map.current?.getBoundingClientRect();if(!r)return;move((e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height);};
  const path=Array.from({length:41},(_,i)=>pathPoint(s,i/40)).map((p,i)=>`${i?'L':'M'}${p.x*1000},${p.y*600}`).join(' ');
  const slider=(key:keyof Config,label:string,min:number,max:number,step:number)=> <label className={styles.field} key={key}>{label} <strong>{s.config[key]}</strong><input aria-label={label} type="range" min={min} max={max} step={step} value={s.config[key] as number} disabled={s.status==='ended'} onChange={e=>config({[key]:Number(e.target.value)})}/></label>;
  const action=(name:string,c:Command,disabled=false,primary=false)=><button className={primary?styles.primary:''} disabled={!can||disabled} onClick={()=>send("at" in c ? {...c,at:Date.now()} : c)}>{name}</button>;
  return <main className={styles.page} dir="rtl" lang="ar" data-testid="dome-control" data-seq={s.seq} data-stage={s.stage} data-objective={s.objective} data-status={s.status} data-completed={sum.completed} data-session={s.sessionId}>
    <div className={styles.inner}><header className={styles.header}><div><span className={styles.eyebrow}>SHUMOS CARE / WALL / THE WONDER DOME</span><h1>قبة العجائب <span>فرقع الفقاعات 3D</span></h1><p>وصول هادئ · توجيه · ثبات · كل حركة تفتح عالمًا</p></div><nav><Link href="/control">مكتبة الأنشطة</Link><a href="/display" target="_blank" rel="noopener">شاشة الطفل ↗</a></nav></header>
      <div className={styles.grid}><section className={styles.card}>
        <div className={styles.chips}><span>{['اكتشف','وجّه','نسّق'][Math.floor(s.stage/3)]} · المرحلة {s.stage%3+1}</span><span>الهدف {s.objective+1} / {count(s)}</span><span>{activeHand(s)==='RIGHT_HAND'?'اليد اليمنى':'اليد اليسرى'}</span><span>{s.input==='manual'?'تحكم يدوي':'حساس معاير'}</span></div>
        <h2>{INSTRUCTION[kind]}</h2><p className={styles.hint}>حرّك اليد على الخريطة. {kind==='guide'?'اتبع المسار بالتدرج حتى الحلقة.':kind==='hold'?'ابق داخل الحلقة حتى يكتمل الضوء.':'اقترب من الحلقة بهدوء.'}</p>
        <svg ref={map} viewBox="0 0 1000 600" className={styles.map} role="application" aria-label="خريطة حركة اليد؛ اسحب المؤشر أو استخدم الأسهم" tabIndex={0} data-testid="dome-map"
          onPointerDown={e=>{if(!live||!can)return;e.currentTarget.setPointerCapture(e.pointerId);send({type:'manual'});pointer(e);}}
          onPointerMove={e=>{if(live&&can&&e.currentTarget.hasPointerCapture(e.pointerId))pointer(e);}}
          onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
          onKeyDown={e=>{const d:Record<string,[number,number]>={ArrowLeft:[-.035,0],ArrowRight:[.035,0],ArrowUp:[0,-.035],ArrowDown:[0,.035]};if(d[e.key]&&can&&live){e.preventDefault();move(s.desired.x+d[e.key][0],s.desired.y+d[e.key][1]);}}}>
          <defs><linearGradient id="dome-map-bg" x2="1" y2="1"><stop stopColor="#f3edf8"/><stop offset="1" stopColor="#d7eeea"/></linearGradient></defs>
          <rect width="1000" height="600" rx="28" fill="url(#dome-map-bg)"/>
          {[200,350,500,650,800].map(x=><path key={x} d={`M${x} 80 L${x} 520`} stroke="#fff" strokeWidth="1"/>)}
          <circle cx="500" cy="300" r="22" stroke="#9a83b8" fill="#fff" strokeDasharray="4 4"/><text x="500" y="309" textAnchor="middle" fill="#877298" fontSize="24">☆</text>
          {kind==='guide'&&<><path d={path} stroke="#8ec9c1" strokeWidth={radiusOf(s)*1200} fill="none" opacity=".25" strokeLinecap="round"/><path d={path} stroke="#548f88" strokeWidth="3" strokeDasharray="8 10" fill="none"/></>}
          <ellipse cx={target.x*1000} cy={target.y*600} rx={radiusOf(s)*1000} ry={radiusOf(s)*600} fill="#fff8" stroke={s.accepted?'#398879':'#a089b9'} strokeWidth="5"/>
          <circle cx={target.x*1000} cy={target.y*600} r={s.config.targetSize*600} fill="#e1d8ef66" stroke="#a68e4f" strokeWidth="2"/>
          <text x={target.x*1000} y={target.y*600+12} textAnchor="middle" fontSize="40" fill="#66527c">{kind==='neutral'?'☆':kind==='hold'?'◉':'✧'}</text>
          <circle cx={s.cursor.x*1000} cy={s.cursor.y*600} r="30" fill="#fff5df" stroke="#78608e" strokeWidth="4"/><text x={s.cursor.x*1000} y={s.cursor.y*600+10} textAnchor="middle" fontSize="26">✋</text>
          <circle cx={s.desired.x*1000} cy={s.desired.y*600} r="7" fill="#67557f"/>
        </svg>
        <div className={styles.actions} aria-label="تحريك اليد خطوة بخطوة">
          {[[0,-.04,'↑ أعلى'],[-.04,0,'← يسار'],[.04,0,'يمين →'],[0,.04,'↓ أسفل']].map(([dx,dy,label])=><button key={String(label)} disabled={!live||!can} onClick={()=>move(s.desired.x+Number(dx),s.desired.y+Number(dy))}>{label}</button>)}
        </div><div className={styles.progress}><span style={{width:`${(kind==='guide'?s.pathProgress:Math.min(1,s.hold/(kind==='hold'?s.config.holdMs:350)))*100}%`}}/></div>
        <div className={styles.actions}>
          {s.status==='ready'&&action('ابدأ المرحلة',{type:'start',at:0},false,true)}
          {live&&action('إيقاف مؤقت',{type:'pause'})}
          {s.status==='paused'&&action('استئناف',{type:'resume',at:0},false,true)}
          {s.status==='stage-complete'&&action(s.stage===8?'إنهاء الجلسة':'المرحلة التالية',{type:'next',at:0},false,true)}
          {action('العودة للمحايد',{type:'neutral'},!live)}
          {action('مساعدة الحركة',{type:'assist'},!live)}
          {action('تكرار الهدف',{type:'repeat'},!live)}
          {action('تجاوز الهدف',{type:'skipObjective'},!live)}
          {action('تجاوز المرحلة',{type:'skipStage'},!live)}
          {action('إنهاء الجلسة',{type:'end',at:0},s.status==='ended')}
          {action('إعادة البدء',{type:'restart'})}
        </div>
        <div className={styles.stages}>{STAGES.map((d,i)=><span key={i} className={s.completed.includes(i)?styles.done:i===s.stage?styles.current:''} title={d.name}>{s.completed.includes(i)?'✦':i+1}</span>)}</div>
        <div className={styles.results} data-testid="dome-results"><strong>{sum.completed}</strong> أهداف مكتملة · <strong>{sum.assisted}</strong> بمساعدة · <strong>{s.completed.length}/9</strong> مراحل · {s.repeats} تكرارات{sum.complete&&<p>✓ اكتملت رحلة قبة العجائب</p>}</div>
        {s.sensorLost&&<p role="status">انقطعت إشارة الحساس؛ التحكم اليدوي متاح الآن.</p>}
        {runtime&&<p className={styles.connection} role="status">{runtime.error??(can?'● التحكم وشاشة الطفل متصلان':'○ انتظار الاتصال أو شاشة الطفل')} · {runtime.history==='saved'?'✓ حُفظت الجلسة':runtime.history==='walk-in'?'جلسة زائر؛ دون سجل مريض':runtime.history==='retry'?'تعذّر الحفظ؛ تجري إعادة المحاولة':runtime.history==='saving'?'جارٍ الحفظ…':''}</p>}
      </section><aside className={styles.card}><h2>مساحة الطفل</h2>
        <label className={styles.field}>المستوى والمرحلة<select aria-label="المستوى والمرحلة" value={s.stage} disabled={!can||!['ready','paused','stage-complete'].includes(s.status)} onChange={e=>send({type:'stage',stage:Number(e.target.value)})}>{STAGES.map((d,i)=><option key={i} value={i} disabled={s.events.some(e=>e.stage===i)||s.completed.includes(i)||s.skipped.includes(i)}>{Math.floor(i/3)+1} · {i%3+1} — {d.name}</option>)}</select></label>
        <label className={styles.field}>اليد النشطة<select aria-label="اليد النشطة" value={s.config.hand} disabled={s.status==='ended'} onChange={e=>config({hand:e.target.value as Config['hand']})}><option value="RIGHT_HAND">اليمنى</option><option value="LEFT_HAND">اليسرى</option><option value="ALTERNATE">بالتناوب</option></select></label>
        <label className={styles.field}>مكان الأهداف<select value={s.config.placement} onChange={e=>config({placement:e.target.value as Config['placement']})}><option value="both">الجانبان</option><option value="right">اليمين</option><option value="left">اليسار</option></select></label>
        {slider('range','مدى الحركة',.25,1,.05)}{slider('targetSize','حجم الهدف',.08,.2,.01)}{slider('tolerance','التسامح',.03,.15,.01)}{slider('holdMs','الثبات بالمللي ثانية',400,5000,100)}{slider('assistance','قوة المساعدة',0,.85,.05)}{slider('speed','سرعة التوجيه',.2,1,.05)}{slider('sensitivity','حساسية الحساس',.5,2,.1)}
        <label className={styles.field}>تكرار التسلسل<select value={s.config.objectives} disabled={s.status!=='ready'||!!s.events.length} onChange={e=>config({objectives:Number(e.target.value)})}>{[1,2,3].map(i=><option key={i} value={i}>{i}</option>)}</select></label>
        <h2>مصدر الحركة</h2><div className={styles.actions}>{action('تحكم يدوي',{type:'manual'})}{action('استخدام الحساس المعاير',{type:'sensorMode'})}</div><p className={styles.hint}>الحساس يحرّك مؤشرًا افتراضيًا من اتجاه المعصم. اسحب الخريطة لاستلام التحكم في أي وقت. المرحلة ٨ تتناوب بين اليدين؛ يلزم اختيار اليدين لتفعيل الحساس، وإلا يبقى التحكم يدويًا لكليهما.</p>
        <h2>راحة العرض</h2>{(['reducedMotion','highContrast','sound'] as const).map((k,i)=><label className={styles.check} key={k}><input type="checkbox" checked={s.config[k]} onChange={e=>config({[k]:e.target.checked})}/>{['تقليل الحركة','تباين عالٍ','صوت هادئ اختياري'][i]}</label>)}{slider('volume','مستوى الصوت',0,.6,.05)}
        <label className={styles.field}>جودة العرض<select value={s.config.quality} onChange={e=>config({quality:e.target.value as Config['quality']})}><option value="high">زجاج وانعكاسات</option><option value="low">خفيفة</option></select></label><p className={styles.hint}>يمكن المشاركة جلوسًا. لا وقت إلزامي ولا فقدان للتقدم عند الابتعاد عن الهدف.</p>
      </aside></div></div>
  </main>;
}

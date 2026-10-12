import {EXERCISES,STAGES,type Mode,type Side,type Limb} from './curriculum';
export interface Config {mode:Mode;side:Side;limbs:Limb[];exercises:string[];presentation:'seated'|'standing';repetitions:number;movementScale:number;holdSeconds:number;mat:boolean;matTarget:'blue'|'orange'|'green';quality:'low'|'high';reducedMotion:boolean;muted:boolean;volume:number}
export interface Attempt {id:number;visit:number;stage:number;encounter:number;exercise:string;result:'confirmed'|'assisted'|'skipped';at:number}
export interface Visit {id:number;stage:number;resolved:number;defeated:number;complete:boolean;skipped:boolean;entered:boolean}
export interface State {sessionId:string;status:'ready'|'running'|'paused'|'stage-complete'|'ended';phase:'intro'|'travel'|'encounter'|'attack'|'defeat'|'victory';phaseMs:number;stage:number;encounter:number;health:number;maxHealth:number;distance:number;exerciseIndex:number;demonstration:number;attack:number;lastOutcome:'confirmed'|'assisted'|'skipped'|null;startedAt:number;endedAt:number;elapsedMs:number;lastTick:number;config:Config;attempts:Attempt[];visits:Visit[];visit:number;completed:number[]}
export type Command = {type:'new';sessionId:string}|{type:'start'|'resume'|'tick'|'end';at:number}|{type:'pause'|'confirm'|'assist'|'skip'|'repeat'|'advance'|'restart'|'next'}|{type:'stage';stage:number}|{type:'configure';config:Partial<Config>};
export const DEFAULT_CONFIG:Config={mode:'hands',side:'bilateral',limbs:['rightArm','leftArm','rightLeg','leftLeg'],exercises:[],presentation:'seated',repetitions:3,movementScale:.65,holdSeconds:0,mat:false,matTarget:'blue',quality:'high',reducedMotion:false,muted:true,volume:.35};
export const LIMBS:Limb[]=['rightArm','leftArm','rightLeg','leftLeg'];
export function exercisePool(c:Config){return EXERCISES.filter(e=>e.mode===c.mode&&(!e.mat||c.mat)&&(!c.exercises.length||c.exercises.includes(e.id))&&e.limbs.some(l=>c.limbs.includes(l)&&(c.side==='bilateral'||l.startsWith(c.side))));}
export function exercise(s:State){const pool=exercisePool(s.config);const base=pool[(s.exerciseIndex+s.encounter+s.stage)%pool.length];return {...base,limbs:base.limbs.filter(l=>s.config.limbs.includes(l)&&(s.config.side==='bilateral'||l.startsWith(s.config.side)))};}
export function validConfig(c:Config){return ['hands','legs','combined'].includes(c.mode)&&['left','right','bilateral'].includes(c.side)&&Array.isArray(c.limbs)&&c.limbs.length>0&&c.limbs.length<=4&&new Set(c.limbs).size===c.limbs.length&&c.limbs.every(l=>LIMBS.includes(l))&&Array.isArray(c.exercises)&&c.exercises.length<=EXERCISES.length&&c.exercises.every(id=>EXERCISES.some(e=>e.id===id))&&['seated','standing'].includes(c.presentation)&&Number.isInteger(c.repetitions)&&c.repetitions>=1&&c.repetitions<=6&&Number.isFinite(c.movementScale)&&c.movementScale>=.25&&c.movementScale<=1&&[0,2,3,5].includes(c.holdSeconds)&&typeof c.mat==='boolean'&&['blue','orange','green'].includes(c.matTarget)&&['low','high'].includes(c.quality)&&typeof c.reducedMotion==='boolean'&&typeof c.muted==='boolean'&&Number.isFinite(c.volume)&&c.volume>=0&&c.volume<=1&&exercisePool(c).length>0;}
export function createState(sessionId:string):State {return {sessionId,status:'ready',phase:'intro',phaseMs:0,stage:0,encounter:0,health:3,maxHealth:3,distance:0,exerciseIndex:0,demonstration:0,attack:0,lastOutcome:null,startedAt:0,endedAt:0,elapsedMs:0,lastTick:0,config:{...DEFAULT_CONFIG,limbs:[...LIMBS],exercises:[]},attempts:[],visits:[{id:0,stage:0,resolved:0,defeated:0,complete:false,skipped:false,entered:false}],visit:0,completed:[]};}
export const encounterDistance=(i:number)=>10+i*18;
const hp=(s:State)=>s.config.repetitions*STAGES[s.stage].phases;
function resetStage(s:State,stage:number):State {const visit=s.visit+1;return {...s,stage,status:'ready',phase:'intro',phaseMs:0,encounter:0,health:s.config.repetitions*STAGES[stage].phases,maxHealth:s.config.repetitions*STAGES[stage].phases,distance:0,exerciseIndex:0,lastTick:0,lastOutcome:null,visit,visits:[...s.visits,{id:visit,stage,resolved:0,defeated:0,complete:false,skipped:false,entered:false}]};}
function resolveEncounter(s:State,defeated:boolean):State {const visits=s.visits.map(v=>v.id===s.visit?{...v,resolved:v.resolved+1,defeated:v.defeated+(defeated?1:0),skipped:v.skipped||!defeated}:v);return {...s,phase:'defeat',phaseMs:0,visits};}
export function reduce(s:State,c:Command):State {
 if(c.type==='new')return s.status==='ended'&&c.sessionId.length>0&&c.sessionId.length<=100?reduce(createState(c.sessionId),{type:'configure',config:s.config}):s;
 if(s.status==='ended')return s;
 switch(c.type){
 case 'configure':{if(!['ready','paused'].includes(s.status))return s;const config={...s.config,...c.config};if(!validConfig(config)||s.status==='paused'&&config.repetitions!==s.config.repetitions)return s;return {...s,config,...(s.status==='ready'?{health:config.repetitions*STAGES[s.stage].phases,maxHealth:config.repetitions*STAGES[s.stage].phases}:{})};}
 case 'stage':return Number.isInteger(c.stage)&&c.stage>=0&&c.stage<9&&['ready','paused','stage-complete'].includes(s.status)&&s.visits.length<90?resetStage(s,c.stage):s;
 case 'restart':return s.visits.length<90?resetStage(s,s.stage):s;
 case 'start':return s.status==='ready'?{...s,status:'running',startedAt:s.startedAt||c.at,lastTick:c.at,visits:s.visits.map(v=>v.id===s.visit?{...v,entered:true}:v)}:s;
 case 'pause':return s.status==='running'?{...s,status:'paused',lastTick:0}:s;
 case 'resume':return s.status==='paused'?{...s,status:'running',lastTick:c.at}:s;
 case 'end':return {...s,status:'ended',endedAt:c.at,lastTick:0};
 case 'repeat':return s.status==='running'&&s.phase==='encounter'?{...s,demonstration:s.demonstration+1,lastOutcome:null}:s;
 case 'confirm':case 'assist':case 'skip':{
  if(s.status!=='running'||s.phase!=='encounter'||s.attempts.length>=600)return s;
  const result:Attempt['result']=c.type==='confirm'?'confirmed':c.type==='assist'?'assisted':'skipped';
  const attempts=[...s.attempts,{id:s.attempts.length,visit:s.visit,stage:s.stage,encounter:s.encounter,exercise:exercise(s).id,result,at:s.lastTick}];
  return {...s,attempts,lastOutcome:result,exerciseIndex:s.exerciseIndex+(result==='skipped'?1:0),demonstration:s.demonstration+1,...(result==='skipped'?{}:{health:Math.max(0,s.health-1),attack:s.attack+1,phase:'attack' as const,phaseMs:0})};
 }
 case 'advance':return s.status==='running'&&s.phase==='encounter'?resolveEncounter({...s,lastOutcome:'skipped'},false):s;
 case 'next':return s.status==='stage-complete'?s.stage===8?{...s,status:'ended',endedAt:s.lastTick}:resetStage(s,s.stage+1):s;
 case 'tick':{
  if(s.status!=='running'||!Number.isFinite(c.at)||c.at<s.lastTick)return s;
  const dt=Math.min(250,Math.max(0,c.at-s.lastTick));let n={...s,lastTick:c.at,elapsedMs:s.elapsedMs+dt,phaseMs:s.phaseMs+dt};
  if(s.phase==='intro'&&n.phaseMs>=2400)n={...n,phase:'travel',phaseMs:0};
  else if(s.phase==='travel'){n.distance=Math.min(encounterDistance(s.encounter),s.distance+dt*.0022);if(n.distance>=encounterDistance(s.encounter))n={...n,phase:'encounter',phaseMs:0,lastOutcome:null};}
  else if(s.phase==='attack'&&n.phaseMs>=1100)n=s.health===0?resolveEncounter(n,true):{...n,phase:'encounter',phaseMs:0,exerciseIndex:n.exerciseIndex+1};
  else if(s.phase==='defeat'&&n.phaseMs>=1800){if(s.encounter+1<STAGES[s.stage].enemies.length)n={...n,encounter:s.encounter+1,health:hp(s),maxHealth:hp(s),phase:'travel',phaseMs:0,lastOutcome:null};else n={...n,phase:'victory',phaseMs:0};}
  else if(s.phase==='victory'&&n.phaseMs>=2600){const visit=n.visits.find(v=>v.id===n.visit)!;const complete=visit.defeated===STAGES[s.stage].enemies.length;n={...n,status:'stage-complete',visits:n.visits.map(v=>v.id===n.visit?{...v,complete}:v),completed:complete?[...new Set([...s.completed,s.stage])]:s.completed};}
  return n;
 }
 }
}
export function recover(s:State):State{return {...s,status:s.status==='running'?'paused':s.status,lastTick:0};}

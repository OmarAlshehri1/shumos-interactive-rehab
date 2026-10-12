import { GameState } from '@/lib/game';
import type { LiveControlMeta } from '@/lib/liveGame/ownership';
import { activeHand, count, createState, difficultyOf, kindOf, sanitizeConfig, STAGES, type State } from './engine';
export const GAME_ID = 'bubble-pop-wall' as const;
export interface DomeLiveSession {
  engine:'dome3'; engineVersion:1; sessionId:string; seed:number; createdAt:number; gameState:GameState;
  currentDifficulty: ReturnType<typeof difficultyOf>; currentStage:{ stageNumber:1|2|3; stageIndex:number };
  config:{childFirstName:string}; dome3:LiveControlMeta & {payload:string};
}
export const encode=(s:State) => JSON.stringify({...s,lastTick:0});
export function makeLive(s:State,ownerId:string,childName:string,stamp:Partial<LiveControlMeta>={}):DomeLiveSession {
  return {engine:'dome3',engineVersion:1,sessionId:s.sessionId,seed:1,createdAt:s.startedAt,
    gameState:s.status==='ended'?GameState.SESSION_COMPLETE:s.status==='stage-complete'?GameState.STAGE_COMPLETE:s.status==='ready'?GameState.START_ZONE:GameState.PLAYING,
    currentDifficulty:difficultyOf(s.stage),currentStage:{stageNumber:((s.stage%3)+1) as 1|2|3,stageIndex:s.stage},config:{childFirstName:childName.trim().slice(0,30)||'صديقي'},
    dome3:{ownerId,...(stamp.controlTabId?{controlTabId:stamp.controlTabId}:{}),...(stamp.heartbeatAt!==undefined?{heartbeatAt:stamp.heartbeatAt}:{}),...(stamp.takeoverFrom?{takeoverFrom:stamp.takeoverFrom}:{}),payload:encode(s)}};
}
const nat=(v:unknown,max=Number.MAX_SAFE_INTEGER):v is number => typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=max;
export function validState(raw:unknown):raw is State {
  if (!raw||typeof raw!=='object') return false;
  const s=raw as State;
  if(typeof s.sessionId!=='string'||!s.sessionId||s.sessionId.length>99||!nat(s.run,100000)||!nat(s.stage,8)||!nat(s.startStage,8)||!['ready','running','paused','stage-complete','ended'].includes(s.status))return false;
  if(!s.config||JSON.stringify(s.config)!==JSON.stringify(sanitizeConfig(s.config))||!nat(s.objective,count(s)-1))return false;
  if(![s.cursor,s.desired].every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1))return false;
  if(![s.lastTick,s.startedAt,s.endedAt,s.hold,s.pathProgress].every(v=>Number.isFinite(v)&&v>=0)||s.pathProgress>1||s.hold>10000||!nat(s.seq)||!nat(s.repeats,100000))return false;
  if(!['manual','sensor'].includes(s.input)||![s.accepted,s.assisted,s.sensorLost].every(v=>typeof v==='boolean'))return false;
  if(!Array.isArray(s.events)||s.events.length>81||!Array.isArray(s.completed)||!Array.isArray(s.skipped))return false;
  if(![s.completed,s.skipped].every(a=>a.length<=9&&new Set(a).size===a.length&&a.every(v=>nat(v,8)))||s.completed.some(v=>s.skipped.includes(v)))return false;
  if(new Set(s.events.map(e=>e?.key)).size!==s.events.length)return false;
  return s.events.every(e=>{
    if(!e||!nat(e.stage,8)||!nat(e.objective,STAGES[e.stage].kinds.length*s.config.objectives-1)||!['completed','skipped'].includes(e.result)||typeof e.assisted!=='boolean'||!['RIGHT_HAND','LEFT_HAND'].includes(e.hand)||e.key!==`${s.run}:${e.stage}:${e.objective}`)return false;
    const ref={...createState(s.sessionId),stage:e.stage,objective:e.objective,config:s.config};
    return e.kind===kindOf(ref)&&(e.stage!==7||e.hand===activeHand(ref));
  });
}
export function decode(raw:unknown):State|null {
  try {const r=raw as DomeLiveSession;if(r?.engine!=='dome3'||r.engineVersion!==1||typeof r.dome3?.payload!=='string'||r.dome3.payload.length>32768)return null;
    const s=JSON.parse(r.dome3.payload);return validState(s)&&s.sessionId===r.sessionId?s:null;
  }catch{return null;}
}
export function reviveDomeLive(raw:unknown):DomeLiveSession|null {
  const r=raw as DomeLiveSession;
  return decode(r)&&typeof r.dome3.ownerId==='string'&&!!r.dome3.ownerId&&typeof r.config?.childFirstName==='string'&&r.config.childFirstName.length<=30&&Number.isFinite(r.createdAt)?r:null;
}
export function recoveredState(r:DomeLiveSession):State|null {
  const s=decode(r);return s?{...s,status:s.status==='running'?'paused':s.status,input:'manual',desired:s.cursor,lastTick:0}:null;
}

export const isDomeLive = (r: unknown): r is DomeLiveSession => !!r && typeof r === 'object' && (r as { engine?: unknown }).engine === 'dome3';

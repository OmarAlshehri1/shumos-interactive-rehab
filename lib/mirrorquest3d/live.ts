import { Difficulty, GameState } from '@/lib/game';
import type { LiveControlMeta } from '@/lib/liveGame/ownership';
import { CHARACTERS, LIMBS, STAGES, createState, reduce, type State } from './engine';
export const GAME_ID = 'mirror-quest-3d' as const;
export const difficulty = (stage:number):Difficulty => [Difficulty.EASY,Difficulty.MEDIUM,Difficulty.ADVANCED][Math.floor(stage/3)];
export interface MirrorLiveSession { engine:'mirror3'; engineVersion:1; sessionId:string; seed:number; createdAt:number; gameState:GameState; currentDifficulty:Difficulty; currentStage:{stageNumber:1|2|3;stageIndex:number}; config:{childFirstName:string}; mirror3:LiveControlMeta & {payload:string} }
export function encode(s:State) { return JSON.stringify({...s,lastTick:0,lastInput:0}); }
export function makeLive(s:State,ownerId:string,childName:string,stamp:Partial<LiveControlMeta>={}):MirrorLiveSession {
 return {engine:'mirror3',engineVersion:1,sessionId:s.sessionId,seed:0,createdAt:s.startedAt||0,gameState:s.status==='ended'?GameState.SESSION_COMPLETE:s.status==='stage-complete'?GameState.STAGE_COMPLETE:s.status==='ready'?GameState.START_ZONE:GameState.PLAYING,currentDifficulty:difficulty(s.stage),currentStage:{stageNumber:(s.stage%3+1) as 1|2|3,stageIndex:s.stage},config:{childFirstName:childName.trim().slice(0,30)||'صديقي'},mirror3:{...(stamp.controlTabId?{controlTabId:stamp.controlTabId}:{}),...(stamp.heartbeatAt!==undefined?{heartbeatAt:stamp.heartbeatAt}:{}),...(stamp.takeoverFrom?{takeoverFrom:stamp.takeoverFrom}:{}),ownerId,payload:encode(s)}};
}
const nat=(v:unknown,max=Number.MAX_SAFE_INTEGER):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=max;
export function validState(raw:unknown):raw is State {
 if(!raw||typeof raw!=='object')return false;const s=raw as State;
 if(typeof s.sessionId!=='string'||!s.sessionId.length||s.sessionId.length>99||!nat(s.demonstration)||!nat(s.run)||!nat(s.stage,8)||!nat(s.pose,STAGES[s.stage].poses.length-1)||!['ready','running','paused','stage-complete','ended'].includes(s.status)||!s.config||!CHARACTERS.includes(s.config.character))return false;
 const base=createState(s.sessionId), configured=reduce(base,{type:'configure',config:s.config});
 if(configured===base)return false;
 if(!s.player||!LIMBS.every(l=>Number.isFinite(s.player[l])&&s.player[l]>=0&&s.player[l]<=1)||!['neutral','near','matched'].includes(s.feedback)||![s.hold,s.lastTick,s.lastInput,s.startedAt,s.endedAt].every(v=>Number.isFinite(v)&&v>=0)||s.hold>s.config.holdMs||!nat(s.sequence)||!Array.isArray(s.accepted)||s.accepted.length>28||!Array.isArray(s.completed)||s.completed.length>9)return false;
 if(new Set(s.completed).size!==s.completed.length||!s.completed.every(i=>nat(i,8))||new Set(s.accepted.map(p=>p.key)).size!==s.accepted.length)return false;
 if(!s.completed.every(stage=>STAGES[stage].poses.every((_,pose)=>s.accepted.some(a=>a.stage===stage&&a.pose===pose&&!a.skipped))))return false;
 return s.accepted.every(p=>nat(p.stage,8)&&nat(p.pose,STAGES[p.stage].poses.length-1)&&p.key===`${s.run}:${p.stage}:${p.pose}`&&typeof p.assisted==='boolean'&&typeof p.skipped==='boolean');
}
export function decode(raw:unknown):State|null {
 try {const r=raw as MirrorLiveSession;if(r?.engine!=='mirror3'||r.engineVersion!==1||typeof r.mirror3?.payload!=='string'||r.mirror3.payload.length>32768)return null;const s=JSON.parse(r.mirror3.payload);return validState(s)&&s.sessionId===r.sessionId?s:null;}catch{return null;}
}
export function reviveMirrorLive(raw:unknown):MirrorLiveSession|null {
 const r=raw as MirrorLiveSession;
 if(!decode(raw)||typeof r.mirror3.ownerId!=='string'||!r.mirror3.ownerId||typeof r.config?.childFirstName!=='string'||r.config.childFirstName.length>30||!Number.isFinite(r.createdAt))return null;
 return r;
}
export function recoveredState(raw:MirrorLiveSession):State|null {const s=decode(raw);return s?{...s,status:s.status==='running'?'paused':s.status,hold:0,lastInput:0,lastTick:0,feedback:'neutral'}:null;}

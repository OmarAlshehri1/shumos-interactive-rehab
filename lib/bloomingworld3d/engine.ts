import { Difficulty } from '@/lib/game';
export const STAGES = Array.from({ length: 9 }, (_, index) => ({ index, level: Math.floor(index / 3) + 1, stage: index % 3 + 1, regions: index + 4 }));
export const difficultyOf = (i: number) => i < 3 ? Difficulty.EASY : i < 6 ? Difficulty.MEDIUM : Difficulty.ADVANCED;
export type Mode = 'MANUAL' | 'RIGHT_HAND' | 'LEFT_HAND' | 'DUAL_HAND' | 'RIGHT_FOOT' | 'LEFT_FOOT' | 'DUAL_FOOT';
export interface Config { projection: 'WALL' | 'FLOOR'; mode: Mode; goal: number; repetitions: number; targetSize: number; movementRange: number; sensitivity: number; smoothing: number; deadZone: number; width: number; height: number; margin: number; grid: boolean; contrast: boolean; reduced: boolean; quality: 'low' | 'high'; audio: boolean; volume: number; sequence: 'ordered' | 'free'; }
export const DEFAULT_CONFIG: Config = { projection: 'WALL', mode: 'MANUAL', goal: 0, repetitions: 1, targetSize: 1, movementRange: 1, sensitivity: 1, smoothing: .35, deadZone: .025, width: 4, height: 2.25, margin: .08, grid: false, contrast: false, reduced: false, quality: 'high', audio: true, volume: .15, sequence: 'ordered' };
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, Number.isFinite(v) ? v : a));
export function sanitizeConfig(c: Partial<Config>): Config { const n = { ...DEFAULT_CONFIG, ...c }; return { projection: n.projection === 'FLOOR' ? 'FLOOR' : 'WALL', mode: ['MANUAL','RIGHT_HAND','LEFT_HAND','DUAL_HAND','RIGHT_FOOT','LEFT_FOOT','DUAL_FOOT'].includes(n.mode) ? n.mode : 'MANUAL', goal: Math.round(clamp(n.goal,0,12)), repetitions: Math.round(clamp(n.repetitions,1,5)), targetSize: clamp(n.targetSize,.65,1.5), movementRange: clamp(n.movementRange,.2,1), sensitivity: clamp(n.sensitivity,.2,3), smoothing: clamp(n.smoothing,.05,1), deadZone: clamp(n.deadZone,0,.2), width: clamp(n.width,1,12), height: clamp(n.height,1,12), margin: clamp(n.margin,.03,.2), grid: !!n.grid, contrast: !!n.contrast, reduced: !!n.reduced, quality: n.quality === 'low' ? 'low' : 'high', audio: !!n.audio, volume: clamp(n.volume,0,.3), sequence: n.sequence === 'free' ? 'free' : 'ordered' }; }
export interface Region { id: number; hits: number; assisted: number; accepted: string[]; }
export interface StageResult { stage: number; goal: number; repetitions: number; regions: Region[]; completed: boolean; skipped: boolean; }
export interface State { sessionId: string; run: number; epoch: number; stage: number; startingStage: number; status: 'ready' | 'running' | 'paused' | 'stage-complete' | 'ended'; config: Config; regions: Region[]; active: number; cursor: { x: number; y: number }; results: StageResult[]; practiceRegion: number|null; practiceEvents: {stage:number;region:number;token:string;assisted:boolean}[]; repeats: number; startedAt: number; endedAt: number; elapsed: number; lastTick: number; }
export const goalOf = (s: State) => s.config.goal || STAGES[s.stage].regions;
export const progress = (s: State) => Math.min(100, Math.round(s.regions.reduce((a,r)=>a+r.hits,0) / (goalOf(s)*s.config.repetitions)*100));
/** Visual phases only: no physical distance or movement-amplitude requirement. */
export function restorationMilestones(percentage:number){const p=clamp(percentage,0,100)/100;const phase=(a:number,b:number)=>{const t=clamp((p-a)/(b-a),0,1);return t*t*(3-2*t);};return {grass:phase(0,.2),flowers:phase(.2,.4),plants:phase(.4,.6),butterflies:phase(.6,.8),light:phase(.8,1)};}
export const tokenFor = (s: State, id: number) => `${s.run}:${s.epoch}:${s.stage}:${id}:${s.regions[id]?.hits}`;
export function createState(sessionId: string): State { return { sessionId, run: 0, epoch: 0, stage: 0, startingStage: 0, status: 'ready', config: { ...DEFAULT_CONFIG }, regions: Array.from({length:4},(_,id)=>({id,hits:0,assisted:0,accepted:[]})), active: 0, cursor: {x:.5,y:.5}, results: [], practiceRegion:null, practiceEvents:[], repeats: 0, startedAt: 0, endedAt: 0, elapsed: 0, lastTick: 0 }; }
export type Command = { type: 'start' | 'pause' | 'resume' | 'restart' | 'skip-region' | 'skip-stage' | 'next' | 'repeat' } | { type: 'end'; at: number } | { type: 'tick'; at: number } | { type: 'stage'; stage: number } | { type: 'config'; patch: Partial<Config> } | { type: 'select'; id: number } | { type: 'cursor'; x: number; y: number } | { type: 'bloom'; id: number; token: string; assisted: boolean };
function freshStage(s: State, stage: number): State { const goal = s.config.goal || STAGES[stage].regions; return { ...s, stage, epoch: s.epoch+1, status:'ready', regions:Array.from({length:goal},(_,id)=>({id,hits:0,assisted:0,accepted:[]})), active:0, practiceRegion:null, lastTick:0 }; }
function archive(s: State, skipped=s.status==='stage-complete'&&s.results.some(r=>r.stage===s.stage&&r.skipped)): State { return {...s, results:[...s.results.filter(r=>r.stage!==s.stage), {stage:s.stage,goal:goalOf(s),repetitions:s.config.repetitions,regions:s.regions.map(r=>({...r,accepted:[...r.accepted]})),completed:!skipped&&progress(s)===100,skipped}]}; }
export function reduce(s: State, c: Command): State {
 if(c.type==='restart') return {...createState(s.sessionId),config:s.config,run:s.run+1,epoch:s.epoch+1,regions:Array.from({length:s.config.goal||4},(_,id)=>({id,hits:0,assisted:0,accepted:[]}))};
 if(s.status==='ended') return s;
 switch(c.type){
 case 'start': return s.status==='ready'?{...s,status:'running',startedAt:s.startedAt||Date.now()}:s;
 case 'pause': return s.status==='running'?{...s,status:'paused',lastTick:0}:s;
 case 'resume': return s.status==='paused'?{...s,status:'running',lastTick:0}:s;
 case 'tick': return s.status==='running'?{...s,elapsed:s.elapsed+(s.lastTick?clamp(c.at-s.lastTick,0,250):0),lastTick:c.at}:s;
 case 'end': return {...archive(s),status:'ended',endedAt:c.at,startedAt:s.startedAt||c.at,lastTick:0};
 case 'config': { if(s.status!=='ready') return s; const config=sanitizeConfig({...s.config,...c.patch}); return freshStage({...s,config},s.stage); }
 case 'stage': return Number.isInteger(c.stage)&&c.stage>=0&&c.stage<9?freshStage({...archive(s),startingStage:s.startedAt?s.startingStage:c.stage},c.stage):s;
 case 'next': return s.status==='stage-complete'&&s.stage<8?freshStage(archive(s),s.stage+1):s;
 case 'skip-stage': if(progress(s)===100)return s.stage<8?freshStage(archive(s),s.stage+1):s;return s.stage<8?freshStage(archive(s,true),s.stage+1):{...archive(s,true),status:'stage-complete'};
 case 'select': return Number.isInteger(c.id)&&c.id>=0&&c.id<s.regions.length?{...s,active:c.id,practiceRegion:s.practiceRegion===c.id?s.practiceRegion:null}:s;
 case 'cursor': return s.status==='running'?{...s,cursor:{x:clamp(c.x,0,1),y:clamp(c.y,0,1)}}:s;
 case 'skip-region': return {...s,active:(s.active+1)%s.regions.length,practiceRegion:null};
 case 'repeat': return {...s,practiceRegion:s.regions[s.active].hits===s.config.repetitions?s.active:null,status:s.status==='stage-complete'?'running':s.status,epoch:s.epoch+1};
 case 'bloom': { const r=s.regions[c.id]; if(s.status!=='running'||!r||(r.hits>=s.config.repetitions&&s.practiceRegion!==c.id)||c.token!==tokenFor(s,c.id)||(s.config.sequence==='ordered'&&c.id!==s.active))return s; if(s.practiceRegion===c.id){const practiced={...s,practiceRegion:null,repeats:s.repeats+1,epoch:s.epoch+1,practiceEvents:[...s.practiceEvents,{stage:s.stage,region:c.id,token:c.token,assisted:c.assisted}].slice(-30)};return progress(practiced)===100?archive({...practiced,status:'stage-complete'}):practiced;} const regions=s.regions.map(v=>v.id===c.id?{...v,hits:v.hits+1,assisted:v.assisted+(c.assisted?1:0),accepted:[...v.accepted,c.token+(c.assisted?"A":"I")]}:v); const next={...s,regions,active:regions.find(v=>v.hits<s.config.repetitions)?.id??c.id}; return progress(next)===100?archive({...next,status:'stage-complete'}):next; }
 }
}
export function regionUV(id: number, count: number, range=1, margin=.08) { const cols=count<=4?2:count<=9?3:4; const rows=Math.ceil(count/cols); return {x:.5+(((id%cols+.5)/cols)-.5)*(1-margin*2)*range,y:.5+((Math.floor(id/cols)+.5)/rows-.5)*(1-margin*2)*.86*range}; }

import { Difficulty } from '@/lib/game';

export type Point = { x: number; y: number };
export type Hand = 'RIGHT_HAND' | 'LEFT_HAND';
export type Kind = 'reach' | 'guide' | 'hold' | 'neutral';
export interface Config {
  hand: Hand | 'ALTERNATE'; range: number; targetSize: number; tolerance: number;
  holdMs: number; assistance: number; speed: number; placement: 'both' | 'left' | 'right';
  objectives: number; reducedMotion: boolean; highContrast: boolean; sound: boolean;
  volume: number; quality: 'high' | 'low'; sensitivity: number;
}
export const DEFAULTS: Config = { hand: 'RIGHT_HAND', range: .8, targetSize: .12, tolerance: .08, holdMs: 1200, assistance: .35, speed: .65, placement: 'both', objectives: 1, reducedMotion: false, highContrast: false, sound: false, volume: .3, quality: 'high', sensitivity: 1 };
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export function sanitizeConfig(c: Partial<Config>): Config {
  const num = (k: keyof Config, a: number, b: number) => typeof c[k] === 'number' && Number.isFinite(c[k]) ? clamp(c[k] as number, a, b) : DEFAULTS[k] as number;
  return { hand: ['RIGHT_HAND','LEFT_HAND','ALTERNATE'].includes(c.hand ?? '') ? c.hand! : DEFAULTS.hand,
    range: num('range',.25,1), targetSize: num('targetSize',.08,.2), tolerance: num('tolerance',.03,.15), holdMs: num('holdMs',400,5000), assistance: num('assistance',0,.85), speed: num('speed',.2,1),
    placement: ['both','left','right'].includes(c.placement ?? '') ? c.placement! : 'both', objectives: Math.round(num('objectives',1,3)),
    reducedMotion: c.reducedMotion === true, highContrast: c.highContrast === true, sound: c.sound === true,
    volume: num('volume',0,.6), quality: c.quality === 'low' ? 'low' : 'high', sensitivity: num('sensitivity',.5,2) };
}
export const STAGES = [
  { name: 'اكتشف الحديقة', kinds: ['reach'], world: 'garden' },
  { name: 'نافذتان للعجائب', kinds: ['reach','reach'], world: 'stars' },
  { name: 'رحلة والعودة', kinds: ['reach','neutral'], world: 'reef' },
  { name: 'نهر من الضوء', kinds: ['guide'], world: 'garden' },
  { name: 'منعطف القمر', kinds: ['guide'], world: 'stars' },
  { name: 'أضئ العالم', kinds: ['guide','hold'], world: 'reef' },
  { name: 'جسر النجمتين', kinds: ['reach','reach'], world: 'stars' },
  { name: 'يد تلو الأخرى', kinds: ['reach','reach'], world: 'garden' },
  { name: 'قبة العجائب', kinds: ['reach','guide','hold'], world: 'reef' },
] as const;
export const difficultyOf = (i: number): Difficulty => i < 3 ? Difficulty.EASY : i < 6 ? Difficulty.MEDIUM : Difficulty.ADVANCED;
export const INSTRUCTION: Record<Kind,string> = { reach: 'المس عالمك برفق', guide: 'اتبع نهر الضوء', hold: 'ابق هنا… ليضيء العالم', neutral: 'أعد يدك إلى النجمة' };
export interface Event { key: string; stage: number; objective: number; kind: Kind; result: 'completed' | 'skipped'; assisted: boolean; hand: Hand }
export interface State {
  sessionId: string; run: number; stage: number; objective: number; status: 'ready' | 'running' | 'paused' | 'stage-complete' | 'ended';
  config: Config; cursor: Point; desired: Point; pathProgress: number; hold: number; accepted: boolean; assisted: boolean;
  input: 'manual' | 'sensor'; sensorLost: boolean; seq: number; lastTick: number; startedAt: number; endedAt: number;
  events: Event[]; completed: number[]; skipped: number[]; repeats: number; startStage: number;
}
export type Command =
  | { type: 'start' | 'resume' | 'tick' | 'end' | 'next'; at: number }
  | { type: 'pause' | 'neutral' | 'assist' | 'repeat' | 'restart' | 'skipObjective' | 'skipStage' | 'manual' | 'sensorMode' | 'sensorLost' }
  | { type: 'move'; point: Point; seq: number; source: 'manual' | 'sensor'; hand: Hand; key?: string }
  | { type: 'configure'; config: Partial<Config> } | { type: 'stage'; stage: number };
export const count = (s: State) => STAGES[s.stage].kinds.length * s.config.objectives;
export const kindOf = (s: State): Kind => STAGES[s.stage].kinds[s.objective % STAGES[s.stage].kinds.length];
export const activeHand = (s: State): Hand => s.stage === 7 || s.config.hand === 'ALTERNATE' ? s.objective % 2 ? 'LEFT_HAND' : 'RIGHT_HAND' : s.config.hand;
export const objectiveKey = (s: State) => `${s.run}:${s.stage}:${s.objective}`;
export function targetOf(s: State): Point {
  if (kindOf(s) === 'neutral') return { x:.5,y:.5 };
  const direction = s.config.placement === 'left' ? -1 : s.config.placement === 'right' ? 1 : s.objective % 2 ? -1 : 1;
  return { x: .5 + direction * .28 * s.config.range, y: .5 - (.14 + (s.stage % 3) * .03) * s.config.range };
}
export function pathPoint(s: State, t: number): Point {
  const end = targetOf(s);
  return { x: .5 + (end.x-.5)*t, y: .5 + (end.y-.5)*t - (s.stage === 4 ? Math.sin(t*Math.PI)*.12*s.config.range : 0) };
}
export const distance = (a: Point,b: Point) => Math.hypot(a.x-b.x,a.y-b.y);
/** Target tolerance never overlaps neutral for an outward reach, even at a small movement range. */
export function radiusOf(s: State): number {
  const generous=s.config.targetSize+s.config.tolerance+(s.stage<3?.04:0);
  return kindOf(s)==='neutral' ? Math.min(generous,.13) : Math.min(generous,distance(targetOf(s),{x:.5,y:.5})*.55);
}
export function createState(sessionId: string): State {
  return { sessionId, run:0,stage:0,objective:0,status:'ready',config:{...DEFAULTS},cursor:{x:.5,y:.5},desired:{x:.5,y:.5},pathProgress:0,hold:0,accepted:false,assisted:false,input:'manual',sensorLost:false,seq:0,lastTick:0,startedAt:0,endedAt:0,events:[],completed:[],skipped:[],repeats:0,startStage:0 };
}
function resetObjective(s: State): State {
  return {...s,cursor:{x:.5,y:.5},desired:{x:.5,y:.5},pathProgress:0,hold:0,accepted:false,assisted:false,lastTick:0};
}
function finish(s: State,result: Event['result']): State {
  const key = objectiveKey(s);
  if (s.events.some(e=>e.key===key)) return s;
  const events = [...s.events,{key,stage:s.stage,objective:s.objective,kind:kindOf(s),result,assisted:s.assisted,hand:activeHand(s)}];
  if (s.objective + 1 >= count(s)) {
    const completed = events.filter(e=>e.stage===s.stage).every(e=>e.result==='completed');
    return {...s,events,status:'stage-complete',accepted:true,completed:completed?[...s.completed,s.stage]:s.completed,skipped:completed?s.skipped:[...new Set([...s.skipped,s.stage])]};
  }
  // The hold follows the guide in place; it must not jump back to neutral.
  const next = {...s,events,objective:s.objective+1,hold:0,accepted:false,assisted:false,lastTick:0};
  return kindOf(next)==='hold'||kindOf(next)==='neutral' ? next : resetObjective(next);
}
export function reduce(s: State,c: Command): State {
  if (c.type==='restart') return {...createState(s.sessionId),run:s.run+1,config:s.config};
  if (c.type==='manual') return {...s,input:'manual',sensorLost:false};
  if (c.type==='sensorMode') return {...s,input:'sensor',sensorLost:false,desired:s.cursor,lastTick:0};
  if (c.type==='sensorLost') return s.input==='sensor' ? {...s,input:'manual',sensorLost:true,desired:s.cursor,lastTick:0} : s;
  if (c.type==='end') return s.status==='ended' ? s : {...s,status:'ended',endedAt:c.at,lastTick:0};
  if (s.status==='ended') return s;
  if (c.type==='configure') {
    const config = sanitizeConfig({...s.config,...c.config});
    // Objective count is fixed after activity begins so event keys remain meaningful.
    if (s.events.length || s.status!=='ready') config.objectives=s.config.objectives;
    return {...s,config};
  }
  if (c.type==='stage') {
    if (!['ready','paused','stage-complete'].includes(s.status) || !Number.isInteger(c.stage) || c.stage<0 || c.stage>8 || s.events.some(e=>e.stage===c.stage) || s.completed.includes(c.stage) || s.skipped.includes(c.stage)) return s;
    return resetObjective({...s,stage:c.stage,objective:0,status:'ready',startStage:s.startedAt?s.startStage:c.stage});
  }
  if (c.type==='start' && s.status==='ready') return {...s,status:'running',startedAt:s.startedAt||c.at,lastTick:c.at};
  if (c.type==='pause' && s.status==='running') return {...s,status:'paused',lastTick:0};
  if (c.type==='resume' && s.status==='paused') return {...s,status:'running',lastTick:c.at};
  if (c.type==='next' && s.status==='stage-complete') {
    if (s.stage===8) return {...s,status:'ended',endedAt:c.at};
    return resetObjective({...s,stage:s.stage+1,objective:0,status:'ready'});
  }
  if (s.status!=='running') return s;
  if (c.type==='skipStage') return {...s,status:'stage-complete',skipped:[...new Set([...s.skipped,s.stage])],lastTick:0};
  if (c.type==='skipObjective') return finish(s,'skipped');
  if (c.type==='repeat') return {...resetObjective(s),repeats:s.repeats+1};
  if (c.type==='neutral') return {...s,desired:{x:.5,y:.5},input:'manual'};
  if (c.type==='assist') return {...s,assisted:true};
  if (c.type==='move') {
    if (c.key!==undefined && c.key!==objectiveKey(s)) return s;
    if (!Number.isInteger(c.seq) || c.seq<=s.seq || c.hand!==activeHand(s) || !Number.isFinite(c.point.x) || !Number.isFinite(c.point.y) || (c.source==='sensor' && s.input!=='sensor')) return s;
    return {...s,seq:c.seq,desired:{x:clamp(c.point.x,0,1),y:clamp(c.point.y,0,1)},input:c.source,sensorLost:false};
  }
  if (c.type!=='tick' || !Number.isFinite(c.at) || c.at<=s.lastTick) return s;
  const dt = s.lastTick ? Math.min(100,c.at-s.lastTick) : 0;
  const k=kindOf(s), target=targetOf(s), radius=radiusOf(s);
  let desired=s.desired;
  if (s.assisted || distance(desired,{x:.5,y:.5})>.015 && distance(desired,target)<radius*1.5) {
    const assist = s.assisted?.85:s.config.assistance;
    const attraction=k==='guide'?pathPoint(s,Math.min(1,s.pathProgress+.07)):target;
    desired={x:desired.x+(attraction.x-desired.x)*assist,y:desired.y+(attraction.y-desired.y)*assist};
  }
  const ease=1-Math.exp(-dt/ (100/s.config.speed));
  const cursor={x:s.cursor.x+(desired.x-s.cursor.x)*ease,y:s.cursor.y+(desired.y-s.cursor.y)*ease};
  let accepted=distance(cursor,target)<=radius, pathProgress=s.pathProgress;
  if (k==='guide') {
    // Sequential corridor checkpoints prevent jumping straight to the end.
    const checkpoint=pathPoint(s,Math.min(1,pathProgress+.07));
    accepted=distance(cursor,checkpoint)<=radius;
    if (accepted) pathProgress=Math.min(1,pathProgress+dt/1800*s.config.speed);
    accepted=pathProgress>=1 && distance(cursor,target)<=radius;
  }
  const hold=accepted?s.hold+dt:s.hold; // forgiving accumulated dwell; mistakes never erase progress
  const next={...s,cursor,pathProgress,accepted,hold,lastTick:c.at};
  if (accepted && hold >= (k==='hold'?s.config.holdMs:350)) return finish(next,'completed');
  return next;
}
export function summary(s: State) {
  return { completed:s.events.filter(e=>e.result==='completed').length, assisted:s.events.filter(e=>e.result==='completed'&&e.assisted).length, repeats:s.repeats, stages:s.completed.length, complete:s.completed.length===9 };
}

import { Difficulty } from '@/lib/game';
export const clamp=(v:number,a:number,b:number)=>Math.min(b,Math.max(a,Number.isFinite(v)?v:a));
export const difficultyOf=(i:number)=>i<3?Difficulty.EASY:i<6?Difficulty.MEDIUM:Difficulty.ADVANCED;
export const STAGES=[
 {name:'صف القمح الأول',crop:'wheat',cols:[3],rows:6},
 {name:'صفّان متجاوران',crop:'wheat',cols:[2,4],rows:8},
 {name:'قطعة القمح الصغيرة',crop:'wheat',cols:[2,3,4,5],rows:8},
 {name:'ثلاثة صفوف هادئة',crop:'grass',cols:[1,3,5],rows:9},
 {name:'مرج المزرعة',crop:'grass',cols:[1,2,3,4,5,6],rows:10},
 {name:'المنحنى الواسع',crop:'grass',cols:[2,3,4],rows:12},
 {name:'الحقل الكبير',crop:'wheat',cols:[1,2,3,4,5,6],rows:12},
 {name:'مناطق الحصاد',crop:'flowers',cols:[0,1,6,7],rows:12},
 {name:'موسم الحصاد الكبير',crop:'wheat',cols:[0,1,2,3,4,5,6,7],rows:12}
] as const;
export type Mode='MANUAL'|'STEERING'|'PEDAL'|'COMBINED';
export interface Config {mode:Mode;coverage:number;fieldSize:number;headerWidth:number;movementRange:number;speed:number;gain:number;deadZone:number;pedalThreshold:number;assistance:number;autoThrottle:boolean;autoSteering:boolean;autoHarvest:boolean;holdMs:number;reduced:boolean;contrast:boolean;guidance:boolean;audio:boolean;volume:number;quality:'low'|'medium'|'high'}
export const DEFAULT_CONFIG:Config={mode:'MANUAL',coverage:100,fieldSize:1,headerWidth:3.6,movementRange:1,speed:3,gain:1,deadZone:.08,pedalThreshold:.08,assistance:.8,autoThrottle:false,autoSteering:false,autoHarvest:true,holdMs:500,reduced:false,contrast:false,guidance:true,audio:true,volume:.12,quality:'high'};
export function sanitizeConfig(raw:Partial<Config>):Config {const c={...DEFAULT_CONFIG,...raw};return {mode:['MANUAL','STEERING','PEDAL','COMBINED'].includes(c.mode)?c.mode:'MANUAL',coverage:Math.round(clamp(c.coverage,5,100)),fieldSize:clamp(c.fieldSize,.5,1.5),headerWidth:clamp(c.headerWidth,2,6),movementRange:clamp(c.movementRange,.05,1),speed:clamp(c.speed,.3,5),gain:clamp(c.gain,.1,5),deadZone:clamp(c.deadZone,0,.8),pedalThreshold:clamp(c.pedalThreshold,0,.8),assistance:clamp(c.assistance,0,1),autoThrottle:!!c.autoThrottle,autoSteering:!!c.autoSteering,autoHarvest:!!c.autoHarvest,holdMs:Math.round(clamp(c.holdMs,100,2000)),reduced:!!c.reduced,contrast:!!c.contrast,guidance:!!c.guidance,audio:!!c.audio,volume:clamp(c.volume,0,.3),quality:['low','medium','high'].includes(c.quality)?c.quality:'medium'};}
export interface Cell {id:number;x:number;z:number;crop:'wheat'|'grass'|'flowers'}
export function cellsOf(stage:number,c:Config):Cell[]{const st=STAGES[stage];const a:Cell[]=[];for(let col=0;col<8;col++)for(let row=0;row<st.rows;row++){if(!(st.cols as readonly number[]).includes(col))continue;const curve=stage===5?Math.sin(row/11*Math.PI)*2:0;const x=((col-3.5)*2+curve)*c.fieldSize,z=(row*2-11)*c.fieldSize;a.push({id:a.length,x,z,crop:st.crop});}return a;}
export interface Input {steering:number;throttle:number;brake:number}
export interface Result {stage:number;harvested:number;required:number;assisted:number;skippedObjectives:number;completed:boolean;skipped:boolean}
export interface State {sessionId:string;run:number;epoch:number;stage:number;startingStage:number;status:'ready'|'running'|'paused'|'stage-complete'|'ended';config:Config;cut:number[];assisted:number[];skippedCells:number[];active:number;vehicle:{x:number;z:number;heading:number;speed:number;distance:number};input:Input;inputSource:'MANUAL'|'GAMEPAD';inputAt:number;autoDrive:boolean;harvesting:boolean;results:Result[];repeats:number;startedAt:number;endedAt:number;elapsed:number;lastTick:number;grain:number;assistedSetup:boolean;navigation:{cell:number;phase:'approach'|'harvest'}}
export const required=(s:State)=>Math.max(1,Math.ceil(cellsOf(s.stage,s.config).length*s.config.coverage/100));
export const progress=(s:State)=>Math.min(100,Math.floor(s.cut.length/required(s)*100));
function initialVehicle(stage:number,c:Config){const first=cellsOf(stage,c)[0];return {x:first.x,z:first.z-4,heading:0,speed:0,distance:0};}
export function createState(sessionId:string):State {return {sessionId,run:0,epoch:0,stage:0,startingStage:0,status:'ready',config:{...DEFAULT_CONFIG},cut:[],assisted:[],skippedCells:[],active:0,vehicle:initialVehicle(0,DEFAULT_CONFIG),input:{steering:0,throttle:0,brake:0},inputSource:'MANUAL',inputAt:0,autoDrive:false,harvesting:true,results:[],repeats:0,startedAt:0,endedAt:0,elapsed:0,lastTick:0,grain:0,assistedSetup:false,navigation:{cell:0,phase:'approach'}};}
export type Command={type:'start'|'pause'|'resume'|'restart'|'next'|'repeat'|'skip-objective'|'skip-stage'|'reposition'}|{type:'tick';at:number}|{type:'end';at:number}|{type:'stage';stage:number}|{type:'config';patch:Partial<Config>}|{type:'input';input:Partial<Input>;at:number;source?:'MANUAL'|'GAMEPAD'}|{type:'auto';on:boolean}|{type:'harvest';on:boolean}|{type:'select';id:number}|{type:'assist';token:string};
export const tokenFor=(s:State)=>`${s.run}:${s.epoch}:${s.stage}:${s.active}:${s.cut.length}`;
const zero={steering:0,throttle:0,brake:0};
function archive(s:State,skipped=false):State {const old=s.results.find(r=>r.stage===s.stage);const row:Result={stage:s.stage,harvested:s.cut.length,required:required(s),assisted:s.assisted.length,skippedObjectives:s.skippedCells.length,completed:progress(s)===100,skipped:progress(s)<100&&(skipped||!!old?.skipped)};return {...s,results:[...s.results.filter(r=>r.stage!==s.stage),row]};}
function fresh(s:State,stage:number):State{return {...s,stage,epoch:s.epoch+1,status:'ready',cut:[],assisted:[],skippedCells:[],active:0,vehicle:initialVehicle(stage,s.config),input:{...zero},inputAt:0,autoDrive:false,harvesting:s.config.autoHarvest,grain:0,assistedSetup:false,navigation:{cell:0,phase:'approach'},lastTick:0};}
const angle=(v:number)=>Math.atan2(Math.sin(v),Math.cos(v));
function accept(s:State,ids:number[],assistance:boolean):State {const cut=[...s.cut],help=[...s.assisted];for(const id of ids){if(cut.length>=required(s))break;if(!cut.includes(id)&&!s.skippedCells.includes(id)){cut.push(id);if(assistance)help.push(id);}}let n={...s,cut,assisted:help,grain:cut.length};const left=cellsOf(s.stage,s.config).find(c=>!cut.includes(c.id)&&!s.skippedCells.includes(c.id));n.active=left?.id??s.active;if(progress(n)===100){n={...archive(n),status:'stage-complete',vehicle:{...n.vehicle,speed:0},input:{...zero},autoDrive:false};}return n;}
/** Swept header segment: accepts only intersected spatial cells; idle time never creates coverage. */
export function sweptCells(s:State,from:State['vehicle'],to:State['vehicle']):number[]{const front=2.8;const ax=from.x+Math.sin(from.heading)*front,az=from.z+Math.cos(from.heading)*front,bx=to.x+Math.sin(to.heading)*front,bz=to.z+Math.cos(to.heading)*front;const dx=bx-ax,dz=bz-az,l2=dx*dx+dz*dz;return cellsOf(s.stage,s.config).filter(c=>{const t=l2?clamp(((c.x-ax)*dx+(c.z-az)*dz)/l2,0,1):0;const px=c.x-ax-t*dx,pz=c.z-az-t*dz;const forward=Math.abs(px*Math.sin(to.heading)+pz*Math.cos(to.heading)),side=Math.abs(px*Math.cos(to.heading)-pz*Math.sin(to.heading));return forward<=.85*s.config.fieldSize&&side<=s.config.headerWidth/2;}).map(c=>c.id);}
export function reduce(s:State,c:Command):State {
 if(c.type==='restart')return fresh({...createState(s.sessionId),config:s.config,run:s.run+1,epoch:s.epoch+1},0);
 if(s.status==='ended')return s;
 if(c.type==='config')return s.status==='ready'?fresh({...s,config:sanitizeConfig({...s.config,...c.patch})},s.stage):s;
 if(c.type==='stage'){if(s.status==='running')return s;const stage=Math.round(clamp(c.stage,0,8));return fresh(archive(s),stage);}
 if(c.type==='start'||c.type==='resume')return s.status===(c.type==='start'?'ready':'paused')?{...s,status:'running',startedAt:s.startedAt||Date.now(),lastTick:0,input:{...zero},inputAt:0}:s;
 if(c.type==='pause')return s.status==='running'?{...s,status:'paused',lastTick:0,vehicle:{...s.vehicle,speed:0},input:{...zero},autoDrive:false}:s;
 if(c.type==='end')return {...archive(s),status:'ended',endedAt:c.at,startedAt:s.startedAt||c.at,vehicle:{...s.vehicle,speed:0},autoDrive:false,input:{...zero},lastTick:0};
 if(c.type==='next')return s.status==='stage-complete'&&s.stage<8?fresh(s,s.stage+1):s;
 if(c.type==='skip-stage')return {...archive(s,true),status:'stage-complete',vehicle:{...s.vehicle,speed:0},autoDrive:false,input:{...zero}};
 if(c.type==='select')return Number.isInteger(c.id)&&cellsOf(s.stage,s.config).some(v=>v.id===c.id)?{...s,active:c.id}:s;
 if(c.type==='harvest')return {...s,harvesting:c.on};
 if(c.type==='auto')return s.status==='running'?{...s,autoDrive:c.on,input:{...zero}}:s;
 if(c.type==='input')return s.status==='running'?{...s,input:{steering:clamp(c.input.steering??s.input.steering,-1,1),throttle:clamp(c.input.throttle??s.input.throttle,0,1),brake:clamp(c.input.brake??s.input.brake,0,1)},inputAt:c.at,inputSource:c.source??'MANUAL',autoDrive:false}:s;
 if(c.type==='assist')return s.status==='running'&&c.token===tokenFor(s)?accept(s,[s.active],true):s;
 if(c.type==='skip-objective'&&(s.cut.includes(s.active)||s.status==='stage-complete'))return s;
 if(c.type==='skip-objective')return {...s,skippedCells:[...new Set([...s.skippedCells,s.active])],active:cellsOf(s.stage,s.config).find(v=>v.id>s.active&&!s.cut.includes(v.id)&&!s.skippedCells.includes(v.id))?.id??0};
 if(c.type==='reposition'||c.type==='repeat'){const cell=cellsOf(s.stage,s.config)[s.active];return {...s,epoch:s.epoch+1,vehicle:{x:cell.x,z:cell.z-4,heading:0,speed:0,distance:s.vehicle.distance},input:{...zero},inputAt:0,autoDrive:false,assistedSetup:true,repeats:s.repeats+(c.type==='repeat'?1:0)};}
 if(c.type!=='tick'||s.status!=='running')return s;
 const dt=s.lastTick?clamp((c.at-s.lastTick)/1000,0,.15):0;let n={...s,lastTick:c.at,elapsed:s.elapsed+dt*1000};if(!dt)return n;
 const freshInput=c.at-s.inputAt<=s.config.holdMs;const input=freshInput?s.input:zero;const guided=s.autoDrive||s.config.autoSteering||(s.config.mode==='PEDAL'&&s.inputSource==='GAMEPAD');const throttle=s.autoDrive||s.config.autoThrottle||(s.config.mode==='STEERING'&&freshInput&&s.inputSource==='GAMEPAD')?1:input.throttle>s.config.pedalThreshold?input.throttle:0;
 let target=cellsOf(s.stage,s.config).find(v=>v.id===s.active&&!s.cut.includes(v.id)&&!s.skippedCells.includes(v.id));if(!target)target=cellsOf(s.stage,s.config).find(v=>!s.cut.includes(v.id)&&!s.skippedCells.includes(v.id));
 let steering=Math.abs(input.steering)<=s.config.deadZone?0:clamp(input.steering*s.config.gain/s.config.movementRange,-1,1);const v={...s.vehicle};
 let turnError=0;if(target&&(guided||s.config.assistance>0)){let nav=s.navigation.cell===target.id?{...s.navigation}:{cell:target.id,phase:'approach' as const};if(nav.phase==='approach'&&Math.hypot(target.x-v.x,target.z-4-v.z)<.8)nav={cell:target.id,phase:'harvest'};n.navigation=nav;const tx=target.x,tz=nav.phase==='approach'?target.z-4:target.z+2;const desired=Math.atan2(tx-v.x,tz-v.z);turnError=angle(desired-v.heading);const correction=clamp(turnError*1.8,-1,1);steering=guided?correction:steering*(1-s.config.assistance)+correction*s.config.assistance;}
 const wanted=input.brake>.1?0:throttle*(guided&&Math.abs(turnError)>.6?Math.min(.65,s.config.speed):s.config.speed);v.speed+=clamp(wanted-v.speed,-4*dt,1.5*dt);v.heading=angle(v.heading+steering*Math.min(1.2,v.speed*1.8)*dt);v.x+=Math.sin(v.heading)*v.speed*dt;v.z+=Math.cos(v.heading)*v.speed*dt;v.distance+=v.speed*dt;
 const edge=10*s.config.fieldSize;if(Math.abs(v.x)>edge||v.z>11*s.config.fieldSize+7||v.z< -11*s.config.fieldSize-7){v.x=clamp(v.x,-edge,edge);v.z=clamp(v.z,-11*s.config.fieldSize-7,11*s.config.fieldSize+7);v.speed=0;n.autoDrive=false;n.input={...zero};}
 n={...n,vehicle:v};if(s.harvesting&&v.speed>.01)n=accept(n,sweptCells(s,s.vehicle,v),s.assistedSetup||s.inputSource==='MANUAL'||s.autoDrive||s.config.autoSteering||s.config.assistance>0||s.config.mode==='PEDAL');return n;
}

import { regionUV, type State } from './engine';
export interface HandInput {role:'RIGHT_HAND'|'LEFT_HAND';x:number;y:number;at:number;connected:boolean;centered:boolean;}
/** Virtual calibrated cursor only; never absolute wrist position. Role selection is isolated. */
export function handCursor(s:State,inputs:readonly HandInput[],now:number,previous=s.cursor){
 const roles=s.config.mode==='DUAL_HAND'?[(s.active%2?'LEFT_HAND':'RIGHT_HAND')]:[s.config.mode];
 const sample=inputs.find(v=>roles.includes(v.role)&&v.connected&&v.centered&&now-v.at>=0&&now-v.at<500);
 if(!sample||![sample.x,sample.y].every(Number.isFinite))return null;
 const map=(v:number)=>Math.min(1,Math.max(0,.5+(v-.5)*s.config.sensitivity*s.config.movementRange,s.config.margin));const x=map(sample.x),y=map(sample.y);const smooth=(v:number,p:number)=>Math.abs(v-p)<s.config.deadZone?p:p+(v-p)*s.config.smoothing;
 return {x:smooth(x,previous.x),y:smooth(y,previous.y),role:sample.role};
}
export function cursorTarget(s:State,p:{x:number;y:number}){return s.regions.find(r=>{const uv=regionUV(r.id,s.regions.length,s.config.movementRange,s.config.margin);return Math.hypot(p.x-uv.x,p.y-uv.y)<.08*s.config.targetSize&&(r.hits<s.config.repetitions||s.practiceRegion===r.id)&&(s.config.sequence==='free'||s.active===r.id);})?.id??null;}
export class FootHintDetector {
 private moving=false;
 observe(sample:{role:'RIGHT_FOOT'|'LEFT_FOOT';at:number;gyro:readonly number[];connected:boolean},mode:State['config']['mode'],now:number){
 if((mode!==sample.role&&mode!=='DUAL_FOOT')||!sample.connected||now-sample.at<0||now-sample.at>=500||!sample.gyro.every(Number.isFinite)){this.moving=false;return 'unavailable' as const;}
 const motion=Math.hypot(...sample.gyro);if(!this.moving&&motion>12){this.moving=true;return 'movement' as const;}if(this.moving&&motion<4){this.moving=false;return 'rest' as const;}return 'steady' as const;
 }
}

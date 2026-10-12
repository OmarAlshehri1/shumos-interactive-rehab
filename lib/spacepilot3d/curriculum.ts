import type { EncounterLayout, FlightDifficulty, MissionPlan } from './missions';
export const NINE_STAGE_CURRICULUM = 'sp3-nine-v1' as const;
export type CurriculumId = typeof NINE_STAGE_CURRICULUM;
export interface CurriculumStage extends MissionPlan { index:number; level:1|2|3; stage:1|2|3; difficulty:FlightDifficulty; nameAr:string }
const ring = (x:number,y=0):EncounterLayout=>({kind:'ring',x,y,scale:.65});
/** Distinct static routes. Level changes vary the pattern, never demand faster
 * reactions or turn down the therapist's chosen assistance/sensitivity. */
export const SPACE_STAGES:readonly CurriculumStage[]=[
 {index:0,level:1,stage:1,difficulty:'LOW',nameAr:'الحلقات الأولى',name:'First Rings',speedFactor:1,encounters:[0,0,0,0].map(x=>ring(x))},
 {index:1,level:1,stage:2,difficulty:'LOW',nameAr:'اتجاه لطيف',name:'Gentle Direction',speedFactor:1,encounters:[0,-.7,.7,0].map(x=>ring(x))},
 {index:2,level:1,stage:3,difficulty:'LOW',nameAr:'الطريق المضيء',name:'Predictable Trail',speedFactor:1,encounters:[0,.6,1.1,.6,0,-.6].map(x=>ring(x))},
 {index:3,level:2,stage:1,difficulty:'MEDIUM',nameAr:'حديقة الكواكب',name:'Planet Garden',speedFactor:1,encounters:[ring(0),ring(-1,.5),ring(.8,-.5),ring(1.3,.6),ring(-.8,-.4)]},
 {index:4,level:2,stage:2,difficulty:'MEDIUM',nameAr:'يمين ويسار',name:'Alternating Flight',speedFactor:1,encounters:[0,-1,1,-1,0].map(x=>ring(x))},
 {index:5,level:2,stage:3,difficulty:'MEDIUM',nameAr:'رحلة بين النجوم',name:'Starlight Route',speedFactor:1,encounters:[ring(0),ring(-1.4,.7),ring(-.6,.3),ring(1.4,-.7),ring(.6,-.3),ring(0)]},
 {index:6,level:3,stage:1,difficulty:'HIGH',nameAr:'ألوان المدار',name:'Orbital Patterns',speedFactor:1,encounters:[ring(0),ring(-1.6,.8),ring(.9,-.7),ring(1.6,.6),ring(-.9,-.6)]},
 {index:7,level:3,stage:2,difficulty:'HIGH',nameAr:'مسار الأصدقاء',name:'Combined Directions',speedFactor:1,encounters:[ring(0),ring(1.4,.8),ring(-1.4,.8),ring(-.7,-.8),ring(.7,-.8)]},
 {index:8,level:3,stage:3,difficulty:'HIGH',nameAr:'المغامرة الختامية',name:'Scenic Finale',speedFactor:1,encounters:[ring(0),ring(-1.7,.9),ring(.9,.4),ring(1.7,-.9),ring(-.9,-.4),ring(0)]},
];
export const CURRICULUM_ENCOUNTERS=SPACE_STAGES.reduce((n,s)=>n+s.encounters.length,0);
export const curriculumIndex=(v:unknown):v is number=>Number.isInteger(v)&&typeof v==='number'&&v>=0&&v<SPACE_STAGES.length;
export interface StageResult {
 stageIndex:number; status:'completed'|'skipped'; assisted:boolean; durationMs:number;
 ringsPresented:number; ringsCollected:number; ringsMissed:number;
 asteroidsPresented:number; asteroidsAvoided:number; asteroidCollisions:number; repeats:number;
}
export function isStageResult(v:unknown):v is StageResult {
 if(!v||typeof v!=='object')return false;const r=v as StageResult;
 return curriculumIndex(r.stageIndex)&&['completed','skipped'].includes(r.status)&&typeof r.assisted==='boolean'&&['durationMs','ringsPresented','ringsCollected','ringsMissed','asteroidsPresented','asteroidsAvoided','asteroidCollisions','repeats'].every(k=>Number.isSafeInteger(r[k as keyof StageResult])&&Number(r[k as keyof StageResult])>=0)&&r.ringsPresented<=SPACE_STAGES[r.stageIndex].encounters.length&&r.asteroidsPresented<=6&&r.ringsCollected+r.ringsMissed<=r.ringsPresented&&r.asteroidsPresented===0&&r.asteroidsAvoided===0&&r.asteroidCollisions===0&&(r.status==='skipped'||r.ringsPresented===SPACE_STAGES[r.stageIndex].encounters.length&&r.ringsCollected+r.ringsMissed===r.ringsPresented);
}

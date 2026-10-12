import { StageStatus } from '@/lib/game';
import type { StoredBubblePopSession } from '@/lib/sessions/types';
import { count, difficultyOf, summary, type State } from './engine';
/** New counts never reinterpret legacy scores. Null accuracy/response times are intentional. */
export function buildHistory(s:State,patientId:string,uid:string):StoredBubblePopSession {
  if(s.status!=='ended'||!s.endedAt||!uid||!patientId)throw Error('Ended bound session required');
  const stageNo=(i:number)=>((i%3)+1) as 1|2|3;
  const sum=summary(s);
  const rows=Array.from({length:9},(_,stage)=>stage).filter(i=>s.events.some(e=>e.stage===i)||s.completed.includes(i)||s.skipped.includes(i));
  return {gameId:'bubble-pop-wall',resultVersion:2,engine:'dome3',sessionId:`${s.sessionId}-r${s.run}`,patientId,createdByUid:uid,
    startedAt:s.startedAt||s.endedAt,completedAt:s.endedAt,durationMs:s.startedAt?s.endedAt-s.startedAt:0,
    startingDifficulty:difficultyOf(s.startStage),startingStage:stageNo(s.startStage),endingDifficulty:difficultyOf(s.stage),endingStage:stageNo(s.stage),
    completedStageCount:s.completed.length,skippedStageCount:s.skipped.length,totalTargetsPresented:rows.reduce((a,i)=>a+count({...s,stage:i}),0),totalTargetsCompleted:sum.completed,totalIncorrect:0,
    objectivesCompleted:sum.completed,assistedObjectives:sum.assisted,repeatedObjectives:s.repeats,sessionCompleted:sum.complete,
    completionRate:null,accuracy:null,averageResponseTimeMs:null,bestStage:s.completed.length?{difficulty:difficultyOf(s.completed.at(-1)!),stageNumber:stageNo(s.completed.at(-1)!)}:null,
    stageResults:rows.map(i=>({engine:'dome3',difficulty:difficultyOf(i),stageNumber:stageNo(i),status:s.completed.includes(i)?StageStatus.COMPLETED:StageStatus.SKIPPED,
      targetsPresented:count({...s,stage:i}),targetsCompleted:s.events.filter(e=>e.stage===i&&e.result==='completed').length,incorrectCount:0,durationMs:null,averageResponseTimeMs:null}))};
}
export function reviveDomeHistory(raw:unknown):StoredBubblePopSession|null {
  const r=raw as StoredBubblePopSession;
  if(!r||r.gameId!=='bubble-pop-wall'||r.resultVersion!==2||r.engine!=='dome3'||!r.sessionId||!r.patientId||!r.createdByUid)return null;
  if(![r.startedAt,r.completedAt,r.durationMs,r.completedStageCount,r.skippedStageCount,r.totalTargetsPresented,r.totalTargetsCompleted,r.objectivesCompleted,r.assistedObjectives,r.repeatedObjectives].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0))return null;
  if(r.completedStageCount!>9||r.skippedStageCount!>9||r.totalTargetsPresented!>81||r.totalTargetsCompleted!>r.totalTargetsPresented!||r.assistedObjectives!>r.objectivesCompleted!||r.objectivesCompleted!==r.totalTargetsCompleted||typeof r.sessionCompleted!=='boolean')return null;
  const rows: StoredBubblePopSession['stageResults'] = Array.isArray(r.stageResults)?r.stageResults:Object.values(r.stageResults??{});
  if(rows.length>9||rows.some(p=>p.engine!=='dome3'||![1,2,3].includes(p.stageNumber)||p.targetsCompleted!>p.targetsPresented!))return null;
  return {...r,accuracy:null,completionRate:null,averageResponseTimeMs:null,bestStage:r.bestStage??null,stageResults:rows.map(p=>({...p,durationMs:null,averageResponseTimeMs:null}))};
}

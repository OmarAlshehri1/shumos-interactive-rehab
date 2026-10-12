import { StageStatus, type StageNumber } from '@/lib/game';
import type { StoredSessionWorkflowFields } from '@/lib/sessions/workflowMetadata';
import { STAGES, type State } from './engine';
import { difficulty, GAME_ID } from './live';
export interface StoredMirrorSession extends StoredSessionWorkflowFields {
 gameId:typeof GAME_ID; resultVersion:1; sessionId:string;patientId:string;createdByUid:string;startedAt:number;completedAt:number;durationMs:number;
 startingDifficulty:ReturnType<typeof difficulty>;startingStage:StageNumber;endingDifficulty:ReturnType<typeof difficulty>;endingStage:StageNumber;completedStageCount:number;skippedStageCount:number;totalPoses:number;totalAssists:number;
 bestStage:{difficulty:ReturnType<typeof difficulty>;stageNumber:StageNumber}|null;
 stageResults:{engine:'mirror3';difficulty:ReturnType<typeof difficulty>;stageNumber:StageNumber;status:StageStatus;poses:number;assists:number;durationMs:null}[];
}
export function buildHistory(s:State,patientId:string,uid:string):StoredMirrorSession {
 if(s.status!=='ended'||!s.endedAt||!patientId||!uid)throw new Error('Ended bound session required');
 const rows=STAGES.flatMap((stage,index)=>{void stage;const events=s.accepted.filter(p=>p.stage===index);return events.length?[{engine:'mirror3' as const,difficulty:difficulty(index),stageNumber:(index%3+1) as StageNumber,status:s.completed.includes(index)?StageStatus.COMPLETED:StageStatus.SKIPPED,poses:events.filter(p=>!p.skipped).length,assists:events.filter(p=>p.assisted).length,durationMs:null}]:[];});
 const best=rows.filter(r=>r.status===StageStatus.COMPLETED).at(-1);
 return {gameId:GAME_ID,resultVersion:1,sessionId:`${s.sessionId}-r${s.run}`,patientId,createdByUid:uid,startedAt:s.startedAt||s.endedAt,completedAt:s.endedAt,durationMs:s.startedAt?Math.max(0,s.endedAt-s.startedAt):0,startingDifficulty:rows[0]?.difficulty??difficulty(s.stage),startingStage:rows[0]?.stageNumber??(s.stage%3+1) as StageNumber,endingDifficulty:difficulty(s.stage),endingStage:(s.stage%3+1) as StageNumber,completedStageCount:s.completed.length,skippedStageCount:rows.filter(r=>r.status===StageStatus.SKIPPED).length,totalPoses:s.accepted.filter(p=>!p.skipped).length,totalAssists:s.accepted.filter(p=>p.assisted).length,bestStage:best?{difficulty:best.difficulty,stageNumber:best.stageNumber}:null,stageResults:rows};
}
export function reviveMirrorHistory(raw:unknown):StoredMirrorSession|null {
 const r=raw as StoredMirrorSession;
 if(!r||r.gameId!==GAME_ID||r.resultVersion!==1||!r.sessionId||!r.patientId||!r.createdByUid||![r.startedAt,r.completedAt,r.durationMs,r.completedStageCount,r.skippedStageCount,r.totalPoses,r.totalAssists].every(v=>Number.isFinite(v)&&v>=0)||r.completedAt<r.startedAt||r.totalPoses>28||r.totalAssists>r.totalPoses||r.completedStageCount>9||r.skippedStageCount>9)return null;
 const rows: StoredMirrorSession["stageResults"] = Array.isArray(r.stageResults)?r.stageResults:Object.values(r.stageResults??{});
 if(rows.length>9||rows.some(p=>p.engine!=='mirror3'||!Number.isInteger(p.poses)||p.poses<0||p.poses>4||!Number.isInteger(p.assists)||p.assists<0||p.assists>p.poses))return null;
 return {...r,bestStage:r.bestStage??null,stageResults:rows.map(p=>({...p,durationMs:null}))};
}

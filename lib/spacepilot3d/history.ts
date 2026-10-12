import {NINE_STAGE_CURRICULUM,CURRICULUM_ENCOUNTERS,SPACE_STAGES,curriculumIndex,isStageResult,type StageResult} from './curriculum';
import { Difficulty, type StageNumber } from '@/lib/game';
import type { StoredSpacePilotSession } from '@/lib/sessions/types';
import { decodeCheckpoint, type SpacePilotLiveSession } from './cloudState';
import type { FlightMode } from './rings';

/** Same game identity; an explicit result version distinguishes rings from historical stars. */
export interface StoredSpacePilotRingSession extends Omit<StoredSpacePilotSession, 'totalStarsPresented' | 'totalStarsCollected' | 'asteroidsCleared'> {
  resultVersion: 2; engine: 'sp3-rings'; runId: number; flightMode: FlightMode;
  totalRingsPresented: number; totalRingsCollected: number; totalRingsMissed: number;
  asteroidCollisions: number; score: number;
}
export interface StoredSpacePilotNineSession extends Omit<StoredSpacePilotRingSession,'resultVersion'> {
 resultVersion:3; curriculumId:typeof NINE_STAGE_CURRICULUM; startingStageIndex:number; endingStageIndex:number;
 stageResults:Record<string,StageResult>; assistedStageCount:number; sessionCompleted:boolean;
}
export type StoredRingResult=StoredSpacePilotRingSession|StoredSpacePilotNineSession;
export function isNineStageHistory(value:unknown):value is StoredSpacePilotNineSession {
 const v=value as Partial<StoredSpacePilotNineSession>|null;return !!v&&v.gameId==='space-pilot'&&v.resultVersion===3&&v.engine==='sp3-rings'&&v.curriculumId===NINE_STAGE_CURRICULUM;
}
export function isRingHistory(value: unknown): value is StoredRingResult {
  const v = value as Partial<StoredSpacePilotRingSession> | null;
  return !!v && v.gameId === 'space-pilot' && (v.resultVersion === 2 || isNineStageHistory(value)) && v.engine === 'sp3-rings';
}
export function buildStoredRingSession(live: SpacePilotLiveSession, patientId: string, ownerUid: string): StoredRingResult {
  const c = decodeCheckpoint(live);
  if (!c || !['completed', 'ended'].includes(live.sp3.status) || !patientId || !live.sp3.endedAt) throw new Error('Accepted completed result and patient binding required');
  const s = c.state, difficulty = s.difficulty === 'LOW' ? Difficulty.EASY : s.difficulty === 'HIGH' ? Difficulty.ADVANCED : Difficulty.MEDIUM;
  const result:StoredSpacePilotRingSession={ gameId: 'space-pilot', resultVersion: 2, engine: 'sp3-rings', sessionId: live.sessionId, patientId,
    createdByUid: ownerUid, startedAt: live.sp3.startedAt || live.createdAt, completedAt: live.sp3.endedAt,
    startingDifficulty: difficulty, endingDifficulty: difficulty, startingStage: 1, endingStage: s.mission as StageNumber,
    runId: s.runId, flightMode: s.accessibility.mode, completedStageCount: s.stats.completedMissions, skippedStageCount: 0,
    totalRingsPresented: s.stats.ringsPresented, totalRingsCollected: s.stats.ringsCollected, totalRingsMissed: s.stats.ringsMissed,
    asteroidCollisions: s.stats.asteroidCollisions, asteroidsAvoided: s.stats.asteroidsAvoided,
    score: s.stats.score, collectionRate: s.stats.collectionAccuracy, finalUpgradeLevel: s.stats.upgradeTier,
    durationMs: Math.round(s.elapsedSeconds * 1000), bestStage: s.stats.completedMissions ? { difficulty, stageNumber: s.stats.completedMissions as StageNumber } : null };
  if(!s.curriculumId)return result;
  const rows=s.stageResults??[],start=SPACE_STAGES[s.startingStageIndex??0],end=SPACE_STAGES[s.mission-1];
  const d=(index:number)=>index<3?Difficulty.EASY:index<6?Difficulty.MEDIUM:Difficulty.ADVANCED;
  const best=rows.filter(r=>r.status==='completed').sort((a,b)=>b.ringsCollected-a.ringsCollected||b.stageIndex-a.stageIndex)[0];
  return {...result,resultVersion:3,curriculumId:NINE_STAGE_CURRICULUM,startingStageIndex:start.index,endingStageIndex:end.index,startingDifficulty:d(start.index),startingStage:start.stage,endingDifficulty:d(end.index),endingStage:end.stage,stageResults:Object.fromEntries(rows.map(r=>[r.stageIndex,{...r}])),completedStageCount:rows.filter(r=>r.status==='completed').length,skippedStageCount:rows.filter(r=>r.status==='skipped').length,assistedStageCount:rows.filter(r=>r.status==='completed'&&r.assisted).length,sessionCompleted:rows.filter(r=>r.status==='completed').length===9,bestStage:best?{difficulty:d(best.stageIndex),stageNumber:SPACE_STAGES[best.stageIndex].stage}:null};
}
// RTDB may encode dense numeric keys as arrays, with null placeholders for absent stages.
function normalizeStageLedger(value:StoredSpacePilotNineSession['stageResults']|undefined){
  return Object.fromEntries(Object.entries(value??{}).filter(([,row])=>!Array.isArray(value)||row!==null));
}
export function reviveRingHistory(raw: unknown): StoredRingResult | null {
  if (!isRingHistory(raw)) return null;
  const v = raw;
  if (!v.sessionId || !v.patientId || ![v.totalRingsPresented, v.totalRingsCollected, v.totalRingsMissed, v.score, v.runId].every(n => Number.isSafeInteger(n) && n >= 0) ||
    v.totalRingsCollected > v.totalRingsPresented || v.score !== v.totalRingsCollected * 100) return null;
  if(isNineStageHistory(v)){
    if(v.stageResults!==undefined&&(!v.stageResults||typeof v.stageResults!=='object'))return null;
    const stages=normalizeStageLedger(v.stageResults);const rows=Object.values(stages);
    if(!stages||typeof stages!=='object'||Object.entries(stages).some(([key,r])=>!isStageResult(r)||key!==String(r.stageIndex)))return null;
    if(!curriculumIndex(v.startingStageIndex)||!curriculumIndex(v.endingStageIndex)||rows.length>9||!rows.every(isStageResult)||new Set(rows.map(r=>r.stageIndex)).size!==rows.length||v.completedStageCount!==rows.filter(r=>r.status==='completed').length||v.skippedStageCount!==rows.filter(r=>r.status==='skipped').length||v.assistedStageCount!==rows.filter(r=>r.status==='completed'&&r.assisted).length||v.sessionCompleted!==(v.completedStageCount===9)||v.totalRingsPresented>CURRICULUM_ENCOUNTERS||v.totalRingsCollected+v.totalRingsMissed>v.totalRingsPresented||v.startingStage!==SPACE_STAGES[v.startingStageIndex].stage||v.endingStage!==SPACE_STAGES[v.endingStageIndex].stage)return null;
  }
  return { ...v,...(isNineStageHistory(v)?{stageResults:normalizeStageLedger(v.stageResults)}:{}), collectionRate: v.totalRingsPresented ? v.totalRingsCollected / v.totalRingsPresented : null,
    bestStage: v.bestStage ?? null, asteroidsAvoided: v.asteroidsAvoided ?? null };
}

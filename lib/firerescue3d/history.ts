import { StageStatus, type StageNumber } from '@/lib/game';
import type { StoredSessionWorkflowFields } from '@/lib/sessions/workflowMetadata';
import { summary, type State } from './engine';
import { GAME_ID } from './live';
import { STAGES, difficultyOf } from './stages';
export interface StoredFireSession extends StoredSessionWorkflowFields {
    gameId: typeof GAME_ID;
    resultVersion: 1;
    engine: 'fr3';
    sessionId: string;
    patientId: string;
    createdByUid: string;
    startedAt: number;
    completedAt: number;
    durationMs: number;
    startingDifficulty: ReturnType<typeof difficultyOf>;
    startingStage: StageNumber;
    endingDifficulty: ReturnType<typeof difficultyOf>;
    endingStage: StageNumber;
    completedStageCount: number;
    skippedStageCount: number;
    drivingObjectives: number;
    fireTargetsExtinguished: number;
    assistedObjectives: number;
    independentObjectives: number;
    skippedObjectives: number;
    repeatedObjectives: number;
    sessionCompleted: boolean;
    inputSource: string;
    stageResults: {
        engine: 'fr3';
        difficulty: ReturnType<typeof difficultyOf>;
        stageNumber: StageNumber;
        stageIndex: number;
        status: StageStatus | 'PARTIAL';
        drivingObjectives: number;
        fireTargetsExtinguished: number;
        assistedObjectives: number;
        skippedObjectives: number;
    }[];
}
export function buildHistory(s: State, patientId: string, uid: string): StoredFireSession {
    if (s.status !== 'ended' || !s.endedAt || !patientId || !uid)
        throw new Error('Ended bound session required');
    const sum = summary(s);
    const stageNo = (i: number) => (i % 3 + 1) as StageNumber;
    return { gameId: GAME_ID, resultVersion: 1, engine: 'fr3', sessionId: s.sessionId, patientId, createdByUid: uid, startedAt: s.startedAt || s.endedAt, completedAt: s.endedAt, durationMs: s.elapsed, startingDifficulty: difficultyOf(s.startingStage), startingStage: stageNo(s.startingStage), endingDifficulty: difficultyOf(s.stage), endingStage: stageNo(s.stage), completedStageCount: s.completed.length, skippedStageCount: s.skipped.length, drivingObjectives: sum.driving, fireTargetsExtinguished: sum.fires, assistedObjectives: sum.assisted, independentObjectives: sum.independent, skippedObjectives: sum.skipped, repeatedObjectives: s.repeats, sessionCompleted: sum.sessionCompleted, inputSource: 'MIXED', stageResults: STAGES.flatMap((_, i) => { const e = s.events.filter(e => e.stage === i); return !e.length && !s.completed.includes(i) && !s.skipped.includes(i) ? [] : [{ engine: 'fr3' as const, difficulty: difficultyOf(i), stageNumber: stageNo(i), stageIndex: i, status: s.completed.includes(i) ? StageStatus.COMPLETED : s.skipped.includes(i) ? StageStatus.SKIPPED : 'PARTIAL' as const, drivingObjectives: e.filter(e => e.kind === 'drive' && e.outcome !== 'skipped').length, fireTargetsExtinguished: e.filter(e => e.kind === 'fire' && e.outcome !== 'skipped').length, assistedObjectives: e.filter(e => e.outcome === 'assisted').length, skippedObjectives: e.filter(e => e.outcome === 'skipped').length }]; }) };
}
const count = (v: unknown, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max;
export function reviveFireHistory(raw: unknown): StoredFireSession | null {
    try {
        const r = raw as StoredFireSession;
        if (!r || r.gameId !== GAME_ID || r.resultVersion !== 1 || r.engine !== 'fr3' || ![r.sessionId, r.patientId, r.createdByUid].every(v => typeof v === 'string' && v.length > 0))
            return null;
        if (![r.startedAt, r.completedAt, r.durationMs].every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0) || r.completedAt < r.startedAt)
            return null;
        if (!count(r.completedStageCount, 9) || !count(r.skippedStageCount, 9) || r.completedStageCount + r.skippedStageCount > 9 || !count(r.drivingObjectives, 12) || !count(r.fireTargetsExtinguished, 18) || !count(r.assistedObjectives, 30) || !count(r.independentObjectives, 30) || !count(r.skippedObjectives, 30) || !count(r.repeatedObjectives, 1e6) || r.assistedObjectives + r.independentObjectives !== r.drivingObjectives + r.fireTargetsExtinguished || typeof r.sessionCompleted !== 'boolean' || r.sessionCompleted !== (r.completedStageCount === 9))
            return null;
        if (!['EASY', 'MEDIUM', 'ADVANCED'].includes(r.startingDifficulty) || !['EASY', 'MEDIUM', 'ADVANCED'].includes(r.endingDifficulty) || !count(r.startingStage, 3) || r.startingStage < 1 || !count(r.endingStage, 3) || r.endingStage < 1)
            return null;
        const rows: Array<StoredFireSession['stageResults'][number]> = Array.isArray(r.stageResults) ? r.stageResults : Object.values(r.stageResults ?? {});
        if (rows.length > 9 || new Set(rows.map(v => v.stageIndex)).size !== rows.length)
            return null;
        for (const p of rows) {
            if (!count(p.stageIndex, 8) || p.engine !== 'fr3' || p.difficulty !== difficultyOf(p.stageIndex) || p.stageNumber !== p.stageIndex % 3 + 1 || !['COMPLETED', 'SKIPPED', 'PARTIAL'].includes(p.status) || !count(p.drivingObjectives, STAGES[p.stageIndex].stops.length) || !count(p.fireTargetsExtinguished, STAGES[p.stageIndex].targets.reduce((a, b) => a + b, 0)) || !count(p.assistedObjectives, p.drivingObjectives + p.fireTargetsExtinguished) || !count(p.skippedObjectives, 8))
                return null;
        }
        if (rows.reduce((a, p) => a + p.drivingObjectives, 0) !== r.drivingObjectives || rows.reduce((a, p) => a + p.fireTargetsExtinguished, 0) !== r.fireTargetsExtinguished || rows.reduce((a, p) => a + p.assistedObjectives, 0) !== r.assistedObjectives || rows.reduce((a, p) => a + p.skippedObjectives, 0) !== r.skippedObjectives || rows.filter(p => p.status === StageStatus.COMPLETED).length !== r.completedStageCount || rows.filter(p => p.status === StageStatus.SKIPPED).length !== r.skippedStageCount)
            return null;
        return { ...r, stageResults: rows, inputSource: r.inputSource || 'MIXED' };
    }
    catch {
        return null;
    }
}

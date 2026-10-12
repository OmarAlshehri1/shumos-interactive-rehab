import { StageStatus, type StageNumber } from '@/lib/game';
import type { StoredSessionWorkflowFields } from '@/lib/sessions/workflowMetadata';
import { participationMode, summary, type State } from './engine';
import { GAME_ID } from './registration';
import { STAGES, difficultyOf, stageNumberOf } from './stages';

export type PearlParticipation = ReturnType<typeof participationMode>;
export const PARTICIPATION_MODES: readonly PearlParticipation[] = ['MANUAL', 'WHEEL', 'PEDAL', 'WHEEL_PEDAL', 'MIXED'];
export interface StoredPearlSession extends StoredSessionWorkflowFields {
    gameId: typeof GAME_ID;
    resultVersion: 1;
    engine: 'pv3';
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
    fishDiscovered: number;
    assistedEncounters: number;
    independentEncounters: number;
    skippedEncounters: number;
    repeatedEncounters: number;
    sessionCompleted: boolean;
    participationMode: PearlParticipation;
    inputSource: string;
    stageResults: {
        engine: 'pv3';
        difficulty: ReturnType<typeof difficultyOf>;
        stageNumber: StageNumber;
        stageIndex: number;
        status: StageStatus | 'PARTIAL';
        fishDiscovered: number;
        assistedEncounters: number;
        skippedEncounters: number;
    }[];
}
/** factual counts only: no clinical score, accuracy or outcome is ever derived */
export function buildHistory(s: State, patientId: string, uid: string): StoredPearlSession {
    if (s.status !== 'ended' || !s.endedAt || !patientId || !uid) throw new Error('Ended bound session required');
    const sum = summary(s);
    const mode = participationMode(s);
    return {
        gameId: GAME_ID, resultVersion: 1, engine: 'pv3', sessionId: s.sessionId, patientId, createdByUid: uid, startedAt: s.startedAt || s.endedAt, completedAt: s.endedAt, durationMs: s.elapsed,
        startingDifficulty: difficultyOf(s.startingStage), startingStage: stageNumberOf(s.startingStage), endingDifficulty: difficultyOf(s.stage), endingStage: stageNumberOf(s.stage),
        completedStageCount: s.completed.length, skippedStageCount: s.skipped.length, fishDiscovered: sum.fish, assistedEncounters: sum.assisted, independentEncounters: sum.independent, skippedEncounters: sum.skipped, repeatedEncounters: s.repeats,
        sessionCompleted: sum.sessionCompleted, participationMode: mode, inputSource: mode,
        stageResults: STAGES.flatMap((_, i) => {
            const e = s.events.filter(ev => ev.stage === i);
            if (!e.length && !s.completed.includes(i) && !s.skipped.includes(i)) return [];
            return [{ engine: 'pv3' as const, difficulty: difficultyOf(i), stageNumber: stageNumberOf(i), stageIndex: i, status: s.completed.includes(i) ? StageStatus.COMPLETED : s.skipped.includes(i) ? StageStatus.SKIPPED : 'PARTIAL' as const, fishDiscovered: e.filter(ev => ev.outcome !== 'skipped').length, assistedEncounters: e.filter(ev => ev.outcome === 'assisted').length, skippedEncounters: e.filter(ev => ev.outcome === 'skipped').length }];
        }),
    };
}
const count = (v: unknown, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max;
export function revivePearlHistory(raw: unknown): StoredPearlSession | null {
    try {
        const r = raw as StoredPearlSession;
        if (!r || r.gameId !== GAME_ID || r.resultVersion !== 1 || r.engine !== 'pv3' || ![r.sessionId, r.patientId, r.createdByUid].every(v => typeof v === 'string' && v.length > 0)) return null;
        if (![r.startedAt, r.completedAt, r.durationMs].every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0) || r.completedAt < r.startedAt) return null;
        if (!count(r.completedStageCount, 9) || !count(r.skippedStageCount, 9) || r.completedStageCount + r.skippedStageCount > 9 || !count(r.fishDiscovered, 29) || !count(r.assistedEncounters, 29) || !count(r.independentEncounters, 29) || !count(r.skippedEncounters, 29) || !count(r.repeatedEncounters, 1e6)) return null;
        if (r.assistedEncounters + r.independentEncounters !== r.fishDiscovered || typeof r.sessionCompleted !== 'boolean' || r.sessionCompleted !== (r.completedStageCount === 9) || !PARTICIPATION_MODES.includes(r.participationMode)) return null;
        if (!['EASY', 'MEDIUM', 'ADVANCED'].includes(r.startingDifficulty) || !['EASY', 'MEDIUM', 'ADVANCED'].includes(r.endingDifficulty) || !count(r.startingStage, 3) || r.startingStage < 1 || !count(r.endingStage, 3) || r.endingStage < 1) return null;
        const rows: Array<StoredPearlSession['stageResults'][number]> = Array.isArray(r.stageResults) ? r.stageResults : Object.values(r.stageResults ?? {});
        if (rows.length > 9 || new Set(rows.map(v => v.stageIndex)).size !== rows.length) return null;
        for (const p of rows) {
            if (!count(p.stageIndex, 8) || p.engine !== 'pv3' || p.difficulty !== difficultyOf(p.stageIndex) || p.stageNumber !== stageNumberOf(p.stageIndex) || !['COMPLETED', 'SKIPPED', 'PARTIAL'].includes(p.status)) return null;
            const total = STAGES[p.stageIndex].markers.length;
            if (!count(p.fishDiscovered, total) || !count(p.assistedEncounters, p.fishDiscovered) || !count(p.skippedEncounters, total) || p.fishDiscovered + p.skippedEncounters > total) return null;
        }
        const sum = (f: (p: typeof rows[number]) => number) => rows.reduce((a, p) => a + f(p), 0);
        if (sum(p => p.fishDiscovered) !== r.fishDiscovered || sum(p => p.assistedEncounters) !== r.assistedEncounters || sum(p => p.skippedEncounters) !== r.skippedEncounters || rows.filter(p => p.status === StageStatus.COMPLETED).length !== r.completedStageCount || rows.filter(p => p.status === StageStatus.SKIPPED).length !== r.skippedStageCount) return null;
        return { ...r, stageResults: rows, inputSource: r.inputSource || r.participationMode };
    }
    catch {
        return null;
    }
}

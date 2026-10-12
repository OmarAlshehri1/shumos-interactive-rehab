import { reviveHarvestHistory } from '@/lib/harvestvalley3d/history';
import { reviveBloomHistory } from '@/lib/bloomingworld3d/history';
import { reviveDomeHistory } from '@/lib/bubblepopwall3d/history';
import { reviveFireHistory } from '@/lib/firerescue3d/history';
import { revivePearlHistory } from '@/lib/pearlvoyage3d/history';
import { reviveMirrorHistory } from '@/lib/mirrorquest3d/history';
import { reviveHexHistory } from '@/lib/safehexarena3d/history';
import { reviveTurnGoHistory } from '@/lib/turngo3d/history';
import { isFootsteps3History, reviveFootsteps3History } from '@/lib/footsteps3d/history';
import { isColorChase3History, reviveColorChase3History } from '@/lib/colorchase3d/history';
import { isRingHistory, reviveRingHistory } from '@/lib/spacepilot3d/history';
import { get, onValue, ref, set, type Unsubscribe } from "firebase/database";
import { getStaffDb } from "@/lib/realtime/firebaseClient";
import { reviveBuildQuestHistory } from "@/lib/buildquest3d/history";
import type { AnyStoredSession, StoredBubblePopSession, StoredColorChaseSession, StoredFeedAnimalsSession, StoredFootstepsSession, StoredRunnerQuestSession, StoredSession, StoredSpacePilotSession } from "./types";
import {
  normalizeSessionWorkflowMetadata,
  normalizeTherapistNote,
  THERAPIST_NAME_MAX_LENGTH,
  trimToLimit,
} from "./workflowMetadata";
import {
  assertFirebaseSafeValue,
  finiteCount,
  nonNegativeFiniteNumber,
  safeRatio,
  sumFinite,
} from "@/lib/dataIntegrity/numeric";
import { Difficulty, StageStatus, type StageNumber } from "@/lib/game";

/**
 * SESSION HISTORY TASK — the dedicated Firebase data layer for permanent
 * per-patient session history, at `/sessions/{patientId}/{sessionId}` (see
 * database.rules.json). Same "UI/controller never touches firebase/database
 * directly" architecture as lib/patients/patientRepository.ts and
 * lib/realtime/sessionRepository.ts.
 */

const SESSIONS_PATH = "sessions";

/**
 * RTDB drops `null` scalars and empty arrays entirely on write (same
 * behavior lib/realtime/serialization.ts documents for SessionState) — a
 * StoredStageResult with `durationMs: null` round-trips as a MISSING key,
 * not a `null` value, and a session with zero stageResults round-trips with
 * no `stageResults` key at all. This restores the exact StoredSession shape
 * callers expect.
 */
function reviveStageResultsArray(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw) : [];
}

function safeString(raw: unknown): string | null {
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

function safeDifficulty(raw: unknown): Difficulty {
  return raw === Difficulty.MEDIUM || raw === Difficulty.ADVANCED ? raw : Difficulty.EASY;
}

function safeStageNumber(raw: unknown): StageNumber {
  return raw === 2 || raw === 3 || raw === 4 || raw === 5 ? raw : 1;
}

function safeStatus(raw: unknown): StageStatus | null {
  return raw === StageStatus.COMPLETED || raw === StageStatus.SKIPPED ? raw : null;
}

function safeBestStage(raw: unknown): { difficulty: Difficulty; stageNumber: StageNumber } | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as { difficulty?: unknown; stageNumber?: unknown };
  if (![1, 2, 3, 4, 5].includes(value.stageNumber as number)) return null;
  return { difficulty: safeDifficulty(value.difficulty), stageNumber: safeStageNumber(value.stageNumber) };
}

/**
 * Runtime history is intentionally more defensive than its write-time type.
 * Invalid legacy numerics become null (unavailable), never a fabricated zero.
 */
function commonFields<T extends Record<string, unknown>>(value: T): T {
  const workflow = normalizeSessionWorkflowMetadata(value);
  const startedAt = nonNegativeFiniteNumber(value.startedAt);
  const rawCompletedAt = nonNegativeFiniteNumber(value.completedAt);
  const completedAt = rawCompletedAt !== null && rawCompletedAt <= Date.now() + 300_000 && (startedAt === null || rawCompletedAt >= startedAt)
    ? rawCompletedAt
    : null;
  const durationMs = completedAt === null && rawCompletedAt !== null ? null : nonNegativeFiniteNumber(value.durationMs);
  return {
    ...value,
    startedAt,
    completedAt,
    createdByUid: typeof value.createdByUid === "string" ? value.createdByUid : "",
    startingDifficulty: safeDifficulty(value.startingDifficulty),
    startingStage: safeStageNumber(value.startingStage),
    endingDifficulty: safeDifficulty(value.endingDifficulty),
    endingStage: safeStageNumber(value.endingStage),
    completedStageCount: finiteCount(value.completedStageCount),
    skippedStageCount: finiteCount(value.skippedStageCount),
    durationMs,
    bestStage: safeBestStage(value.bestStage),
    sessionGoal: workflow?.sessionGoal,
    customSessionGoal: workflow?.customSessionGoal,
    endReason: workflow?.endReason,
    customEndReason: workflow?.customEndReason,
    therapistName: typeof value.therapistName === "string" ? trimToLimit(value.therapistName, THERAPIST_NAME_MAX_LENGTH) || undefined : undefined,
    therapistNote: typeof value.therapistNote === "string" ? normalizeTherapistNote(value.therapistNote) || undefined : undefined,
  } as T;
}

function validRecordIdentity(value: Record<string, unknown>): boolean {
  return safeString(value.sessionId) !== null && safeString(value.patientId) !== null;
}

function reviveStoredSession(raw: unknown): StoredSession | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<StoredSession> & { stageResults?: unknown };
  if (!validRecordIdentity(value as Record<string, unknown>)) return null;
  // Balloon Quest 3D records tag each stage result `engine: "bq3"`; their `incorrect` counts are informational wrong-colour touches, so an accuracy percentage is never derived for them.
  const isBq3 = reviveStageResultsArray(value.stageResults).some((r) => (r as { engine?: unknown } | null)?.engine === "bq3");

  return commonFields({
    ...(value as StoredSession),
    totalCorrect: finiteCount(value.totalCorrect),
    totalIncorrect: finiteCount(value.totalIncorrect),
    accuracy: isBq3 ? null : safeRatio(value.totalCorrect, sumFinite([finiteCount(value.totalCorrect), finiteCount(value.totalIncorrect)])),
    averageReactionTimeMs: nonNegativeFiniteNumber(value.averageReactionTimeMs),
    stageResults: reviveStageResultsArray(value.stageResults).flatMap((result) => {
      const r = result as Partial<StoredSession["stageResults"][number]>;
      const status = safeStatus(r.status);
      if (!status) return [];
      return [{
        ...r,
        difficulty: safeDifficulty(r.difficulty), stageNumber: safeStageNumber(r.stageNumber), status,
        correct: finiteCount(r.correct), incorrect: finiteCount(r.incorrect),
        accuracy: r.engine === "bq3" ? null : safeRatio(r.correct, sumFinite([finiteCount(r.correct), finiteCount(r.incorrect)])),
        durationMs: nonNegativeFiniteNumber(r.durationMs),
        averageReactionTimeMs: nonNegativeFiniteNumber(r.averageReactionTimeMs),
      } as unknown as StoredSession["stageResults"][number]];
    }),
  } as unknown as Record<string, unknown>) as unknown as StoredSession;
}

/** MULTI-GAME HISTORY — Follow the Footsteps' own revive function, same RTDB-empty-array/null repair job as reviveStoredSession above. */
function reviveStoredFootstepsSession(raw: unknown): StoredFootstepsSession | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<StoredFootstepsSession> & { stageResults?: unknown };
  if (!validRecordIdentity(value as Record<string, unknown>)) return null;

  return commonFields({
    ...(value as StoredFootstepsSession),
    totalStepsPresented: finiteCount(value.totalStepsPresented),
    totalStepsCompleted: finiteCount(value.totalStepsCompleted),
    completionRate: safeRatio(value.totalStepsCompleted, value.totalStepsPresented),
    averageStepTimeMs: nonNegativeFiniteNumber(value.averageStepTimeMs),
    stageResults: reviveStageResultsArray(value.stageResults).flatMap((result) => {
      const r = result as Partial<StoredFootstepsSession["stageResults"][number]>;
      const status = safeStatus(r.status);
      if (!status) return [];
      return [{
        ...r,
        difficulty: safeDifficulty(r.difficulty), stageNumber: safeStageNumber(r.stageNumber), status,
        stepsPresented: finiteCount(r.stepsPresented), stepsCompleted: finiteCount(r.stepsCompleted),
        durationMs: nonNegativeFiniteNumber(r.durationMs),
        averageStepTimeMs: nonNegativeFiniteNumber(r.averageStepTimeMs),
      } as unknown as StoredFootstepsSession["stageResults"][number]];
    }),
  } as unknown as Record<string, unknown>) as unknown as StoredFootstepsSession;
}

/** MULTI-GAME HISTORY — Bubble Pop Wall's own revive function, same RTDB-empty-array/null repair job as the other two revive functions above. */
function reviveStoredBubblePopSession(raw: unknown): StoredBubblePopSession | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<StoredBubblePopSession> & { stageResults?: unknown };
  if (!validRecordIdentity(value as Record<string, unknown>)) return null;

  return commonFields({
    ...(value as StoredBubblePopSession),
    totalTargetsPresented: finiteCount(value.totalTargetsPresented), totalTargetsCompleted: finiteCount(value.totalTargetsCompleted),
    totalIncorrect: finiteCount(value.totalIncorrect), completionRate: safeRatio(value.totalTargetsCompleted, value.totalTargetsPresented),
    accuracy: safeRatio(value.totalTargetsCompleted, sumFinite([finiteCount(value.totalTargetsCompleted), finiteCount(value.totalIncorrect)])),
    averageResponseTimeMs: nonNegativeFiniteNumber(value.averageResponseTimeMs),
    stageResults: reviveStageResultsArray(value.stageResults).flatMap((result) => {
      const r = result as Partial<StoredBubblePopSession["stageResults"][number]>;
      const status = safeStatus(r.status);
      if (!status) return [];
      return [{
        ...r,
        difficulty: safeDifficulty(r.difficulty), stageNumber: safeStageNumber(r.stageNumber), status,
        targetsPresented: finiteCount(r.targetsPresented), targetsCompleted: finiteCount(r.targetsCompleted), incorrectCount: finiteCount(r.incorrectCount),
        durationMs: nonNegativeFiniteNumber(r.durationMs), averageResponseTimeMs: nonNegativeFiniteNumber(r.averageResponseTimeMs),
      } as unknown as StoredBubblePopSession["stageResults"][number]];
    }),
  } as unknown as Record<string, unknown>) as unknown as StoredBubblePopSession;
}

/** MULTI-GAME HISTORY — Feed the Animals' own revive function, same RTDB-empty-array/null repair job as the other three revive functions above. */
function reviveStoredFeedAnimalsSession(raw: unknown): StoredFeedAnimalsSession | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<StoredFeedAnimalsSession> & { stageResults?: unknown };
  if (!validRecordIdentity(value as Record<string, unknown>)) return null;

  return commonFields({
    ...(value as StoredFeedAnimalsSession),
    totalRoundsPresented: finiteCount(value.totalRoundsPresented), totalRoundsCompleted: finiteCount(value.totalRoundsCompleted),
    totalIncorrect: finiteCount(value.totalIncorrect), completionRate: safeRatio(value.totalRoundsCompleted, value.totalRoundsPresented),
    accuracy: safeRatio(value.totalRoundsCompleted, sumFinite([finiteCount(value.totalRoundsCompleted), finiteCount(value.totalIncorrect)])),
    averageResponseTimeMs: nonNegativeFiniteNumber(value.averageResponseTimeMs),
    stageResults: reviveStageResultsArray(value.stageResults).flatMap((result) => {
      const r = result as Partial<StoredFeedAnimalsSession["stageResults"][number]>;
      const status = safeStatus(r.status);
      if (!status) return [];
      return [{
        ...r,
        difficulty: safeDifficulty(r.difficulty), stageNumber: safeStageNumber(r.stageNumber), status,
        roundsPresented: finiteCount(r.roundsPresented), roundsCompleted: finiteCount(r.roundsCompleted), incorrectCount: finiteCount(r.incorrectCount),
        durationMs: nonNegativeFiniteNumber(r.durationMs), averageResponseTimeMs: nonNegativeFiniteNumber(r.averageResponseTimeMs),
      } as unknown as StoredFeedAnimalsSession["stageResults"][number]];
    }),
  } as unknown as Record<string, unknown>) as unknown as StoredFeedAnimalsSession;
}

/** MULTI-GAME HISTORY — Space Pilot's own revive function. No stageResults array to repair (this game has none — see StoredSpacePilotSession's doc comment); only the nullable bestStage/finalUpgradeLevel need the same RTDB-dropped-null repair every other reviver applies. */
function reviveStoredSpacePilotSession(raw: unknown): StoredSpacePilotSession | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<StoredSpacePilotSession>;
  if (!validRecordIdentity(value as Record<string, unknown>)) return null;

  return commonFields({
    ...(value as StoredSpacePilotSession),
    totalStarsPresented: finiteCount(value.totalStarsPresented), totalStarsCollected: finiteCount(value.totalStarsCollected),
    collectionRate: safeRatio(value.totalStarsCollected, value.totalStarsPresented), finalUpgradeLevel: finiteCount(value.finalUpgradeLevel),
    asteroidsCleared: value.asteroidsCleared == null ? null : finiteCount(value.asteroidsCleared),
    asteroidsAvoided: value.asteroidsAvoided == null ? null : finiteCount(value.asteroidsAvoided),
  } as unknown as Record<string, unknown>) as unknown as StoredSpacePilotSession;
}

function reviveStoredColorChaseSession(raw: unknown): StoredColorChaseSession | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<StoredColorChaseSession> & { stageResults?: unknown };
  if (!validRecordIdentity(value as Record<string, unknown>)) return null;
  return commonFields({
    ...(value as StoredColorChaseSession),
    totalTargetsPresented: finiteCount(value.totalTargetsPresented), totalCorrect: finiteCount(value.totalCorrect),
    totalIncorrect: finiteCount(value.totalIncorrect), totalDangerPresses: finiteCount(value.totalDangerPresses),
    accuracy: safeRatio(value.totalCorrect, sumFinite([finiteCount(value.totalCorrect), finiteCount(value.totalIncorrect), finiteCount(value.totalDangerPresses)])),
    averageResponseTimeMs: nonNegativeFiniteNumber(value.averageResponseTimeMs),
    stageResults: reviveStageResultsArray(value.stageResults).flatMap((result) => {
      const row = result as Partial<StoredColorChaseSession["stageResults"][number]>;
      const status = safeStatus(row.status);
      if (!status) return [];
      return [{ ...row, difficulty: safeDifficulty(row.difficulty), stageNumber: safeStageNumber(row.stageNumber), status,
        targetsPresented: finiteCount(row.targetsPresented), correctCount: finiteCount(row.correctCount), incorrectCount: finiteCount(row.incorrectCount), dangerPressCount: finiteCount(row.dangerPressCount),
        accuracy: safeRatio(row.correctCount, sumFinite([finiteCount(row.correctCount), finiteCount(row.incorrectCount), finiteCount(row.dangerPressCount)])),
        durationMs: nonNegativeFiniteNumber(row.durationMs), averageResponseTimeMs: nonNegativeFiniteNumber(row.averageResponseTimeMs) } as unknown as StoredColorChaseSession["stageResults"][number]];
    }),
  } as unknown as Record<string, unknown>) as unknown as StoredColorChaseSession;
}

/** RUNNER QUEST 3D — own revive function. No accuracy is ever derived; counts are repaired from RTDB's dropped nulls/empty arrays. */
function reviveStoredRunnerQuestSession(raw: unknown): StoredRunnerQuestSession | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<StoredRunnerQuestSession> & { stageResults?: unknown };
  if (!validRecordIdentity(value as Record<string, unknown>)) return null;
  return commonFields({
    ...(value as StoredRunnerQuestSession),
    resultVersion: finiteCount(value.resultVersion) ?? 1,
    totalStars: finiteCount(value.totalStars), totalHolds: finiteCount(value.totalHolds), totalAssists: finiteCount(value.totalAssists),
    totalObstaclesPresented: finiteCount(value.totalObstaclesPresented), totalObstaclesResolved: finiteCount(value.totalObstaclesResolved),
    inputSource: typeof value.inputSource === "string" ? value.inputSource : null,
    stageResults: reviveStageResultsArray(value.stageResults).flatMap((result) => {
      const r = result as Partial<StoredRunnerQuestSession["stageResults"][number]>;
      const status = safeStatus(r.status);
      if (!status) return [];
      return [{ ...r, engine: "rq3", difficulty: safeDifficulty(r.difficulty), stageNumber: safeStageNumber(r.stageNumber), status,
        stars: finiteCount(r.stars), holds: finiteCount(r.holds), assists: finiteCount(r.assists), obstaclesResolved: finiteCount(r.obstaclesResolved), obstaclesTotal: finiteCount(r.obstaclesTotal),
        durationMs: nonNegativeFiniteNumber(r.durationMs),
        // Version 1 rows have neither field: they stay WALL and are never reinterpreted.
        ...(r.projection === "FLOOR" ? { projection: "FLOOR" as const, objectivesSkipped: finiteCount(r.objectivesSkipped) } : r.projection === "WALL" ? { projection: "WALL" as const } : {}) } as unknown as StoredRunnerQuestSession["stageResults"][number]];
    }),
  } as unknown as Record<string, unknown>) as unknown as StoredRunnerQuestSession;
}

/**
 * MULTI-GAME HISTORY — dispatches to the right revive function by the raw
 * record's own `gameId`, never a guess from shape. A record with a missing/
 * unrecognized gameId is dropped (filtered out by the `AnyStoredSession`
 * callers below), same "fail safely, never misinterpret" convention
 * lib/realtime/sessionRepository.ts's normalizeGameId documents.
 */
export function reviveAnyStoredSession(raw: unknown): AnyStoredSession | null {
  const gameId = (raw as { gameId?: unknown } | null)?.gameId;
  if (gameId === "harvest-valley-3d") return reviveHarvestHistory(raw);
  if (gameId === "blooming-world-3d") return reviveBloomHistory(raw);
  if (gameId === "fire-rescue-3d") return reviveFireHistory(raw);
  if (gameId === "pearl-voyage-3d") return revivePearlHistory(raw);
  if (gameId === "mirror-quest-3d") return reviveMirrorHistory(raw);
  if (gameId === "safe-hex-arena-3d") return reviveHexHistory(raw);
  if (gameId === "turn-and-go-3d") return reviveTurnGoHistory(raw);
  if (gameId === "build-quest-3d") return reviveBuildQuestHistory(raw);
  // original five-stage records have no `resultVersion`/`engine` and are never reinterpreted
  if (gameId === "follow-the-footsteps") return isFootsteps3History(raw) ? reviveFootsteps3History(raw) : reviveStoredFootstepsSession(raw);
  if (gameId === "balloon-quest") return reviveStoredSession(raw);
  if (gameId === "bubble-pop-wall") return (raw as { resultVersion?: unknown }).resultVersion === 2 ? reviveDomeHistory(raw) : (raw as { resultVersion?: unknown }).resultVersion == null ? reviveStoredBubblePopSession(raw) : null;
  if (gameId === "feed-the-animals") return reviveStoredFeedAnimalsSession(raw);
  if (gameId === "space-pilot") return isRingHistory(raw) ? reviveRingHistory(raw) : (raw as { resultVersion?: unknown }).resultVersion == null ? reviveStoredSpacePilotSession(raw) : null;
  // original five-stage Color Chase records have no `resultVersion`/`engine` and are never reinterpreted
  if (gameId === "color-chase") return isColorChase3History(raw) ? reviveColorChase3History(raw) : reviveStoredColorChaseSession(raw);
  if (gameId === "runner-quest-3d") return reviveStoredRunnerQuestSession(raw);
  return null;
}

/**
 * Live-subscribes to every stored session for one patient, newest-first
 * (see the task's "SESSION HISTORY LIST... newest-first"). The clinic sees
 * ~10-15 patients/month with a handful of sessions each at this stage — the
 * whole per-patient node is small, so no pagination is needed yet.
 */
/** Live-subscribes to every stored session for one patient, across every game, newest-first. */
export function subscribeToPatientSessions(patientId: string, callback: (sessions: AnyStoredSession[]) => void): Unsubscribe {
  const db = getStaffDb();
  return onValue(ref(db, `${SESSIONS_PATH}/${patientId}`), (snapshot) => {
    const value = (snapshot.val() as Record<string, unknown> | null) ?? {};
    const sessions = Object.values(value)
      .map(reviveAnyStoredSession)
      .filter((s): s is AnyStoredSession => s !== null && s.patientId === patientId)
      .sort((a, b) => (nonNegativeFiniteNumber(b.completedAt) ?? -1) - (nonNegativeFiniteNumber(a.completedAt) ?? -1));
    callback(sessions);
  });
}

export async function getSessionHistoryRecord(patientId: string, sessionId: string): Promise<AnyStoredSession | null> {
  const db = getStaffDb();
  const snapshot = await get(ref(db, `${SESSIONS_PATH}/${patientId}/${sessionId}`));
  const session = reviveAnyStoredSession(snapshot.val());
  return session?.patientId === patientId && session.sessionId === sessionId ? session : null;
}

export type SaveSessionHistoryResult = "saved" | "already-saved";

/**
 * SESSION HISTORY TASK — "a completed patient session must be persisted
 * EXACTLY ONCE" (task section 4). Two layers, deliberately redundant:
 *
 *  1. Client-side: a `get()` existence check before ever attempting to
 *     write — the common-case fast path that avoids a noisy failed write
 *     on every redundant call (React re-render, Firebase reconnect,
 *     celebration replay, a second "End Session" tap — see the caller,
 *     useRealtimeControllerSession.ts, which also keeps its own in-memory
 *     "already attempted this sessionId" guard on TOP of this).
 *  2. Server-side (the AUTHORITATIVE guarantee, not just an optimization):
 *     database.rules.json's `.write` rule for this exact path is
 *     `!data.exists()` — the same permanent-claim pattern
 *     patientRepository.ts's patientNumbers index uses. Even if two writers
 *     somehow both pass the existence check above (a genuine race —
 *     another controller tab taking over the lease mid-save, for
 *     instance), only the FIRST write the server actually receives can
 *     ever succeed; every other one is rejected. A record, once saved, can
 *     never be silently duplicated or overwritten — see the task's
 *     "immutable session records."
 *
 * A rules rejection alone is NOT proof of a duplicate: validation and auth
 * failures use the same PERMISSION_DENIED code. After a rejected race this
 * function reads the exact immutable path again and reports
 * `"already-saved"` only if the record genuinely exists. Every other failure
 * is rethrown so the caller can clear its in-memory guard and retry rather
 * than silently losing history.
 */
export async function saveSessionHistoryOnce(patientId: string, record: AnyStoredSession): Promise<SaveSessionHistoryResult> {
  if (!patientId || record.patientId !== patientId || !record.sessionId) {
    throw new Error("Session history identity does not match its Firebase path");
  }
  assertFirebaseSafeValue(record);
  const db = getStaffDb();
  const path = `${SESSIONS_PATH}/${patientId}/${record.sessionId}`;

  const existing = await get(ref(db, path));
  if (existing.exists()) return "already-saved";

  try {
    await set(ref(db, path), record);
    return "saved";
  } catch (error) {
    if ((error as { code?: string } | null)?.code === "PERMISSION_DENIED") {
      // A rules/validation mismatch is also PERMISSION_DENIED. Only call it
      // a won race after proving the immutable record now exists.
      const racedRecord = await get(ref(db, path));
      if (racedRecord.exists()) return "already-saved";
    }
    throw error;
  }
}

/**
 * The one intentionally mutable field on an otherwise immutable history
 * record. Writes only the note child, never rewrites metrics or stage data.
 */
export async function saveSessionTherapistNote(patientId: string, sessionId: string, note: string): Promise<string> {
  const normalized = normalizeTherapistNote(note);
  const db = getStaffDb();
  const sessionPath = `${SESSIONS_PATH}/${patientId}/${sessionId}`;
  const existing = await get(ref(db, sessionPath));
  if (!existing.exists()) throw new Error("Session history is not ready yet");
  await set(ref(db, `${sessionPath}/therapistNote`), normalized || null);
  return normalized;
}

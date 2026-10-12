import { beforeEach, describe, expect, it, vi } from "vitest";
import { Difficulty, StageStatus } from "@/lib/game";
import type { SessionSummary } from "@/lib/balloonquest/types";
import { balloonQuestStagesPerDifficulty, isBalloonQuest3DSession } from "../balloonQuestVersion";
import { buildStoredBalloonQuest3DSession } from "../buildStoredBalloonQuest3DSession";
import { suggestResumePoint } from "../resumeSuggestion";

/* eslint-disable @typescript-eslint/no-unused-vars -- mock signatures mirror the real APIs */
const getMock = vi.fn((..._args: unknown[]): Promise<{ val: () => unknown; exists: () => boolean }> => Promise.resolve({ val: () => null, exists: () => false }));
/* eslint-enable @typescript-eslint/no-unused-vars */
vi.mock("firebase/database", () => ({
  ref: (_db: unknown, path?: string) => ({ __path: path ?? "" }),
  get: (...args: unknown[]) => getMock(...args),
  set: vi.fn(),
  onValue: vi.fn(() => () => {}),
}));
vi.mock("@/lib/realtime/firebaseClient", () => ({ getStaffDb: () => ({}) }));

const summary = (over: Partial<SessionSummary> = {}): SessionSummary => ({
  sessionId: "s1", runId: 1, reason: "completed",
  stages: [
    { index: 3, difficulty: "MEDIUM", stage: 1, status: "completed", target: "blue", goal: 4, correct: 4, wrongContacts: 2, activeMs: 21_000, attempts: 1 },
    { index: 4, difficulty: "MEDIUM", stage: 2, status: "skipped", target: "red", goal: 5, correct: 1, wrongContacts: 0, activeMs: 8_000, attempts: 1 },
  ],
  completedStages: 1, skippedStages: 1, totalCorrect: 5, totalWrongContacts: 2, activeMs: 29_000, restarts: 0, ...over,
});

const build = (s = summary()) => buildStoredBalloonQuest3DSession({ summary: s, startIndex: 3, startedAt: 1_000, completedAt: 40_000, patientId: "p1", createdByUid: "u1", therapistName: "أ. سارة" });

describe("Balloon Quest 3D history record", () => {
  it("is stored under the existing game id with every stage result tagged and stage numbers in 1-3", () => {
    const r = build();
    expect(r.gameId).toBe("balloon-quest");
    expect(r.stageResults.every((x) => x.engine === "bq3")).toBe(true);
    expect(r.stageResults.map((x) => [x.difficulty, x.stageNumber, x.status])).toEqual([
      [Difficulty.MEDIUM, 1, StageStatus.COMPLETED],
      [Difficulty.MEDIUM, 2, StageStatus.SKIPPED],
    ]);
    expect([r.startingDifficulty, r.startingStage, r.endingDifficulty, r.endingStage]).toEqual([Difficulty.MEDIUM, 1, Difficulty.MEDIUM, 2]);
    expect(r).toMatchObject({ completedStageCount: 1, skippedStageCount: 1, totalCorrect: 5, totalIncorrect: 2, durationMs: 29_000, therapistName: "أ. سارة" });
  });

  it("never fabricates an accuracy or reaction time (wrong-colour touches are informational)", () => {
    const r = build();
    expect(r.accuracy).toBeNull();
    expect(r.averageReactionTimeMs).toBeNull();
    expect(r.bestStage).toBeNull();
    expect(r.stageResults.every((x) => x.accuracy === null && x.averageReactionTimeMs === null)).toBe(true);
  });

  it("satisfies the unchanged security rules' numeric constraints", () => {
    const r = build();
    expect(r.startingStage).toBeGreaterThanOrEqual(1);
    expect(r.startingStage).toBeLessThanOrEqual(5);
    expect(r.endingStage).toBeLessThanOrEqual(5);
    expect(r.completedAt!).toBeGreaterThanOrEqual(r.startedAt!);
    expect(r.durationMs!).toBeGreaterThanOrEqual(0);
    expect(r.totalCorrect!).toBeGreaterThanOrEqual(0);
    expect(r.totalIncorrect!).toBeGreaterThanOrEqual(0);
    // required children for gameId balloon-quest
    for (const k of ["sessionId", "patientId", "gameId", "startedAt", "completedAt", "createdByUid", "startingDifficulty", "startingStage", "endingDifficulty", "endingStage", "completedStageCount", "skippedStageCount", "totalCorrect", "totalIncorrect"] as const) expect(r[k]).not.toBeUndefined();
  });

  it("a session ended before any stage still has a valid record anchored at the planned start", () => {
    const r = build(summary({ stages: [], completedStages: 0, skippedStages: 0, totalCorrect: 0, totalWrongContacts: 0, activeMs: 0, reason: "therapist-ended" }));
    expect([r.endingDifficulty, r.endingStage]).toEqual([Difficulty.MEDIUM, 1]);
    expect(r.stageResults).toEqual([]);
  });

  it("each run of the same session is stored under its own key (records are immutable and keyed by session id)", () => {
    expect(build().sessionId).toBe("s1");
    expect(build(summary({ runId: 2 })).sessionId).toBe("s1-r2");
    expect(build(summary({ runId: 3 })).sessionId).toBe("s1-r3");
    expect(build(summary({ runId: 2 })).sessionId).not.toMatch(/[.$#[\]/]/); // Realtime Database keys may not contain . $ # [ ] /
  });

  it("completedAt is never before startedAt", () => {
    const r = buildStoredBalloonQuest3DSession({ summary: summary(), startIndex: 0, startedAt: 9_000, completedAt: 5_000, patientId: "p", createdByUid: "u" });
    expect(r.completedAt).toBe(9_000);
  });
});

describe("version detection and legacy records", () => {
  const legacy = { stageResults: [{ difficulty: Difficulty.MEDIUM, stageNumber: 4, status: StageStatus.COMPLETED }] };
  it("tells the two shapes apart by the stage-result marker, never by guessing", () => {
    expect(isBalloonQuest3DSession(build())).toBe(true);
    expect(isBalloonQuest3DSession(legacy)).toBe(false);
    expect(isBalloonQuest3DSession({ stageResults: [] })).toBe(false);
    expect(balloonQuestStagesPerDifficulty(build())).toBe(3);
    expect(balloonQuestStagesPerDifficulty(legacy)).toBe(5);
  });

  it("resume suggestion uses 3 stages for the new game and still 5 for legacy records", () => {
    const stage = (n: 1 | 2 | 3, status: StageStatus, difficulty = Difficulty.EASY, engine?: "bq3") => ({ stageResults: [{ difficulty, stageNumber: n, status, ...(engine ? { engine } : {}) }], startingDifficulty: difficulty, startingStage: 1 as const });
    expect(suggestResumePoint(stage(2, StageStatus.COMPLETED, Difficulty.EASY, "bq3"))).toMatchObject({ difficulty: Difficulty.EASY, startingStage: 3, reason: "next-stage" });
    expect(suggestResumePoint(stage(3, StageStatus.COMPLETED, Difficulty.EASY, "bq3"))).toMatchObject({ difficulty: Difficulty.MEDIUM, startingStage: 1, reason: "next-difficulty" });
    expect(suggestResumePoint(stage(3, StageStatus.COMPLETED, Difficulty.ADVANCED, "bq3"))).toMatchObject({ reason: "repeat-final-stage" });
    expect(suggestResumePoint(stage(2, StageStatus.SKIPPED, Difficulty.MEDIUM, "bq3"))).toMatchObject({ startingStage: 2, reason: "resume-skipped" });
    // legacy: stage 3 of 5 -> stage 4 (unchanged behaviour)
    expect(suggestResumePoint(stage(3, StageStatus.COMPLETED, Difficulty.EASY))).toMatchObject({ difficulty: Difficulty.EASY, startingStage: 4, reason: "next-stage" });
  });
});

describe("reading history back (Realtime Database drops nulls)", () => {
  beforeEach(() => { vi.resetModules(); getMock.mockReset(); });

  const stored = (raw: Record<string, unknown>) => getMock.mockResolvedValueOnce({ val: () => raw, exists: () => true });
  const rtdbRecord = () => {
    const r = JSON.parse(JSON.stringify(build())) as Record<string, unknown>; // JSON drops the nulls like RTDB
    return r;
  };

  it("keeps the engine marker and does NOT derive an accuracy from correct/(correct+touches)", async () => {
    const { getSessionHistoryRecord } = await import("../sessionHistoryRepository");
    stored(rtdbRecord());
    const s = (await getSessionHistoryRecord("p1", "s1")) as import("../types").StoredSession;
    expect(isBalloonQuest3DSession(s)).toBe(true);
    expect(s.accuracy).toBeNull(); // would be 5/7 if reinterpreted as legacy
    expect(s.stageResults.map((r) => r.accuracy)).toEqual([null, null]);
    expect(s.totalIncorrect).toBe(2);
    expect(s.stageResults.map((r) => r.stageNumber)).toEqual([1, 2]);
  });

  it("legacy records are read exactly as before (accuracy derived, no marker, five stages)", async () => {
    const { getSessionHistoryRecord } = await import("../sessionHistoryRepository");
    stored({
      sessionId: "old", patientId: "p1", gameId: "balloon-quest", startedAt: 1000, completedAt: 5000, createdByUid: "u",
      startingDifficulty: "MEDIUM", startingStage: 4, endingDifficulty: "MEDIUM", endingStage: 5, completedStageCount: 2, skippedStageCount: 0,
      totalCorrect: 6, totalIncorrect: 2, durationMs: 4000,
      stageResults: [{ difficulty: "MEDIUM", stageNumber: 4, status: "COMPLETED", correct: 3, incorrect: 1, durationMs: 2000 }, { difficulty: "MEDIUM", stageNumber: 5, status: "COMPLETED", correct: 3, incorrect: 1, durationMs: 2000 }],
    });
    const s = (await getSessionHistoryRecord("p1", "old")) as import("../types").StoredSession;
    expect(isBalloonQuest3DSession(s)).toBe(false);
    expect(balloonQuestStagesPerDifficulty(s)).toBe(5);
    expect(s.accuracy).toBeCloseTo(0.75);
    expect(s.endingStage).toBe(5);
    expect(s.stageResults.map((r) => r.accuracy)).toEqual([0.75, 0.75]);
  });
});

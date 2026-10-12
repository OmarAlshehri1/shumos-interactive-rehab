import { RETIRED_FEED_ANIMALS_ID as FEED_THE_ANIMALS_GAME_ID } from "../retiredFeedAnimals";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Difficulty, StageStatus } from "@/lib/game";
import { BALLOON_QUEST_GAME_ID, BUBBLE_POP_WALL_GAME_ID, FOLLOW_THE_FOOTSTEPS_GAME_ID } from "@/lib/games/registry";
import type { AnyStoredSession, StoredBubblePopSession, StoredFeedAnimalsSession, StoredFootstepsSession, StoredSession } from "../types";

/* eslint-disable @typescript-eslint/no-unused-vars -- mock signatures intentionally mirror the real APIs' arity for type-safe spreading below */
const refMock = vi.fn((_db: unknown, path?: string) => ({ __path: path ?? "" }));
const getMock = vi.fn((..._args: unknown[]): Promise<{ val: () => unknown; exists: () => boolean }> =>
  Promise.resolve({ val: () => null, exists: () => false }),
);
const setMock = vi.fn((..._args: unknown[]): Promise<void> => Promise.resolve());
const onValueMock = vi.fn((..._args: unknown[]) => () => {});
/* eslint-enable @typescript-eslint/no-unused-vars */

vi.mock("firebase/database", () => ({
  ref: (db: unknown, path?: string) => refMock(db, path),
  get: (...args: unknown[]) => getMock(...args),
  set: (...args: unknown[]) => setMock(...args),
  onValue: (...args: unknown[]) => onValueMock(...args),
}));

vi.mock("@/lib/realtime/firebaseClient", () => ({
  getStaffDb: () => ({ __fakeDb: true }),
}));

function makeStoredSession(overrides: Partial<StoredSession> = {}): StoredSession {
  return {
    sessionId: "session-1",
    patientId: "patient-1",
    gameId: BALLOON_QUEST_GAME_ID,
    startedAt: 1000,
    completedAt: 5000,
    createdByUid: "staff-1",
    startingDifficulty: Difficulty.EASY,
    startingStage: 1,
    endingDifficulty: Difficulty.EASY,
    endingStage: 1,
    completedStageCount: 1,
    skippedStageCount: 0,
    totalCorrect: 3,
    totalIncorrect: 0,
    accuracy: 1,
    durationMs: 4000,
    averageReactionTimeMs: 500,
    bestStage: { difficulty: Difficulty.EASY, stageNumber: 1 },
    stageResults: [
      { difficulty: Difficulty.EASY, stageNumber: 1, status: StageStatus.COMPLETED, correct: 3, incorrect: 0, accuracy: 1, durationMs: 4000, averageReactionTimeMs: 500 },
    ],
    ...overrides,
  };
}

describe("saveSessionHistoryOnce — exactly-once persistence", () => {
  beforeEach(() => {
    vi.resetModules();
    refMock.mockClear();
    getMock.mockClear();
    setMock.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("writes to sessions/{patientId}/{sessionId} when nothing exists there yet", async () => {
    getMock.mockResolvedValueOnce({ val: () => null, exists: () => false });
    const { saveSessionHistoryOnce } = await import("../sessionHistoryRepository");
    const record = makeStoredSession();

    const result = await saveSessionHistoryOnce("patient-1", record);

    expect(result).toBe("saved");
    expect(refMock).toHaveBeenCalledWith(expect.anything(), "sessions/patient-1/session-1");
    expect(setMock).toHaveBeenCalledWith(expect.anything(), record);
  });

  it("skips the write entirely (exactly-once fast path) when a record already exists at that path", async () => {
    getMock.mockResolvedValueOnce({ val: () => ({ sessionId: "session-1" }), exists: () => true });
    const { saveSessionHistoryOnce } = await import("../sessionHistoryRepository");

    const result = await saveSessionHistoryOnce("patient-1", makeStoredSession());

    expect(result).toBe("already-saved");
    expect(setMock).not.toHaveBeenCalled();
  });

  it("treats a PERMISSION_DENIED-rejected write as already-saved only after proving another writer won", async () => {
    getMock.mockResolvedValueOnce({ val: () => null, exists: () => false });
    getMock.mockResolvedValueOnce({ val: () => makeStoredSession(), exists: () => true });
    setMock.mockRejectedValueOnce(Object.assign(new Error("permission_denied at /sessions"), { code: "PERMISSION_DENIED" }));
    const { saveSessionHistoryOnce } = await import("../sessionHistoryRepository");

    const result = await saveSessionHistoryOnce("patient-1", makeStoredSession());

    expect(result).toBe("already-saved");
  });

  it("does not silently swallow a rules/validation PERMISSION_DENIED when no record was saved", async () => {
    getMock.mockResolvedValueOnce({ val: () => null, exists: () => false });
    getMock.mockResolvedValueOnce({ val: () => null, exists: () => false });
    setMock.mockRejectedValueOnce(Object.assign(new Error("permission_denied at /sessions"), { code: "PERMISSION_DENIED" }));
    const { saveSessionHistoryOnce } = await import("../sessionHistoryRepository");
    await expect(saveSessionHistoryOnce("patient-1", makeStoredSession())).rejects.toThrow("permission_denied");
  });

  it("rejects non-finite metrics and patient/path mismatches before any Firebase write", async () => {
    const { saveSessionHistoryOnce } = await import("../sessionHistoryRepository");
    await expect(saveSessionHistoryOnce("patient-1", makeStoredSession({ durationMs: Number.NaN }))).rejects.toThrow("non-finite");
    await expect(saveSessionHistoryOnce("patient-2", makeStoredSession())).rejects.toThrow("identity");
    expect(setMock).not.toHaveBeenCalled();
  });

  it("RELIABILITY FIX regression: rethrows a genuine failure (e.g. offline/timeout) instead of silently swallowing it as 'already-saved'", async () => {
    getMock.mockResolvedValueOnce({ val: () => null, exists: () => false });
    setMock.mockRejectedValueOnce(new Error("network error"));
    const { saveSessionHistoryOnce } = await import("../sessionHistoryRepository");

    await expect(saveSessionHistoryOnce("patient-1", makeStoredSession())).rejects.toThrow("network error");
  });

  it("scopes different patients to different paths — patient isolation at the repository layer", async () => {
    getMock.mockResolvedValue({ val: () => null, exists: () => false });
    const { saveSessionHistoryOnce } = await import("../sessionHistoryRepository");

    await saveSessionHistoryOnce("patient-A", makeStoredSession({ patientId: "patient-A", sessionId: "s-a" }));
    await saveSessionHistoryOnce("patient-B", makeStoredSession({ patientId: "patient-B", sessionId: "s-b" }));

    expect(refMock).toHaveBeenCalledWith(expect.anything(), "sessions/patient-A/s-a");
    expect(refMock).toHaveBeenCalledWith(expect.anything(), "sessions/patient-B/s-b");
  });
});

describe("subscribeToPatientSessions", () => {
  beforeEach(() => {
    vi.resetModules();
    refMock.mockClear();
    onValueMock.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reads from sessions/{patientId} and delivers sessions newest-first", async () => {
    const { subscribeToPatientSessions } = await import("../sessionHistoryRepository");
    const callback = vi.fn();

    subscribeToPatientSessions("patient-1", callback);

    expect(refMock).toHaveBeenCalledWith(expect.anything(), "sessions/patient-1");
    const onValueCallback = onValueMock.mock.calls[0]![1] as (snapshot: { val: () => unknown }) => void;
    onValueCallback({
      val: () => ({
        "session-old": makeStoredSession({ sessionId: "session-old", completedAt: 1000 }),
        "session-new": makeStoredSession({ sessionId: "session-new", completedAt: 5000 }),
        "session-mid": makeStoredSession({ sessionId: "session-mid", completedAt: 3000 }),
      }),
    });

    const delivered = callback.mock.calls[0]![0] as StoredSession[];
    expect(delivered.map((s) => s.sessionId)).toEqual(["session-new", "session-mid", "session-old"]);
  });

  it("drops a legacy record whose embedded patientId does not match the subscribed patient path", async () => {
    const { subscribeToPatientSessions } = await import("../sessionHistoryRepository");
    const callback = vi.fn();
    subscribeToPatientSessions("patient-A", callback);
    const onValueCallback = onValueMock.mock.calls[0]![1] as (snapshot: { val: () => unknown }) => void;

    onValueCallback({ val: () => ({
      own: makeStoredSession({ sessionId: "own", patientId: "patient-A" }),
      foreign: makeStoredSession({ sessionId: "foreign", patientId: "patient-B" }),
    }) });

    const delivered = callback.mock.calls[0]![0] as StoredSession[];
    expect(delivered.map((session) => session.sessionId)).toEqual(["own"]);
  });

  it("revives RTDB's dropped null scalars/empty arrays back to their real StoredSession shape", async () => {
    const { subscribeToPatientSessions } = await import("../sessionHistoryRepository");
    const callback = vi.fn();

    subscribeToPatientSessions("patient-1", callback);

    const onValueCallback = onValueMock.mock.calls[0]![1] as (snapshot: { val: () => unknown }) => void;
    // Simulates a session ended before any stage was entered: durationMs/accuracy/
    // averageReactionTimeMs/bestStage all null, stageResults empty — RTDB drops
    // all of these entirely on write (see the file's own doc comment).
    const raw = makeStoredSession({ bestStage: null, averageReactionTimeMs: null, stageResults: [] });
    delete (raw as Partial<StoredSession>).bestStage;
    delete (raw as Partial<StoredSession>).averageReactionTimeMs;
    delete (raw as Partial<StoredSession>).stageResults;

    onValueCallback({ val: () => ({ "session-1": raw }) });

    const [delivered] = callback.mock.calls[0]! as [StoredSession[]];
    expect(delivered[0]!.bestStage).toBeNull();
    expect(delivered[0]!.averageReactionTimeMs).toBeNull();
    expect(delivered[0]!.stageResults).toEqual([]);
    expect(delivered[0]!.therapistName).toBeUndefined();
    expect(delivered[0]!.sessionGoal).toBeUndefined();
    expect(delivered[0]!.therapistNote).toBeUndefined();
  });

  it("keeps old goal-containing history readable without requiring a therapist name", async () => {
    const { subscribeToPatientSessions } = await import("../sessionHistoryRepository");
    const callback = vi.fn();
    subscribeToPatientSessions("patient-1", callback);
    const onValueCallback = onValueMock.mock.calls[0]![1] as (snapshot: { val: () => unknown }) => void;
    onValueCallback({ val: () => ({
      legacy: makeStoredSession({
        sessionId: "legacy",
        therapistName: undefined,
        sessionGoal: "OTHER",
        customSessionGoal: "هدف محفوظ من إصدار قديم",
      }),
    }) });

    const delivered = callback.mock.calls[0]![0] as StoredSession[];
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatchObject({
      sessionId: "legacy",
      sessionGoal: "OTHER",
      customSessionGoal: "هدف محفوظ من إصدار قديم",
    });
    expect(delivered[0]!.therapistName).toBeUndefined();
  });

  it("keeps a legacy session visible while converting malformed metrics to unavailable values", async () => {
    const { subscribeToPatientSessions } = await import("../sessionHistoryRepository");
    const callback = vi.fn();
    subscribeToPatientSessions("patient-1", callback);
    const onValueCallback = onValueMock.mock.calls[0]![1] as (snapshot: { val: () => unknown }) => void;
    const hostile = makeStoredSession({
      completedAt: Number.NaN,
      durationMs: -4,
      completedStageCount: undefined as never,
      totalCorrect: Number.POSITIVE_INFINITY,
      accuracy: Number.NaN,
      stageResults: [{
        difficulty: Difficulty.EASY,
        stageNumber: 1,
        status: StageStatus.COMPLETED,
        correct: undefined as never,
        incorrect: 0,
        accuracy: Number.NaN,
        durationMs: -2,
        averageReactionTimeMs: Number.POSITIVE_INFINITY,
      }],
    });
    onValueCallback({ val: () => ({ hostile }) });
    const delivered = callback.mock.calls[0]![0] as StoredSession[];
    expect(delivered).toHaveLength(1);
    expect(delivered[0]!.completedAt).toBeNull();
    expect(delivered[0]!.durationMs).toBeNull();
    expect(delivered[0]!.completedStageCount).toBeNull();
    expect(delivered[0]!.totalCorrect).toBeNull();
    expect(delivered[0]!.accuracy).toBeNull();
    expect(delivered[0]!.stageResults[0]).toMatchObject({ correct: null, accuracy: null, durationMs: null, averageReactionTimeMs: null });
  });

  it("MULTI-GAME PLATFORM — four-game history compatibility: correctly revives a mix of Balloon Quest, Follow the Footsteps, Bubble Pop Wall, and Feed the Animals records for the SAME patient, newest-first, with no field bleeding between shapes", async () => {
    const { subscribeToPatientSessions } = await import("../sessionHistoryRepository");
    const callback = vi.fn();

    subscribeToPatientSessions("patient-1", callback);

    const balloonQuest: StoredSession = makeStoredSession({ sessionId: "bq-1", completedAt: 1000 });
    const footsteps: StoredFootstepsSession = {
      sessionId: "fs-1",
      patientId: "patient-1",
      gameId: FOLLOW_THE_FOOTSTEPS_GAME_ID,
      startedAt: 2000,
      completedAt: 3000,
      createdByUid: "staff-1",
      startingDifficulty: Difficulty.EASY,
      startingStage: 1,
      endingDifficulty: Difficulty.EASY,
      endingStage: 1,
      completedStageCount: 1,
      skippedStageCount: 0,
      totalStepsPresented: 4,
      totalStepsCompleted: 4,
      completionRate: 1,
      durationMs: 1000,
      averageStepTimeMs: 250,
      bestStage: { difficulty: Difficulty.EASY, stageNumber: 1 },
      stageResults: [{ difficulty: Difficulty.EASY, stageNumber: 1, status: StageStatus.COMPLETED, stepsPresented: 4, stepsCompleted: 4, durationMs: 1000, averageStepTimeMs: 250 }],
    };
    const bubblePop: StoredBubblePopSession = {
      sessionId: "bp-1",
      patientId: "patient-1",
      gameId: BUBBLE_POP_WALL_GAME_ID,
      startedAt: 4000,
      completedAt: 5000,
      createdByUid: "staff-1",
      startingDifficulty: Difficulty.EASY,
      startingStage: 1,
      endingDifficulty: Difficulty.EASY,
      endingStage: 1,
      completedStageCount: 1,
      skippedStageCount: 0,
      totalTargetsPresented: 2,
      totalTargetsCompleted: 2,
      totalIncorrect: 1,
      completionRate: 1,
      accuracy: 2 / 3,
      durationMs: 1000,
      averageResponseTimeMs: 400,
      bestStage: { difficulty: Difficulty.EASY, stageNumber: 1 },
      stageResults: [{ difficulty: Difficulty.EASY, stageNumber: 1, status: StageStatus.COMPLETED, targetsPresented: 2, targetsCompleted: 2, incorrectCount: 1, durationMs: 1000, averageResponseTimeMs: 400 }],
    };
    const feedAnimals: StoredFeedAnimalsSession = {
      sessionId: "fa-1",
      patientId: "patient-1",
      gameId: FEED_THE_ANIMALS_GAME_ID,
      startedAt: 6000,
      completedAt: 7000,
      createdByUid: "staff-1",
      startingDifficulty: Difficulty.EASY,
      startingStage: 1,
      endingDifficulty: Difficulty.EASY,
      endingStage: 1,
      completedStageCount: 1,
      skippedStageCount: 0,
      totalRoundsPresented: 3,
      totalRoundsCompleted: 3,
      totalIncorrect: 1,
      completionRate: 1,
      accuracy: 3 / 4,
      durationMs: 1200,
      averageResponseTimeMs: 500,
      bestStage: { difficulty: Difficulty.EASY, stageNumber: 1 },
      stageResults: [{ difficulty: Difficulty.EASY, stageNumber: 1, status: StageStatus.COMPLETED, roundsPresented: 3, roundsCompleted: 3, incorrectCount: 1, durationMs: 1200, averageResponseTimeMs: 500 }],
    };

    const onValueCallback = onValueMock.mock.calls[0]![1] as (snapshot: { val: () => unknown }) => void;
    onValueCallback({ val: () => ({ "bq-1": balloonQuest, "fs-1": footsteps, "bp-1": bubblePop, "fa-1": feedAnimals }) });

    const delivered = callback.mock.calls[0]![0] as AnyStoredSession[];
    // Newest-first by completedAt: feed the animals (7000) -> bubble pop (5000) -> footsteps (3000) -> balloon quest (1000).
    expect(delivered.map((s) => s.sessionId)).toEqual(["fa-1", "bp-1", "fs-1", "bq-1"]);
    expect(delivered.map((s) => s.gameId)).toEqual([FEED_THE_ANIMALS_GAME_ID, BUBBLE_POP_WALL_GAME_ID, FOLLOW_THE_FOOTSTEPS_GAME_ID, BALLOON_QUEST_GAME_ID]);

    const revivedFeedAnimals = delivered[0] as StoredFeedAnimalsSession;
    expect(revivedFeedAnimals.totalRoundsCompleted).toBe(3);
    expect(revivedFeedAnimals.accuracy).toBeCloseTo(3 / 4);
    expect("totalTargetsCompleted" in revivedFeedAnimals).toBe(false);
    expect("totalCorrect" in revivedFeedAnimals).toBe(false);

    const revivedBubblePop = delivered[1] as StoredBubblePopSession;
    expect(revivedBubblePop.totalTargetsCompleted).toBe(2);
    expect(revivedBubblePop.accuracy).toBeCloseTo(2 / 3);
    expect("totalCorrect" in revivedBubblePop).toBe(false);
    expect("totalStepsCompleted" in revivedBubblePop).toBe(false);

    const revivedFootsteps = delivered[2] as StoredFootstepsSession;
    expect(revivedFootsteps.totalStepsCompleted).toBe(4);
    expect("accuracy" in revivedFootsteps).toBe(false);

    const revivedBalloonQuest = delivered[3] as StoredSession;
    expect(revivedBalloonQuest.totalCorrect).toBe(3);
  });
});

describe("saveSessionTherapistNote", () => {
  beforeEach(() => {
    vi.resetModules();
    refMock.mockClear();
    getMock.mockReset();
    setMock.mockReset();
    setMock.mockResolvedValue(undefined);
  });

  it("updates only the selected patient's note child and trims the note", async () => {
    getMock.mockResolvedValueOnce({ val: () => makeStoredSession(), exists: () => true });
    const { saveSessionTherapistNote } = await import("../sessionHistoryRepository");

    await expect(saveSessionTherapistNote("patient-A", "session-A", "  ملاحظة مختصرة  ")).resolves.toBe("ملاحظة مختصرة");
    expect(refMock).toHaveBeenCalledWith(expect.anything(), "sessions/patient-A/session-A/therapistNote");
    expect(setMock).toHaveBeenCalledWith(expect.anything(), "ملاحظة مختصرة");
  });

  it("clears an optional note with null and never rewrites the immutable session", async () => {
    getMock.mockResolvedValueOnce({ val: () => makeStoredSession(), exists: () => true });
    const { saveSessionTherapistNote } = await import("../sessionHistoryRepository");

    await saveSessionTherapistNote("patient-B", "session-B", "   ");
    expect(refMock).toHaveBeenLastCalledWith(expect.anything(), "sessions/patient-B/session-B/therapistNote");
    expect(setMock).toHaveBeenCalledWith(expect.anything(), null);
  });

  it("does not write before the immutable session record exists", async () => {
    getMock.mockResolvedValueOnce({ val: () => null, exists: () => false });
    const { saveSessionTherapistNote } = await import("../sessionHistoryRepository");
    await expect(saveSessionTherapistNote("patient-A", "missing", "note")).rejects.toThrow("not ready");
    expect(setMock).not.toHaveBeenCalled();
  });
});

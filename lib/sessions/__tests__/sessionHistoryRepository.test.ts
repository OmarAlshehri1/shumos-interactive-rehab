import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Difficulty, StageStatus } from "@/lib/game";
import { BALLOON_QUEST_GAME_ID } from "@/lib/games/registry";
import type { StoredSession } from "../types";

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

  it("treats a PERMISSION_DENIED-rejected write as 'already-saved' (another writer won a race), never throws", async () => {
    getMock.mockResolvedValueOnce({ val: () => null, exists: () => false });
    setMock.mockRejectedValueOnce(Object.assign(new Error("permission_denied at /sessions"), { code: "PERMISSION_DENIED" }));
    const { saveSessionHistoryOnce } = await import("../sessionHistoryRepository");

    const result = await saveSessionHistoryOnce("patient-1", makeStoredSession());

    expect(result).toBe("already-saved");
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
  });
});

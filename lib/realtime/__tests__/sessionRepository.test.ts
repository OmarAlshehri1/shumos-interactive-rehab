import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * These mock firebase/database entirely — no real network, no emulator
 * required — to verify the repository calls the right paths with the right
 * payloads. End-to-end behavior against a real (emulated) database is
 * covered separately by the Task 6 report's two-browser Playwright run.
 */

type SnapshotHandler = (snapshot: { val: () => unknown }) => void;

/* eslint-disable @typescript-eslint/no-unused-vars -- mock signatures intentionally mirror the real APIs' arity for type-safe spreading below */
const refMock = vi.fn((_db: unknown, path?: string) => ({ __path: path ?? "" }));
const onValueMock = vi.fn((_ref: unknown, _handler: SnapshotHandler) => vi.fn());
// Resolves to "no data" by default so it never interferes with tests that
// only assert on onValue's synchronous dispatch — get()'s .then() is a
// microtask that won't run until the test awaits something.
const getMock = vi.fn((..._args: unknown[]): Promise<{ val: () => unknown }> => Promise.resolve({ val: () => null }));
const updateMock = vi.fn((..._args: unknown[]) => Promise.resolve());
const removeMock = vi.fn((..._args: unknown[]) => Promise.resolve());
const onDisconnectMock = vi.fn((..._args: unknown[]) => ({ remove: vi.fn(async () => {}), set: vi.fn(async () => {}) }));
/* eslint-enable @typescript-eslint/no-unused-vars */
const serverTimestampMock = vi.fn(() => ({ ".sv": "timestamp" }));

vi.mock("firebase/database", () => ({
  ref: (db: unknown, path?: string) => refMock(db, path),
  onValue: (ref: unknown, handler: SnapshotHandler) => onValueMock(ref, handler),
  get: (...args: unknown[]) => getMock(...args),
  update: (...args: unknown[]) => updateMock(...args),
  remove: (...args: unknown[]) => removeMock(...args),
  onDisconnect: (...args: unknown[]) => onDisconnectMock(...args),
  serverTimestamp: () => serverTimestampMock(),
}));

vi.mock("../firebaseClient", () => ({
  getRealtimeDb: () => ({ __fakeDb: true }),
}));

describe("sessionRepository", () => {
  beforeEach(() => {
    refMock.mockClear();
    onValueMock.mockClear();
    getMock.mockClear();
    getMock.mockResolvedValue({ val: () => null });
    updateMock.mockClear();
    removeMock.mockClear();
    onDisconnectMock.mockClear();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("publishSession() writes sessionId/revision/session/lastInteraction/updatedAt atomically to liveSession", async () => {
    const { publishSession } = await import("../sessionRepository");
    const session = { gameState: "PLAYING" } as never;

    await publishSession({ sessionId: "abc", revision: 3, session, lastInteraction: null });

    expect(refMock).toHaveBeenCalledWith(expect.anything(), "liveSession");
    expect(updateMock).toHaveBeenCalledTimes(1);
    const [, payload] = updateMock.mock.calls[0]!;
    expect(payload).toMatchObject({ sessionId: "abc", revision: 3, session, lastInteraction: null });
    expect(payload).toHaveProperty("updatedAt");
  });

  it("publishSession() coerces an undefined lastInteraction to null (Firebase update() rejects raw undefined)", async () => {
    const { publishSession } = await import("../sessionRepository");
    const session = { gameState: "PLAYING" } as never;

    // A caller that read lastInteraction back from a previous RTDB round-trip
    // (before it's revived) would see undefined here, not null — this is
    // exactly what broke pauseOrResume() in production (see report).
    await publishSession({ sessionId: "abc", revision: 3, session, lastInteraction: undefined as never });

    const [, payload] = updateMock.mock.calls[0]!;
    expect(payload).toMatchObject({ lastInteraction: null });
  });

  it("subscribeToLiveSession() revives a dropped top-level lastInteraction back to null, not undefined", async () => {
    const { subscribeToLiveSession } = await import("../sessionRepository");
    const callback = vi.fn();
    const rawSession = {
      sessionId: "sess-1",
      seed: "seed",
      config: { childFirstName: "سارة", difficulty: "EASY", targetSize: "LARGE", targetSpacing: "CLOSE", playArea: "FULL" },
      gameState: "PLAYING",
      currentDifficulty: "EASY",
      currentStage: { difficulty: "EASY", stageNumber: 1, targetColor: "BLUE", balloons: [], totalTargets: 2, correctCount: 0, incorrectCount: 0, totalPausedMs: 0 },
      createdAt: 1,
    };
    // lastInteraction key entirely absent, matching what RTDB actually
    // returns after publishSession wrote `lastInteraction: null`.
    const record = { sessionId: "x", revision: 1, session: rawSession, updatedAt: 1 };

    onValueMock.mockImplementationOnce((_ref: unknown, handler: (snap: { val: () => unknown }) => void) => {
      handler({ val: () => record });
      return vi.fn();
    });
    subscribeToLiveSession(callback);

    const delivered = callback.mock.calls[0]![0];
    expect(delivered.lastInteraction).toBeNull();
    expect("lastInteraction" in delivered).toBe(true); // must be present-as-null, not simply missing
  });

  it("subscribeToLiveSession() delivers via a one-shot get() even if onValue's own initial dispatch never fires (StrictMode race)", async () => {
    // Simulates the exact production symptom (Task 7 QA): onValue's initial
    // callback is lost, but the caller must still end up with the current
    // value — this is the entire point of pairing get() alongside onValue.
    onValueMock.mockImplementationOnce(() => vi.fn()); // never invokes its handler
    const record = {
      sessionId: "x",
      revision: 9,
      session: {
        sessionId: "x",
        seed: "s",
        config: {},
        gameState: "PLAYING",
        currentDifficulty: "EASY",
        currentStage: { difficulty: "EASY", stageNumber: 1, targetColor: "BLUE", balloons: [], totalTargets: 2, correctCount: 0, incorrectCount: 0, totalPausedMs: 0 },
        createdAt: 1,
      },
      lastInteraction: null,
      updatedAt: 1,
    };
    getMock.mockResolvedValueOnce({ val: () => record });

    const { subscribeToLiveSession } = await import("../sessionRepository");
    const callback = vi.fn();
    subscribeToLiveSession(callback);

    // get()'s .then() is a microtask — flush it.
    await Promise.resolve();
    await Promise.resolve();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0]![0]).toMatchObject({ sessionId: "x", revision: 9 });
  });

  it("clearLiveSession() removes the whole liveSession node (not a partial field)", async () => {
    const { clearLiveSession } = await import("../sessionRepository");
    await clearLiveSession();
    expect(refMock).toHaveBeenCalledWith(expect.anything(), "liveSession");
    expect(removeMock).toHaveBeenCalledTimes(1);
  });

  it("subscribeToLiveSession() treats a missing/malformed snapshot as null (no session), never as a partial session", async () => {
    const { subscribeToLiveSession } = await import("../sessionRepository");
    const callback = vi.fn();

    onValueMock.mockImplementationOnce((_ref: unknown, handler: (snap: { val: () => unknown }) => void) => {
      handler({ val: () => null });
      return vi.fn();
    });
    subscribeToLiveSession(callback);
    expect(callback).toHaveBeenCalledWith(null);

    callback.mockClear();
    onValueMock.mockImplementationOnce((_ref: unknown, handler: (snap: { val: () => unknown }) => void) => {
      handler({ val: () => ({ sessionId: "x" /* missing revision/session */ }) });
      return vi.fn();
    });
    subscribeToLiveSession(callback);
    expect(callback).toHaveBeenCalledWith(null);
  });

  it("subscribeToLiveSession() forwards a well-formed record, reviving the session (see lib/realtime/serialization.ts)", async () => {
    const { subscribeToLiveSession } = await import("../sessionRepository");
    const callback = vi.fn();
    const rawSession = {
      sessionId: "sess-1",
      seed: "seed",
      config: { childFirstName: "سارة", difficulty: "EASY", targetSize: "LARGE", targetSpacing: "CLOSE", playArea: "FULL" },
      gameState: "WELCOME",
      currentDifficulty: "EASY",
      currentStage: { difficulty: "EASY", stageNumber: 1, targetColor: "BLUE", balloons: [], totalTargets: 2, correctCount: 0, incorrectCount: 0, totalPausedMs: 0 },
      createdAt: 1,
      // results/endedAt/summary intentionally absent, matching what RTDB actually returns for a fresh session
    };
    const record = { sessionId: "x", revision: 1, session: rawSession, lastInteraction: null, updatedAt: 1 };

    onValueMock.mockImplementationOnce((_ref: unknown, handler: (snap: { val: () => unknown }) => void) => {
      handler({ val: () => record });
      return vi.fn();
    });
    subscribeToLiveSession(callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const delivered = callback.mock.calls[0]![0];
    expect(delivered.session.results).toEqual([]);
    expect(delivered.session.endedAt).toBeNull();
    expect(delivered.session.summary).toBeNull();
  });

  it("subscribeToControllerLease() delivers via get() even if onValue's initial dispatch is lost (Task 7 QA regression: a second controller must never default to 'unclaimed')", async () => {
    onValueMock.mockImplementationOnce(() => vi.fn()); // never invokes its handler — simulates the lost-dispatch race
    const lease = { ownerId: "owner-A", claimedAt: 1, updatedAt: 12345 };
    getMock.mockResolvedValueOnce({ val: () => lease });

    const { subscribeToControllerLease } = await import("../sessionRepository");
    const callback = vi.fn();
    subscribeToControllerLease(callback);

    await Promise.resolve();
    await Promise.resolve();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(lease);
  });

  it("claimControllerLease() registers onDisconnect().remove() before writing the lease, so a crashed tab releases it", async () => {
    const remove = vi.fn(async () => {});
    onDisconnectMock.mockReturnValueOnce({ remove, set: vi.fn(async () => {}) });
    const { claimControllerLease } = await import("../sessionRepository");

    await claimControllerLease("owner-1");

    expect(onDisconnectMock).toHaveBeenCalledWith(expect.objectContaining({ __path: "controllerLease" }));
    expect(remove).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ __path: "controllerLease" }),
      expect.objectContaining({ ownerId: "owner-1" }),
    );
  });

  it("registerControllerPresence() re-registers onDisconnect every time .info/connected flips true (survives reconnects)", async () => {
    const { registerControllerPresence } = await import("../sessionRepository");

    let connectedHandler!: (snap: { val: () => unknown }) => void;
    onValueMock.mockImplementationOnce((_ref: unknown, handler: (snap: { val: () => unknown }) => void) => {
      connectedHandler = handler;
      return vi.fn();
    });

    registerControllerPresence();
    connectedHandler({ val: () => true });
    connectedHandler({ val: () => true });

    expect(onDisconnectMock).toHaveBeenCalledTimes(2);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * These mock firebase/database entirely — no real network, no emulator
 * required — to verify the repository calls the right paths with the right
 * payloads. End-to-end behavior against a real (emulated) database is
 * covered separately by the Task 6 report's two-browser Playwright run.
 *
 * AUTH ISOLATION HARDENING: sessionRepository.ts no longer reaches for a
 * module-level `getRealtimeDb()` internally — every function takes the
 * caller's `db` as its first argument (see firebaseClient.ts's
 * getStaffDb()/getDisplayDb()). These tests pass a plain fake db object
 * explicitly, the same way a real caller would pass getStaffDb() or
 * getDisplayDb() — there is nothing left to mock from firebaseClient here.
 */

vi.mock("firebase/auth", () => ({ getAuth: () => ({ currentUser: { uid: "staff-1" } }) }));

const fakeDb = { __fakeDb: true } as never;
const RAW_BALLOONS = [
  { id: "b1", color: "BLUE", position: { x: .35, y: .5 }, size: .1, isTarget: true, isPopped: false },
  { id: "b2", color: "BLUE", position: { x: .65, y: .5 }, size: .1, isTarget: true, isPopped: false },
];

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
const onDisconnectMock = vi.fn((..._args: unknown[]) => ({ remove: vi.fn(async () => {}), set: vi.fn(async () => {}), update: vi.fn(async () => {}) }));
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

  it("publishSession() writes gameId/sessionId/revision/session/lastInteraction/updatedAt atomically to liveSession", async () => {
    const { publishSession } = await import("../sessionRepository");
    const session = { gameState: "PLAYING" } as never;

    await publishSession(fakeDb, { gameId: "balloon-quest", sessionId: "abc", revision: 3, session, lastInteraction: null, patientId: null });

    expect(updateMock).toHaveBeenCalledTimes(1);
    const [, payload] = updateMock.mock.calls[0]!;
    expect(payload).toMatchObject({ "liveSession/gameId": "balloon-quest", "liveSession/sessionId": "abc", "liveSession/revision": 3, "liveSession/session": session, "liveSession/lastInteraction": null });
    expect(payload).toHaveProperty("liveSession/updatedAt");
    expect(payload).toHaveProperty("liveSession/controllerUid", "staff-1");
    // Walk-in: no patient binding, and no patient id in the Display-readable record.
    expect(payload).toMatchObject({ "liveSession/patientId": null, liveSessionPrivate: null });
  });

  it("publishSession() keeps the patient binding OUT of the Display-readable record (staff-only liveSessionPrivate, same atomic update)", async () => {
    const { publishSession } = await import("../sessionRepository");
    await publishSession(fakeDb, { gameId: "balloon-quest", sessionId: "abc", revision: 3, session: { gameState: "PLAYING" } as never, lastInteraction: null, patientId: "p-1" });
    const [, payload] = updateMock.mock.calls[0]! as [unknown, Record<string, unknown>];
    expect(payload["liveSession/patientId"]).toBeNull();
    expect(payload.liveSessionPrivate).toMatchObject({ sessionId: "abc", patientId: "p-1" });
    expect(JSON.stringify(Object.entries(payload).filter(([k]) => k.startsWith("liveSession/")))).not.toContain("p-1");
  });

  it("publishSession() coerces an undefined lastInteraction to null (Firebase update() rejects raw undefined)", async () => {
    const { publishSession } = await import("../sessionRepository");
    const session = { gameState: "PLAYING" } as never;

    // A caller that read lastInteraction back from a previous RTDB round-trip
    // (before it's revived) would see undefined here, not null — this is
    // exactly what broke pauseOrResume() in production (see report).
    await publishSession(fakeDb, { gameId: "balloon-quest", sessionId: "abc", revision: 3, session, lastInteraction: undefined as never, patientId: null });

    const [, payload] = updateMock.mock.calls[0]!;
    expect(payload).toMatchObject({ "liveSession/lastInteraction": null });
  });

  it("publishSession() blocks NaN/Infinity before Firebase can receive a corrupt live state", async () => {
    const { publishSession } = await import("../sessionRepository");
    const session = { gameState: "PLAYING", corruptMetric: Number.NaN } as never;
    await expect(publishSession(fakeDb, { gameId: "balloon-quest", sessionId: "abc", revision: 3, session, lastInteraction: null, patientId: null })).rejects.toThrow("non-finite");
    expect(updateMock).not.toHaveBeenCalled();
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
      currentStage: { difficulty: "EASY", stageNumber: 1, targetColor: "BLUE", balloons: RAW_BALLOONS, totalTargets: 2, correctCount: 0, incorrectCount: 0, totalPausedMs: 0 },
      createdAt: 1,
    };
    // lastInteraction key entirely absent, matching what RTDB actually
    // returns after publishSession wrote `lastInteraction: null`.
    const record = { gameId: "balloon-quest", sessionId: "sess-1", revision: 1, session: rawSession, updatedAt: 1 };

    onValueMock.mockImplementationOnce((_ref: unknown, handler: (snap: { val: () => unknown }) => void) => {
      handler({ val: () => record });
      return vi.fn();
    });
    subscribeToLiveSession(fakeDb, callback);

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
      gameId: "balloon-quest",
      sessionId: "x",
      revision: 9,
      session: {
        sessionId: "x",
        seed: "s",
        config: { childFirstName: "سارة", difficulty: "EASY" },
        gameState: "PLAYING",
        currentDifficulty: "EASY",
        currentStage: { difficulty: "EASY", stageNumber: 1, targetColor: "BLUE", balloons: RAW_BALLOONS, totalTargets: 2, correctCount: 0, incorrectCount: 0, totalPausedMs: 0 },
        createdAt: 1,
      },
      lastInteraction: null,
      updatedAt: 1,
    };
    getMock.mockResolvedValueOnce({ val: () => record });

    const { subscribeToLiveSession } = await import("../sessionRepository");
    const callback = vi.fn();
    subscribeToLiveSession(fakeDb, callback);

    // get()'s .then() is a microtask — flush it.
    await Promise.resolve();
    await Promise.resolve();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0]![0]).toMatchObject({ sessionId: "x", revision: 9 });
  });

  it("clearLiveSession() removes the whole liveSession node and its staff-only binding in one update (not a partial field)", async () => {
    const { clearLiveSession } = await import("../sessionRepository");
    await clearLiveSession(fakeDb);
    expect(updateMock).toHaveBeenCalledWith(expect.anything(), { liveSession: null, liveSessionPrivate: null });
  });

  it("subscribeToLiveSession() treats a missing/malformed snapshot as null (no session), never as a partial session", async () => {
    const { subscribeToLiveSession } = await import("../sessionRepository");
    const callback = vi.fn();

    onValueMock.mockImplementationOnce((_ref: unknown, handler: (snap: { val: () => unknown }) => void) => {
      handler({ val: () => null });
      return vi.fn();
    });
    subscribeToLiveSession(fakeDb, callback);
    expect(callback).toHaveBeenCalledWith(null);

    callback.mockClear();
    onValueMock.mockImplementationOnce((_ref: unknown, handler: (snap: { val: () => unknown }) => void) => {
      handler({ val: () => ({ sessionId: "x" /* missing revision/session */ }) });
      return vi.fn();
    });
    subscribeToLiveSession(fakeDb, callback);
    expect(callback).toHaveBeenCalledWith(null);

    callback.mockClear();
    onValueMock.mockImplementationOnce((_ref: unknown, handler: (snap: { val: () => unknown }) => void) => {
      handler({ val: () => ({ gameId: "balloon-quest", sessionId: "bad", revision: 1, session: { sessionId: "bad", seed: "s", config: {}, gameState: "PLAYING", currentDifficulty: "EASY", currentStage: {}, createdAt: Number.NaN } }) });
      return vi.fn();
    });
    subscribeToLiveSession(fakeDb, callback);
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
      currentStage: { difficulty: "EASY", stageNumber: 1, targetColor: "BLUE", balloons: RAW_BALLOONS, totalTargets: 2, correctCount: 0, incorrectCount: 0, totalPausedMs: 0 },
      createdAt: 1,
      // results/endedAt/summary intentionally absent, matching what RTDB actually returns for a fresh session
    };
    const record = { gameId: "balloon-quest", sessionId: "sess-1", revision: 1, session: rawSession, lastInteraction: null, updatedAt: 1 };

    onValueMock.mockImplementationOnce((_ref: unknown, handler: (snap: { val: () => unknown }) => void) => {
      handler({ val: () => record });
      return vi.fn();
    });
    subscribeToLiveSession(fakeDb, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const delivered = callback.mock.calls[0]![0];
    expect(delivered.session.results).toEqual([]);
    expect(delivered.session.endedAt).toBeNull();
    expect(delivered.session.summary).toBeNull();
  });

  describe("patient binding (staff-only liveSessionPrivate)", () => {
    const staffDb = { app: { name: "shumos-staff" } } as never;
    const displayDb = { app: { name: "shumos-display" } } as never;
    const raw = (sessionId: string) => ({
      gameId: "balloon-quest", sessionId, revision: 1, lastInteraction: null, updatedAt: 1,
      session: { sessionId, seed: "seed", config: { childFirstName: "سارة", difficulty: "EASY", targetSize: "LARGE", targetSpacing: "CLOSE", playArea: "FULL" }, gameState: "WELCOME", currentDifficulty: "EASY",
        currentStage: { difficulty: "EASY", stageNumber: 1, targetColor: "BLUE", balloons: RAW_BALLOONS, totalTargets: 2, correctCount: 0, incorrectCount: 0, totalPausedMs: 0 }, createdAt: 1 },
    });
    const byPath = (values: Record<string, unknown>) => getMock.mockImplementation(async (r: unknown) => ({ val: () => values[(r as { __path: string }).__path] ?? null }));

    it("fetchLiveSession() re-attaches the binding for staff only when it belongs to the same session", async () => {
      const { fetchLiveSession } = await import("../sessionRepository");
      byPath({ liveSession: raw("s1"), liveSessionPrivate: { sessionId: "s1", patientId: "p-1" } });
      expect((await fetchLiveSession(staffDb))?.patientId).toBe("p-1");
      byPath({ liveSession: raw("s2"), liveSessionPrivate: { sessionId: "s1", patientId: "p-1" } });
      expect((await fetchLiveSession(staffDb))?.patientId).toBeNull();
    });

    it("a failing binding read never hides the live record (treated as walk-in)", async () => {
      const { fetchLiveSession } = await import("../sessionRepository");
      getMock.mockImplementation(async (r: unknown) => {
        if ((r as { __path: string }).__path === "liveSessionPrivate") throw new Error("PERMISSION_DENIED");
        return { val: () => raw("s1") };
      });
      expect((await fetchLiveSession(staffDb))?.sessionId).toBe("s1");
    });

    it("the Display handle never reads the binding", async () => {
      const { fetchLiveSession, subscribeToLiveSession } = await import("../sessionRepository");
      byPath({ liveSession: raw("s1"), liveSessionPrivate: { sessionId: "s1", patientId: "p-1" } });
      expect((await fetchLiveSession(displayDb))?.patientId).toBeNull();
      subscribeToLiveSession(displayDb, vi.fn());
      const paths = [...getMock.mock.calls.map((c) => (c[0] as { __path: string }).__path), ...onValueMock.mock.calls.map((c) => (c[0] as { __path: string }).__path)];
      expect(paths).not.toContain("liveSessionPrivate");
    });

    it("subscribeToLiveSession() coalesces the record and the binding into one delivery for staff", async () => {
      vi.useFakeTimers();
      try {
        const { subscribeToLiveSession } = await import("../sessionRepository");
        const handlers: Record<string, SnapshotHandler> = {};
        onValueMock.mockImplementation((r: unknown, h: SnapshotHandler) => { handlers[(r as { __path: string }).__path] = h; return vi.fn(); });
        byPath({});
        const cb = vi.fn();
        subscribeToLiveSession(staffDb, cb);
        handlers.liveSession!({ val: () => raw("s1") });
        expect(cb).not.toHaveBeenCalled();
        handlers.liveSessionPrivate!({ val: () => ({ sessionId: "s1", patientId: "p-1" }) });
        await vi.advanceTimersByTimeAsync(5);
        expect(cb).toHaveBeenCalledTimes(1);
        expect(cb.mock.calls[0]![0].patientId).toBe("p-1");
      } finally { vi.useRealTimers(); }
    });
  });

  // RELIABILITY FIX — FAILED-WRITE RESYNC: fetchLiveSession is the one-shot
  // read useRealtimeControllerSession.ts's resyncFromCanonical uses to
  // restore local state after a failed publishSession() — see that file's
  // doc comment.
  describe("fetchLiveSession", () => {
    it("resolves the current canonical record via a one-shot get(), reviving it the same way subscribeToLiveSession does", async () => {
      const rawSession = {
        sessionId: "sess-1",
        seed: "seed",
        config: { childFirstName: "سارة", difficulty: "EASY", targetSize: "LARGE", targetSpacing: "CLOSE", playArea: "FULL" },
        gameState: "PLAYING",
        currentDifficulty: "EASY",
        currentStage: { difficulty: "EASY", stageNumber: 1, targetColor: "BLUE", balloons: RAW_BALLOONS, totalTargets: 2, correctCount: 0, incorrectCount: 0, totalPausedMs: 0 },
        createdAt: 1,
      };
      const record = { gameId: "balloon-quest", sessionId: "sess-1", revision: 4, session: rawSession, lastInteraction: null, updatedAt: 1 };
      getMock.mockResolvedValueOnce({ val: () => record });

      const { fetchLiveSession } = await import("../sessionRepository");
      const delivered = await fetchLiveSession(fakeDb);

      expect(refMock).toHaveBeenCalledWith(fakeDb, "liveSession");
      expect(delivered).toMatchObject({ sessionId: "sess-1", revision: 4 });
    });

    it("resolves null when no live session exists (matches subscribeToLiveSession's 'no session' behavior)", async () => {
      getMock.mockResolvedValueOnce({ val: () => null });
      const { fetchLiveSession } = await import("../sessionRepository");
      await expect(fetchLiveSession(fakeDb)).resolves.toBeNull();
    });
  });

  // MULTI-GAME PLATFORM: /display's game resolver trusts gameId to decide
  // which child-facing module to mount (falling back to the Shumos waiting
  // world otherwise) — these three cases are exactly what protects it from
  // ever crashing or guessing on an old/malformed/unsupported record.
  describe("gameId normalization", () => {
    const minimalRawSession = {
      sessionId: "sess-1",
      seed: "seed",
      config: { childFirstName: "سارة", difficulty: "EASY", targetSize: "LARGE", targetSpacing: "CLOSE", playArea: "FULL" },
      gameState: "WELCOME",
      currentDifficulty: "EASY",
      currentStage: { difficulty: "EASY", stageNumber: 1, targetColor: "BLUE", balloons: RAW_BALLOONS, totalTargets: 2, correctCount: 0, incorrectCount: 0, totalPausedMs: 0 },
      createdAt: 1,
    };

    async function deliver(record: Record<string, unknown>) {
      const { subscribeToLiveSession } = await import("../sessionRepository");
      const callback = vi.fn();
      onValueMock.mockImplementationOnce((_ref: unknown, handler: (snap: { val: () => unknown }) => void) => {
        handler({ val: () => record });
        return vi.fn();
      });
      subscribeToLiveSession(fakeDb, callback);
      return callback.mock.calls[0]![0];
    }

    it("passes through a currently-registered gameId", async () => {
      const delivered = await deliver({ gameId: "balloon-quest", sessionId: "sess-1", revision: 1, session: minimalRawSession, updatedAt: 1 });
      expect(delivered.gameId).toBe("balloon-quest");
    });

    it("normalizes a missing gameId (pre-migration record) to null, never guessing balloon-quest", async () => {
      const delivered = await deliver({ sessionId: "sess-1", revision: 1, session: minimalRawSession, updatedAt: 1 });
      expect(delivered).toBeNull();
    });

    it("normalizes an unsupported/malformed gameId to null", async () => {
      const delivered = await deliver({ gameId: "not-a-real-game", sessionId: "sess-1", revision: 1, session: minimalRawSession, updatedAt: 1 });
      expect(delivered).toBeNull();
    });
  });

  // BUG FIX — "ابدأ" stall: the real-completion-signal handshake between
  // /display's CountdownScene and useRealtimeControllerSession's
  // runInstructionsToPlaying (replacing a blind timer). See both functions'
  // own doc comments.
  describe("countdown completion signal", () => {
    it("reportCountdownComplete() merges {sessionId, revision} onto presence/display, not a new path", async () => {
      const { reportCountdownComplete } = await import("../sessionRepository");
      await reportCountdownComplete(fakeDb, "sess-1", 7);
      expect(refMock).toHaveBeenCalledWith(fakeDb, "presence/display");
      expect(updateMock).toHaveBeenCalledWith(expect.anything(), { countdownComplete: { sessionId: "sess-1", revision: 7 } });
    });

    it("waitForDisplayCountdownComplete() resolves once a matching (sessionId, revision) signal arrives", async () => {
      const { waitForDisplayCountdownComplete } = await import("../sessionRepository");
      let deliver!: (snap: { val: () => unknown }) => void;
      onValueMock.mockImplementationOnce((_ref: unknown, handler: (snap: { val: () => unknown }) => void) => {
        deliver = handler;
        return vi.fn();
      });

      const { promise, cancel } = waitForDisplayCountdownComplete(fakeDb, "sess-1", 7);
      let resolved = false;
      void promise.then(() => {
        resolved = true;
      });

      deliver({ val: () => ({ connected: true, countdownComplete: { sessionId: "sess-1", revision: 6 } }) }); // stale — a different revision
      await Promise.resolve();
      expect(resolved).toBe(false);

      deliver({ val: () => ({ connected: true, countdownComplete: { sessionId: "sess-1", revision: 7 } }) }); // the real match
      await promise;
      expect(resolved).toBe(true);
      cancel();
    });

    it("waitForDisplayCountdownComplete()'s cancel() unsubscribes the listener", async () => {
      const { waitForDisplayCountdownComplete } = await import("../sessionRepository");
      const unsubscribe = vi.fn();
      onValueMock.mockImplementationOnce(() => unsubscribe);

      const { cancel } = waitForDisplayCountdownComplete(fakeDb, "sess-1", 7);
      cancel();
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
  });

  describe("remote display audio handshake", () => {
    it("writes a control command without claiming the display is ready", async () => {
      const { requestDisplayAudioEnable } = await import("../sessionRepository");
      await requestDisplayAudioEnable(fakeDb, { id: "audio-1", requestedAt: 123 });

      expect(refMock).toHaveBeenCalledWith(fakeDb, "presence/display");
      expect(updateMock).toHaveBeenCalledWith(expect.anything(), {
        audioEnableCommand: { id: "audio-1", requestedAt: 123 },
      });
    });

    it("writes ready only as a display-authored status containing the actual context state", async () => {
      const { reportDisplayAudioStatus } = await import("../sessionRepository");
      await reportDisplayAudioStatus(fakeDb, { state: "ready", commandId: "audio-1", contextState: "running" });

      expect(updateMock).toHaveBeenCalledWith(expect.anything(), {
        audioStatus: {
          state: "ready",
          commandId: "audio-1",
          contextState: "running",
          updatedAt: { ".sv": "timestamp" },
        },
      });
    });

    it("subscribes to the display command path and rejects malformed values", async () => {
      const { subscribeToDisplayAudioEnableCommand } = await import("../sessionRepository");
      const callback = vi.fn();
      onValueMock.mockImplementationOnce((_ref: unknown, handler: SnapshotHandler) => {
        handler({ val: () => ({ id: "audio-2", requestedAt: 456 }) });
        return vi.fn();
      });

      subscribeToDisplayAudioEnableCommand(fakeDb, callback);
      expect(refMock).toHaveBeenCalledWith(fakeDb, "presence/display/audioEnableCommand");
      expect(callback).toHaveBeenCalledWith({ id: "audio-2", requestedAt: 456 });
    });
  });

  describe("shared RIGHT_HAND pointer mirror (sensor -> display)", () => {
    it("reportControllerPointer() writes onto presence/display, the same command-delivery node the audio handshake uses", async () => {
      const { reportControllerPointer } = await import("../sessionRepository");
      await reportControllerPointer(fakeDb, { x: 0.42, y: 0.61, visible: true });

      expect(refMock).toHaveBeenCalledWith(fakeDb, "presence/display");
      expect(updateMock).toHaveBeenCalledWith(expect.anything(), {
        controllerPointer: { x: 0.42, y: 0.61, visible: true, updatedAt: { ".sv": "timestamp" } },
      });
    });

    it("reportControllerPointer(null) clears the field (sensor disconnected, or nothing to show)", async () => {
      const { reportControllerPointer } = await import("../sessionRepository");
      await reportControllerPointer(fakeDb, null);

      expect(updateMock).toHaveBeenCalledWith(expect.anything(), { controllerPointer: null });
    });

    it("subscribeToControllerPointer() subscribes to the mirrored path and rejects malformed values", async () => {
      const { subscribeToControllerPointer } = await import("../sessionRepository");
      const callback = vi.fn();
      onValueMock.mockImplementationOnce((_ref: unknown, handler: SnapshotHandler) => {
        handler({ val: () => ({ x: 0.3, y: 0.7, visible: true }) });
        return vi.fn();
      });

      subscribeToControllerPointer(fakeDb, callback);
      expect(refMock).toHaveBeenCalledWith(fakeDb, "presence/display/controllerPointer");
      expect(callback).toHaveBeenCalledWith({ x: 0.3, y: 0.7, visible: true });
    });

    it("subscribeToControllerPointer() treats absent/malformed data as no pointer, never a guess", async () => {
      const { subscribeToControllerPointer } = await import("../sessionRepository");
      const callback = vi.fn();
      onValueMock.mockImplementationOnce((_ref: unknown, handler: SnapshotHandler) => {
        handler({ val: () => ({ x: 0.3 }) }); // missing y/visible
        return vi.fn();
      });

      subscribeToControllerPointer(fakeDb, callback);
      expect(callback).toHaveBeenCalledWith(null);
    });
  });

  it("subscribeToControllerLease() delivers via get() even if onValue's initial dispatch is lost (Task 7 QA regression: a second controller must never default to 'unclaimed')", async () => {
    onValueMock.mockImplementationOnce(() => vi.fn()); // never invokes its handler — simulates the lost-dispatch race
    const lease = { ownerId: "owner-A", claimedAt: 1, updatedAt: 12345 };
    getMock.mockResolvedValueOnce({ val: () => lease });

    const { subscribeToControllerLease } = await import("../sessionRepository");
    const callback = vi.fn();
    subscribeToControllerLease(fakeDb, callback);

    await Promise.resolve();
    await Promise.resolve();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(lease);
  });

  it("drops a delayed initial read after a newer subscription event, and after unsubscribe", async () => {
    let resolveRead!: (value: { val: () => unknown }) => void;
    getMock.mockReturnValueOnce(new Promise(resolve => { resolveRead = resolve; }));
    let listener!: SnapshotHandler;
    onValueMock.mockImplementationOnce((_ref, handler) => { listener = handler; return vi.fn(); });
    const { subscribeToControllerLease } = await import("../sessionRepository");
    const callback = vi.fn();
    const stop = subscribeToControllerLease(fakeDb, callback);
    const latest = { ownerId: "new-owner", claimedAt: 2, updatedAt: 200 };
    listener({ val: () => latest });
    resolveRead({ val: () => ({ ownerId: "old-owner" }) });
    await Promise.resolve(); await Promise.resolve();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(latest);
    stop(); listener({ val: () => null });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("claimControllerLease() registers onDisconnect().remove() before writing the lease, so a crashed tab releases it", async () => {
    const remove = vi.fn(async () => {});
    onDisconnectMock.mockReturnValueOnce({ remove, set: vi.fn(async () => {}), update: vi.fn(async () => {}) });
    const { claimControllerLease } = await import("../sessionRepository");

    await claimControllerLease(fakeDb, "owner-1");

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

    registerControllerPresence(fakeDb);
    connectedHandler({ val: () => true });
    connectedHandler({ val: () => true });

    expect(onDisconnectMock).toHaveBeenCalledTimes(2);
  });
});

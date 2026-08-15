import { describe, expect, it } from "vitest";
import { applyLiveRecord, createInitialGuardState, type DisplayGuardState } from "../displayGuard";
import type { LiveSessionRecord } from "../types";

function makeRecord(overrides: Partial<LiveSessionRecord> = {}): LiveSessionRecord {
  return {
    gameId: "balloon-quest",
    sessionId: "session-a",
    revision: 1,
    updatedAt: 1000,
    session: {} as LiveSessionRecord["session"],
    lastInteraction: null,
    celebrationReplay: null,
    patientId: null,
    ...overrides,
  };
}

describe("applyLiveRecord", () => {
  it("accepts the very first record and adopts its revision as the baseline", () => {
    const result = applyLiveRecord(createInitialGuardState(), makeRecord({ revision: 5 }));
    expect(result.accept).toBe(true);
    expect(result.state.lastRevision).toBe(5);
    expect(result.state.sessionId).toBe("session-a");
  });

  it("accepts a strictly increasing revision within the same session", () => {
    const first = applyLiveRecord(createInitialGuardState(), makeRecord({ revision: 1 }));
    const second = applyLiveRecord(first.state, makeRecord({ revision: 2 }));
    expect(second.accept).toBe(true);
    expect(second.state.lastRevision).toBe(2);
  });

  it("rejects a stale/out-of-order revision (delayed packet must never revert the game)", () => {
    const first = applyLiveRecord(createInitialGuardState(), makeRecord({ revision: 5 }));
    const stale = applyLiveRecord(first.state, makeRecord({ revision: 3 }));
    expect(stale.accept).toBe(false);
    expect(stale.state.lastRevision).toBe(5); // baseline unchanged
  });

  it("rejects a duplicate/equal revision", () => {
    const first = applyLiveRecord(createInitialGuardState(), makeRecord({ revision: 5 }));
    const duplicate = applyLiveRecord(first.state, makeRecord({ revision: 5 }));
    expect(duplicate.accept).toBe(false);
  });

  it("resets the baseline (and accepts) when a different sessionId arrives, even at a lower revision number", () => {
    const first = applyLiveRecord(createInitialGuardState(), makeRecord({ sessionId: "session-a", revision: 40 }));
    const newSession = applyLiveRecord(first.state, makeRecord({ sessionId: "session-b", revision: 1 }));
    expect(newSession.accept).toBe(true);
    expect(newSession.state.sessionId).toBe("session-b");
    expect(newSession.state.lastRevision).toBe(1);
  });

  it("treats record=null (no active session) as always-accepted and clears the guard", () => {
    const first = applyLiveRecord(createInitialGuardState(), makeRecord({ revision: 5 }));
    const cleared = applyLiveRecord(first.state, null);
    expect(cleared.accept).toBe(true);
    expect(cleared.state).toEqual(createInitialGuardState());
  });

  it("signals a new INCORRECT interaction exactly once", () => {
    // Real usage: a session is always created with lastInteraction: null
    // (see useRealtimeControllerSession's confirmSetup), so the baseline is
    // established BEFORE any interaction exists — matches production.
    const created = applyLiveRecord(createInitialGuardState(), makeRecord({ revision: 1, lastInteraction: null }));
    const first = applyLiveRecord(
      created.state,
      makeRecord({ revision: 2, lastInteraction: { id: "i1", type: "INCORRECT", balloonId: "b1", revision: 2, timestamp: 1 } }),
    );
    expect(first.newIncorrectBalloonId).toBe("b1");

    // The same interaction id echoed again (e.g. an unrelated field changing) must not re-fire.
    const echoed = applyLiveRecord(
      first.state,
      makeRecord({ revision: 3, lastInteraction: { id: "i1", type: "INCORRECT", balloonId: "b1", revision: 2, timestamp: 1 } }),
    );
    expect(echoed.accept).toBe(true);
    expect(echoed.newIncorrectBalloonId).toBeNull();
  });

  it("does not signal a CORRECT interaction (pop is already diffable from balloon.isPopped)", () => {
    const result = applyLiveRecord(
      createInitialGuardState(),
      makeRecord({ revision: 1, lastInteraction: { id: "i1", type: "CORRECT", balloonId: "b1", revision: 1, timestamp: 1 } }),
    );
    expect(result.newIncorrectBalloonId).toBeNull();
    expect(result.state.lastInteractionId).toBe("i1"); // still tracked, just no visual signal
  });

  it("never replays the interaction that was already live at initial subscribe time (reconnect case)", () => {
    // Simulates a display subscribing fresh and immediately receiving a
    // record whose lastInteraction is NOT new to the world, just new to
    // this particular listener.
    const state: DisplayGuardState = createInitialGuardState();
    const result = applyLiveRecord(
      state,
      makeRecord({ revision: 7, lastInteraction: { id: "old-interaction", type: "INCORRECT", balloonId: "b9", revision: 7, timestamp: 1 } }),
    );
    // First-ever record for a session seeds the interaction baseline without firing.
    expect(result.newIncorrectBalloonId).toBeNull();
  });

  it("does fire for a new session's first interaction if it arrives on a LATER record than the session's own creation", () => {
    const created = applyLiveRecord(createInitialGuardState(), makeRecord({ sessionId: "s", revision: 1, lastInteraction: null }));
    const firstRealTap = applyLiveRecord(
      created.state,
      makeRecord({ sessionId: "s", revision: 2, lastInteraction: { id: "tap-1", type: "INCORRECT", balloonId: "b1", revision: 2, timestamp: 2 } }),
    );
    expect(firstRealTap.accept).toBe(true);
    expect(firstRealTap.newIncorrectBalloonId).toBe("b1");
  });

  describe("celebrationReplay (TASK 9 — إعادة الاحتفال)", () => {
    it("signals a new replay token exactly once", () => {
      const created = applyLiveRecord(createInitialGuardState(), makeRecord({ revision: 1, celebrationReplay: null }));
      const replayed = applyLiveRecord(
        created.state,
        makeRecord({ revision: 2, celebrationReplay: { token: "r1", timestamp: 2 } }),
      );
      expect(replayed.newCelebrationReplayToken).toBe("r1");

      // The same token echoed again (e.g. an unrelated field changing) must not re-fire.
      const echoed = applyLiveRecord(
        replayed.state,
        makeRecord({ revision: 3, celebrationReplay: { token: "r1", timestamp: 2 } }),
      );
      expect(echoed.newCelebrationReplayToken).toBeNull();
    });

    it("fires again for a second, distinct replay token", () => {
      const created = applyLiveRecord(createInitialGuardState(), makeRecord({ revision: 1, celebrationReplay: null }));
      const firstReplay = applyLiveRecord(
        created.state,
        makeRecord({ revision: 2, celebrationReplay: { token: "r1", timestamp: 2 } }),
      );
      const secondReplay = applyLiveRecord(
        firstReplay.state,
        makeRecord({ revision: 3, celebrationReplay: { token: "r2", timestamp: 3 } }),
      );
      expect(secondReplay.newCelebrationReplayToken).toBe("r2");
    });

    it("never replays a token that was already live at initial subscribe time (reconnect case)", () => {
      const result = applyLiveRecord(
        createInitialGuardState(),
        makeRecord({ revision: 7, celebrationReplay: { token: "old-token", timestamp: 1 } }),
      );
      expect(result.newCelebrationReplayToken).toBeNull();
    });

    it("a fresh session (different sessionId) never auto-replays even if it happens to carry a celebrationReplay value", () => {
      const first = applyLiveRecord(
        createInitialGuardState(),
        makeRecord({ sessionId: "session-a", revision: 1, celebrationReplay: { token: "r1", timestamp: 1 } }),
      );
      const newSession = applyLiveRecord(
        first.state,
        makeRecord({ sessionId: "session-b", revision: 1, celebrationReplay: { token: "r1", timestamp: 1 } }),
      );
      expect(newSession.accept).toBe(true);
      expect(newSession.newCelebrationReplayToken).toBeNull();
    });
  });
});

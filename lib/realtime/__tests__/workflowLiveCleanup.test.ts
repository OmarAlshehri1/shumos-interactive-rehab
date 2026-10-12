import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), transaction: vi.fn() }));
vi.mock("firebase/database", () => ({
  get: mocks.get,
  ref: (_db: unknown, path: string) => path,
  runTransaction: mocks.transaction,
}));
import { canClearWorkflowSession, clearWorkflowLiveSession } from "../workflowLiveCleanup";

const live = (tab: string, gameState = "PLAYING", sessionId = "session-1") => ({
  sessionId, session: { engine: "build3", gameState, build3: { controlTabId: tab } },
});

describe("workflow cleanup across Control tabs", () => {
  beforeEach(() => { mocks.get.mockReset(); mocks.get.mockResolvedValue({}); mocks.transaction.mockReset(); });

  it("preserves another tab's active, paused and finished sessions across all modern stamps", () => {
    for (const engine of ["bq3", "fp3", "dome3", "sp3", "cc3", "build3", "rq3", "mirror3", "hex3", "fr3", "bw3", "hv3", "pv3"]) {
      for (const gameState of ["PLAYING", "PAUSED", "SESSION_COMPLETE"]) {
        expect(canClearWorkflowSession({ session: { engine, gameState, [engine]: { controlTabId: "first" } } }, "second")).toBe(false);
      }
    }
    expect(canClearWorkflowSession(live("own"), "own")).toBe(true);
  });

  it("preserves unfinished historical records whose Control window cannot be identified", () => {
    expect(canClearWorkflowSession({ session: { gameState: "PLAYING" } }, "own")).toBe(false);
    expect(canClearWorkflowSession({ session: { gameState: "SESSION_COMPLETE" } }, "own")).toBe(true);
    expect(canClearWorkflowSession(null, "own")).toBe(false);
  });

  it("rechecks the latest owner when a concurrent write retries the deletion transaction", async () => {
    mocks.transaction.mockImplementation(async (_path, update) => {
      expect(update(live("own"))).toBeNull();
      expect(update(live("new-owner"))).toBeUndefined();
      return { committed: false };
    });
    await clearWorkflowLiveSession({} as never, "own");
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("cleans only the deleted session's binding and preserves a concurrently created patient binding", async () => {
    mocks.transaction.mockImplementation(async (path, update) => {
      if (path === "liveSession") { expect(update(live("own"))).toBeNull(); return { committed: true }; }
      expect(update({ sessionId: "session-1", patientId: "patient-1" })).toBeNull();
      expect(update({ sessionId: "new-session", patientId: "patient-2" })).toBeUndefined();
      return { committed: false };
    });
    await clearWorkflowLiveSession({} as never, "own");
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.get.mock.calls.map(call => call[0])).toEqual(["liveSession", "liveSessionPrivate"]);
  });
});

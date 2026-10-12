import { beforeEach, describe, expect, it, vi } from "vitest";
import { Env } from "@/lib/balloonquest/__tests__/harness";
import { buildLiveSession } from "@/lib/balloonquest/live";
import type { Message } from "@/lib/balloonquest/protocol";

/* eslint-disable @typescript-eslint/no-unused-vars -- mock signatures mirror the real APIs */
const getMock = vi.fn((..._args: unknown[]): Promise<{ val: () => unknown }> => Promise.resolve({ val: () => null }));
const updateMock = vi.fn((..._args: unknown[]) => Promise.resolve());
/* eslint-enable @typescript-eslint/no-unused-vars */
vi.mock("firebase/database", () => ({
  ref: (_db: unknown, path?: string) => ({ __path: path ?? "" }),
  get: (...args: unknown[]) => getMock(...args),
  update: (...args: unknown[]) => updateMock(...args),
  onValue: vi.fn(() => () => {}),
  remove: vi.fn(),
  onDisconnect: vi.fn(() => ({ remove: vi.fn(), set: vi.fn() })),
  serverTimestamp: () => ({ ".sv": "timestamp" }),
}));
const db = {} as never;

function liveRecord(over: Record<string, unknown> = {}) {
  const env = new Env({ inputMode: "therapist", allowNoDisplay: true });
  env.rt.command({ type: "new-session", difficulty: "ADVANCED", stage: 1 });
  env.addDisplay(); env.run(300); env.rt.command({ type: "start" }); env.run(2000);
  const state = env.sent.filter((m): m is Extract<Message, { type: "state" }> => m.type === "state").pop()!;
  const session = buildLiveSession({ state, clock: null, seed: 1, createdAt: env.rt.session.sessionEpoch, childFirstName: "ليلى" });
  return { gameId: "balloon-quest", sessionId: state.sessionId, revision: 12, session, lastInteraction: null, patientId: "p1", updatedAt: 1, ...over };
}
const rtdb = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe("live record parsing for the redesigned Balloon Quest", () => {
  beforeEach(() => { vi.resetModules(); getMock.mockReset(); });

  it("a record tagged engine:bq3 under gameId balloon-quest revives through its own validator", async () => {
    getMock.mockResolvedValueOnce({ val: () => rtdb(liveRecord()) });
    const { fetchLiveSession } = await import("../sessionRepository");
    const rec = await fetchLiveSession(db);
    expect(rec?.gameId).toBe("balloon-quest");
    expect((rec!.session as unknown as { engine: string }).engine).toBe("bq3");
    expect(rec!.session.config.childFirstName).toBe("ليلى");
    expect(rec!.revision).toBe(12);
    expect(rec!.patientId).toBe("p1");
  });

  it("a malformed bq3 record is treated as no session (never rendered, never crashes the subscriber)", async () => {
    const bad = rtdb(liveRecord());
    (bad.session as unknown as { bq3: { state: { target: string } } }).bq3.state.target = "pink";
    getMock.mockResolvedValueOnce({ val: () => bad });
    const { fetchLiveSession } = await import("../sessionRepository");
    expect(await fetchLiveSession(db)).toBeNull();
  });

  it("a record whose sessionId does not match the inner session is rejected", async () => {
    getMock.mockResolvedValueOnce({ val: () => rtdb(liveRecord({ sessionId: "someone-else" })) });
    const { fetchLiveSession } = await import("../sessionRepository");
    expect(await fetchLiveSession(db)).toBeNull();
  });

  it("an untagged balloon-quest record still goes through the legacy reviver (and a bad one is still rejected, not mistaken for bq3)", async () => {
    getMock.mockResolvedValueOnce({ val: () => rtdb({ gameId: "balloon-quest", sessionId: "legacy-1", revision: 3, session: { sessionId: "legacy-1", gameState: "PLAYING" }, lastInteraction: null, updatedAt: 1 }) });
    const { fetchLiveSession } = await import("../sessionRepository");
    expect(await fetchLiveSession(db)).toBeNull(); // malformed legacy shape fails safely, as before
  });

  it("publishing a bq3 session uses the existing publishSession path with the existing game id (no new fields at the top level)", async () => {
    const { publishSession } = await import("../sessionRepository");
    const rec = liveRecord();
    await publishSession(db, { gameId: "balloon-quest", sessionId: rec.sessionId, revision: 13, session: rec.session as never, lastInteraction: null, patientId: "p1" });
    const payload = updateMock.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(["liveSession/gameId", "liveSession/lastInteraction", "liveSession/patientId", "liveSession/revision", "liveSession/session", "liveSession/sessionId", "liveSession/updatedAt", "liveSessionPrivate"]);
  });
});

import { describe, it, expect, vi } from "vitest";
const mocked = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("firebase/database", () => ({
  get: vi.fn(),
  onValue: vi.fn(),
  ref: () => "",
  set: vi.fn(),
  update: mocked.update,
  serverTimestamp: () => ({ ".sv": "timestamp" }),
  onDisconnect: vi.fn(),
}));
vi.mock("@/lib/realtime/firebaseClient", () => ({ getStaffDb: () => ({}) }));
import {
  publishSession,
  type PublishSessionInput,
} from "@/lib/realtime/sessionRepository";
import { observePublishIntent } from "@/lib/realtime/publishIntent";
const input = {
  gameId: "balloon-quest",
  sessionId: "game-1",
  revision: 1,
  session: { gameState: "PLAYING" },
  patientId: "patient-1",
  lastInteraction: null,
} as unknown as PublishSessionInput;
describe("navigation observes pending game publication separately from server acknowledgement", () => {
  it("announces pending intent before the write resolves and acknowledges only afterward", async () => {
    let resolve!: () => void;
    mocked.update.mockImplementationOnce(
      () => new Promise<void>((r) => (resolve = r)),
    );
    const states: boolean[] = [],
      stop = observePublishIntent((e) => states.push(e.acknowledged));
    const pending = publishSession({} as never, input);
    expect(states).toEqual([false]);
    resolve();
    await pending;
    expect(states).toEqual([false, true]);
    stop();
    const updates = mocked.update.mock.calls.at(-1)![1];
    expect(updates["liveSession/patientId"]).toBeNull();
    expect(updates.liveSessionPrivate.patientId).toBe("patient-1");
  });
  it("never acknowledges a failed publish; a successful retry can recover", async () => {
    mocked.update
      .mockRejectedValueOnce(Error("offline"))
      .mockResolvedValueOnce(undefined);
    const states: boolean[] = [],
      stop = observePublishIntent((e) => states.push(e.acknowledged));
    await expect(publishSession({} as never, input)).rejects.toThrow("offline");
    expect(states).toEqual([false]);
    await publishSession({} as never, { ...input, revision: 2 });
    expect(states).toEqual([false, false, true]);
    stop();
  });
});

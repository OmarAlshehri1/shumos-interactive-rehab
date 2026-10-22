import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  vi.stubEnv("NEXT_PUBLIC_BALANCE_BRIDGE_3D", "true");
  return { get: vi.fn(), transaction: vi.fn(), uid: "staff" as string | null };
});
vi.mock("firebase/auth", () => ({ getAuth: () => ({ currentUser: mocks.uid ? { uid: mocks.uid } : null }) }));
vi.mock("firebase/database", () => ({
  get: mocks.get,
  ref: (_db: unknown, path: string) => path,
  runTransaction: mocks.transaction,
}));
import { discardUnstartedPreview } from "../sessionRepository";
import { createState } from "@/lib/balancebridge3d/engine";
import { makeLive } from "@/lib/balancebridge3d/live";
const record = (tab = "own", started = false, id = "preview") => {
  const s = createState(id);
  if (started) {
    s.startedAt = 50;
    s.status = "running";
  }
  return {
    gameId: "balance-bridge-3d",
    sessionId: id,
    revision: 1,
    session: makeLive(s, "staff", "طفل", { controlTabId: tab, heartbeatAt: 1 }),
    patientId: null,
  };
};
beforeEach(() => {
  mocks.uid = "staff";
  mocks.get.mockReset();
  mocks.get.mockResolvedValue({val:()=>({sessionId:"preview",patientId:"patient",updatedAt:1})});
  mocks.transaction.mockReset();
});
it("atomically discards only its own setup and rechecks concurrent Start, owner and session changes", async () => {
  mocks.transaction.mockImplementation(async (_path, update) => {
    expect(update(record())).toBeNull();
    mocks.uid = null;
    expect(update(record())).toBeUndefined();
    mocks.uid = "staff";
    for (const r of [
      record("other"),
      record("own", true),
      record("own", false, "new"),
      null,
      { broken: true },
    ])
      expect(update(r)).toBeUndefined();
    return { committed: false };
  });
  expect(await discardUnstartedPreview({} as never, "preview", "own")).toBe(
    false,
  );
  expect(mocks.transaction).toHaveBeenCalledTimes(1);
  expect(mocks.get).toHaveBeenCalledWith("liveSession");
  expect(mocks.get).toHaveBeenCalledWith("liveSessionPrivate");
});
it("removes only the matching private binding after committed deletion, without touching history", async () => {
  mocks.transaction.mockImplementation(async (path, update) => {
    if (path === "liveSession") {
      expect(update(record())).toBeNull();
      return { committed: true };
    }
    expect(path).toBe("liveSessionPrivate");
    expect(update({ sessionId: "preview",patientId:"patient",updatedAt:1 })).toBeNull();
    expect(update({ sessionId: "new-session" })).toBeUndefined();
    expect(update({sessionId:"preview",patientId:"patient",updatedAt:2})).toBeUndefined();
    expect(update({sessionId:"preview",patientId:"other-patient",updatedAt:1})).toBeUndefined();
    return { committed: true };
  });
  expect(await discardUnstartedPreview({} as never, "preview", "own")).toBe(
    true,
  );
  expect(mocks.transaction).toHaveBeenCalledTimes(2);
});

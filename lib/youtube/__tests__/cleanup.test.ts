import { it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  active: false,
  stop: vi.fn(),
  get: vi.fn(),
  tx: vi.fn(),
}));
vi.mock("firebase/database", () => ({
  ref: (_db: unknown, path: string) => path,
  get: m.get,
  onValue: () => {
    m.active = true;
    return () => {
      m.active = false;
      m.stop();
    };
  },
  runTransaction: m.tx,
}));
import { stopOwnedVideo } from "../repository";
it("retains the command cache until owned cleanup completes, preserves another tab and removes its temporary listener", async () => {
  m.get.mockResolvedValue({ val: () => ({ controlTabId: "own" }) });
  m.tx.mockImplementation(async (_ref, fn) => {
    expect(m.active).toBe(true);
    expect(fn({ controlTabId: "own" })).toBeNull();
    expect(fn({ controlTabId: "other" })).toBeUndefined();
    return { committed: true };
  });
  await stopOwnedVideo({} as never, "own");
  expect(m.stop).toHaveBeenCalledTimes(1);
  expect(m.active).toBe(false);
});
it("removes its cache-retaining subscription even if the server rejects cleanup", async () => {
  m.get.mockRejectedValueOnce(Error("offline"));
  await expect(stopOwnedVideo({} as never, "own")).rejects.toThrow("offline");
  expect(m.active).toBe(false);
});

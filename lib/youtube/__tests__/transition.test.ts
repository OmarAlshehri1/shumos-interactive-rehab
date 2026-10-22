import { beforeEach, expect, it, vi } from "vitest";
import { createSession, Difficulty, TargetSize, TargetSpacing, PlayArea, GameState } from "@/lib/game";
const m = vi.hoisted(() => ({ fetch: vi.fn(), discard: vi.fn(), lease: vi.fn(), get: vi.fn(), tx: vi.fn(), stop: vi.fn(), update: vi.fn(async () => {}) }));
vi.mock("firebase/database", () => ({ ref: (_db: unknown, path: string) => path, get: m.get, onValue: () => m.stop, runTransaction: m.tx, update: m.update, serverTimestamp: () => ({'.sv':'timestamp'}) }));
vi.mock("@/lib/realtime/sessionRepository", () => ({ fetchLiveSession: m.fetch, discardUnstartedPreview: m.discard, claimControllerLease: m.lease }));
vi.mock("@/lib/sessions/sessionHistoryRepository", () => ({ getSessionHistoryRecord: vi.fn(async () => null) }));
import { prepareVideoDisplay } from "../repository";
function preview() {
  const session = createSession({ childFirstName: "Synthetic", difficulty: Difficulty.EASY, targetSize: TargetSize.MEDIUM, targetSpacing: TargetSpacing.MEDIUM, playArea: PlayArea.FULL, seed: "video-transition" });
  return { gameId: "balloon-quest", controllerUid: "staff", sessionId: session.sessionId, session, patientId: null, revision: 1 };
}
beforeEach(() => { vi.clearAllMocks(); m.get.mockResolvedValue({ exists: () => false }); m.discard.mockResolvedValue(true); });
it("clears an owned original setup preview before acquiring the video lease", async () => {
  const record = preview(); m.fetch.mockResolvedValue(record);
  await prepareVideoDisplay({} as never, "staff", "tab");
  expect(m.discard).toHaveBeenCalledWith({}, record.sessionId, "tab");
  expect(m.lease).toHaveBeenCalledWith({}, "staff");
  expect(m.tx).not.toHaveBeenCalled();
});
it("retains genuinely started gameplay and its unsaved results", async () => {
  const record = preview(); record.session.gameState = GameState.PLAYING;
  m.fetch.mockResolvedValue(record);
  await expect(prepareVideoDisplay({} as never, "staff", "tab")).rejects.toThrow("أكمل النشاط");
  expect(m.discard).not.toHaveBeenCalled(); expect(m.lease).not.toHaveBeenCalled();
});
it("uses a renewable native-sharing lease without registering disconnect removal", async () => {
  m.fetch.mockResolvedValue(null);
  await prepareVideoDisplay({} as never, "staff", "tab", { leaseCleanup: "heartbeat" });
  expect(m.lease).not.toHaveBeenCalled();
  expect(m.update).toHaveBeenCalledWith("controllerLease", { ownerId: "staff", claimedAt: expect.any(Number), updatedAt: { '.sv': 'timestamp' } });
});
it("cannot discard another therapist's preview or race a newer live activity", async () => {
  const record = preview(); m.fetch.mockResolvedValue(record);
  await expect(prepareVideoDisplay({} as never, "other-staff", "tab")).rejects.toThrow();
  expect(m.discard).not.toHaveBeenCalled();
  m.get.mockResolvedValue({ exists: () => true });
  await expect(prepareVideoDisplay({} as never, "staff", "tab")).rejects.toThrow("يوجد نشاط");
  expect(m.lease).not.toHaveBeenCalled(); expect(m.stop).toHaveBeenCalledTimes(4);
});

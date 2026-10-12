import { describe, it, expect, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  transaction: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
  history: vi.fn(),
}));
vi.mock("firebase/database", () => ({
  get: mocks.get,
  ref: (_db: unknown, path = "") => path,
  runTransaction: mocks.transaction,
  set: mocks.set,
  update: mocks.update,
  onValue: vi.fn(),
}));
vi.mock("@/lib/realtime/firebaseClient", () => ({ getStaffDb: () => ({}) }));
vi.mock("@/lib/sessions/sessionHistoryRepository", () => ({
  getSessionHistoryRecord: mocks.history,
}));
import { commitVisit, createPatientVisit } from "../repository";
import { blankEvaluation, type Visit } from "../model";
const visit = (): Visit => ({
  version: 1,
  visitId: "v1",
  patientId: "p1",
  childName: "طفل",
  ownerUid: "staff",
  controlTabId: "tab",
  title: "جلسة",
  therapistName: "معالج",
  initialNotes: "",
  finalNotes: "",
  overallRating: null,
  startedAt: 1000,
  plannedMs: 45 * 60000,
  pausedMs: 0,
  pausedAt: null,
  endedAt: null,
  revision: 0,
  updatedAt: 1000,
  entries: {},
  breaks: {},
});
describe("acknowledged revisioned visit writes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue({ exists: () => false, val: () => null });
    mocks.set.mockResolvedValue(undefined);
  });
  it("requires the atomic creation acknowledgement before resolving", async () => {
    let resolve!: () => void;
    let complete = false;
    mocks.update.mockImplementation(
      () => new Promise<void>((r) => (resolve = r)),
    );
    const pending = createPatientVisit(visit()).then(() => {
      complete = true;
    });
    await Promise.resolve();
    expect(complete).toBe(false);
    expect(mocks.update.mock.calls[0][1]).toHaveProperty(
      "activeTherapyVisits/staff",
    );
    resolve();
    await pending;
    expect(complete).toBe(true);
  });
  it("surfaces failed writes and stale revisions while leaving the previous visit intact", async () => {
    mocks.update.mockRejectedValueOnce(Error("offline"));
    const v = visit();
    await expect(createPatientVisit(v)).rejects.toThrow("offline");
    mocks.transaction.mockResolvedValue({ committed: false });
    await expect(commitVisit(v, { ...v, finalNotes: "draft" })).rejects.toThrow(
      "تغيّرت",
    );
    expect(v.revision).toBe(0);
    expect(v.finalNotes).toBe("");
  });
  it("increments revision only after a confirmed transaction and aborts a racing revision", async () => {
    const v = visit();
    mocks.transaction.mockImplementation(async (_target, fn, options) => {
      expect(options.applyLocally).toBe(false);
      expect(fn({ ...v, revision: 1 })).toBeUndefined();
      const next = fn(v);
      expect(next.revision).toBe(1);
      return { committed: true, snapshot: { val: () => next } };
    });
    expect(
      (await commitVisit(v, { ...v, plannedMs: 50 * 60000 })).plannedMs,
    ).toBe(50 * 60000);
  });
  it("refuses unconfirmed, wrong-patient-author and pre-visit game references", async () => {
    const v = visit(),
      next = {
        ...v,
        entries: {
          s1: {
            kind: "game" as const,
            sessionId: "s1",
            gameId: "balloon-quest" as const,
            linkedAt: 1000,
            evaluation: blankEvaluation("staff", 1000),
          },
        },
      };
    for (const history of [
      null,
      { gameId: "balloon-quest", createdByUid: "other", startedAt: 1000 },
      { gameId: "balloon-quest", createdByUid: "staff", startedAt: 999 },
      { gameId: "color-chase", createdByUid: "staff", startedAt: 1000 },
    ]) {
      mocks.history.mockResolvedValueOnce(history);
      await expect(commitVisit(v, next)).rejects.toThrow("لم يتأكد");
    }
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it("does not reassign an immutable result claim to another visit", async () => {
    const v = visit(),
      next = {
        ...v,
        entries: {
          s1: {
            kind: "game" as const,
            sessionId: "s1",
            gameId: "balloon-quest" as const,
            linkedAt: 1000,
            evaluation: blankEvaluation("staff", 1000),
          },
        },
      };
    mocks.history.mockResolvedValueOnce({
      gameId: "balloon-quest",
      createdByUid: "staff",
      startedAt: 1000,
    });
    mocks.get.mockResolvedValueOnce({
      exists: () => true,
      val: () => "other-visit",
    });
    await expect(commitVisit(v, next)).rejects.toThrow("مرتبطة بزيارة أخرى");
    expect(mocks.set).not.toHaveBeenCalled();
  });
});

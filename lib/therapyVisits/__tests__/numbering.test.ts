import { describe, it, expect, vi, beforeEach } from "vitest";
const m = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }));
vi.mock("firebase/database", () => ({
  ref: (_db: unknown, path = "") => path,
  get: m.get,
  update: m.update,
}));
vi.mock("@/lib/realtime/firebaseClient", () => ({ getStaffDb: () => ({}) }));
import {
  allocationPatch,
  chronologicalVisits,
  parseNumbering,
  numberFor,
  createNumberedVisit,
  type VisitNumbering,
} from "../numbering";
import { visitFixture } from "./visitFixture";
beforeEach(() => {
  m.get.mockReset();
  m.update.mockReset();
});
describe("unlimited patient visit numbering", () => {
  it("normalizes Firebase's dense numeric arrays without mutating the snapshot", () => {
    const raw = {
      lastNumber: 2,
      lastVisitId: "v2",
      byVisit: { v1: "1", v2: "2" },
      byNumber: [null, "v1", "v2"],
    };
    expect(parseNumbering(raw).byNumber).toEqual({ "1": "v1", "2": "v2" });
    expect(raw.byNumber).toEqual([null, "v1", "v2"]);
  });
  for (const size of [1, 6, 8, 12, 20])
    it(`${size} actual visits retain identity after reverse loading, edits and interruptions`, () => {
      const visits = Array.from({ length: size }, (_, i) =>
        visitFixture(`v${String(i + 1).padStart(2, "0")}`, 1000 + i),
      );
      const index: VisitNumbering = {
        lastNumber: size,
        lastVisitId: visits.at(-1)!.visitId,
        byVisit: Object.fromEntries(
          visits.map((v, i) => [v.visitId, String(i + 1)]),
        ),
        byNumber: Object.fromEntries(
          visits.map((v, i) => [String(i + 1), v.visitId]),
        ),
      };
      expect(parseNumbering(index)).toEqual(index);
      expect(
        chronologicalVisits([...visits].reverse()).map((v) => v.visitId),
      ).toEqual(visits.map((v) => v.visitId));
      for (const v of [...visits].reverse())
        expect(numberFor(index, v.visitId)).toBe(visits.indexOf(v) + 1);
      expect(
        numberFor(
          index,
          { ...visits[0], title: "عنوان معدل", endedAt: null }.visitId,
        ),
      ).toBe(1);
      expect(
        allocationPatch("p", "next", index)[
          "therapyVisits/p/_numbering/lastNumber"
        ],
      ).toBe(size + 1);
    });
  it("rejects reserved-key collisions, duplicate/invalid mapping and malformed legacy metadata", () => {
    expect(() => parseNumbering(visitFixture("_numbering"))).toThrow("تعارض");
    expect(() =>
      parseNumbering({
        lastNumber: 1,
        lastVisitId: "v",
        byVisit: { v: "1", other: "1" },
        byNumber: { 1: "v" },
      }),
    ).toThrow();
    expect(() =>
      allocationPatch("p", "_numbering", parseNumbering(null)),
    ).toThrow();
  });
  it("creates visit, pointer and number in one acknowledged write, with no detached reservation", async () => {
    m.get.mockResolvedValue({ val: () => null });
    m.update.mockResolvedValue(undefined);
    await createNumberedVisit(
      { ...visitFixture(), endedAt: null },
      { patientId: "p", visitId: "v1", controlTabId: "tab" },
    );
    const patch = m.update.mock.calls[0][1];
    expect(patch).toHaveProperty("therapyVisits/p/v1");
    expect(patch).toHaveProperty("activeTherapyVisits/staff");
    expect(patch["therapyVisits/p/_numbering/byVisit/v1"]).toBe("1");
  });
  it("retries a competing atomic allocation instead of assigning a duplicate number", async () => {
    const idx = {
      lastNumber: 1,
      lastVisitId: "other",
      byVisit: { other: "1" },
      byNumber: { 1: "other" },
    };
    m.get
      .mockResolvedValueOnce({ val: () => null })
      .mockResolvedValueOnce({ val: () => null })
      .mockResolvedValueOnce({ val: () => null })
      .mockResolvedValue({ val: () => idx });
    m.update
      .mockRejectedValueOnce(Error("competing update"))
      .mockResolvedValueOnce(undefined);
    await createNumberedVisit({ ...visitFixture(), endedAt: null }, {});
    expect(
      m.update.mock.calls[0][1]["therapyVisits/p/_numbering/byVisit/v1"],
    ).toBe("1");
    expect(
      m.update.mock.calls[1][1]["therapyVisits/p/_numbering/byVisit/v1"],
    ).toBe("2");
  });
});

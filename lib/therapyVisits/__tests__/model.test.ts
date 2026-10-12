import { describe, it, expect } from "vitest";
import {
  assertVisit,
  blankEvaluation,
  elapsedMs,
  finishVisit,
  formatClock,
  pauseVisit,
  resumeVisit,
  reviveVisit,
  visitClock,
  type Visit,
} from "../model";
export const sampleVisit = (minutes = 45): Visit => ({
  version: 1,
  visitId: "visit-1",
  patientId: "patient-1",
  childName: "ليلى",
  ownerUid: "staff-1",
  controlTabId: "tab-1",
  title: "جلسة علاج طبيعي",
  therapistName: "المعالج",
  initialNotes: "",
  finalNotes: "",
  overallRating: null,
  startedAt: 1000000,
  plannedMs: minutes * 60000,
  pausedMs: 0,
  pausedAt: null,
  endedAt: null,
  revision: 0,
  updatedAt: 1000000,
  entries: {},
  breaks: {},
});
describe("authoritative visit timing and validation", () => {
  for (const duration of [30, 45, 60, 17])
    it(`${duration}-minute plan survives navigation/reload and enters overtime without stopping`, () => {
      const v = sampleVisit(duration),
        now = v.startedAt + duration * 60000 + 275000;
      assertVisit(v);
      expect(visitClock(v, now)).toEqual({
        elapsed: duration * 60000 + 275000,
        remaining: 0,
        overtime: 275000,
        expired: true,
      });
      expect(
        visitClock(reviveVisit(JSON.parse(JSON.stringify(v)))!, now),
      ).toEqual(visitClock(v, now));
      expect(v.endedAt).toBeNull();
      expect(formatClock(275000)).toBe("04:35");
    });
  it("pauses exactly once, excludes the break and resumes without reset", () => {
    const v = sampleVisit(),
      paused = pauseVisit(v, 1100000);
    expect(pauseVisit(paused, 1200000)).toBe(paused);
    expect(elapsedMs(paused, 9000000)).toBe(100000);
    const resumed = resumeVisit(paused, 1300000);
    expect(resumed.pausedMs).toBe(200000);
    expect(elapsedMs(resumed, 1400000)).toBe(200000);
    expect(resumed.breaks.b1100000.endedAt).toBe(1300000);
    expect(resumeVisit(resumed, 1500000)).toBe(resumed);
  });
  it("ending during a break stops timing permanently and closes the break", () => {
    const ended = finishVisit(pauseVisit(sampleVisit(), 1100000), 1300000);
    expect(elapsedMs(ended, 9000000)).toBe(100000);
    expect(ended.pausedAt).toBeNull();
    expect(ended.endedAt).toBe(1300000);
    expect(finishVisit(ended, 1400000)).toBe(ended);
  });
  it("extension returns overtime to remaining time without changing elapsed", () => {
    const v = sampleVisit(30),
      now = v.startedAt + 31 * 60000;
    expect(visitClock(v, now).expired).toBe(true);
    expect(visitClock({ ...v, plannedMs: 35 * 60000 }, now).remaining).toBe(
      4 * 60000,
    );
  });
  it("restores RTDB null and empty-map omissions without inventing a rating", () => {
    const raw: Partial<Visit> = { ...sampleVisit() };
    for (const key of [
      "pausedAt",
      "endedAt",
      "overallRating",
      "entries",
      "breaks",
    ] as const)
      delete raw[key];
    expect(reviveVisit(raw)).toEqual(sampleVisit());
  });
  it("rejects corrupt timing, invalid identity, forged ratings and malformed activities", () => {
    for (const patch of [
      { plannedMs: NaN },
      { plannedMs: 0 },
      { plannedMs: 9 * 60 * 60000 },
      { patientId: "bad/path" },
      { overallRating: 6 },
      { overallRating: 2.5 },
      { pausedAt: 999 },
      { revision: -1 },
      { entries: { bad: { kind: "exercise" } } },
      { breaks: { bad: { startedAt: 0 } } },
    ])
      expect(() =>
        assertVisit({ ...sampleVisit(), ...patch } as Visit),
      ).toThrow();
  });
  it("keeps unrated evaluations distinct from a zero rating", () => {
    expect(blankEvaluation("staff", 1).rating).toBeNull();
    const v = sampleVisit();
    v.entries.s1 = {
      kind: "game",
      gameId: "balloon-quest",
      sessionId: "s1",
      linkedAt: v.startedAt,
      evaluation: { ...blankEvaluation("staff", v.startedAt), rating: 0 },
    };
    assertVisit(v);
    expect(reviveVisit(v)?.entries.s1.evaluation.rating).toBe(0);
  });
});

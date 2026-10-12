import { describe, expect, it } from "vitest";
import { buildPatientAnalytics, sessionAccuracy, sessionResponseTimeMs } from "@/lib/analytics/patientAnalytics";
import { ControlRuntime } from "@/lib/runnerquest3d/controlRuntime";
import { buildStoredRunnerQuestSession, runnerHistoryRecordId } from "../buildStoredRunnerQuestSession";
import { reviveAnyStoredSession } from "../sessionHistoryRepository";
import { RUNNER_QUEST_RESULT_VERSION, type StoredRunnerQuestSession } from "../types";

function finishedSession() {
  let t = 1000;
  const rt = new ControlRuntime({ now: () => t, wall: () => 1_700_000_000_000 + t, send: () => {}, ownerId: "u", newId: (() => { let n = 0; return () => `s${++n}`; })(), seed: 4, startIndex: 3, endIndex: 5, settings: { speed: 4.5 }, externalDisplayReady: () => true });
  const step = (ms: number) => { for (let i = 0; i < ms; i += 16) { t += 16; rt.tick(); } };
  rt.command({ type: "start" }); step(1500);
  rt.command({ type: "assist" }); rt.command({ type: "skip" });
  rt.command({ type: "advance" }); rt.command({ type: "start" }); step(800);
  rt.command({ type: "end" });
  return rt.session;
}
const rtdb = (v: unknown): unknown => JSON.parse(JSON.stringify(v, (_k, x) => (x === null ? undefined : Array.isArray(x) && x.length === 0 ? undefined : x)));

describe("Runner Quest history record", () => {
  const s = finishedSession();
  const rec = buildStoredRunnerQuestSession({ summary: s.summary!, sessionId: s.sessionId, runId: s.runId, startIndex: s.startIndex, startedAt: s.sessionEpoch, completedAt: s.sessionEpoch + 5000, patientId: "p1", createdByUid: "u1", inputSource: s.settings.inputSource, therapistName: "الأخصائية" });

  it("is its own versioned type under its own game id", () => {
    expect(rec.gameId).toBe("runner-quest-3d");
    expect(rec.resultVersion).toBe(RUNNER_QUEST_RESULT_VERSION);
    expect(rec.stageResults.every((r) => r.engine === "rq3")).toBe(true);
    expect(rec.stageResults[0]).toMatchObject({ difficulty: "MEDIUM", stageNumber: 1, status: "SKIPPED" });
    expect(rec.startingDifficulty).toBe("MEDIUM");
    expect(rec).not.toHaveProperty("accuracy");
    expect(rec).not.toHaveProperty("totalCorrect");
    expect(rec).not.toHaveProperty("totalIncorrect");
    expect(rec.skippedStageCount).toBe(1);
  });
  it("totals equal the sum of the stage rows (no recomputed formula)", () => {
    expect(rec.totalStars).toBe(rec.stageResults.reduce((a, r) => a + (r.stars ?? 0), 0));
    expect(rec.totalObstaclesResolved).toBe(rec.stageResults.reduce((a, r) => a + (r.obstaclesResolved ?? 0), 0));
    expect(rec.totalAssists).toBe(1);
  });
  it("a later run of the same session gets its own immutable key", () => {
    expect(runnerHistoryRecordId("abc", 0)).toBe("abc");
    expect(runnerHistoryRecordId("abc", 1)).toBe("abc-r1");
  });
  it("round-trips through RTDB-style loss and is revived by the real history reader", () => {
    const back = reviveAnyStoredSession(rtdb(rec)) as StoredRunnerQuestSession | null;
    expect(back).not.toBeNull();
    expect(back!.gameId).toBe("runner-quest-3d");
    expect(back!.totalStars).toBe(rec.totalStars);
    expect(back!.stageResults).toHaveLength(rec.stageResults.length);
    expect(back!.stageResults.map((r) => r.status)).toEqual(rec.stageResults.map((r) => r.status));
    expect(back!.inputSource).toBe("MANUAL");
  });
  it("legacy and other games' records are still revived exactly as before; unknown game ids are still dropped", () => {
    const legacy = { sessionId: "o1", patientId: "p1", gameId: "balloon-quest", startedAt: 1, completedAt: 2, createdByUid: "u", startingDifficulty: "EASY", startingStage: 1, endingDifficulty: "EASY", endingStage: 5, completedStageCount: 5, skippedStageCount: 0, totalCorrect: 20, totalIncorrect: 2, accuracy: 0.9, durationMs: 1000, stageResults: [{ difficulty: "EASY", stageNumber: 5, status: "COMPLETED", correct: 4, incorrect: 0, accuracy: 1, durationMs: 100, averageReactionTimeMs: 900 }] };
    const r = reviveAnyStoredSession(legacy);
    expect(r?.gameId).toBe("balloon-quest");
    expect((r as { totalCorrect: number }).totalCorrect).toBe(20);
    expect(reviveAnyStoredSession({ ...legacy, gameId: "mystery-game" })).toBeNull();
    expect(reviveAnyStoredSession({ ...legacy, gameId: "runner-quest-3d" })).not.toBeNull(); // own reviver; missing numbers become unavailable, never invented
  });
  it("analytics never invent an accuracy or response time for it", () => {
    const back = reviveAnyStoredSession(rtdb(rec))!;
    expect(sessionAccuracy(back)).toBeNull();
    expect(sessionResponseTimeMs(back)).toBeNull();
    const a = buildPatientAnalytics([back], "p1", "all", Date.now());
    const game = a.perGame.find((g) => g.gameId === "runner-quest-3d");
    expect(game).toBeTruthy();
    expect(game!.metrics.some((m) => m.key === "accuracy" || m.key === "response")).toBe(false);
    expect(game!.metrics.some((m) => m.key === "stars")).toBe(true);
  });
});

describe("Runner Quest FLOOR history (result version 2)", () => {
  function floorSession() {
    let t = 1000;
    const rt = new ControlRuntime({ now: () => t, wall: () => 1_700_000_000_000 + t, send: () => {}, ownerId: "u", newId: (() => { let n = 0; return () => `f${++n}`; })(), seed: 5, startIndex: 0, endIndex: 2, projection: "FLOOR", externalDisplayReady: () => true });
    const step = (ms: number) => { for (let i = 0; i < ms; i += 16) { t += 16; rt.tick(); } };
    rt.command({ type: "start" }); step(400);
    rt.command({ type: "assist" }); rt.command({ type: "skip-objective" });
    for (let g = 0; g < 20 && rt.session.lifecycle === "playing"; g++) { rt.command({ type: "assist" }); }
    rt.command({ type: "advance" }); rt.command({ type: "start" }); step(300);
    rt.command({ type: "skip" });
    rt.command({ type: "end" });
    return rt.session;
  }
  const s = floorSession();
  const rec = buildStoredRunnerQuestSession({ summary: s.summary!, sessionId: s.sessionId, runId: s.runId, startIndex: s.startIndex, startedAt: s.sessionEpoch, completedAt: s.sessionEpoch + 5000, patientId: "p1", createdByUid: "u1", inputSource: s.settings.inputSource });

  it("records the projection, objectives completed/skipped and assisted actions per stage row", () => {
    expect(rec.resultVersion).toBe(2);
    expect(rec.stageResults.length).toBe(2);
    expect(rec.stageResults.every((r) => r.projection === "FLOOR" && r.holds === 0)).toBe(true);
    const first = rec.stageResults[0];
    expect(first).toMatchObject({ status: "COMPLETED", objectivesSkipped: 1, obstaclesTotal: 6, obstaclesResolved: 5 });
    expect(first.assists).toBe(5);
    expect(rec.stageResults[1].status).toBe("SKIPPED");
    expect(rec.totalObstaclesPresented).toBe(rec.stageResults.reduce((a, r) => a + (r.obstaclesTotal ?? 0), 0));
    expect(rec).not.toHaveProperty("accuracy");
    expect(rec).not.toHaveProperty("projection"); // top-level fields would need new shared rules; the rows carry it
  });
  it("round-trips FLOOR rows through RTDB-style loss and the real reader", () => {
    const back = reviveAnyStoredSession(rtdb(rec)) as StoredRunnerQuestSession;
    expect(back.stageResults.map((r) => r.projection)).toEqual(["FLOOR", "FLOOR"]);
    expect(back.stageResults[0].objectivesSkipped).toBe(1);
    expect(back.stageResults[1].objectivesSkipped).toBe(0);
  });
  it("version-1 WALL rows (no projection fields) are revived untouched and never reinterpreted", () => {
    const wall = finishedSession();
    const old = buildStoredRunnerQuestSession({ summary: wall.summary!, sessionId: wall.sessionId, runId: wall.runId, startIndex: wall.startIndex, startedAt: wall.sessionEpoch, completedAt: wall.sessionEpoch + 5000, patientId: "p1", createdByUid: "u1", inputSource: "MANUAL" });
    const v1 = JSON.parse(JSON.stringify({ ...old, resultVersion: 1, stageResults: old.stageResults.map((row) => { const c: Record<string, unknown> = { ...row }; delete c.projection; delete c.objectivesSkipped; return c; }) }));
    const back = reviveAnyStoredSession(v1) as StoredRunnerQuestSession;
    expect(back.resultVersion).toBe(1);
    expect(back.stageResults.every((r) => r.projection === undefined && r.objectivesSkipped === undefined)).toBe(true);
    expect(back.totalHolds).toBe(old.totalHolds);
    expect(wall.summary!.projection).toBe("WALL");
    expect(old.stageResults.every((r) => r.projection === "WALL")).toBe(true);
  });
});

import { it, expect } from "vitest";
import { visitFixture } from "./visitFixture";
import {
  clinicalMetrics,
  overallVisitSummary,
  comparablePrevious,
  ratingComparison,
  independentSessions,
  pendingVisitResults,
  objectiveComparison,
  visitStatus,
} from "../clinicalSummary";
import type { AnyStoredSession } from "@/lib/sessions/types";
import { reviveClinicalResult } from "../clinicalResults";
const record = (id: string) =>
  ({
    sessionId: id,
    gameId: "balloon-quest",
    patientId: "p",
    createdByUid: "staff",
    completedStageCount: 2,
    skippedStageCount: 1,
    endingDifficulty: "EASY",
    endingStage: 1,
    totalCorrect: 8,
    totalIncorrect: 2,
    durationMs: 70000,
  }) as AnyStoredSession;
it("summarizes recorded clinical evaluations, assistance and missing ratings without a synthetic score", () => {
  const v = visitFixture();
  v.entries.game = {
    kind: "game",
    sessionId: "linked",
    gameId: "balloon-quest",
    linkedAt: 2000,
    evaluation: {
      rating: 4,
      assistance: "verbal",
      completion: "completed",
      notes: "ملاحظة",
      updatedAt: 3000,
      updatedByUid: "staff",
    },
  };
  const s = overallVisitSummary(v, [record("linked"), record("unrelated")]);
  expect(s.gamesCompleted).toBe(1);
  expect(s.exercisesCompleted).toBe(1);
  expect(s.assistance).toContain("توجيه لفظي");
  expect(s.rating).toBeNull();
  expect(s.skippedStages).toBe(1);
  expect(overallVisitSummary(v, []).skippedStages).toBeNull();
  expect(clinicalMetrics(record("linked")).map((m) => m.key)).toEqual([
    "totalCorrect",
    "totalIncorrect",
  ]);
});
it("keeps independent games separate and exposes an interrupted claim without fabricating a visit activity", () => {
  const v = visitFixture(),
    rs = [record("independent"), record("pending")];
  expect(
    independentSessions(rs, [v], { pending: "v1" }).map((r) => r.sessionId),
  ).toEqual(["independent"]);
  expect(
    pendingVisitResults(rs, [v], { pending: "v1" }).map((r) => r.sessionId),
  ).toEqual(["pending"]);
  expect(Object.keys(v.entries)).toEqual(["exercise"]);
});
it("compares only a prior shared exercise objective or exact repeated game level, with optional ratings", () => {
  const previous = { ...visitFixture("old", 1000), overallRating: 3 };
  const current = { ...visitFixture("new", 3000), overallRating: 4 };
  expect(comparablePrevious(current, [previous])).toBe(previous);
  expect(objectiveComparison(current, previous, [])).toEqual([
    "الوصول باليد · التكرارات المسجلة: سابقاً 3، حالياً 3.",
  ]);
  expect(ratingComparison(current, previous)).toContain("3/5");
  expect(
    ratingComparison({ ...current, overallRating: null }, previous),
  ).toContain("غير مسجل");
  const different = visitFixture("unrelated", 2000);
  different.entries.exercise = {
    ...different.entries.exercise,
    kind: "exercise",
    title: "هدف مختلف",
    goal: "غير مقارن",
    repetitions: 1,
    holdSeconds: 0,
    confirmed: true,
    recordedAt: 2200,
  };
  expect(comparablePrevious(current, [different])).toBeNull();
});
it("does not label quick/empty or interrupted visits as completed programs", () => {
  const empty = visitFixture();
  empty.entries = {};
  expect(visitStatus(empty)).toBe("انتهت دون أنشطة مسجلة");
  const interrupted = visitFixture();
  interrupted.entries.exercise.evaluation.completion = "interrupted";
  expect(visitStatus(interrupted)).toContain("متوقفة");
});
it("does not present legacy replay fallback levels as recorded clinical facts", () => {
  const incomplete = reviveClinicalResult(record("legacy"));
  expect(incomplete?.clinicalLevelsAvailable).toBe(false);
  const complete = reviveClinicalResult({
    ...record("complete"),
    startingDifficulty: "EASY",
    startingStage: 1,
  });
  expect(complete?.clinicalLevelsAvailable).toBe(true);
  const old = visitFixture("old", 1000),
    current = visitFixture("current", 3000);
  for (const v of [old, current]) {
    v.entries = {
      legacy: {
        kind: "game",
        sessionId: "legacy",
        gameId: "balloon-quest",
        linkedAt: v.startedAt + 100,
        evaluation: {
          rating: null,
          assistance: "unrecorded",
          completion: "completed",
          notes: "",
          updatedAt: v.startedAt + 100,
          updatedByUid: "staff",
        },
      },
    };
  }
  expect(comparablePrevious(current, [old], [incomplete!])).toBeNull();
  expect(objectiveComparison(current, old, [incomplete!])).toEqual([]);
});

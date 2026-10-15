import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { VisitSummary, VisitTimeline } from "../VisitWorkspace";
import { visitFixture } from "@/lib/therapyVisits/__tests__/visitFixture";
import { finishVisit, reviveVisit } from "@/lib/therapyVisits/model";

it("keeps historical exercises, notes, ratings, and duration through display and visit completion", () => {
  const visit = visitFixture();
  visit.endedAt = null;
  visit.overallRating = 4;
  visit.initialNotes = "ملاحظات البداية";
  visit.finalNotes = "ملاحظة ختامية محفوظة";
  visit.entries.exercise.evaluation.rating = 3;
  visit.entries.exercise.evaluation.notes = "ملاحظة تمرين محفوظة";
  const original = JSON.stringify(visit);
  const summary = renderToStaticMarkup(<VisitSummary visit={visit} now={visit.startedAt + 120000} />);
  const timeline = renderToStaticMarkup(<VisitTimeline visit={visit} />);
  for (const text of [visit.title, "الأخصائي", "4", visit.finalNotes, "تمارين"])
    expect(summary).toContain(text);
  for (const text of ["الوصول باليد", "الوصول إلى هدف قريب", "3", "2", "ملاحظة تمرين محفوظة"])
    expect(timeline).toContain(text);
  expect(timeline).not.toContain("إضافة تمرين بين الألعاب");
  expect(JSON.stringify(visit)).toBe(original);
  const completed = finishVisit(visit, visit.startedAt + 120000);
  const restored = reviveVisit(JSON.parse(JSON.stringify(completed)));
  expect(restored?.entries.exercise).toEqual(visit.entries.exercise);
  expect(restored?.overallRating).toBe(4);
  expect(restored?.finalNotes).toBe(visit.finalNotes);
});

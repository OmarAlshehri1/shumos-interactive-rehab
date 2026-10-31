import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PatientClinicalOverview } from "../PatientClinicalOverview";
import { visitFixture } from "@/lib/therapyVisits/__tests__/visitFixture";
import { parseNumbering } from "@/lib/therapyVisits/numbering";

it("keeps the latest recorded rating when the newest visit is unrated without changing any visit", () => {
  const recorded = { ...visitFixture(), visitId: "old", startedAt: 1000, overallRating: 4 };
  const unrated = { ...visitFixture(), visitId: "new", startedAt: 2000, overallRating: null, finalNotes: "أحدث ملاحظة محفوظة" };
  const visits = [unrated, recorded];
  const before = JSON.stringify(visits);
  const html = renderToStaticMarkup(<PatientClinicalOverview patientId="p1" history={{ visits, numbering: parseNumbering(null), error: "" }} />);
  expect(html).toContain("4 / 5");
  expect(html).toContain("أحدث ملاحظة محفوظة");
  expect(JSON.stringify(visits)).toBe(before);
});

it("counts every visit while limiting only the compact rating chart to twelve", () => {
  const visits = Array.from({ length: 14 }, (_, i) => ({ ...visitFixture(), visitId: `v${i}`, startedAt: 1000 + i, overallRating: 3 }));
  const html = renderToStaticMarkup(<PatientClinicalOverview patientId="p1" history={{ visits, numbering: parseNumbering(null), error: "" }} />);
  expect(html).toContain((14).toLocaleString("ar-SA"));
  expect(html.match(/aria-label="الجلسة /g)).toHaveLength(12);
  expect(visits).toHaveLength(14);
});

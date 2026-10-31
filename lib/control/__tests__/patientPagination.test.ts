import { expect, it } from "vitest";
import { patientPage } from "../patientPagination";
import type { Patient } from "@/lib/patients/types";
const patients: Patient[] = Array.from({ length: 23 }, (_, i) => ({ patientId: `p${i + 1}`, patientNumber: `${i+1}`, firstName: `طفل ${i+1}`, active: true, createdAt: i, updatedAt: i, createdByUid: "synthetic" }));
it("paginates 23 records into 10, 10 and 3 without missing or duplicated patients", () => {
  for (const order of ["newest", "oldest"] as const) {
    const pages = [1,2,3].map(page => patientPage(patients,page,order));
    expect(pages.map(p=>p.patients.length)).toEqual([10,10,3]);
    const ids = pages.flatMap(p=>p.patients.map(patient=>patient.patientId));
    expect(new Set(ids).size).toBe(23);
    expect(ids[0]).toBe(order === "newest" ? "p23" : "p1");
    expect(ids.at(-1)).toBe(order === "newest" ? "p1" : "p23");
  }
});
it("clamps a page when records are deactivated or filtered", () => {
  expect(patientPage(patients.map(p=>({...p,active:Number(p.patientNumber)<12})),3,"newest")).toMatchObject({page:2,totalPages:2,total:11});
  expect(patientPage(patients.slice(0,3),3,"newest")).toMatchObject({page:1,totalPages:1,total:3});
  expect(patientPage([],99,"newest")).toMatchObject({page:1,totalPages:1,total:0,patients:[]});
});
it("places added records by creation date and preserves source records", () => {
  const before=JSON.stringify(patients), added={...patients[0],patientId:"new",createdAt:100};
  expect(patientPage([...patients,added],1,"newest").patients[0].patientId).toBe("new");
  expect(JSON.stringify(patients)).toBe(before);
});
it("breaks timestamp ties deterministically regardless of subscription order", () => {
  const tied=patients.map(p=>({...p,createdAt:1}));
  for(const order of ["newest","oldest"] as const) expect(patientPage(tied,1,order).patients).toEqual(patientPage([...tied].reverse(),1,order).patients);
});

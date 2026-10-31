import type { Patient } from "@/lib/patients/types";

export type PatientSort = "newest" | "oldest";
export const PATIENTS_PER_PAGE = 10;

/** Stable tie-breaking prevents records from changing pages when timestamps match. Never mutates data. */
export function patientPage(patients: readonly Patient[], requestedPage: number, order: PatientSort) {
  const sorted = patients.filter(p => p.active).sort((a,b) => {
    const chronological = a.createdAt - b.createdAt || a.patientId.localeCompare(b.patientId);
    return order === "oldest" ? chronological : -chronological;
  });
  const totalPages = Math.max(1, Math.ceil(sorted.length / PATIENTS_PER_PAGE));
  const page = Math.min(totalPages, Math.max(1, Math.trunc(requestedPage) || 1));
  return { page, totalPages, total: sorted.length, patients: sorted.slice((page - 1) * PATIENTS_PER_PAGE, page * PATIENTS_PER_PAGE) };
}

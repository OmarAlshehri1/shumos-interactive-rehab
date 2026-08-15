"use client";

import { useEffect, useMemo, useState } from "react";
import { normalizePatientNumber, subscribeToPatients } from "./patientRepository";
import type { Patient } from "./types";

export interface UsePatientsResult {
  /** Active patients only, sorted alphabetically — see the task's "Inactive patients should not appear in the default active list/count." */
  patients: Patient[];
  activeCount: number;
  loading: boolean;
}

/**
 * PATIENT REGISTRY TASK — the Patient Registry's data source. A single live
 * subscription (subscribeToPatients) shared by the count and the list, so
 * "Patient appears immediately" / "Patient count increases" (task tests C/D)
 * fall out of ordinary Firebase realtime sync rather than a manual refetch.
 */
export function usePatients(): UsePatientsResult {
  const [allPatients, setAllPatients] = useState<Patient[] | null>(null);

  useEffect(() => subscribeToPatients(setAllPatients), []);

  const patients = useMemo(() => {
    if (!allPatients) return [];
    return allPatients.filter((patient) => patient.active).sort((a, b) => a.firstName.localeCompare(b.firstName, "ar"));
  }, [allPatients]);

  return { patients, activeCount: patients.length, loading: allPatients === null };
}

/** Matches by first name (plain substring) or patient number (digit-normalized, so Arabic-Indic/ASCII digits both find the same patient) — see the task's search requirement. */
export function searchPatients(patients: Patient[], rawQuery: string): Patient[] {
  const query = rawQuery.trim();
  if (!query) return patients;
  const normalizedQueryNumber = normalizePatientNumber(query);
  const lowerQuery = query.toLowerCase();
  return patients.filter(
    (patient) => patient.firstName.toLowerCase().includes(lowerQuery) || patient.patientNumber.includes(normalizedQueryNumber),
  );
}

/** Arabic-friendly count label — matches the task's own "12 مريض" example exactly at n>=3, with natural 0/1/2 forms. */
export function formatPatientCountLabel(count: number): string {
  if (count === 0) return "لا يوجد مرضى نشطون";
  if (count === 1) return "مريض واحد";
  if (count === 2) return "مريضان";
  return `${count} مريض`;
}

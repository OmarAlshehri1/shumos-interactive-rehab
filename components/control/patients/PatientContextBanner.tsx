"use client";

import { usePatientContext } from "@/lib/patients/PatientSessionContext";

/**
 * PATIENT REGISTRY TASK — "the therapist should NOT retype the child's
 * name" + "provide a clear تغيير المريض / إلغاء اختيار المريض where
 * appropriate." Shown on the Game Library only while a patient context is
 * active (see lib/patients/PatientSessionContext.tsx) — the therapist
 * arrived here via a Patient Profile's "بدء جلسة جديدة," and this is the
 * one place that choice is visible before they pick an activity. Silent
 * (renders nothing) once no patient is selected — the ordinary
 * walk-in/manual-session flow (task's WALK-IN section) is untouched.
 */
export function PatientContextBanner() {
  const { selectedPatient, clearPatient } = usePatientContext();
  if (!selectedPatient) return null;

  return (
    <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 rounded-2xl border border-teal-100 bg-teal-50 px-4 py-3 sm:px-6">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-teal-600" aria-hidden="true">
          👤
        </span>
        <span className="text-teal-800">
          الجلسة القادمة لـِ <span className="font-bold">{selectedPatient.firstName}</span>
        </span>
      </div>
      <button
        type="button"
        onClick={clearPatient}
        className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-teal-700 transition-colors hover:bg-teal-100"
      >
        إلغاء اختيار المريض
      </button>
    </div>
  );
}

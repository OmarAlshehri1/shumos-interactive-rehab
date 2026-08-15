"use client";

import Link from "next/link";
import type { Patient } from "@/lib/patients/types";
import { formatPatientUpdatedAt } from "./formatPatientDate";

/**
 * PATIENT REGISTRY TASK — "each row/card should show: محمد, #1024, and
 * perhaps آخر تحديث if useful." Deliberately no clinical stats (see the
 * task's "Do NOT show fake clinical statistics yet").
 */
export function PatientListItem({ patient }: { patient: Patient }) {
  return (
    <Link
      href={`/control/patients/${patient.patientId}`}
      className="flex min-h-[4.5rem] touch-manipulation items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-[0_2px_8px_rgba(30,41,59,0.05)] transition-all active:scale-[0.99] active:bg-slate-50"
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-base font-bold text-slate-900">{patient.firstName}</span>
        <span className="text-xs font-medium text-slate-400">آخر تحديث {formatPatientUpdatedAt(patient.updatedAt)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold whitespace-nowrap text-slate-600">#{patient.patientNumber}</span>
        <span aria-hidden="true" className="text-slate-300">
          ‹
        </span>
      </div>
    </Link>
  );
}

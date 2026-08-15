"use client";

import { useState } from "react";
import Link from "next/link";
import { searchPatients, usePatients } from "@/lib/patients/usePatients";

/**
 * PATIENT SIDEBAR TASK — "staff want to quickly move between patients... a
 * compact patient navigation area suitable for iPad." A right-side rail on
 * wide layouts (iPad landscape and up, Tailwind `lg:` = 1024px+) so the
 * primary Patient Profile content keeps its space — see the task's "do not
 * make this enormous." Deliberately hidden below `lg:` rather than
 * reimplemented as a drawer: the existing "→ المرضى" back link already
 * gives narrow/portrait layouts a one-tap way back to the full Patient
 * Registry (with its own, more spacious search) — see the report for why a
 * second search surface wasn't duplicated there too.
 */
export function PatientQuickRail({ currentPatientId }: { currentPatientId: string }) {
  const { patients, loading } = usePatients();
  const [query, setQuery] = useState("");
  const results = searchPatients(patients, query);

  return (
    <aside className="hidden w-64 shrink-0 flex-col gap-3 lg:flex">
      <div className="sticky top-8 flex max-h-[calc(100dvh-4rem)] flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3.5">
        <h2 className="px-1 text-xs font-semibold text-slate-500">المرضى</h2>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="بحث سريع"
          className="min-h-9 touch-manipulation rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-teal-600 focus:bg-white"
        />
        <div className="flex flex-col gap-1 overflow-y-auto">
          {loading && <p className="px-2 py-3 text-center text-xs text-slate-400">جاري التحميل...</p>}
          {!loading && results.length === 0 && <p className="px-2 py-3 text-center text-xs text-slate-400">لا توجد نتائج</p>}
          {results.map((patient) => {
            const isCurrent = patient.patientId === currentPatientId;
            return (
              <Link
                key={patient.patientId}
                href={`/control/patients/${patient.patientId}`}
                className={`flex touch-manipulation items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-sm transition-colors ${
                  isCurrent ? "bg-teal-50 font-semibold text-teal-800" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span className="truncate">{patient.firstName}</span>
                <span className="shrink-0 text-xs text-slate-400">#{patient.patientNumber}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

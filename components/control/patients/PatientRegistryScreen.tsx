"use client";

import { useState } from "react";
import { ControlNav } from "@/components/control/nav/ControlNav";
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { useStaffAuth } from "@/lib/realtime/useStaffAuth";
import { formatPatientCountLabel, searchPatients, usePatients } from "@/lib/patients/usePatients";
import { SectionCard } from "@/components/control/ui/SectionCard";
import { AddPatientSheet } from "./AddPatientSheet";
import { PatientListItem } from "./PatientListItem";

/**
 * PATIENT REGISTRY TASK — the Patient Registry home screen: patient count,
 * search (by first name or patient number), the patient list, and
 * "+ مريض جديد." Same outer shell/typeface/RTL shape as GameLibraryScreen so
 * the two read as one app (see the task's "compact professional
 * navigation" requirement) — deliberately not sharing a component, since
 * the library's grid-of-cards layout and this screen's scrollable list have
 * little in common beyond the header chrome.
 */
export function PatientRegistryScreen() {
  return (
    <main
      dir="rtl"
      lang="ar"
      className="fixed inset-0 flex h-dvh w-dvw touch-manipulation flex-col overflow-y-auto bg-slate-50 pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] text-slate-900"
      style={{ fontFamily: "var(--font-control), system-ui, sans-serif" }}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-5 py-8 sm:gap-10 sm:px-8 sm:py-10">
        <ControlNav active="patients" />
        {isRealtimeEnabled() ? <RealtimePatientRegistry /> : <RealtimeUnavailableNotice />}
      </div>
    </main>
  );
}

function RealtimeUnavailableNotice() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-slate-400">
      <span className="text-3xl" aria-hidden="true">
        🗄️
      </span>
      <p className="max-w-xs text-sm leading-relaxed">سجل المرضى غير متاح حاليًا. تحقق من إعداد اتصال النظام.</p>
    </div>
  );
}

function RealtimePatientRegistry() {
  const auth = useStaffAuth();
  const { patients, activeCount, loading } = usePatients();
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const results = searchPatients(patients, query);

  return (
    <>
      <header className="flex flex-col gap-1 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">المرضى</h1>
        <p className="text-base text-slate-500">{loading ? "جاري التحميل..." : formatPatientCountLabel(activeCount)}</p>
      </header>

      <SectionCard className="sm:flex-row sm:items-center">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث بالاسم أو رقم المريض"
          className="min-h-12 flex-1 touch-manipulation rounded-2xl border-2 border-slate-200 bg-white px-5 text-base font-medium text-slate-900 outline-none transition-colors select-text placeholder:text-slate-400 focus:border-teal-600"
        />
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          disabled={auth.phase !== "authorized"}
          className="min-h-12 touch-manipulation rounded-2xl bg-teal-600 px-5 text-sm font-bold whitespace-nowrap text-white shadow-sm shadow-teal-900/15 transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
        >
          + مريض جديد
        </button>
      </SectionCard>

      <SectionCard title="قائمة المرضى" className="flex-1 pb-8">
        {!loading && patients.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center text-slate-400">
            <span className="text-3xl" aria-hidden="true">
              🧒
            </span>
            <p className="text-sm">لا يوجد مرضى مسجّلون بعد</p>
          </div>
        )}

        {!loading && patients.length > 0 && results.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center text-slate-400">
            <p className="text-sm">لا توجد نتائج مطابقة</p>
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          {results.map((patient) => (
            <PatientListItem key={patient.patientId} patient={patient} />
          ))}
        </div>
      </SectionCard>

      {auth.uid && (
        <AddPatientSheet
          open={addOpen}
          createdByUid={auth.uid}
          onCreated={() => setAddOpen(false)}
          onCancel={() => setAddOpen(false)}
        />
      )}
    </>
  );
}

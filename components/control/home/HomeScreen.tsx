"use client";

import Link from "next/link";
import { useState } from "react";
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import {
  formatPatientCountLabel,
  usePatients,
} from "@/lib/patients/usePatients";
import { ControlNav } from "@/components/control/nav/ControlNav";
import { ResetLiveDisplayOnMount } from "@/components/control/live/ResetLiveDisplayOnMount";
import { PatientListItem } from "@/components/control/patients/PatientListItem";
import { SectionCard } from "@/components/control/ui/SectionCard";
import { ReadinessDashboard } from "./ReadinessDashboard";
import { usePatientContext } from "@/lib/patients/PatientSessionContext";
import { useVisit } from "@/components/control/visits/VisitProvider";

const RECENT_PATIENTS_LIMIT = 4;

/** Clinical dashboard; the complete canonical game library remains at /control/activities. */
export function HomeScreen() {
  return (
    <main
      dir="rtl"
      lang="ar"
      className="min-h-dvh w-full touch-manipulation bg-slate-50 pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] text-slate-900"
      style={{ fontFamily: "var(--font-control), system-ui, sans-serif" }}
    >
      <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-5 px-5 py-6 md:px-8 xl:px-10">
        <ControlNav active="home" />

        <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
          نظام التأهيل التفاعلي
        </h1>

        <ReadinessDashboard />
        <QuickStartSection />
        <ResetLiveDisplayOnMount />
        {isRealtimeEnabled() && <QuickPatientsSection />}
      </div>
    </main>
  );
}

/** Task section 5 — the two obvious "بدء جلسة جديدة" choices, both reusing existing flows: a saved patient (-> Patient Registry -> Patient Profile's own Start/Continue actions) or a walk-in (-> Activity Library -> manual first name). */
function QuickStartSection() {
  const patient = usePatientContext();
  const { visit } = useVisit();
  const [quickError, setQuickError] = useState(false);
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-teal-100 bg-teal-50/50 p-4 shadow-sm shadow-slate-900/5">
      <h2 className="text-base font-bold text-slate-900">بدء جلسة جديدة</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href="/control/visits"
          className="flex min-h-16 touch-manipulation flex-col items-center justify-center gap-1 rounded-2xl bg-teal-600 px-4 text-center text-white shadow-lg shadow-teal-900/15 transition-all active:scale-[0.98]"
        >
          <span className="text-base font-bold">جلسة علاجية</span>
          <span className="text-xs text-teal-100">
            مريض محفوظ أو جديد أو ضيف
          </span>
        </Link>
        <Link
          href="/control/quick-session"
          onClick={(event) => {
            if (visit && !visit.endedAt) {
              event.preventDefault();
              setQuickError(true);
              return;
            }
            patient.clearPatient();
          }}
          aria-disabled={!!visit && !visit.endedAt}
          className="flex min-h-16 touch-manipulation flex-col items-center justify-center gap-1 rounded-2xl border-2 border-slate-200 bg-white px-4 text-center text-slate-700 transition-all active:scale-[0.98] active:bg-slate-50"
        >
          <span className="text-base font-bold">جلسة سريعة</span>
          <span className="text-xs text-slate-400">
            بدون ملف مريض · اختر الاسم والنشاط
          </span>
        </Link>
      </div>
      {quickError && <p role="status" className="text-sm text-amber-800">أنهِ الجلسة العلاجية الحالية من شريط الجلسة قبل بدء جلسة سريعة.</p>}
    </section>
  );
}

/** Task section 4 — a few recent patients only (never the whole registry), same PatientListItem rows the full Patient Registry uses. */
function QuickPatientsSection() {
  const { patients, activeCount, loading } = usePatients();
  const recent = [...patients]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, RECENT_PATIENTS_LIMIT);

  return (
    <SectionCard>
      <div className="flex items-end justify-between">
        <div className="flex flex-col">
          <h2 className="text-sm font-semibold text-slate-700">المرضى</h2>
          <span className="text-xs text-slate-400">
            {loading ? "جاري التحميل..." : formatPatientCountLabel(activeCount)}
          </span>
        </div>
        <Link
          href="/control/patients"
          className="text-sm font-semibold text-teal-700 transition-colors hover:text-teal-800"
        >
          عرض كل المرضى
        </Link>
      </div>

      {!loading && recent.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 py-8 text-center text-sm text-slate-400">
          لا يوجد مرضى مسجّلون بعد
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {recent.map((patient) => (
          <PatientListItem key={patient.patientId} patient={patient} />
        ))}
      </div>
    </SectionCard>
  );
}

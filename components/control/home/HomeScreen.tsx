"use client";

import Link from "next/link";
import { useState } from "react";
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import {
  formatPatientCountLabel,
  usePatients,
} from "@/lib/patients/usePatients";
import { ControlIcon } from "@/components/control/ui/ControlIcon";
import { GAME_REGISTRY } from "@/lib/games/registry";
import styles from "./home.module.css";
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
        <header className={styles.heading}>
          <div><span className={styles.eyebrow}>مساحة الرعاية</span><h1>الرئيسية</h1><p>جهّز مساحة اللعب، وابدأ خطوة جديدة.</p></div>
          <Link href="/control/activities" className={styles.libraryLink}><ControlIcon name="activities"/><span><strong>مكتبة الأنشطة</strong>{GAME_REGISTRY.length} نشاطًا تفاعليًا</span><ControlIcon name="arrow"/></Link>
        </header>
        <QuickStartSection />
        <ReadinessDashboard />
        {isRealtimeEnabled() && <div className={styles.patients}><QuickPatientsSection /></div>}
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
    <section className={styles.start} aria-label="بدء جلسة جديدة">
      <div className={styles.sectionTitle}><h2>لنبدأ رحلة التأهيل</h2><ControlIcon name="spark"/></div>
      <div className={styles.startOptions}>
        <Link href="/control/visits" className={styles.primary}>
          <ControlIcon name="patients"/><strong>جلسة علاجية</strong><small>مريض محفوظ، جديد أو ضيف</small><span className={styles.arrow}>بدء جلسة جديدة<ControlIcon name="arrow"/></span>
        </Link>
        <Link href="/control/quick-session" className={styles.secondary}
          onClick={event => { if (visit && !visit.endedAt) { event.preventDefault(); setQuickError(true); return; } patient.clearPatient(); }}
          aria-disabled={!!visit && !visit.endedAt}>
          <ControlIcon name="activities"/><strong>جلسة سريعة</strong><small>اختر الاسم والنشاط بدون ملف مريض</small><span className={styles.arrow}>اختيار النشاط<ControlIcon name="arrow"/></span>
        </Link>
      </div>
      {quickError && <p role="status" className={styles.error}>أنهِ الجلسة العلاجية الحالية من شريط الجلسة قبل بدء جلسة سريعة.</p>}
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

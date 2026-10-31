"use client";

import Link from "next/link";
import { useState } from "react";
import { ControlIcon } from "@/components/control/ui/ControlIcon";
import styles from "./home.module.css";
import { ReadinessDashboard } from "./ReadinessDashboard";
import { usePatientContext } from "@/lib/patients/PatientSessionContext";
import { useVisit } from "@/components/control/visits/VisitProvider";

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
        <header className={styles.heading}><h1>الرئيسية</h1></header>
        <QuickStartSection />
        <ReadinessDashboard />
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

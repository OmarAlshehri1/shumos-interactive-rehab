"use client";

import Link from "next/link";
import { GAME_REGISTRY } from "@/lib/games/registry";
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { formatPatientCountLabel, usePatients } from "@/lib/patients/usePatients";
import { ControlNav } from "@/components/control/nav/ControlNav";
import { ShumosBrandMark } from "@/components/control/brand/ShumosBrandMark";
import { ResetLiveDisplayOnMount } from "@/components/control/live/ResetLiveDisplayOnMount";
import { GameCard } from "@/components/control/library/GameCard";
import { PatientListItem } from "@/components/control/patients/PatientListItem";
import { SectionCard } from "@/components/control/ui/SectionCard";
import { DisplayAudioControl } from "./DisplayAudioControl";
import { SystemReadinessCard } from "./SystemReadinessCard";

const RECENT_PATIENTS_LIMIT = 4;

/**
 * CONTROL UX POLISH TASK — /control's new Home (task section 2): "the
 * therapist should immediately understand the system... ماذا تريد أن
 * تفعل؟" Reuses existing pieces throughout — GameCard, PatientListItem,
 * usePatients — rather than inventing new product functionality; this
 * screen is quick ACCESS/overview only. The full Activity Library moved to
 * /control/activities (see app/control/activities/page.tsx) and the full
 * Patient Registry stays at /control/patients — this page just previews
 * both and gives the two "بدء جلسة جديدة" entry points spelled out in the
 * task (a saved patient, or a walk-in/demo quick session).
 */
export function HomeScreen() {
  return (
    <main
      dir="rtl"
      lang="ar"
      className="fixed inset-0 flex h-dvh w-dvw touch-manipulation flex-col overflow-y-auto bg-slate-50 pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] text-slate-900"
      style={{ fontFamily: "var(--font-control), system-ui, sans-serif" }}
    >
      <ResetLiveDisplayOnMount />
      {isRealtimeEnabled() && <DisplayAudioControl />}
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-5 py-8 sm:gap-10 sm:px-8 sm:py-10">
        <ControlNav active="home" />

        <header className="flex flex-col items-center gap-1.5 text-center">
          <ShumosBrandMark />
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">نظام التأهيل التفاعلي</h1>
          <p className="text-base text-slate-500">مرحبًا، ماذا تريد أن تفعل؟</p>
        </header>

        {isRealtimeEnabled() && <SystemReadinessCard />}
        <QuickStartSection />
        {isRealtimeEnabled() && <QuickPatientsSection />}
        <ActivitiesPreviewSection />
      </div>
    </main>
  );
}

/** Task section 5 — the two obvious "بدء جلسة جديدة" choices, both reusing existing flows: a saved patient (-> Patient Registry -> Patient Profile's own Start/Continue actions) or a walk-in (-> Activity Library -> manual first name). */
function QuickStartSection() {
  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-teal-100 bg-teal-50/50 p-5 shadow-sm shadow-slate-900/5">
      <h2 className="text-center text-lg font-bold text-slate-900">بدء جلسة جديدة</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href="/control/patients"
          className="flex min-h-16 touch-manipulation flex-col items-center justify-center gap-1 rounded-2xl bg-teal-600 px-4 text-center text-white shadow-lg shadow-teal-900/15 transition-all active:scale-[0.98]"
        >
          <span className="text-base font-bold">اختر مريضًا محفوظًا</span>
          <span className="text-xs text-teal-100">جلسة مرتبطة بملف المريض وسجل تقدمه</span>
        </Link>
        <Link
          href="/control/quick-session"
          className="flex min-h-16 touch-manipulation flex-col items-center justify-center gap-1 rounded-2xl border-2 border-slate-200 bg-white px-4 text-center text-slate-700 transition-all active:scale-[0.98] active:bg-slate-50"
        >
          <span className="text-base font-bold">جلسة سريعة</span>
          <span className="text-xs text-slate-400">مناسبة للعروض التجريبية والزيارات العابرة</span>
        </Link>
      </div>
    </section>
  );
}

/** Task section 4 — a few recent patients only (never the whole registry), same PatientListItem rows the full Patient Registry uses. */
function QuickPatientsSection() {
  const { patients, activeCount, loading } = usePatients();
  const recent = [...patients].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, RECENT_PATIENTS_LIMIT);

  return (
    <SectionCard>
      <div className="flex items-end justify-between">
        <div className="flex flex-col">
          <h2 className="text-sm font-semibold text-slate-700">المرضى</h2>
          <span className="text-xs text-slate-400">{loading ? "جاري التحميل..." : formatPatientCountLabel(activeCount)}</span>
        </div>
        <Link href="/control/patients" className="text-sm font-semibold text-teal-700 transition-colors hover:text-teal-800">
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

/** Task section 6 — a compact preview (today: the one registered game), not a duplicate of the full library. */
function ActivitiesPreviewSection() {
  return (
    <SectionCard>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">الأنشطة</h2>
        <Link href="/control/activities" className="text-sm font-semibold text-teal-700 transition-colors hover:text-teal-800">
          عرض كل الأنشطة
        </Link>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,300px))] gap-4">
        {GAME_REGISTRY.map((game) => (
          <GameCard key={game.id} game={game} />
        ))}
      </div>
    </SectionCard>
  );
}

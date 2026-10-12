"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmSheet } from "@/components/control/live/ConfirmSheet";
import { ControlBreadcrumb } from "@/components/control/nav/ControlBreadcrumb";
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { useStaffAuth } from "@/lib/realtime/useStaffAuth";
import { usePatientContext } from "@/lib/patients/PatientSessionContext";
import { deactivatePatient, subscribeToPatient, updatePatientFirstName } from "@/lib/patients/patientRepository";
import { PatientRepositoryException, type Patient } from "@/lib/patients/types";
import { describePatientError } from "./patientErrorCopy";
import { formatPatientCreatedAt } from "./formatPatientDate";
import { PatientQuickRail } from "./PatientQuickRail";
import { PatientSessionHistorySection } from "./PatientSessionHistorySection";

import { PatientVisitHistory } from '@/components/control/visits/PatientVisitHistory';

const MAX_NAME_LENGTH = 50;

/**
 * PATIENT REGISTRY TASK — the Patient Profile: identity, status, edit
 * firstName, "بدء جلسة جديدة" (see the task's START SESSION FROM PATIENT
 * section). SESSION HISTORY TASK: now also a real session-history section
 * (PatientSessionHistorySection) and a compact patient quick-access rail on
 * wide (iPad landscape+) layouts — see PatientQuickRail's doc comment.
 *
 * CONTROL UX POLISH TASK: the old lone "← المرضى" arrow is now a small
 * breadcrumb (الرئيسية / المرضى / <name>) — same back-navigation, plus a
 * reachable Home, plus the "small contextual trail" the task asks deeper
 * pages to have (see ControlBreadcrumb's doc comment). Deliberately no
 * second nav strip alongside PatientQuickRail on this page — see the task's
 * "avoid visual clutter."
 */
export function PatientProfileScreen({ patientId }: { patientId: string }) {
  return (
    <main
      dir="rtl"
      lang="ar"
      className="fixed inset-0 flex h-dvh w-dvw touch-manipulation flex-col overflow-y-auto bg-slate-50 pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] text-slate-900"
      style={{ fontFamily: "var(--font-control), system-ui, sans-serif" }}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-5 py-8 sm:px-8 sm:py-10">
        <PatientProfileBreadcrumb patientId={patientId} />

        <div className="flex flex-1 flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
          <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-7 lg:mx-0">
            {isRealtimeEnabled() ? <RealtimePatientProfile patientId={patientId} /> : <RealtimeUnavailableNotice />}
          </div>
          {isRealtimeEnabled() && <PatientQuickRail currentPatientId={patientId} />}
        </div>
      </div>
    </main>
  );
}

function PatientProfileBreadcrumb({ patientId }: { patientId: string }) {
  const [patient, setPatient] = useState<Patient | null | undefined>(undefined);
  useEffect(() => (isRealtimeEnabled() ? subscribeToPatient(patientId, setPatient) : undefined), [patientId]);

  return (
    <ControlBreadcrumb
      items={[
        { label: "الرئيسية", href: "/control" },
        { label: "المرضى", href: "/control/patients" },
        { label: patient?.firstName ?? "..." },
      ]}
    />
  );
}

function RealtimeUnavailableNotice() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-slate-400">
      <p className="max-w-xs text-sm leading-relaxed">سجل المرضى يتطلب اتصال Firebase مُهيّأ لهذه النسخة.</p>
    </div>
  );
}

function RealtimePatientProfile({ patientId }: { patientId: string }) {
  const auth = useStaffAuth();
  const router = useRouter();
  const { selectPatient } = usePatientContext();

  const [patient, setPatient] = useState<Patient | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  useEffect(() => subscribeToPatient(patientId, setPatient), [patientId]);

  if (patient === undefined) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-400">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-teal-600" />
        <span className="text-sm font-medium">جاري تحميل بيانات المريض...</span>
      </div>
    );
  }

  if (patient === null) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-slate-400">
        <span className="text-3xl" aria-hidden="true">
          🔍
        </span>
        <p className="text-sm">لم يتم العثور على هذا المريض</p>
      </div>
    );
  }

  const startEditing = () => {
    setNameDraft(patient.firstName);
    setNameError(null);
    setEditing(true);
  };

  const saveName = async () => {
    if (savingName) return;
    setSavingName(true);
    setNameError(null);
    try {
      await updatePatientFirstName(patient.patientId, nameDraft);
      setEditing(false);
    } catch (err) {
      const code = err instanceof PatientRepositoryException ? err.code : "unknown";
      setNameError(describePatientError(code));
    } finally {
      setSavingName(false);
    }
  };

  const startNewSession = () => {
    selectPatient({ patientId: patient.patientId, patientNumber: patient.patientNumber, firstName: patient.firstName });
    router.push("/control/activities");
  };

  const handleDeactivate = async () => {
    setDeactivating(true);
    try {
      await deactivatePatient(patient.patientId);
      router.push("/control/patients");
    } finally {
      setDeactivating(false);
      setConfirmDeactivate(false);
    }
  };

  return (
    <>
      <header className="flex flex-col items-center gap-3 rounded-3xl border border-slate-200 bg-white px-6 py-8 text-center shadow-[0_2px_8px_rgba(30,41,59,0.05)]">
        {editing ? (
          <div className="flex w-full max-w-xs flex-col gap-2">
            <input
              autoFocus
              type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              maxLength={MAX_NAME_LENGTH}
              className="min-h-12 touch-manipulation rounded-xl border-2 border-slate-200 bg-white px-4 text-center text-xl font-bold text-slate-900 outline-none transition-colors focus:border-teal-600"
            />
            {nameError && <p className="text-xs font-medium text-rose-600">{nameError}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={saveName}
                disabled={savingName || nameDraft.trim().length === 0}
                className="min-h-10 flex-1 touch-manipulation rounded-xl bg-teal-600 text-sm font-bold text-white transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              >
                {savingName ? "جاري الحفظ..." : "حفظ"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="min-h-10 flex-1 touch-manipulation rounded-xl bg-slate-100 text-sm font-semibold text-slate-600"
              >
                إلغاء
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">{patient.firstName}</h1>
            <button type="button" onClick={startEditing} aria-label="تعديل اسم الطفل" className="text-slate-300 transition-colors hover:text-teal-600">
              ✎
            </button>
          </div>
        )}

        <span className="rounded-full bg-slate-100 px-3.5 py-1.5 text-sm font-semibold text-slate-600">رقم المريض #{patient.patientNumber}</span>

        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${patient.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
          >
            {patient.active ? "نشط" : "غير نشط"}
          </span>
          <span className="text-xs text-slate-400">تاريخ الإنشاء: {formatPatientCreatedAt(patient.createdAt)}</span>
        </div>
      </header>

      {/*
        CONTROL UX POLISH TASK — action hierarchy (task section 8): when
        this patient has Balloon Quest history, PatientSessionHistorySection
        renders its OWN primary "متابعة من آخر تقدم" (LastProgressCard) —
        that should lead. "بدء جلسة جديدة" is always available (a brand-new
        patient with no history yet has nothing else), but is now styled and
        positioned as the secondary choice, right after the history section
        rather than above it, so it never visually competes with "متابعة من
        آخر تقدم" for primary attention — see ReadyScreen's "تعديل
        الإعدادات" for the same secondary-button treatment.
      */}
      <PatientVisitHistory patientId={patient.patientId} />
      <h2 className="text-lg font-bold text-slate-800">سجل الألعاب · داخل الزيارات وخارجها</h2>
      <PatientSessionHistorySection patient={patient} />

      {patient.active && (
        <button
          type="button"
          onClick={startNewSession}
          disabled={auth.phase !== "authorized"}
          className="min-h-14 touch-manipulation rounded-2xl border-2 border-teal-200 bg-white text-base font-bold text-teal-700 transition-all active:scale-[0.98] active:bg-teal-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
        >
          بدء جلسة جديدة
        </button>
      )}

      {patient.active && (
        <div className="mt-2 flex flex-col items-center gap-1 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={() => setConfirmDeactivate(true)}
            className="min-h-10 touch-manipulation text-sm font-medium text-rose-400 transition-colors hover:text-rose-600"
          >
            إلغاء تنشيط هذا المريض
          </button>
        </div>
      )}

      <ConfirmSheet
        open={confirmDeactivate}
        title="إلغاء تنشيط المريض؟"
        description={`لن يظهر ${patient.firstName} بعد الآن في قائمة المرضى النشطين. يمكن استرجاع سجله لاحقًا عند الحاجة.`}
        confirmLabel={deactivating ? "جاري التنفيذ..." : "إلغاء التنشيط"}
        destructive
        onConfirm={handleDeactivate}
        onCancel={() => setConfirmDeactivate(false)}
      />
    </>
  );
}

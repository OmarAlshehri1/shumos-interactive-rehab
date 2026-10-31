"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmSheet } from "@/components/control/live/ConfirmSheet";
import { ControlPageNav } from "@/components/control/nav/ControlPageNav";
import { ControlBreadcrumb } from "@/components/control/nav/ControlBreadcrumb";
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { useStaffAuth } from "@/lib/realtime/useStaffAuth";
import { usePatientContext } from "@/lib/patients/PatientSessionContext";
import { deactivatePatient, subscribeToPatient, updatePatientFirstName } from "@/lib/patients/patientRepository";
import { PatientRepositoryException, type Patient } from "@/lib/patients/types";
import { describePatientError } from "./patientErrorCopy";
import { formatPatientCreatedAt } from "./formatPatientDate";
import { usePatientVisitHistory } from "@/components/control/visits/usePatientVisitHistory";
import { PatientClinicalOverview } from "./PatientClinicalOverview";
import { ControlIcon } from "@/components/control/ui/ControlIcon";
import styles from "./profile.module.css";
import { PatientSessionHistorySection } from "./PatientSessionHistorySection";


import { PatientVisitHistory } from '@/components/control/visits/PatientVisitHistory';

const MAX_NAME_LENGTH = 50;

/** A full-width identity header and coordinated clinical history panels. */
export function PatientProfileScreen({ patientId }: { patientId: string }) {
  return (
    <main
      dir="rtl"
      lang="ar"
      className={styles.profile}
    >
      <div className={styles.content}>
        <ControlPageNav backHref="/control/patients" backLabel="المرضى" />
        <PatientProfileBreadcrumb patientId={patientId} />
        {isRealtimeEnabled() ? <RealtimePatientProfile patientId={patientId} /> : <RealtimeUnavailableNotice />}
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
  const history = usePatientVisitHistory(patientId);
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
      <header className={styles.identity}>
        <div className={styles.avatar} aria-hidden="true">{patient.firstName.slice(0,1)}</div>
        <div className={styles.identityMain}>
        {editing ? (
          <div className={styles.editing}>
            <input
              autoFocus
              aria-label="اسم الطفل"
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
          <div className={styles.name}>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">{patient.firstName}</h1>
            <button type="button" onClick={startEditing} aria-label="تعديل اسم الطفل" className={styles.edit}>
              ✎
            </button>
          </div>
        )}

        <div className={styles.metadata}>
          <span>رقم المريض <bdi>#{patient.patientNumber}</bdi></span>
          <span>مسجل منذ {formatPatientCreatedAt(patient.createdAt)}</span>
          <span className={styles.status}>{patient.active ? "نشط" : "غير نشط"}</span>
        </div>
        </div>
        {patient.active && <div className={styles.actions}>
          <button type="button" className={styles.primary} disabled={auth.phase !== "authorized"} onClick={() => { selectPatient({ patientId: patient.patientId, patientNumber: patient.patientNumber, firstName: patient.firstName }); router.push("/control/visits"); }}><ControlIcon name="plus"/>بدء جلسة علاجية</button>
          <button type="button" className={styles.secondary} disabled={auth.phase !== "authorized"} onClick={startNewSession}>نشاط مستقل</button>
        </div>}
      </header>
      <div className={styles.columns}>
        <div className={styles.history}><PatientVisitHistory key={`visits-${patient.patientId}`} patientId={patient.patientId} history={history} /></div>
        <aside className={styles.support} aria-label="التقدم والأنشطة المستقلة">
          <PatientClinicalOverview patientId={patient.patientId} history={history}/>
          <h2>سجل الأنشطة المستقلة</h2>
          <PatientSessionHistorySection key={`sessions-${patient.patientId}`} patient={patient} />
        </aside>
      </div>
      {patient.active && <div className={styles.management}><button type="button" onClick={() => setConfirmDeactivate(true)}>إلغاء تنشيط هذا المريض</button></div>}

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

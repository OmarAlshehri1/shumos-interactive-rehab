"use client";

import { useState } from "react";
import { ControlDialog } from "@/components/control/ui/ControlDialog";
import { createPatient } from "@/lib/patients/patientRepository";
import { PatientRepositoryException, type Patient } from "@/lib/patients/types";
import { describePatientError } from "./patientErrorCopy";

interface AddPatientSheetProps {
  open: boolean;
  createdByUid: string;
  onCreated: (patient: Patient) => void;
  onCancel: () => void;
}

const MAX_NAME_LENGTH = 50;
const MAX_NUMBER_LENGTH = 40;

/**
 * PATIENT REGISTRY TASK — "+ مريض جديد" form: اسم الطفل + رقم المريض,
 * required, trimmed, length-limited, duplicate patientNumber rejected with
 * an Arabic-friendly message (never a raw Firebase error) — see
 * lib/patients/patientRepository.ts's createPatient and
 * patientErrorCopy.ts. Same bottom-sheet shape as
 * components/control/live/ConfirmSheet.tsx, reachable with a thumb on an
 * iPad rather than a small centered dialog.
 */
export function AddPatientSheet({ open, createdByUid, onCreated, onCancel }: AddPatientSheetProps) {
  const [firstName, setFirstName] = useState("");
  const [patientNumber, setPatientNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setFirstName("");
    setPatientNumber("");
    setError(null);
    setSubmitting(false);
  };

  const handleCancel = () => {
    if (submitting) return;
    reset();
    onCancel();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const patient = await createPatient({ firstName, patientNumber, createdByUid });
      reset();
      onCreated(patient);
    } catch (err) {
      const code = err instanceof PatientRepositoryException ? err.code : "unknown";
      setError(describePatientError(code));
      setSubmitting(false);
    }
  };

  const canSubmit = firstName.trim().length > 0 && patientNumber.trim().length > 0 && !submitting;

  return <ControlDialog open={open} title="إضافة مريض جديد" onClose={handleCancel} busy={submitting}>
            <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-md flex-col gap-5">
              <h2 className="text-center text-lg font-bold text-slate-900">مريض جديد</h2>

              <div className="flex flex-col gap-2">
                <label htmlFor="new-patient-name" className="text-sm font-semibold text-slate-700">
                  اسم الطفل
                </label>
                <input
                  id="new-patient-name"
                  type="text"
                  autoComplete="off"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="اكتب الاسم الأول"
                  maxLength={MAX_NAME_LENGTH}
                  className="min-h-14 touch-manipulation rounded-2xl border-2 border-slate-200 bg-white px-5 text-lg font-medium text-slate-900 outline-none transition-colors select-text placeholder:text-slate-400 focus:border-teal-600"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="new-patient-number" className="text-sm font-semibold text-slate-700">
                  رقم المريض
                </label>
                <input
                  id="new-patient-number"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={patientNumber}
                  onChange={(e) => setPatientNumber(e.target.value)}
                  placeholder="مثال: 1024"
                  maxLength={MAX_NUMBER_LENGTH}
                  className="min-h-14 touch-manipulation rounded-2xl border-2 border-slate-200 bg-white px-5 text-lg font-medium text-slate-900 outline-none transition-colors select-text placeholder:text-slate-400 focus:border-teal-600"
                />
              </div>

              {error && <p role="alert" id="new-patient-error" className="text-sm font-medium text-rose-600">{error}</p>}

              <div className="flex flex-col gap-2.5">
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="min-h-14 touch-manipulation rounded-2xl bg-teal-600 text-base font-bold text-white shadow-sm shadow-teal-900/15 transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                >
                  {submitting ? "جاري الحفظ..." : "حفظ المريض"}
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="min-h-12 touch-manipulation rounded-2xl text-base font-medium text-slate-500 active:text-slate-700"
                >
                  إلغاء
                </button>
              </div>
            </form>
  </ControlDialog>;
}

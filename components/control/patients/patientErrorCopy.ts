import type { PatientRepositoryError } from "@/lib/patients/types";

/** Arabic-friendly copy for every PatientRepositoryError — never the raw Firebase error, per spec. Same "closed mapping, never leak the wire error" pattern as StaffAuthGate's login screen. */
export const PATIENT_ERROR_COPY: Record<PatientRepositoryError, string> = {
  "invalid-name": "يرجى إدخال اسم الطفل",
  "invalid-number": "رقم المريض غير صالح — استخدم أرقامًا أو حروفًا بدون رموز أو مسافات",
  "duplicate-number": "رقم المريض هذا مستخدم بالفعل لمريض آخر",
  network: "تعذّر الاتصال بالخادم. تحقق من الإنترنت وحاول مرة أخرى",
  unknown: "حدث خطأ غير متوقع. حاول مرة أخرى",
};

export function describePatientError(code: PatientRepositoryError): string {
  return PATIENT_ERROR_COPY[code];
}

interface SetupIdentityCardProps {
  childName: string;
  patientName?: string | null;
  therapistName?: string | null;
}

export const THERAPIST_ACCOUNT_FALLBACK = "حساب الأخصائي";

export function displayTherapistName(name: string | null | undefined): string {
  return name?.trim() || THERAPIST_ACCOUNT_FALLBACK;
}

/** Shared pre-session identity hierarchy used by every game Setup screen. */
export function SetupIdentityCard({ childName, patientName, therapistName }: SetupIdentityCardProps) {
  const savedPatientName = patientName?.trim() || "";
  const displayedChildName = savedPatientName || childName.trim() || "—";
  return (
    <section
      data-setup-identity
      aria-label="هوية الجلسة"
      className="grid grid-cols-1 gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2"
    >
      <IdentityItem label={savedPatientName ? "المريض" : "الطفل"} value={displayedChildName} />
      <IdentityItem label="الأخصائي" value={displayTherapistName(therapistName)} />
    </section>
  );
}

function IdentityItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1 text-base font-bold text-slate-900">{value}</div>
    </div>
  );
}

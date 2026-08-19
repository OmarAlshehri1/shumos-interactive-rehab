import {
  sessionEndReasonLabel,
  type StoredSessionWorkflowFields,
  type SessionWorkflowMetadata,
} from "@/lib/sessions/workflowMetadata";

export function SessionMetadataDetails({
  metadata,
  therapistName,
  includeEndReason = true,
}: {
  metadata?: SessionWorkflowMetadata | StoredSessionWorkflowFields;
  therapistName?: string | null;
  includeEndReason?: boolean;
}) {
  const endReason = includeEndReason ? sessionEndReasonLabel(metadata) : null;
  if (!endReason && !therapistName) return null;
  return (
    <dl className="grid gap-2 text-sm sm:grid-cols-2">
      {therapistName && <MetadataRow label="الأخصائي" value={therapistName} />}
      {endReason && <MetadataRow label="سبب إنهاء الجلسة" value={endReason} />}
    </dl>
  );
}

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3">
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-bold text-slate-800">{value}</dd>
    </div>
  );
}

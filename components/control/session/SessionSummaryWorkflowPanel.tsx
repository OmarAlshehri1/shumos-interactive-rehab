import { SectionCard } from "@/components/control/ui/SectionCard";
import type { SessionWorkflowMetadata } from "@/lib/sessions/workflowMetadata";
import { SessionMetadataDetails } from "./SessionMetadataDetails";
import { TherapistNoteEditor } from "./TherapistNoteEditor";

export function SessionSummaryWorkflowPanel({
  workflow,
  therapistName,
  patientId,
  sessionId,
}: {
  workflow?: SessionWorkflowMetadata;
  therapistName?: string | null;
  patientId: string | null;
  sessionId: string;
}) {
  const hasMetadata = Boolean(workflow?.endReason || therapistName);
  if (!hasMetadata && !patientId) return null;
  return (
    <SectionCard title="بيانات الجلسة" className="gap-5">
      <SessionMetadataDetails metadata={workflow} therapistName={therapistName} />
      {patientId && <TherapistNoteEditor patientId={patientId} sessionId={sessionId} />}
    </SectionCard>
  );
}

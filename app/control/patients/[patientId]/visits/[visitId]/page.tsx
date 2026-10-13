import { VisitDetailScreen } from "@/components/control/visits/VisitDetailScreen";
export default async function VisitDetailPage({
  params,
}: {
  params: Promise<{ patientId: string; visitId: string }>;
}) {
  const { patientId, visitId } = await params;
  return (
    <VisitDetailScreen
      key={`${patientId}:${visitId}`}
      patientId={patientId}
      visitId={visitId}
    />
  );
}

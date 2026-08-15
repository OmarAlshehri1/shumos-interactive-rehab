import type { Metadata } from "next";
import { SessionDetailScreen } from "@/components/control/patients/SessionDetailScreen";

export const metadata: Metadata = {
  title: "Shumos Interactive Rehab — تفاصيل الجلسة",
};

export default async function SessionDetailPage({ params }: { params: Promise<{ patientId: string; sessionId: string }> }) {
  const { patientId, sessionId } = await params;
  return <SessionDetailScreen patientId={patientId} sessionId={sessionId} />;
}

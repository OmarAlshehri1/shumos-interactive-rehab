import type { Metadata } from "next";
import { PatientProfileScreen } from "@/components/control/patients/PatientProfileScreen";

export const metadata: Metadata = {
  title: "Shumos Interactive Rehab — ملف المريض",
};

export default async function PatientProfilePage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  return <PatientProfileScreen patientId={patientId} />;
}

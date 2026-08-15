import type { Metadata } from "next";
import { PatientRegistryScreen } from "@/components/control/patients/PatientRegistryScreen";

export const metadata: Metadata = {
  title: "Shumos Interactive Rehab — المرضى",
};

export default function PatientsPage() {
  return <PatientRegistryScreen />;
}

import type { Metadata } from "next";
import { LeftHandEnrollmentScreen } from "@/components/control/sensors/LeftHandEnrollmentScreen";

export const metadata: Metadata = {
  title: "Shumos Interactive Rehab — جلسة تسجيل اليد اليسرى",
};

/** Isolated development/engineering route; intentionally absent from normal clinic navigation, same as /control/right-hand-final-session. */
export default function LeftHandEnrollmentSessionPage() {
  return <LeftHandEnrollmentScreen />;
}

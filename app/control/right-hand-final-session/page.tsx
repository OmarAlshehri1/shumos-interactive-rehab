import type { Metadata } from "next";
import { RightHandFinalSessionScreen } from "@/components/control/sensors/RightHandFinalSessionScreen";

export const metadata: Metadata = {
  title: "Shumos Interactive Rehab — الجلسة النهائية لليد اليمنى",
};

/** Isolated development/engineering route; intentionally absent from normal clinic navigation, same as /control/sensor-hand-demo. */
export default function RightHandFinalSessionPage() {
  return <RightHandFinalSessionScreen />;
}

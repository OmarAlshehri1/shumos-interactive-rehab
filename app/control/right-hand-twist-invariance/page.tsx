import type { Metadata } from "next";
import { RightHandTwistInvarianceScreen } from "@/components/control/sensors/RightHandTwistInvarianceScreen";

export const metadata: Metadata = {
  title: "Shumos Interactive Rehab — اختبار ثبات الاتجاه أثناء اللف",
};

/** Isolated development/engineering route; intentionally absent from normal clinic navigation, same as /control/right-hand-final-session. */
export default function RightHandTwistInvariancePage() {
  return <RightHandTwistInvarianceScreen />;
}

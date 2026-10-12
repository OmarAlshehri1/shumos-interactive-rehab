import type { Metadata } from "next";
import { SensorHandDemoScreen } from "@/components/control/sensors/SensorHandDemoScreen";

export const metadata: Metadata = {
  title: "Shumos Interactive Rehab — مختبر اليد الافتراضية",
};

/** Isolated development route; intentionally absent from normal clinic navigation. */
export default function SensorHandDemoPage() {
  return <SensorHandDemoScreen />;
}

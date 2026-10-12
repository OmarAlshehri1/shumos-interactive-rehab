import type { Metadata } from "next";
import { SensorSetupPrototypeScreen } from "@/components/control/sensors/SensorSetupPrototypeScreen";

export const metadata: Metadata = {
  title: "Shumos Interactive Rehab — نموذج إعداد الحساسات (أولي)",
};

/**
 * Isolated prototype route — deliberately not linked from ControlNav or any
 * other page. See SensorSetupPrototypeScreen.tsx's doc comment.
 */
export default function SensorSetupPrototypePage() {
  return <SensorSetupPrototypeScreen />;
}

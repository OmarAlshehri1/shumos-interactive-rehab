import type { Metadata } from "next";
import { BubblePopSensorContactDemo } from "@/components/control/sensors/BubblePopSensorContactDemo";

export const metadata: Metadata = {
  title: "Shumos Interactive Rehab — جدار الفقاعات بالحساس",
};

/**
 * Bubble Pop Wall RIGHT_HAND sensor-play route — mirrors
 * /control/right-hand-balloon-play's pattern (real engine + real display
 * scene, local practice session, shared sensor runtime). Standalone from
 * the production BubblePopControlScreen therapist flow — no Firebase, no
 * patient/session data.
 */
export default function BubblePopWallSensorPlayPage() {
  return <BubblePopSensorContactDemo />;
}

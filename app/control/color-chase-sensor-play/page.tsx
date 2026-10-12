import type { Metadata } from "next";
import { ColorChaseSensorContactDemo } from "@/components/control/sensors/ColorChaseSensorContactDemo";

export const metadata: Metadata = {
  title: "Shumos Interactive Rehab — مطاردة الألوان بالحساس",
};

/**
 * Color Chase RIGHT_HAND sensor-play route — mirrors
 * /control/right-hand-balloon-play's pattern (real engine + real display
 * grid, local practice session, shared sensor runtime). Standalone from the
 * production ColorChaseControlScreen therapist flow — no Firebase, no
 * patient/session data.
 */
export default function ColorChaseSensorPlayPage() {
  return <ColorChaseSensorContactDemo />;
}

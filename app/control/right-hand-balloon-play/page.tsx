import type { Metadata } from "next";
import { RightHandBalloonPlayable } from "@/components/control/sensors/RightHandBalloonPlayable";

export const metadata: Metadata = {
  title: "Shumos Interactive Rehab — تجربة اللعب باليد الحقيقية",
};

/**
 * RIGHT_HAND playable prototype route: connect -> recenter -> play, no
 * diagnostic/calibration gate. Standalone from the production Balloon Quest
 * therapist flow (ControlScreen/LiveSessionScreen/useRealtimeControllerSession) —
 * no Firebase, no patient/session data.
 */
export default function RightHandBalloonPlayPage() {
  return <RightHandBalloonPlayable />;
}

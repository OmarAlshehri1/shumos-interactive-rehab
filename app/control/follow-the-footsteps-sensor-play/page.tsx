import type { Metadata } from "next";
import { FollowFootstepsSensorContactDemo } from "@/components/control/sensors/FollowFootstepsSensorContactDemo";

export const metadata: Metadata = {
  title: "Shumos Interactive Rehab — اتبع الخطوات بالحساس",
};

/**
 * Follow the Footsteps RIGHT_HAND sensor-play route — mirrors
 * /control/right-hand-balloon-play's pattern exactly (real engine + real
 * display scene, local practice session, shared sensor runtime). Standalone
 * from the production FootstepsControlScreen therapist flow — no Firebase,
 * no patient/session data.
 */
export default function FollowTheFootstepsSensorPlayPage() {
  return <FollowFootstepsSensorContactDemo />;
}

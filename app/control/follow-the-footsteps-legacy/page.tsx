import type { Metadata } from "next";
import { FootstepsControlScreen } from "@/components/control/footsteps/FootstepsControlScreen";

export const metadata: Metadata = {
  title: "Shumos Interactive Rehab — اتبع الخطوات (النسخة الأصلية)",
  robots: { index: false, follow: false },
};

/**
 * The original Follow the Footsteps controller, kept reachable internally as the rollback path even while the 3D
 * feature flag is on. It has no library card (the library lists exactly one Follow the Footsteps) and the Display
 * renders its sessions with the original module, because they are untagged.
 */
export default function FollowTheFootstepsLegacyControlPage() {
  return <FootstepsControlScreen />;
}

import type { Metadata } from "next";
import { ColorChaseControlScreen } from "@/components/control/colorchase/ColorChaseControlScreen";

export const metadata: Metadata = {
  title: "Shumos Interactive Rehab — مطاردة الألوان (النسخة الأصلية)",
  robots: { index: false, follow: false },
};

/**
 * The original Color Chase controller, kept reachable internally as the rollback path even while the 3D feature flag is
 * on. It has no library card (the library lists exactly one Color Chase) and the Display renders its sessions with the
 * original module, because they are untagged.
 */
export default function ColorChaseLegacyControlPage() {
  return <ColorChaseControlScreen />;
}

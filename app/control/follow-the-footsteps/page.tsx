import type { Metadata } from "next";
import { FootstepsControlScreen } from "@/components/control/footsteps/FootstepsControlScreen";

export const metadata: Metadata = {
  title: "Shumos Interactive Rehab — اتبع الخطوات",
};

/**
 * Follow the Footsteps' own controller route — see lib/games/registry.ts's
 * "follow-the-footsteps" entry, whose `route` points here. Mirrors
 * app/control/balloon-quest/page.tsx's pattern exactly: this game's own
 * setup/controller experience lives entirely behind FootstepsControlScreen.
 */
export default function FollowTheFootstepsControlPage() {
  return <FootstepsControlScreen />;
}

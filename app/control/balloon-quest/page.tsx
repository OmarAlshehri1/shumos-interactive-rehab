import type { Metadata } from "next";
import { ControlScreen } from "@/components/control/ControlScreen";

export const metadata: Metadata = {
  title: "Shumos Interactive Rehab — مغامرة البالونات",
};

/**
 * Balloon Quest's own controller route — see lib/games/registry.ts's
 * "balloon-quest" entry, whose `route` points here. ControlScreen is the
 * exact, unmodified Task 5-12 therapist controller (setup -> ready -> live
 * -> summary); this page is only the address the game library now sends
 * the therapist to, instead of /control opening it directly.
 */
export default function BalloonQuestControlPage() {
  return <ControlScreen />;
}

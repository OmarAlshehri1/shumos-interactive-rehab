import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RunnerQuestControl } from "@/components/control/runnerquest3d/RunnerQuestControl";
import { RUNNER_QUEST_3D_ENABLED } from "@/lib/runnerquest3d/availability";

export const metadata: Metadata = { title: "مغامرة العدّاء — Runner Quest 3D" };

/**
 * Integrated Control route (library card target). Inherits the existing staff gate from app/control/layout.tsx.
 * With Firebase configured it is cross-device (live session + patient history); without it, a same-computer local session.
 * Returns 404 when the feature flag is off (see lib/runnerquest3d/availability.ts).
 */
export default function RunnerQuest3DControlPage() {
  if (!RUNNER_QUEST_3D_ENABLED) notFound();
  return <RunnerQuestControl />;
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RunnerQuest3DDisplay } from "@/components/display/runnerquest3d/RunnerQuest3DDisplay";
import type { Quality } from "@/components/display/runnerquest3d/scene/types";
import { RUNNER_QUEST_3D_ENABLED } from "@/lib/runnerquest3d/availability";

export const metadata: Metadata = { title: "مغامرة العدّاء", robots: { index: false, follow: false } };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Child-facing Display. No diagnostics, no preview mode. Optional ?quality=low|medium|high. 404 when the feature flag is off. */
export default async function RunnerQuest3DDisplayPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!RUNNER_QUEST_3D_ENABLED) notFound();
  const q = one((await searchParams).quality);
  const quality: Quality = q === "low" || q === "medium" || q === "high" ? q : "high";
  return <RunnerQuest3DDisplay opts={{ quality, autoQuality: true, preview: false, diagnostics: false }} />;
}

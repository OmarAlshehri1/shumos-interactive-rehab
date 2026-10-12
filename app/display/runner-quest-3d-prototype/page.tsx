import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RunnerQuest3DDisplay } from "@/components/display/runnerquest3d/RunnerQuest3DDisplay";
import { RemountHarness } from "@/components/display/runnerquest3d/RemountHarness";
import type { Quality } from "@/components/display/runnerquest3d/scene/types";

export const metadata: Metadata = { title: "Runner Quest 3D — Experimental Display", robots: { index: false, follow: false } };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Development-only child display. Unavailable in production, including direct URL access.
 * Optional: ?quality=low|medium|high  ?auto=0  ?diag=1  ?preview=1&stage=0..8 (single-window keyboard preview)
 * ?harness=remount&cycles=N (GPU-cleanup check)
 */
export default async function RunnerQuest3DDisplayPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const p = await searchParams;
  const q = one(p.quality);
  const quality: Quality = q === "low" || q === "medium" || q === "high" ? q : "high";
  const stage = Number(one(p.stage));
  if (one(p.harness) === "remount") return <RemountHarness cycles={Math.min(60, Number(one(p.cycles)) || 20)} />;
  return (
    <RunnerQuest3DDisplay
      opts={{ quality, autoQuality: one(p.auto) !== "0", preview: one(p.preview) === "1", previewStage: Number.isInteger(stage) && stage >= 0 && stage <= 8 ? stage : 0, diagnostics: one(p.diag) === "1", previewSettings: one(p.reduced) === "1" ? { reducedMotion: true } : undefined }}
    />
  );
}

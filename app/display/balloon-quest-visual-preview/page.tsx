import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BalloonQuestVisualPreview } from "@/components/display/balloonquest3d/preview/BalloonQuestVisualPreview";
import { parsePreviewMode } from "@/components/display/balloonquest3d/preview/previewConfig";

export const metadata: Metadata = {
  title: "Balloon Quest — Visual preview (development)",
  robots: { index: false, follow: false },
};

/**
 * B2 development-only visual preview. Unavailable in production, including
 * direct URL access. Query: ?mode=easy|medium|advanced&symbols=1&panel=0
 */
export default async function BalloonQuestVisualPreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const params = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return (
    <BalloonQuestVisualPreview
      initialMode={parsePreviewMode(first(params.mode))}
      initialSymbols={first(params.symbols) === "1"}
      showPanel={first(params.panel) !== "0"}
    />
  );
}

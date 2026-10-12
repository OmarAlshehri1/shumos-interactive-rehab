import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BalloonQuest3DDisplay } from "@/components/display/balloonquest3d/game/BalloonQuest3DDisplay";

export const metadata: Metadata = { title: "Balloon Quest 3D — Experimental Display", robots: { index: false, follow: false } };

/** Development-only child display. Unavailable in production, including direct URL access. Optional: ?symbols=1 */
export default async function BalloonQuest3DDisplayPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const params = await searchParams;
  const symbols = (Array.isArray(params.symbols) ? params.symbols[0] : params.symbols) === "1";
  return <BalloonQuest3DDisplay showSymbols={symbols} />;
}

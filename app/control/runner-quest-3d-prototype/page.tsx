import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RunnerQuest3DControl } from "@/components/control/runnerquest3d/RunnerQuest3DControl";

export const metadata: Metadata = { title: "Runner Quest 3D — Experimental Control", robots: { index: false, follow: false } };

/** Inherits the existing staff authentication/authorization gate (app/control/layout.tsx). Development only; no registry entry; no production route. */
export default function RunnerQuest3DControlPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <RunnerQuest3DControl />;
}

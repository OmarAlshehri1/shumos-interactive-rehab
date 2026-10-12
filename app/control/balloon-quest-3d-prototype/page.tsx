import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BalloonQuest3DControl } from "@/components/control/balloonquest3d/BalloonQuest3DControl";

export const metadata: Metadata = { title: "Balloon Quest 3D — Experimental Control", robots: { index: false, follow: false } };

/** Inherits the existing staff authentication/authorization gate. Development only; no registry entry; no production route. */
export default function BalloonQuest3DControlPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <BalloonQuest3DControl />;
}

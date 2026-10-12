import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SpacePilot3DControl } from "@/components/control/spacepilot3d/SpacePilot3DControl";

export const metadata: Metadata = { title: "Space Pilot 3D — Experimental Control", robots: { index: false, follow: false } };

/** Inherits the existing staff authentication/authorization gate. No registry entry. */
export default function SpacePilot3DControlPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <SpacePilot3DControl />;
}

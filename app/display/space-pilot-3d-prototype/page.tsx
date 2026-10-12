import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SpacePilot3DSessionDisplay } from "@/components/display/spacepilot3d/SpacePilot3DSessionDisplay";

export const metadata: Metadata = {
  title: "Space Pilot 3D — Development prototype",
  robots: { index: false, follow: false },
};

export default function SpacePilot3DPrototypePage() {
  // Explicitly unavailable in production, including direct URL access.
  if (process.env.NODE_ENV !== "development") notFound();
  return <SpacePilot3DSessionDisplay />;
}

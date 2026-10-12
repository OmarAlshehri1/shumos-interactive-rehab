import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { GardenPrototype } from "@/components/display/colorchase3d/GardenPrototype";

export const metadata: Metadata = {
  title: "Color Chase 3D — Development prototype",
  robots: { index: false, follow: false },
};

export default function ColorChase3DPrototypePage() {
  // Explicitly unavailable in production, including direct URL access.
  if (process.env.NODE_ENV !== "development") notFound();
  return <Suspense><GardenPrototype /></Suspense>;
}

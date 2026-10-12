"use client";

import { usePathname } from "next/navigation";
import { isBuildQuestControl } from "@/lib/buildquest3d/registration";

/** Only suppress the inherited cloud pointer publisher; keep auth and local RIGHT_HAND broadcasting. */
export function BuildQuestLocalOnlyBoundary({ children }: { children: React.ReactNode }) {
  return isBuildQuestControl(usePathname()) ? null : children;
}

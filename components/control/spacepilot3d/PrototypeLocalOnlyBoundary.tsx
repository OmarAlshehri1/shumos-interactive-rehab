"use client";

import { usePathname } from "next/navigation";
import { isLocalFlightControl } from '@/lib/spacepilot3d/releasePolicy';

/** The experimental route keeps the existing local publisher but omits cloud pointer writes. */
export function PrototypeLocalOnlyBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return isLocalFlightControl(pathname) ? null : children;
}

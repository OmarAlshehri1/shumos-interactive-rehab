"use client";

import { usePathname } from "next/navigation";
import { isLocalFlightControl } from '@/lib/spacepilot3d/releasePolicy';

/** Local diagnostics and experimental flight omit cloud pointer writes. */
export function PrototypeLocalOnlyBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return pathname === '/control/dual-sensor-test' || isLocalFlightControl(pathname) ? null : children;
}

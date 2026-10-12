"use client";
import { createState } from "@/lib/balancebridge3d/engine";
import { BridgeView } from "./BridgeView";
export function BridgeThumbnail() {
  return (
    <BridgeView state={{ ...createState("thumbnail"), status: "running" }} />
  );
}

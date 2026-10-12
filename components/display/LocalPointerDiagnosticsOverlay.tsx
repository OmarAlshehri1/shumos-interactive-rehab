"use client";

import { useEffect, useState } from "react";
import type { LocalPointerChannelState } from "./useLocalPointerChannel";

/**
 * DEV-ONLY diagnostics for the local-vs-Firebase pointer transport (see
 * useLocalPointerChannel.ts + DisplayScreen.tsx's source-priority logic).
 * Never part of the child-facing experience — hidden outright in a
 * production build, same gate as DevBadge.tsx.
 */
export function LocalPointerDiagnosticsOverlay({ local, usingLocal }: { local: LocalPointerChannelState; usingLocal: boolean }) {
  // `Date.now()` can't be called during render (react-hooks/purity) — a rAF
  // loop pushes a fresh "now" into state instead, so "age @ render" is
  // actually the age at the last paint, not a value computed impurely
  // mid-render.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    let rafId: number;
    const tick = () => {
      setNow(Date.now());
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  if (process.env.NODE_ENV === "production") return null;

  const d = local.diagnostics;
  // Live, continuously-updating age — distinct from d.ageAtReceiveMs (a snapshot frozen at the last message's own commit): this one keeps growing between messages, which is what actually shows a stalled/unhealthy channel.
  const liveAgeMs = d.sentAtMs != null ? Math.max(0, now - d.sentAtMs) : null;

  return (
    <div className="pointer-events-none absolute bottom-2 right-2 z-50 rounded bg-black/40 px-2 py-1 font-mono text-[10px] leading-tight text-white/70">
      <div>source: {usingLocal ? "LOCAL (BroadcastChannel)" : "FIREBASE (fallback)"}</div>
      <div>local healthy: {String(local.healthy)}</div>
      <div>seq: {d.seq ?? "—"}</div>
      <div>receive Hz: {d.receiveHz != null ? d.receiveHz.toFixed(1) : "—"}</div>
      <div>render Hz: {d.renderHz != null ? d.renderHz.toFixed(1) : "—"}</div>
      <div>age @ receive: {d.ageAtReceiveMs != null ? `${d.ageAtReceiveMs}ms` : "—"}</div>
      <div>age (live): {liveAgeMs != null ? `${liveAgeMs}ms` : "—"}</div>
      <div>skipped: {d.skippedCount}</div>
    </div>
  );
}

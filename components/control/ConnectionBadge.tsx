import { useEffect, useState } from "react";
import type { ConnectionStatus } from "@/lib/realtime/types";

type DisplayStatus = ConnectionStatus | "syncing" | "restored";

const STATUS_LABELS: Record<DisplayStatus, string> = {
  connected: "متصل",
  connecting: "جاري الاتصال",
  syncing: "جاري المزامنة",
  disconnected: "غير متصل",
  restored: "تمت استعادة الحالة",
};

const STATUS_DOT: Record<DisplayStatus, string> = {
  connected: "bg-emerald-500",
  connecting: "bg-amber-400 animate-pulse",
  syncing: "bg-amber-400 animate-pulse",
  disconnected: "bg-rose-500",
  restored: "bg-sky-500",
};

/** RELIABILITY FIX — FAILED-WRITE RESYNC: how long the "تمت استعادة الحالة" notice stays up before the badge reverts to the normal connection label on its own. Long enough to notice, short enough to never feel like a stuck error. */
const RESTORED_NOTICE_MS = 4000;

interface ConnectionBadgeProps {
  status: ConnectionStatus;
  /**
   * TASK 8: when the socket is up but we haven't received the first live
   * session snapshot yet, that's meaningfully different from "متصل" — the
   * badge says "جاري المزامنة" instead. Omit (or pass true) outside that
   * brief bootstrap window.
   */
  hasLoadedInitialSession?: boolean;
  /**
   * RELIABILITY FIX — FAILED-WRITE RESYNC: a timestamp (Date.now(), a new
   * value every time) from useRealtimeControllerSession.ts's
   * resyncFromCanonical — set whenever a mutating write genuinely failed
   * and local state was just resynced from Firebase's true canonical
   * value. This badge is the ONLY user-facing surface for that event: a
   * brief, unobtrusive label swap, never a raw Firebase error, never a
   * modal. Omit on the local (non-realtime) adapter, which never fails
   * writes this way.
   */
  syncRestoredAt?: number | null;
}

/** TASK 6/8: subtle, always-visible connection indicator — deliberately small, per spec ("do not turn connection status into a giant UI element"). */
export function ConnectionBadge({ status, hasLoadedInitialSession = true, syncRestoredAt = null }: ConnectionBadgeProps) {
  const [showRestored, setShowRestored] = useState(false);

  // Both the "turn on" and "turn off" state changes happen inside a timer
  // callback, never as a synchronous setState call in the effect body
  // itself (React's rules-of-hooks lint flags that pattern) — showTimer's
  // 0ms delay is imperceptible but keeps this effect purely about
  // scheduling, never directly mutating state during its own execution.
  useEffect(() => {
    if (syncRestoredAt === null) return;
    const showTimer = setTimeout(() => setShowRestored(true), 0);
    const hideTimer = setTimeout(() => setShowRestored(false), RESTORED_NOTICE_MS);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [syncRestoredAt]);

  const displayStatus: DisplayStatus = showRestored ? "restored" : status === "connected" && !hasLoadedInitialSession ? "syncing" : status;
  return (
    <div className="pointer-events-none fixed top-2 start-2 z-40 flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-slate-500 shadow-sm">
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[displayStatus]}`} />
      {STATUS_LABELS[displayStatus]}
    </div>
  );
}

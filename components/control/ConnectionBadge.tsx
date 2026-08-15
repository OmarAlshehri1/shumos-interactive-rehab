import type { ConnectionStatus } from "@/lib/realtime/types";

type DisplayStatus = ConnectionStatus | "syncing";

const STATUS_LABELS: Record<DisplayStatus, string> = {
  connected: "متصل",
  connecting: "جاري الاتصال",
  syncing: "جاري المزامنة",
  disconnected: "غير متصل",
};

const STATUS_DOT: Record<DisplayStatus, string> = {
  connected: "bg-emerald-500",
  connecting: "bg-amber-400 animate-pulse",
  syncing: "bg-amber-400 animate-pulse",
  disconnected: "bg-rose-500",
};

interface ConnectionBadgeProps {
  status: ConnectionStatus;
  /**
   * TASK 8: when the socket is up but we haven't received the first live
   * session snapshot yet, that's meaningfully different from "متصل" — the
   * badge says "جاري المزامنة" instead. Omit (or pass true) outside that
   * brief bootstrap window.
   */
  hasLoadedInitialSession?: boolean;
}

/** TASK 6/8: subtle, always-visible connection indicator — deliberately small, per spec ("do not turn connection status into a giant UI element"). */
export function ConnectionBadge({ status, hasLoadedInitialSession = true }: ConnectionBadgeProps) {
  const displayStatus: DisplayStatus = status === "connected" && !hasLoadedInitialSession ? "syncing" : status;
  return (
    <div className="pointer-events-none fixed top-2 start-2 z-40 flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-slate-500 shadow-sm">
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[displayStatus]}`} />
      {STATUS_LABELS[displayStatus]}
    </div>
  );
}

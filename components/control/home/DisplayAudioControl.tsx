"use client";

import { useEffect, useMemo, useState } from "react";
import { getStaffDb } from "@/lib/realtime/firebaseClient";
import { requestDisplayAudioEnable, subscribeToDisplayPresence } from "@/lib/realtime/sessionRepository";
import type { PresenceRecord } from "@/lib/realtime/types";

type ControlState = "not-ready" | "attempting" | "ready";

export function deriveDisplayAudioControlState(presence: PresenceRecord | null, pendingCommandId: string | null): ControlState {
  if (presence?.connected !== true) return "not-ready";
  if (presence?.connected === true && presence.audioStatus?.state === "ready") return "ready";
  if (pendingCommandId && presence?.audioStatus?.commandId !== pendingCommandId) return "attempting";
  if (pendingCommandId && presence?.audioStatus?.state === "attempting") return "attempting";
  return "not-ready";
}

export function DisplayAudioControl() {
  const [presence, setPresence] = useState<PresenceRecord | null>(null);
  const [pendingCommandId, setPendingCommandId] = useState<string | null>(null);
  const [sendFailed, setSendFailed] = useState(false);

  useEffect(() => {
    return subscribeToDisplayPresence(getStaffDb(), (next) => {
      setPresence(next);
      setPendingCommandId((pending) => {
        if (!pending) return null;
        const status = next?.audioStatus;
        if (next?.connected === true && status?.state === "ready") return null;
        if (status?.commandId === pending && status.state === "blocked") return null;
        return pending;
      });
    });
  }, []);

  const state = useMemo(
    () => deriveDisplayAudioControlState(presence, pendingCommandId),
    [pendingCommandId, presence],
  );
  const ready = state === "ready";

  const requestEnable = async () => {
    const id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `audio-${Date.now()}`;
    setPendingCommandId(id);
    setSendFailed(false);
    try {
      await requestDisplayAudioEnable(getStaffDb(), { id, requestedAt: Date.now() });
    } catch {
      setPendingCommandId(null);
      setSendFailed(true);
    }
  };

  const statusCopy =
    state === "ready"
      ? "✓ صوت شاشة العرض جاهز"
      : state === "attempting"
        ? "⏳ جاري تشغيل الصوت..."
        : "🔊 تشغيل صوت شاشة العرض";

  return (
    <section
      aria-label="التحكم بصوت شاشة العرض"
      className="fixed z-40 flex max-w-[calc(100vw-1rem)] flex-col items-start"
      style={{ top: "max(0.5rem, env(safe-area-inset-top))", left: "max(0.5rem, env(safe-area-inset-left))" }}
    >
      <button
        type="button"
        onClick={() => void requestEnable()}
        aria-live="polite"
        className={`flex min-h-8 touch-manipulation items-center justify-center rounded-full border px-3 py-1 text-xs font-bold shadow-sm backdrop-blur-sm transition-all active:scale-[0.98] ${
          ready
            ? "border-emerald-200 bg-emerald-50/95 text-emerald-800"
            : state === "attempting"
              ? "border-amber-300 bg-amber-50/95 text-amber-800"
              : "border-teal-200 bg-white/95 text-teal-800 ring-2 ring-teal-100 hover:bg-teal-50"
        }`}
      >
        {statusCopy}
      </button>

      {!ready && (
        <div role="alert" className="relative mt-3 w-64 max-w-[calc(100vw-1rem)] rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-right shadow-lg shadow-amber-900/10">
          <p className="text-sm font-extrabold text-amber-950">قبل بدء الجلسة</p>
          <p className="mt-0.5 text-sm font-semibold text-amber-800">اضغط هنا لتشغيل صوت شاشة العرض</p>
          {sendFailed && <p className="mt-1 text-xs font-semibold text-red-700">تعذّر إرسال الطلب. تحقق من الاتصال وحاول مرة أخرى.</p>}
          <span aria-hidden="true" className="absolute -top-2 left-8 h-4 w-4 rotate-45 border-t border-l border-amber-300 bg-amber-50" />
        </div>
      )}
    </section>
  );
}

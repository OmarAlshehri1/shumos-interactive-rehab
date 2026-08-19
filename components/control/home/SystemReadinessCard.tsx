"use client";

import { useEffect, useMemo, useState } from "react";
import { getStaffDb } from "@/lib/realtime/firebaseClient";
import { subscribeToDisplayPresence } from "@/lib/realtime/sessionRepository";
import type { PresenceRecord } from "@/lib/realtime/types";
import { SectionCard } from "@/components/control/ui/SectionCard";

export type ReadinessKind = "ready" | "not-ready" | "unknown";

export interface SystemReadinessState {
  display: ReadinessKind;
  audio: ReadinessKind;
}

/** Only the display's own acknowledgement may produce a ready state. */
export function deriveSystemReadiness(presence: PresenceRecord | null | undefined): SystemReadinessState {
  if (presence === undefined) return { display: "unknown", audio: "unknown" };
  if (!presence || presence.connected !== true) return { display: "not-ready", audio: "not-ready" };
  const audioReady = presence.audioStatus?.state === "ready" && presence.audioStatus.contextState === "running";
  return { display: "ready", audio: audioReady ? "ready" : "not-ready" };
}

const COPY: Record<"display" | "audio", Record<ReadinessKind, string>> = {
  display: {
    ready: "شاشة العرض متصلة",
    "not-ready": "شاشة العرض غير متصلة",
    unknown: "حالة شاشة العرض غير معروفة",
  },
  audio: {
    ready: "صوت شاشة العرض جاهز",
    "not-ready": "صوت شاشة العرض غير جاهز",
    unknown: "حالة الصوت غير معروفة",
  },
};

function ReadinessRow({ label, kind }: { label: string; kind: ReadinessKind }) {
  const marker = kind === "ready" ? "✓" : kind === "not-ready" ? "!" : "؟";
  const classes = kind === "ready" ? "bg-emerald-50 text-emerald-800" : kind === "not-ready" ? "bg-rose-50 text-rose-800" : "bg-slate-100 text-slate-600";
  return (
    <div className="flex min-h-12 items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4">
      <span aria-hidden="true" className={`grid h-7 w-7 place-items-center rounded-full text-sm font-black ${classes}`}>{marker}</span>
      <span className="text-sm font-bold text-slate-700">{label}</span>
    </div>
  );
}

export function SystemReadinessCard() {
  const [presence, setPresence] = useState<PresenceRecord | null | undefined>(undefined);

  useEffect(() => subscribeToDisplayPresence(getStaffDb(), setPresence), []);
  const state = useMemo(() => deriveSystemReadiness(presence), [presence]);

  return (
    <SectionCard title="جاهزية النظام" className="gap-3" aria-live="polite">
      <div className="grid gap-2 sm:grid-cols-2">
        <ReadinessRow label={COPY.display[state.display]} kind={state.display} />
        <ReadinessRow label={COPY.audio[state.audio]} kind={state.audio} />
      </div>
    </SectionCard>
  );
}

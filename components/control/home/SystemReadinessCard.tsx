"use client";

import { useEffect, useMemo, useState } from "react";
import { getStaffDb, isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { subscribeToDisplayPresence } from "@/lib/realtime/sessionRepository";
import type { PresenceRecord } from "@/lib/realtime/types";
import { SectionCard } from "@/components/control/ui/SectionCard";
import { useLeftHandSensorRuntime, useSensorRuntime } from "@/components/control/sensors/SensorRuntimeProvider";

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

function ReadinessRow({ label, kind, action }: { label: string; kind: ReadinessKind; action?: React.ReactNode }) {
  const marker = kind === "ready" ? "✓" : kind === "not-ready" ? "!" : "؟";
  const classes = kind === "ready" ? "bg-emerald-50 text-emerald-800" : kind === "not-ready" ? "bg-rose-50 text-rose-800" : "bg-slate-100 text-slate-600";
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-4">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className={`grid h-7 w-7 place-items-center rounded-full text-sm font-black ${classes}`}>{marker}</span>
        <span className="text-sm font-bold text-slate-700">{label}</span>
      </div>
      {action}
    </div>
  );
}

export interface SensorRowInput {
  readonly connected: boolean;
  readonly connecting: boolean;
  readonly reconnecting: boolean;
  readonly liveRateHz: number | null;
  /**
   * That hand's own SensorRuntime.error, if any (tonight's dual-sensor
   * brief, section 4's "خطأ" state) — real signal already produced by
   * useSensorHandRuntime's connect()/BLE-layer failures, not a new
   * fabricated status. Only shown while genuinely idle (not mid-
   * connect/reconnect, which already have their own copy) — a stale error
   * from a previous failed attempt must not keep showing "خطأ" forever once
   * a fresh attempt is in flight.
   */
  readonly error?: string | null;
}

export interface SensorRowDerived {
  readonly kind: ReadinessKind;
  readonly label: string;
  readonly needsManualAction: boolean;
}

/**
 * Pure so the copy/kind/action-visibility logic is unit-testable without a
 * DOM or SensorRuntimeProvider harness (this codebase's established
 * pattern — see deriveSystemReadiness above for the display/audio
 * equivalent). Deliberately never surfaces BLE UUIDs, filter mode, or
 * yaw/pitch/roll — only connected/reconnecting/live-Hz/error, the facts a
 * clinic-floor therapist actually needs at a glance.
 */
export function deriveSensorRow(sensorName: string, input: SensorRowInput): SensorRowDerived {
  const kind: ReadinessKind = input.connected ? "ready" : "not-ready";
  const idle = !input.connected && !input.connecting && !input.reconnecting;
  const label = input.connected
    ? `${sensorName} متصل${input.liveRateHz !== null ? ` · ${Math.round(input.liveRateHz)} Hz` : ""}`
    : input.reconnecting
      ? `${sensorName} — جاري إعادة الاتصال…`
      : input.connecting
        ? `${sensorName} — جاري الاتصال…`
        : idle && input.error
          ? `${sensorName} — خطأ`
          : `${sensorName} غير متصل`;
  const needsManualAction = idle;
  return { kind, label, needsManualAction };
}

/**
 * One hand's row, reading the SAME shared SensorRuntimeProvider every game
 * uses (see components/control/sensors/SensorRuntimeProvider.tsx) — never
 * a separate/faked status. A manual "ربط" action only appears when one is
 * genuinely needed (not connected, and no automatic reconnect currently in
 * flight) — see SensorRuntimeProvider's automatic-reconnect doc comment for
 * when that is. RIGHT_HAND and LEFT_HAND each render their own independent
 * instance of this — one sensor's connecting/error state can never make the
 * other hand's row look anything but exactly what ITS OWN runtime reports
 * (tonight's dual-sensor brief, section 4: "one sensor failing must not
 * make the other sensor appear failed").
 */
function HandSensorRow({ label, runtime }: { label: string; runtime: ReturnType<typeof useSensorRuntime> }) {
  const { connected, connecting, reconnecting, liveRateHz, error, connect } = runtime;
  const { kind, label: rowLabel, needsManualAction } = deriveSensorRow(label, { connected, connecting, reconnecting, liveRateHz, error });

  return (
    <ReadinessRow
      label={rowLabel}
      kind={kind}
      action={
        needsManualAction ? (
          <button type="button" onClick={() => void connect()} className="rounded-xl bg-teal-600 px-3 py-1.5 text-xs font-bold text-white">ربط</button>
        ) : undefined
      }
    />
  );
}

export function SystemReadinessCard() {
  const [presence, setPresence] = useState<PresenceRecord | null | undefined>(undefined);
  const realtimeEnabled = isRealtimeEnabled();
  const rightHand = useSensorRuntime();
  const leftHand = useLeftHandSensorRuntime();

  useEffect(() => {
    if (!realtimeEnabled) return;
    return subscribeToDisplayPresence(getStaffDb(), setPresence);
  }, [realtimeEnabled]);
  const state = useMemo(() => deriveSystemReadiness(presence), [presence]);

  return (
    <SectionCard title="جاهزية النظام" className="gap-3" aria-live="polite">
      <div className="flex flex-col gap-2">
        {realtimeEnabled && <ReadinessRow label={COPY.display[state.display]} kind={state.display} />}
        {realtimeEnabled && <ReadinessRow label={COPY.audio[state.audio]} kind={state.audio} />}
        <HandSensorRow label="حساس اليد اليمنى" runtime={rightHand} />
        <HandSensorRow label="حساس اليد اليسرى" runtime={leftHand} />
      </div>
    </SectionCard>
  );
}

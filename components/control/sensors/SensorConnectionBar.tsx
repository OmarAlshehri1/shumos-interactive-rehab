"use client";

import { useSensorRuntime } from "./SensorRuntimeProvider";
import { ConnectionState } from "@/lib/physicalInput";

/**
 * One consistent connect/status header, reused across every sensor-play
 * route — therapist/setup-facing only (see its doc comment on
 * SensorRuntimeProvider: never render this on the child/projector view).
 * Technical BLE detail (live Hz, filter picker) stays confined to here.
 */
export function SensorConnectionBar() {
  const { connection, connected, connecting, reconnecting, sample, centered, liveRateHz, error, rateNote, connect, disconnect, recenter } = useSensorRuntime();

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <StatusDot state={connection} reconnecting={reconnecting} />
          <div>
            <p className="text-sm font-bold">{reconnecting ? "جاري إعادة الاتصال…" : connectionLabel(connection)}</p>
            <p className="text-xs text-slate-500">{readinessLabel(connected, centered, !!sample)}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {connected ? (
            <button type="button" onClick={disconnect} className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-bold text-red-600">فصل</button>
          ) : (
            <button type="button" onClick={connect} disabled={connecting} className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">
              {reconnecting ? "جاري إعادة الاتصال…" : connecting ? "جاري الاتصال…" : "ربط حساس اليد اليمنى"}
            </button>
          )}
          <button
            type="button"
            onClick={recenter}
            disabled={!connected || !sample}
            title="للمعالج فقط — إعادة ضبط المرجع يدويًا؛ اللعب العادي لا يحتاجها"
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-500 disabled:opacity-40"
          >
            إعادة التمركز (اختياري للمعالج)
          </button>
        </div>
      </div>
      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      {connected && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600">
          <span>المعدل الحي: {liveRateHz === null ? "—" : `${liveRateHz.toFixed(1)} Hz`}</span>
          {rateNote && <span className="text-teal-700">{rateNote}</span>}
        </div>
      )}
    </section>
  );
}

function readinessLabel(connected: boolean, centered: boolean, hasSample: boolean): string {
  if (!connected) return "اربط الحساس لبدء اللعب";
  if (centered) return "جاهز للعب ✓";
  if (hasSample) return "جاري التهيئة التلقائية…";
  return "بانتظار أول قراءة من الحساس…";
}

function connectionLabel(state: ConnectionState): string {
  if (state === ConnectionState.CONNECTED) return "متصل ويستقبل بيانات";
  if (state === ConnectionState.CONNECTING) return "جاري الاتصال…";
  if (state === ConnectionState.ERROR) return "خطأ في الاتصال";
  return "غير متصل";
}

function StatusDot({ state, reconnecting }: { state: ConnectionState; reconnecting: boolean }) {
  const color = state === ConnectionState.CONNECTED ? "bg-emerald-500" : state === ConnectionState.CONNECTING || reconnecting ? "bg-amber-400" : "bg-slate-300";
  return <span className={`h-3 w-3 rounded-full ${color}`} />;
}

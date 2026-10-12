"use client";

import { type MotionFilterMode } from "@/lib/physicalInput";
import { SensorPlayPage } from "./SensorPlayPage";
import { useSensorRuntime } from "./SensorRuntimeProvider";
import { CanonicalBalloonContactDemo } from "./CanonicalBalloonContactDemo";

const FILTERS: readonly { mode: MotionFilterMode; short: string; label: string }[] = [
  { mode: "ADAPTIVE_EMA", short: "B", label: "متوازن (الافتراضي)" },
  { mode: "ONE_EURO", short: "C", label: "ذكي" },
  { mode: "LIGHT_EMA", short: "A", label: "أسرع" },
];

/**
 * Playable RIGHT_HAND prototype: connect -> auto-center -> play, no manual
 * step and no diagnostic gate. Reads the shared SensorRuntimeProvider (see
 * app/control/layout.tsx) via SensorPlayPage instead of owning its own
 * BLE/controller instance, so the connection this page establishes survives
 * navigating to any other /control/* route and back. Reuses
 * CanonicalBalloonContactDemo's existing continuous-pointer ->
 * ContactActivationGate -> selectBalloon pipeline as-is.
 */
export function RightHandBalloonPlayable() {
  const { pointer, connected, filterMode, selectFilter } = useSensorRuntime();

  return (
    <SensorPlayPage eyebrow="RIGHT_HAND · نموذج أولي قابل للعب" title="مغامرة البالونات — تحكم باليد الحقيقية">
      {() => (
        <>
          <section className="rounded-3xl border border-slate-200 bg-white p-3">
            <div className="grid grid-cols-3 gap-2">
              {FILTERS.map((filter) => (
                <button
                  key={filter.mode}
                  type="button"
                  onClick={() => selectFilter(filter.mode)}
                  className={`rounded-xl px-2 py-3 text-sm font-bold ${filterMode === filter.mode ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-600"}`}
                >
                  <span dir="ltr">{filter.short}</span>
                  <small className="mt-1 block text-[10px] opacity-80">{filter.label}</small>
                </button>
              ))}
            </div>
          </section>
          <CanonicalBalloonContactDemo pointer={pointer} connected={connected} />
        </>
      )}
    </SensorPlayPage>
  );
}

"use client";

import Link from "next/link";
import { useSensorRuntime } from "./SensorRuntimeProvider";
import { SensorConnectionBar } from "./SensorConnectionBar";

/**
 * Shared shell for every "<game> sensor play" route: header, back link,
 * SensorConnectionBar, and the "connect first" placeholder — factored out
 * once RightHandBalloonPlayable's original layout needed repeating for
 * Follow the Footsteps / Bubble Pop Wall / Color Chase,
 * so the connect/status UI reads identically everywhere (Part
 * "SENSOR CONNECTION UX ACROSS GAMES").
 */
export function SensorPlayPage({ eyebrow, title, children }: { eyebrow: string; title: string; children: (centered: boolean) => React.ReactNode }) {
  const { connected, centered } = useSensorRuntime();

  return (
    <main dir="rtl" lang="ar" className="min-h-dvh bg-[#eff9f8] text-slate-900" style={{ fontFamily: "var(--font-control), system-ui, sans-serif" }}>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 sm:px-7 lg:py-7">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-xs font-bold text-teal-700">{eyebrow}</span>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{title}</h1>
          </div>
          <Link href="/control" className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm">رجوع</Link>
        </header>

        <SensorConnectionBar />

        {centered ? (
          children(centered)
        ) : (
          <section className="rounded-3xl border border-dashed border-slate-300 p-5 text-center text-sm font-semibold text-slate-500">
            {connected ? "جاري ربط حساس الحركة…" : "اربط الحساس أولًا."}
          </section>
        )}
        <p className="pb-2 text-center text-xs text-slate-500">لا تُرسل هذه الصفحة بيانات إلى Firebase أو Munsit.</p>
      </div>
    </main>
  );
}

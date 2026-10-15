"use client";

import { useState } from "react";
import { ControlPageNav } from "@/components/control/nav/ControlPageNav";
import { GameCard } from "@/components/control/library/GameCard";
import { ResetLiveDisplayOnMount } from "@/components/control/live/ResetLiveDisplayOnMount";
import { ControlNav } from "@/components/control/nav/ControlNav";
import { createQuickSessionLaunch, gamesForQuickSessionSurface } from "@/lib/control/quickSession";
import type { SurfaceType } from "@/lib/games/registry";
import { usePatientContext } from "@/lib/patients/PatientSessionContext";

export function QuickSessionScreen() {
  const [name, setName] = useState("");
  const [surface, setSurface] = useState<SurfaceType | null>(null);
  const patient = usePatientContext();
  const games = surface ? gamesForQuickSessionSurface(surface) : [];
  const validName = name.trim().length > 0;

  return (
    <main dir="rtl" lang="ar" className="fixed inset-0 h-dvh w-dvw overflow-y-auto bg-slate-50 text-slate-900" style={{ fontFamily: "var(--font-control), system-ui, sans-serif" }}>
      <ResetLiveDisplayOnMount />
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-6 px-5 py-8 sm:px-8 sm:py-10">
        <ControlPageNav backHref="/control" backLabel="الرئيسية" />
        <ControlNav active="home" />
        <header className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-3xl font-bold">جلسة سريعة</h1>
          <p className="text-sm text-slate-500">بدون إنشاء ملف مريض دائم</p>
        </header>

        <section className="mx-auto flex w-full max-w-2xl flex-col gap-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <label className="flex flex-col gap-2 text-sm font-bold text-slate-700">
            اسم الطفل الأول
            <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="اكتب الاسم الأول" className="min-h-14 rounded-2xl border-2 border-slate-200 px-4 text-lg outline-none focus:border-teal-600" />
          </label>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-bold text-slate-700">مكان النشاط</span>
            <div className="grid grid-cols-2 gap-3">
              {([['FLOOR', 'ألعاب الأرض'], ['WALL', 'ألعاب الجدار']] as const).map(([value, label]) => (
                <button key={value} type="button" disabled={!validName} onClick={() => setSurface(value)} className={`min-h-14 rounded-2xl border-2 px-3 font-bold transition-colors disabled:opacity-40 ${surface === value ? "border-teal-600 bg-teal-600 text-white" : "border-slate-200 bg-white text-slate-700"}`}>{label}</button>
              ))}
            </div>
          </div>
        </section>

        {surface && (
          <section className="flex flex-col gap-4 rounded-3xl border border-teal-100 bg-teal-50/45 p-4 sm:p-6">
            <h2 className="text-xl font-bold">اختر اللعبة</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {games.map((game) => (
                <GameCard key={game.id} game={game} onSelect={() => {
                  const launch = createQuickSessionLaunch(name, game);
                  patient.selectWalkIn(launch.childFirstName);
                }} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

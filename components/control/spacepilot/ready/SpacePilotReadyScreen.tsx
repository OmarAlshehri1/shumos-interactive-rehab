"use client";

import { useState } from "react";
import { Difficulty, isEncounterStage, totalStarsFor, type SpacePilotSessionState } from "@/lib/spacepilot";
import { ConfirmSheet } from "@/components/control/live/ConfirmSheet";

interface SpacePilotReadyScreenProps {
  session: SpacePilotSessionState;
  onStart: () => void;
  onEdit: () => void;
  onCancel: () => void;
  displayConnected?: boolean;
  displayFullscreen?: boolean;
}

const STAGE_TITLE_AR: Record<Difficulty, string> = {
  [Difficulty.EASY]: "رحلة النجوم",
  [Difficulty.MEDIUM]: "حزام النيازك",
  [Difficulty.ADVANCED]: "مهمة المجرة",
};

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-3 last:border-b-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-base font-semibold text-slate-900">{value}</span>
    </div>
  );
}

/** Space Pilot's own READY confirmation screen — same three-tier action hierarchy as every other game's ready screen, single-level preview instead of a difficulty/stage summary. */
export function SpacePilotReadyScreen({ session, onStart, onEdit, onCancel, displayConnected, displayFullscreen }: SpacePilotReadyScreenProps) {
  const { config, currentDifficulty, currentStage } = session;
  const hasFire = isEncounterStage(currentStage);
  const [confirmCancel, setConfirmCancel] = useState(false);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center gap-8 px-5 py-8 sm:px-8">
      <div className="flex flex-col items-center gap-1.5 text-center">
        <span className="text-xs font-semibold tracking-wide text-indigo-600 uppercase">جاهز للبدء</span>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">{config.childFirstName}</h1>
      </div>

      <div className="w-full rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <SummaryRow label="النشاط" value={STAGE_TITLE_AR[currentDifficulty]} />
        <SummaryRow label="النجوم" value={`${totalStarsFor(currentDifficulty)} نجوم`} />
      </div>

      <div className="w-full overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-b from-[#0b1030] to-[#161c4a] p-5 text-center shadow-sm">
        <p className="text-sm font-semibold text-indigo-200">{hasFire ? "استخدم الأسهم لتحريك الصاروخ، واضغط إطلاق لتدمير النيازك" : "استخدم الأسهم لتحريك الصاروخ"}</p>
        <div className="mt-4 flex items-center justify-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/20 text-2xl font-bold text-indigo-100">▲</span>
          {hasFire && <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/20 text-sm font-bold text-rose-100">إطلاق</span>}
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/20 text-2xl font-bold text-indigo-100">▼</span>
        </div>
        <p className="mt-4 text-xs text-indigo-300">
          {hasFire ? "اجمع النجوم، وتفادَ النيازك بتغيير المسار أو دمّرها بالإطلاق" : "اجمع النجوم عن طريق الانتقال إلى نفس المسار قبل وصولها"}
        </p>
      </div>

      {displayConnected !== undefined && (
        <div
          className={`flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold ${
            displayConnected ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
          }`}
        >
          {displayConnected
            ? displayFullscreen
              ? "شاشة العرض متصلة ✓ · وضع ملء الشاشة ⛶"
              : "شاشة العرض متصلة ✓ · لم يتم تفعيل ملء الشاشة بعد"
            : "⚠ شاشة العرض غير متصلة حاليًا"}
        </div>
      )}

      <div className="flex w-full flex-col gap-3">
        <button
          type="button"
          onClick={onStart}
          className="min-h-16 touch-manipulation rounded-2xl bg-indigo-600 text-xl font-bold text-white shadow-lg shadow-indigo-900/15 transition-all active:scale-[0.98]"
        >
          ابدأ الرحلة
        </button>
        <button type="button" onClick={onEdit} className="min-h-12 touch-manipulation rounded-2xl text-base font-medium text-slate-500 transition-colors active:text-slate-700">
          تعديل الإعدادات
        </button>
        <button
          type="button"
          onClick={() => setConfirmCancel(true)}
          className="min-h-10 touch-manipulation text-sm font-medium text-rose-400 transition-colors active:text-rose-600"
        >
          إلغاء الجلسة والعودة للأنشطة
        </button>
      </div>

      <ConfirmSheet
        open={confirmCancel}
        title="إلغاء الجلسة؟"
        description="لم تبدأ الجلسة بعد. سيتم التراجع عن هذا الإعداد والعودة إلى الأنشطة."
        confirmLabel="إلغاء الجلسة"
        destructive
        onConfirm={() => {
          setConfirmCancel(false);
          onCancel();
        }}
        onCancel={() => setConfirmCancel(false)}
      />
    </div>
  );
}

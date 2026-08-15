"use client";

import { STAGES_PER_DIFFICULTY, type SessionState } from "@/lib/game";
import { DIFFICULTY_LABELS, PLAY_AREA_LABELS, TARGET_SIZE_LABELS, TARGET_SPACING_LABELS } from "../copy";

interface ReadyScreenProps {
  session: SessionState;
  onStart: () => void;
  onEdit: () => void;
  /** TASK 6: undefined in local mode (nothing rendered); a boolean once connected to Firebase — whether /display currently has an active tab. */
  displayConnected?: boolean;
  /** TASK 9 PART 4: best-effort — whether /display currently reports being in browser fullscreen. Only meaningful (and shown) once displayConnected is true. */
  displayFullscreen?: boolean;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-3 last:border-b-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-base font-semibold text-slate-900">{value}</span>
    </div>
  );
}

export function ReadyScreen({ session, onStart, onEdit, displayConnected, displayFullscreen }: ReadyScreenProps) {
  const { config } = session;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-8 px-5 py-8 sm:px-8">
      <div className="flex flex-col items-center gap-1.5 text-center">
        <span className="text-xs font-semibold tracking-wide text-teal-600 uppercase">جاهز للبدء</span>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">{config.childFirstName}</h1>
      </div>

      <div className="w-full rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <SummaryRow label="المستوى" value={DIFFICULTY_LABELS[config.difficulty].name} />
        {/* TASK 12: one final confirmation of the manually-chosen starting point before the child ever sees a balloon. */}
        <SummaryRow label="مرحلة البداية" value={`${config.startingStage} من ${STAGES_PER_DIFFICULTY}`} />
        <SummaryRow label="حجم الأهداف" value={TARGET_SIZE_LABELS[config.targetSize]} />
        <SummaryRow label="المسافات" value={TARGET_SPACING_LABELS[config.targetSpacing]} />
        <SummaryRow label="منطقة اللعب" value={PLAY_AREA_LABELS[config.playArea]} />
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
          className="min-h-16 touch-manipulation rounded-2xl bg-teal-600 text-xl font-bold text-white shadow-lg shadow-teal-900/15 transition-all active:scale-[0.98]"
        >
          ابدأ المغامرة
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="min-h-12 touch-manipulation rounded-2xl text-base font-medium text-slate-500 transition-colors active:text-slate-700"
        >
          تعديل الإعدادات
        </button>
      </div>
    </div>
  );
}

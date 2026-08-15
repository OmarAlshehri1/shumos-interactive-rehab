"use client";

import { useState } from "react";
import { STAGES_PER_DIFFICULTY, type SessionState } from "@/lib/game";
import { ConfirmSheet } from "../live/ConfirmSheet";
import { DIFFICULTY_LABELS, PLAY_AREA_LABELS, TARGET_SIZE_LABELS, TARGET_SPACING_LABELS } from "../copy";

interface ReadyScreenProps {
  session: SessionState;
  onStart: () => void;
  onEdit: () => void;
  /** CONTROL UX POLISH TASK — the therapist's safe way to abandon this not-yet-started session entirely and return to Activities, instead of requiring browser Back (task section 11). */
  onCancel: () => void;
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

/**
 * CONTROL UX POLISH TASK — READY's three-tier action hierarchy (task
 * section 11): PRIMARY "ابدأ المغامرة", SECONDARY "تعديل الإعدادات"
 * (unchanged, both existed before), and a new TERTIARY safe cancel. Nothing
 * has been played yet at this point (session is still GameState.WELCOME —
 * no stage, no score), so cancelling here is low-stakes, but the task still
 * asks for an explicit confirmation rather than an instant, easy-to-fat-
 * finger action next to "ابدأ المغامرة".
 */
export function ReadyScreen({ session, onStart, onEdit, onCancel, displayConnected, displayFullscreen }: ReadyScreenProps) {
  const { config } = session;
  const [confirmCancel, setConfirmCancel] = useState(false);

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

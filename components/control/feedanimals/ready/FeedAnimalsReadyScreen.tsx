"use client";

import { useState } from "react";
import { STAGES_PER_DIFFICULTY, type FeedAnimalsSessionState } from "@/lib/feedanimals";
import { getFeedAnimalsStageCopy } from "@/lib/control/feedanimals/stageCopy";
import { ConfirmSheet } from "@/components/control/live/ConfirmSheet";
import { DIFFICULTY_LABELS } from "@/components/control/copy";
import { FeedAnimalsStagePreview } from "@/components/control/setup/previews/FeedAnimalsStagePreview";

interface FeedAnimalsReadyScreenProps {
  session: FeedAnimalsSessionState;
  onStart: () => void;
  onEdit: () => void;
  onCancel: () => void;
  displayConnected?: boolean;
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
 * THERAPIST SETUP SIMPLIFICATION — Feed the Animals' own READY confirmation
 * screen, same three-tier action hierarchy as every other game's ready
 * screens. The technical-field rows (حجم الطعام/ارتفاع الوصول/جهة الوصول/نمط
 * الحركة) are replaced by the same Stage Card preview + copy the setup
 * screen showed, built from the same getFeedAnimalsStageCopy source, so the
 * therapist sees exactly what they picked, in human language, with a visual
 * confirmation rather than a list of settings.
 */
export function FeedAnimalsReadyScreen({ session, onStart, onEdit, onCancel, displayConnected, displayFullscreen }: FeedAnimalsReadyScreenProps) {
  const { config } = session;
  const [confirmCancel, setConfirmCancel] = useState(false);
  const copy = getFeedAnimalsStageCopy(config.difficulty, config.startingStage);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center gap-8 px-5 py-8 sm:px-8">
      <div className="flex flex-col items-center gap-1.5 text-center">
        <span className="text-xs font-semibold tracking-wide text-amber-600 uppercase">جاهز للبدء</span>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">{config.childFirstName}</h1>
      </div>

      <div className="w-full rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <SummaryRow label="المستوى" value={DIFFICULTY_LABELS[config.difficulty].name} />
        <SummaryRow label="مرحلة البداية" value={`${config.startingStage} من ${STAGES_PER_DIFFICULTY}`} />
      </div>

      <div className="w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="relative" style={{ aspectRatio: "16 / 9" }}>
          <FeedAnimalsStagePreview difficulty={config.difficulty} stageNumber={config.startingStage} />
        </div>
        <div className="flex flex-col gap-1.5 p-4">
          <span className="text-xs font-semibold text-amber-600">إعداد المرحلة</span>
          <h2 className="text-base font-bold text-slate-900">{copy.title}</h2>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-slate-600">
            {copy.characteristics.map((item) => (
              <li key={item} className="flex items-center gap-1">
                <span className="h-1 w-1 rounded-full bg-slate-400" />
                {item}
              </li>
            ))}
          </ul>
        </div>
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
          className="min-h-16 touch-manipulation rounded-2xl bg-amber-600 text-xl font-bold text-white shadow-lg shadow-amber-900/15 transition-all active:scale-[0.98]"
        >
          ابدأ مغامرة السفاري
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

"use client";
import { ControlDialog } from "@/components/control/ui/ControlDialog";

import { useState } from "react";
import {
  CUSTOM_END_REASON_MAX_LENGTH,
  type EarlyEndSelection,
  type SessionEndReason,
} from "@/lib/sessions/workflowMetadata";

const OPTIONS: ReadonlyArray<{ value: SessionEndReason | null; label: string }> = [
  { value: null, label: "بدون تحديد" },
  { value: "CHILD_SATISFIED", label: "اكتفى الطفل" },
  { value: "CHILD_TIRED", label: "تعب الطفل" },
  { value: "CHANGE_ACTIVITY", label: "تغيير النشاط" },
  { value: "OTHER", label: "سبب آخر" },
];

interface EndSessionReasonSheetProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (selection: EarlyEndSelection) => void;
}

export function EndSessionReasonSheet({ open, onCancel, onConfirm }: EndSessionReasonSheetProps) {
  const [reason, setReason] = useState<SessionEndReason | null>(null);
  const [customReason, setCustomReason] = useState("");

  const reset = () => {
    setReason(null);
    setCustomReason("");
  };
  const cancel = () => {
    reset();
    onCancel();
  };

  if (!open) return null;

  return (
    <ControlDialog open title="سبب إنهاء الجلسة" onClose={cancel} role="dialog">
        <h2 id="end-session-reason-title" className="text-xl font-bold text-slate-900">لماذا تم إنهاء الجلسة؟</h2>
        <p className="mt-1 text-sm text-slate-500">اختياري — لا يؤثر على تقييم أداء الطفل.</p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {OPTIONS.map((option) => (
            <button
              key={option.value ?? "NONE"}
              type="button"
              aria-pressed={reason === option.value}
              onClick={() => setReason(option.value)}
              className={`min-h-12 rounded-2xl border px-4 text-right text-sm font-semibold transition-colors ${
                reason === option.value ? "border-teal-500 bg-teal-50 text-teal-800" : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {reason === "OTHER" && (
          <div className="mt-4">
            <label htmlFor="custom-end-reason" className="mb-1.5 block text-sm font-semibold text-slate-700">السبب</label>
            <input
              id="custom-end-reason"
              value={customReason}
              onChange={(event) => setCustomReason(event.target.value.slice(0, CUSTOM_END_REASON_MAX_LENGTH))}
              maxLength={CUSTOM_END_REASON_MAX_LENGTH}
              className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
              placeholder="اكتب سببًا مختصرًا — اختياري"
            />
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button type="button" onClick={cancel} className="min-h-12 rounded-2xl border border-slate-200 bg-white font-bold text-slate-700">إلغاء</button>
          <button
            type="button"
            onClick={() => {
              onConfirm({ reason, customReason: reason === "OTHER" ? customReason : "" });
              reset();
            }}
            className="min-h-12 rounded-2xl bg-rose-600 font-bold text-white shadow-lg shadow-rose-900/15"
          >
            إنهاء الجلسة
          </button>
        </div>
      </ControlDialog>
  );
}

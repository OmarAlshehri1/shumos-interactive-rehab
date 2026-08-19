"use client";

import { useState } from "react";
import { saveSessionTherapistNote } from "@/lib/sessions/sessionHistoryRepository";
import { THERAPIST_NOTE_MAX_LENGTH } from "@/lib/sessions/workflowMetadata";

export function TherapistNoteEditor({ patientId, sessionId, initialNote = "" }: { patientId: string; sessionId: string; initialNote?: string }) {
  const [note, setNote] = useState(initialNote);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const save = async () => {
    setStatus("saving");
    try {
      const saved = await saveSessionTherapistNote(patientId, sessionId, note);
      setNote(saved);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <label htmlFor={`therapist-note-${sessionId}`} className="text-sm font-bold text-slate-800">ملاحظات الأخصائي</label>
      <p className="text-xs text-slate-500">أضف ملاحظة مختصرة عن الجلسة — اختياري</p>
      <textarea
        id={`therapist-note-${sessionId}`}
        value={note}
        onChange={(event) => { setNote(event.target.value.slice(0, THERAPIST_NOTE_MAX_LENGTH)); setStatus("idle"); }}
        maxLength={THERAPIST_NOTE_MAX_LENGTH}
        rows={4}
        className="resize-y rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-800 outline-none focus:border-teal-600"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-slate-400">{note.length} / {THERAPIST_NOTE_MAX_LENGTH}</span>
        <div className="flex items-center gap-3">
          {status === "saved" && <span className="text-sm font-bold text-emerald-700" role="status">تم حفظ الملاحظة ✓</span>}
          {status === "error" && <span className="text-sm font-semibold text-rose-700" role="alert">تعذّر الحفظ. حاول مرة أخرى.</span>}
          <button
            type="button"
            onClick={() => void save()}
            disabled={status === "saving"}
            className="min-h-11 rounded-xl bg-teal-600 px-5 text-sm font-bold text-white disabled:opacity-50"
          >
            {status === "saving" ? "جاري الحفظ..." : "حفظ الملاحظة"}
          </button>
        </div>
      </div>
    </div>
  );
}

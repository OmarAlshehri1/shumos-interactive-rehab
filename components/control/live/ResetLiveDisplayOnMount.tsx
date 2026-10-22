"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGameSafety } from "@/components/control/visits/GameSafetyProvider";
import { usePatientContext } from "@/lib/patients/PatientSessionContext";
import { getPatient } from "@/lib/patients/patientRepository";
import { getGameById } from "@/lib/games/registry";
import { isUnstartedActivity } from "@/lib/therapyVisits/gameSafety";
import { getStaffDb } from "@/lib/realtime/firebaseClient";
import { canResumeSession, dismissCompletedSession } from "@/lib/realtime/dismissCompletedSession";

/** Navigation never resets progress. Recovery/end is an explicit therapist choice. */
export function ResetLiveDisplayOnMount() {
  const safety = useGameSafety(), patient = usePatientContext(), router = useRouter();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const record = safety.live;
  const game = record?.gameId ? getGameById(record.gameId) : null;
  if (!safety.known || !record || !game) return null;
  const preview = isUnstartedActivity(record), complete = record.session.gameState === "SESSION_COMPLETE";
  const resume = async () => {
    setBusy(true); setError("");
    try {
      if (!canResumeSession(getStaffDb(), record)) throw Error("foreign-owner");
      // Reuse the record's pinned identity; never resume into whichever patient
      // happened to be selected on the homepage.
      if (record.patientId) {
        const original = await getPatient(record.patientId);
        if (!original) throw Error("missing-patient");
        patient.selectPatient(original);
      } else patient.selectWalkIn(record.session.config.childFirstName);
      router.push(game.route);
    } catch { setError("تعذّر استعادة سياق النشاط. لم يُغيّر تقدمه."); setBusy(false); }
  };
  const dismiss = async () => {
    setBusy(true); setError("");
    try {
      if (!await dismissCompletedSession(getStaffDb(), record.sessionId, record.revision)) setError("تغيّر النشاط أو لم يتأكد حفظه. عُد إلى أدوات النشاط.");
    } catch { setError("تعذّر إغلاق العرض. لم يُحذف تقدم أو سجل محفوظ."); }
    finally { setBusy(false); }
  };
  return <section dir="rtl" role="status" className="mx-5 mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
    <p>{preview ? "يوجد إعداد سابق لم يبدأ" : complete ? "يوجد نشاط منتهٍ" : "يوجد نشاط غير مكتمل"}: {game.nameAr}</p>
    <p className="mt-1">{preview ? "الإعداد محفوظ، ولا تعيد شاشة العرض فتحه بعد توقف التحكم." : "التقدم محفوظ في النشاط. استأنفه أو أنهِه بأمان من أدواته."}</p>
    <button disabled={busy || !safety.connected} onClick={() => void resume()} className="mt-2 min-h-11 rounded-lg bg-white px-4 font-bold text-teal-800">{preview ? "فتح إعداد النشاط" : "استئناف أو إنهاء النشاط"}</button>
    {complete && safety.canLeave && <button disabled={busy || !safety.connected} onClick={() => void dismiss()} className="ms-2 mt-2 min-h-11 rounded-lg bg-white px-4 font-bold text-teal-800">إنهاء العرض والعودة للترحيب</button>}
    {error && <p role="alert">{error}</p>}
  </section>;
}

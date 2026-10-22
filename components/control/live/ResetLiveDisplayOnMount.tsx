"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGameSafety } from "@/components/control/visits/GameSafetyProvider";
import { usePatientContext } from "@/lib/patients/PatientSessionContext";
import { getPatient } from "@/lib/patients/patientRepository";
import { getGameById } from "@/lib/games/registry";
import { isUnstartedActivity } from "@/lib/therapyVisits/gameSafety";
import { getStaffDb } from "@/lib/realtime/firebaseClient";
import { discardUnstartedPreview } from "@/lib/realtime/sessionRepository";
import { controlTabId } from "@/lib/liveGame/ownership";
import { canResumeSession, dismissCompletedSession } from "@/lib/realtime/dismissCompletedSession";
import { TherapistButton } from "@/components/control/ui/TherapistSurface";
import ui from "@/components/control/ui/therapist.module.css";
import styles from "./recovery.module.css";

/** One presentation of the existing recovery/ownership flow; never deletes on navigation or hide. */
export function ResetLiveDisplayOnMount() {
  const safety = useGameSafety(), patient = usePatientContext(), router = useRouter();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [hiddenPreview, setHiddenPreview] = useState<string | null>(null);
  const record = safety.live;
  const game = record?.gameId ? getGameById(record.gameId) : null;
  if (!safety.known || !record || !game) return null;
  const preview = isUnstartedActivity(record), complete = record.session.gameState === "SESSION_COMPLETE";
  const resume = async () => {
    setBusy(true); setError("");
    try {
      if (!canResumeSession(getStaffDb(), record)) throw Error("foreign-owner");
      // Preserve the pinned patient/visit and recover using the game's own route.
      if (record.patientId) {
        const original = await getPatient(record.patientId);
        if (!original) throw Error("missing-patient");
        patient.selectPatient(original);
      } else patient.selectWalkIn(record.session.config.childFirstName);
      router.push(game.route);
    } catch { setError("تعذّر استعادة سياق النشاط. لم يُغيّر تقدمه."); setBusy(false); }
  };
  const discard = async () => {
    if (!window.confirm("حذف هذا الإعداد الذي لم يبدأ؟ لن يُحذف أي سجل محفوظ.")) return;
    setBusy(true); setError("");
    try {
      if (!canResumeSession(getStaffDb(), record) || !await discardUnstartedPreview(getStaffDb(), record.sessionId, controlTabId())) setError("تغيّر الإعداد أو تملكه نافذة أخرى. استكمل الإعداد من نافذته أولًا.");
    } catch { setError("تعذّر حذف الإعداد. لم يُغيّر أي تقدم أو سجل محفوظ."); }
    finally { setBusy(false); }
  };
  const dismiss = async () => {
    setBusy(true); setError("");
    try {
      if (!await dismissCompletedSession(getStaffDb(), record.sessionId, record.revision)) setError("لم يتأكد حفظ النتائج بعد. افتح نتائج النشاط لإتمام الحفظ.");
    } catch { setError("تعذّر إغلاق العرض. لم يُحذف تقدم أو سجل محفوظ."); }
    finally { setBusy(false); }
  };
  if (preview && hiddenPreview === record.sessionId) return <section className={`${ui.theme} ${styles.folded}`} data-testid="session-recovery"><span>إعداد محفوظ: {game.nameAr}</span><button type="button" onClick={() => setHiddenPreview(null)}>إظهار التذكير</button></section>;
  return <section dir="rtl" className={`${ui.theme} ${styles.recovery}`} aria-label="استعادة نشاط سابق" data-testid="session-recovery" data-kind={preview ? "preview" : complete ? "complete" : "unfinished"}>
    <div className={styles.copy}><span className={styles.label}>{preview ? "إعداد لم يبدأ" : complete ? "نتائج نشاط منتهٍ" : "جلسة غير مكتملة"}</span><h2>{game.nameAr}</h2><p>{preview ? "يمكنك استكماله أو حذف الإعداد فقط." : complete ? safety.canLeave ? "تأكد حفظ النتائج. يمكنك إغلاق العرض بأمان." : "النتائج محفوظة داخل النشاط. افتحها لإتمام الحفظ." : "تقدم الطفل محفوظ. استكمل الجلسة أو أنهِها من أدوات النشاط."}</p></div>
    <div className={styles.actions}><TherapistButton tone="primary" disabled={busy || !safety.connected} onClick={() => void resume()}>{preview ? "استكمال الإعداد" : complete ? "فتح النتائج" : "استكمال الجلسة"}</TherapistButton>
      {preview && <TherapistButton disabled={busy || !safety.connected} onClick={() => void discard()}>حذف الإعداد</TherapistButton>}
      {!preview && !complete && <TherapistButton disabled={busy || !safety.connected} onClick={() => void resume()}>إنهاء بأمان من النشاط</TherapistButton>}
      {complete && safety.canLeave && <TherapistButton disabled={busy || !safety.connected} onClick={() => void dismiss()}>إغلاق العرض</TherapistButton>}
      {preview && <button className={styles.hide} type="button" disabled={busy} onClick={() => setHiddenPreview(record.sessionId)}>إخفاء التذكير</button>}
    </div>
    {error && <p className={ui.error} role="alert">{error}</p>}
  </section>;
}

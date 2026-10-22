"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePatientContext } from "@/lib/patients/PatientSessionContext";
import { getPatient } from "@/lib/patients/patientRepository";
import { getGameById } from "@/lib/games/registry";
import { isUnstartedActivity } from "@/lib/therapyVisits/gameSafety";
import { getStaffDb } from "@/lib/realtime/firebaseClient";
import { discardUnstartedPreview } from "@/lib/realtime/sessionRepository";
import { controlTabId } from "@/lib/liveGame/ownership";
import { canResumeSession } from "@/lib/realtime/dismissCompletedSession";
import type { LiveSessionRecord } from "@/lib/realtime/types";
import { useTherapistConfirmation } from "@/components/control/ui/TherapistConfirmation";
import { TherapistButton } from "@/components/control/ui/TherapistSurface";
import ui from "@/components/control/ui/therapist.module.css";
import styles from "./recoveryCard.module.css";

/**
 * The one recovery surface. Both actions reuse the existing lifecycle: returning restores the pinned patient and opens the
 * game's own recovery route; ending discards only a verified-empty setup, otherwise opens the game so its own confirmed
 * end/save workflow runs. Nothing here deletes progress or writes history.
 */
export function ActivityRecoveryCard({ record, connected }: { record: LiveSessionRecord; connected: boolean }) {
  const confirmation = useTherapistConfirmation();
  const patient = usePatientContext(), router = useRouter();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const game = record.gameId ? getGameById(record.gameId) : null;
  if (!game) return null;
  const preview = isUnstartedActivity(record), complete = record.session.gameState === "SESSION_COMPLETE";
  const resume = async () => {
    setBusy(true); setError("");
    try {
      if (!canResumeSession(getStaffDb(), record)) throw Error("foreign-owner");
      if (record.patientId) {
        const original = await getPatient(record.patientId);
        if (!original) throw Error("missing-patient");
        patient.selectPatient(original);
      } else patient.selectWalkIn(record.session.config.childFirstName);
      router.push(game.route);
    } catch { setError("تعذّر استعادة النشاط. لم يتغيّر تقدمه."); setBusy(false); }
  };
  const discard = async () => {
    if (!canResumeSession(getStaffDb(), record) || !await discardUnstartedPreview(getStaffDb(), record.sessionId, controlTabId()))
      throw Error("preview-changed");
  };
  const end = () => confirmation.ask(preview
    ? { title: "إنهاء الإعداد الذي لم يبدأ؟", description: "يُحذف هذا الإعداد الفارغ فقط. لا يتأثر أي تقدم أو سجل محفوظ.", confirmLabel: "إنهاء الإعداد", action: discard }
    : complete
      ? { title: "حفظ النتائج وإنهاء النشاط؟", description: "سيُفتح النشاط لإتمام حفظ النتائج. لا تُحذف أي نتيجة.", confirmLabel: "متابعة الحفظ", action: resume }
      : { title: "إنهاء النشاط؟", description: "سيُفتح النشاط لتنهيه من أدواته فيُحفظ ما أنجزه الطفل. لا يُحذف أي تقدم.", confirmLabel: "متابعة الإنهاء", action: resume });
  return <section dir="rtl" className={`${ui.theme} ${styles.card}`} role="status" aria-label="نشاط يحتاج إجراءً" data-testid="session-recovery" data-kind={preview ? "preview" : complete ? "complete" : "unfinished"}>
    <div className={styles.copy}><span>{preview ? "إعداد لم يبدأ" : complete ? "نتائج تنتظر الحفظ" : "نشاط غير منتهٍ"}</span><strong>{game.nameAr}</strong></div>
    <div className={styles.actions}>
      <TherapistButton tone="primary" disabled={busy || !connected} onClick={() => void resume()}>العودة إلى النشاط</TherapistButton>
      <TherapistButton disabled={busy || !connected} onClick={end}>إنهاء النشاط</TherapistButton>
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {confirmation.dialog}
  </section>;
}

"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ControlNav } from "@/components/control/nav/ControlNav";
import { AddPatientSheet } from "@/components/control/patients/AddPatientSheet";
import { usePatients, searchPatients } from "@/lib/patients/usePatients";
import type { Patient } from "@/lib/patients/types";
import { useStaffAuth } from "@/lib/realtime/useStaffAuth";
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { usePatientContext } from "@/lib/patients/PatientSessionContext";
import { controlTabId } from "@/lib/liveGame/ownership";
import { useVisit } from "./VisitProvider";
import { useGameSafety } from "./GameSafetyProvider";
import styles from "./visit.module.css";

export function VisitSetupScreen() {
  const visit = useVisit(),
    auth = useStaffAuth(),
    router = useRouter(),
    patientContext = usePatientContext(),
    safety = useGameSafety(),
    realtime = isRealtimeEnabled();
  const [mode, setMode] = useState<"existing" | "new" | "guest">(
      realtime ? "existing" : "guest",
    ),
    [selected, setSelected] = useState<Patient | null>(null),
    [guest, setGuest] = useState(""),
    [search, setSearch] = useState(""),
    [adding, setAdding] = useState(false);
  const [therapist, setTherapist] = useState(""),
    [title, setTitle] = useState("جلسة علاج طبيعي"),
    [minutes, setMinutes] = useState("45"),
    [custom, setCustom] = useState("45"),
    [notes, setNotes] = useState(""),
    [error, setError] = useState("");
  const duration = minutes === "custom" ? Number(custom) : Number(minutes),
    child = mode === "guest" ? guest.trim() : (selected?.firstName ?? ""),
    therapistName = therapist.trim() || auth.displayName || "";
  const begin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      if (
        !child ||
        !therapistName ||
        !Number.isInteger(duration) ||
        duration < 1 ||
        duration > 480
      )
        throw Error("أكمل الاسم والمعالج والمدة (١–٤٨٠ دقيقة).");
      const now = visit.now;
      await visit.start({
        version: 1,
        visitId: crypto.randomUUID(),
        patientId: mode === "guest" ? null : selected!.patientId,
        childName: child,
        ownerUid: realtime ? auth.uid! : "local-demo",
        controlTabId: controlTabId(),
        title: title.trim(),
        therapistName,
        initialNotes: notes.trim(),
        finalNotes: "",
        overallRating: null,
        startedAt: now,
        plannedMs: duration * 60000,
        pausedMs: 0,
        pausedAt: null,
        endedAt: null,
        revision: 0,
        updatedAt: now,
        entries: {},
        breaks: {},
      });
      if (mode === "guest") patientContext.selectWalkIn(child);
      else
        patientContext.selectPatient({
          patientId: selected!.patientId,
          patientNumber: selected!.patientNumber,
          firstName: child,
        });
      router.push("/control/activities");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "تعذّر بدء الجلسة. تحقق من قواعد الوصول والاتصال.",
      );
    }
  };
  return (
    <main className={styles.page} dir="rtl" lang="ar">
      <div className={styles.content}>
        <ControlNav active="home" />
        <header className={styles.header}>
          <p>شموس / الرعاية التفاعلية</p>
          <h1>جلسة علاجية جديدة</h1>
          <p>زيارة واحدة تجمع الأنشطة والتقييم والتمارين، مع توقيت مستمر.</p>
        </header>
        {visit.visit && !visit.visit.endedAt ? (
          <section className={styles.card}>
            <h2>توجد جلسة قائمة لـ {visit.visit.childName}</h2>
            <p className={styles.muted}>
              استخدم شريط الجلسة للمراجعة أو الإنهاء قبل بدء زيارة أخرى.
            </p>
            <Link className={styles.link} href="/control/activities">
              متابعة إلى الأنشطة
            </Link>
          </section>
        ) : (
          <form onSubmit={begin} className={styles.card}>
            <h2>اختيار الطفل</h2>
            <div className={styles.options}>
              {(
                [
                  ["existing", "مريض محفوظ"],
                  ["new", "مريض جديد"],
                  ["guest", "طفل ضيف"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  disabled={key !== "guest" && !realtime}
                  aria-pressed={mode === key}
                  onClick={() => {
                    setMode(key);
                    setSelected(null);
                    if (key === "new") setAdding(true);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {mode === "existing" && realtime && (
              <>
                <label className={styles.field}>
                  البحث بالاسم أو رقم المريض
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <PatientPicker
                  query={search}
                  selected={selected}
                  onSelect={setSelected}
                />
              </>
            )}
            {mode === "new" && (
              <>
                <p className={styles.muted}>
                  {selected
                    ? `المريض المختار: ${selected.firstName}`
                    : "تُستخدم استمارة المرضى الحالية وقواعد التحقق نفسها."}
                </p>
                <button
                  type="button"
                  className={styles.button}
                  onClick={() => setAdding(true)}
                >
                  إضافة مريض
                </button>
              </>
            )}
            {mode === "guest" && (
              <>
                <label className={styles.field}>
                  الاسم الأول أو الاسم المفضّل
                  <input
                    maxLength={50}
                    required
                    value={guest}
                    onChange={(e) => setGuest(e.target.value)}
                  />
                </label>
                <p className={styles.muted}>
                  هذه الجلسة مؤقتة في هذا التبويب. لا تُنشئ ملفًا، ولن تظهر
                  نتائجها في سجل المرضى الدائم. إغلاق التبويب يحذفها.
                </p>
              </>
            )}
            <div className={styles.fields}>
              <label className={styles.field}>
                اسم المعالج
                <input
                  required
                  maxLength={100}
                  value={therapist || auth.displayName || ""}
                  onChange={(e) => setTherapist(e.target.value)}
                />
              </label>
              <label className={styles.field}>
                عنوان الجلسة
                <input
                  required
                  maxLength={100}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label className={styles.field}>
                المدة المخططة
                <select
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                >
                  <option value="30">٣٠ دقيقة</option>
                  <option value="45">٤٥ دقيقة</option>
                  <option value="60">٦٠ دقيقة</option>
                  <option value="custom">مدة مخصصة</option>
                </select>
              </label>
              {minutes === "custom" && (
                <label className={styles.field}>
                  الدقائق
                  <input
                    type="number"
                    min="1"
                    max="480"
                    required
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                  />
                </label>
              )}
              <label className={`${styles.field} ${styles.wide}`}>
                ملاحظات أولية (اختياري)
                <textarea
                  maxLength={2000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
            </div>
            {!safety.canLeave && (
              <p className={styles.error}>
                أنهِ النشاط الحالي وانتظر تأكيد حفظه قبل بدء زيارة جديدة.
              </p>
            )}
            {(error || visit.error) && (
              <p className={styles.error} role="alert">
                {error || visit.error}
              </p>
            )}
            <button
              className={`${styles.button} ${styles.primary}`}
              disabled={
                !visit.restored ||
                visit.busy ||
                !child ||
                !therapistName ||
                !safety.canLeave
              }
            >
              {visit.busy ? "جاري الحفظ…" : "بدء الجلسة واختيار الأنشطة"}
            </button>
            <p className={styles.muted}>
              هوية الحساب المسجّل تحدد صلاحيات الحفظ؛ اسم المعالج للعرض والتوثيق
              فقط.
            </p>
          </form>
        )}
        <AddPatientSheet
          open={adding}
          createdByUid={auth.uid ?? ""}
          onCancel={() => setAdding(false)}
          onCreated={(p) => {
            setSelected(p);
            setAdding(false);
          }}
        />
      </div>
    </main>
  );
}
function PatientPicker({
  query,
  selected,
  onSelect,
}: {
  query: string;
  selected: Patient | null;
  onSelect: (p: Patient) => void;
}) {
  const { patients, loading } = usePatients();
  const results = searchPatients(patients, query);
  return (
    <div className={styles.patients} aria-label="المرضى المحفوظون">
      {loading ? (
        <p className={styles.muted}>جاري تحميل المرضى…</p>
      ) : results.length === 0 ? (
        <p className={styles.muted}>لا يوجد مرضى مطابقون.</p>
      ) : (
        results.map((p) => (
          <button
            type="button"
            className={styles.patient}
            key={p.patientId}
            aria-pressed={selected?.patientId === p.patientId}
            onClick={() => onSelect(p)}
          >
            <strong>{p.firstName}</strong>
            <span>#{p.patientNumber}</span>
          </button>
        ))
      )}
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import { useStaffAuth } from "@/lib/realtime/useStaffAuth";
import {
  commitVisit,
  subscribePatientVisits,
} from "@/lib/therapyVisits/repository";
import {
  formatClock,
  elapsedMs,
  type Visit,
  type GameReference,
  type ExerciseBlock,
} from "@/lib/therapyVisits/model";
import {
  VisitSummary,
  VisitTimeline,
  ActivityEvaluation,
} from "./VisitWorkspace";
import styles from "./visit.module.css";
import { modalKeys } from "./modalKeys";

export function PatientVisitHistory({ patientId }: { patientId: string }) {
  const [visits, setVisits] = useState<Visit[]>([]),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<string | null>(null),
    [evaluation, setEvaluation] = useState<string | null>(null),
    [saving, setSaving] = useState(false);
  const auth = useStaffAuth(),
    visit = visits.find((v) => v.visitId === selected);
  useEffect(
    () =>
      subscribePatientVisits(patientId, setVisits, () =>
        setError(
          "سجل الزيارات غير متاح. يلزم اتصال وقواعد وصول الزيارات الجديدة. سجل الألعاب الحالي متاح أدناه.",
        ),
      ),
    [patientId],
  );
  return (
    <section className={styles.card} aria-label="الزيارات العلاجية">
      <h2>الزيارات العلاجية</h2>
      {error && <p className={styles.muted}>{error}</p>}
      {!visits.some((v) => v.endedAt) && (
        <p className={styles.muted}>
          لا توجد زيارات علاجية مكتملة. تبقى الألعاب السابقة ظاهرة في سجل
          الأنشطة الفردية.
        </p>
      )}
      {visits
        .filter((v) => v.endedAt)
        .map((v) => (
          <button
            className={styles.patient}
            key={v.visitId}
            onClick={() => {
              setSelected(v.visitId);
              setEvaluation(null);
            }}
          >
            <div>
              <strong>{v.title}</strong>
              <p className={styles.muted}>
                {new Date(v.startedAt).toLocaleDateString("ar-SA")} ·{" "}
                {v.therapistName} · {formatClock(elapsedMs(v, v.endedAt!))}
              </p>
              <p className={styles.muted}>
                {
                  Object.values(v.entries).filter((e) => e.kind === "game")
                    .length
                }{" "}
                ألعاب ·{" "}
                {
                  Object.values(v.entries).filter((e) => e.kind === "exercise")
                    .length
                }{" "}
                تمارين{" "}
                {v.overallRating !== null && `· تقييم ${v.overallRating}/5`}
              </p>
            </div>
            <span>←</span>
          </button>
        ))}
      {visit && (
        <div className={styles.overlay} dir="rtl">
          <section
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-label="مراجعة الزيارة"
            onKeyDown={(event) =>
              modalKeys(event, () => {
                setSelected(null);
                setEvaluation(null);
              })
            }
          >
            <header>
              <h2>{visit.title}</h2>
              <button
                autoFocus
                className={styles.button}
                onClick={() => {
                  setSelected(null);
                  setEvaluation(null);
                }}
              >
                إغلاق
              </button>
            </header>
            {error && (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            )}
            {evaluation && visit.entries[evaluation] ? (
              <ActivityEvaluation
                key={evaluation}
                visit={visit}
                entry={
                  visit.entries[evaluation] as GameReference | ExerciseBlock
                }
                disabled={saving || auth.uid !== visit.ownerUid}
                onSave={async (e) => {
                  setSaving(true);
                  try {
                    await commitVisit(visit, {
                      ...visit,
                      updatedAt: Date.now(),
                      entries: {
                        ...visit.entries,
                        [evaluation]: {
                          ...visit.entries[evaluation],
                          evaluation: { ...e, updatedByUid: auth.uid! },
                        },
                      },
                    });
                    setEvaluation(null);
                  } catch {
                    setError(
                      "تعذّر حفظ التقييم. احتفظ بالتعديلات وحاول مجددًا.",
                    );
                  } finally {
                    setSaving(false);
                  }
                }}
              />
            ) : (
              <>
                <VisitSummary
                  visit={visit}
                  now={visit.endedAt ?? visit.updatedAt}
                />
                <VisitTimeline
                  visit={visit}
                  onEvaluate={
                    auth.uid === visit.ownerUid ? setEvaluation : undefined
                  }
                />
              </>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

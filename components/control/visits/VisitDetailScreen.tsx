"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useStaffAuth } from "@/lib/realtime/useStaffAuth";
import {
  commitVisit,
  subscribeVisitResultClaims,
} from "@/lib/therapyVisits/repository";
import {
  subscribeClinicalResults,
  hasRecordedLevels,
} from "@/lib/therapyVisits/clinicalResults";
import { getGameById } from "@/lib/games/registry";
import type { GameId } from "@/lib/games/registry";
import type { AnyStoredSession } from "@/lib/sessions/types";
import {
  ASSISTANCE_LABELS,
  blankEvaluation,
  elapsedMs,
  formatClock,
  type Visit,
} from "@/lib/therapyVisits/model";
import {
  clinicalMetrics,
  objectiveComparison,
  recordedSide,
  overallVisitSummary,
  comparablePrevious,
  ratingComparison,
  completionName,
  difficultyName,
  gameName,
  visitStatus,
  missing,
} from "@/lib/therapyVisits/clinicalSummary";
import { numberFor } from "@/lib/therapyVisits/numbering";
import { usePatientVisitHistory } from "./usePatientVisitHistory";
import { ActivityEvaluation } from "./VisitWorkspace";
import { ControlPageNav } from "@/components/control/nav/ControlPageNav";
import styles from "./visitHistory.module.css";
export function VisitDetailScreen({
  patientId,
  visitId,
}: {
  patientId: string;
  visitId: string;
}) {
  const history = usePatientVisitHistory(patientId),
    auth = useStaffAuth();
  const [claims, setClaims] = useState<Record<string, string>>({});
  const [records, setRecords] = useState<AnyStoredSession[] | null>(null),
    [resultError, setResultError] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [edit, setEdit] = useState<string | null>(null),
    [editBase, setEditBase] = useState<Visit | null>(null);
  useEffect(
    () =>
      subscribeVisitResultClaims(patientId, setClaims, () =>
        setResultError("تعذّر التحقق من روابط النتائج."),
      ),
    [patientId],
  );
  useEffect(() => {
    return subscribeClinicalResults(patientId, setRecords, () =>
      setResultError("تعذّر تحميل نتائج الأنشطة. لم يُفقد أي سجل."),
    );
  }, [patientId]);
  const visit = history.visits?.find((v) => v.visitId === visitId);
  const save = useCallback(
    async (next: Visit) => {
      if (!visit || auth.uid !== visit.ownerUid) return;
      setBusy(true);
      setError("");
      try {
        await commitVisit(editBase ?? visit, {
          ...next,
          updatedAt: Math.max(Date.now(), visit.updatedAt),
        });
        setEdit(null);
        setEditBase(null);
      } catch {
        setError(
          "تعذّر الحفظ أو تغيّر السجل في نافذة أخرى. احتفظ بالتعديلات وأعد المحاولة.",
        );
      } finally {
        setBusy(false);
      }
    },
    [visit, auth.uid, editBase],
  );

  if (history.visits === null)
    return (
      <main dir="rtl" className={styles.page}>
        <ControlPageNav backHref={`/control/patients/${patientId}`} backLabel="ملف المريض" />
        <p>{history.error || "جارٍ تحميل الجلسة…"}</p>
      </main>
    );
  if (!visit)
    return (
      <main dir="rtl" className={styles.page}>
        <ControlPageNav backHref={`/control/patients/${patientId}`} backLabel="ملف المريض" />
        <p role="alert">الجلسة غير متاحة أو ليس لديك صلاحية الوصول.</p>
      </main>
    );
  const number = numberFor(history.numbering, visit.visitId),
    summary = overallVisitSummary(visit, records ?? []),
    previous = comparablePrevious(visit, history.visits ?? [], records ?? []),
    owner = auth.phase === "authorized" && auth.uid === visit.ownerUid;
  return (
    <main dir="rtl" className={styles.page}>
      <ControlPageNav backHref={`/control/patients/${patientId}`} backLabel="ملف المريض" />
      <header className={`${styles.card} ${styles.header}`}>
        <div className={styles.top}>
          <h1>
            {number === null ? "رقم الجلسة غير مسجل" : `الجلسة ${number}`}
          </h1>
          <span className={styles.status}>{visitStatus(visit)}</span>
        </div>
        <h2>{visit.title}</h2>
        <p className={styles.muted}>
          {new Date(visit.startedAt).toLocaleString("ar-SA", {
            calendar: "gregory",
          })}{" "}
          · {visit.therapistName || missing}
        </p>
        <dl className={styles.stats}>
          <Stat label="المدة المخططة" value={formatClock(visit.plannedMs)} />
          <Stat
            label={
              visit.endedAt ? "المدة الفعلية" : "المدة الفعلية حتى آخر تحديث"
            }
            value={formatClock(
              elapsedMs(visit, visit.endedAt ?? visit.updatedAt),
            )}
          />
          <Stat
            label="الاستراحات المسجلة"
            value={formatClock(visit.pausedMs)}
          />
        </dl>
      </header>
      {(history.error || error || resultError) && (
        <p role="alert" className={styles.error}>
          {error || history.error || resultError}
        </p>
      )}
      <section className={styles.card}>
        <h2>تقييم الأخصائي</h2>
        {edit === "visit" ? (
          <VisitEvaluation
            key={`${visit.visitId}:edit`}
            visit={visit}
            busy={busy}
            onSave={save}
            onCancel={() => {
              setEdit(null);
              setEditBase(null);
            }}
          />
        ) : (
          <>
            <p className={styles.rating} aria-label="تقييم الأخصائي العام">
              {visit.overallRating === null
                ? missing
                : `${"★".repeat(visit.overallRating)}${"☆".repeat(5 - visit.overallRating)} ${visit.overallRating}/5`}
            </p>
            <p className={styles.notes}>
              ملاحظات الأخصائي: {visit.finalNotes.trim() || missing}
            </p>
            <p className={styles.notes}>
              ملاحظات البداية: {visit.initialNotes.trim() || missing}
            </p>
            <p className={styles.muted}>
              المساعدة المسجلة: {summary.assistance.join("، ") || missing}
            </p>
            {owner && (
              <button
                className={styles.button}
                onClick={() => {
                  setEditBase(visit);
                  setEdit("visit");
                }}
              >
                تعديل تقييم الجلسة والملاحظات
              </button>
            )}
          </>
        )}
      </section>
      {owner &&
        (records ?? []).some(
          (r) =>
            claims[r.sessionId] === visitId &&
            !visit.entries[r.sessionId] &&
            !!getGameById(r.gameId),
        ) && (
          <section className={styles.card}>
            <h2>نتائج محفوظة بانتظار إكمال الربط</h2>
            {(records ?? [])
              .filter(
                (r) =>
                  claims[r.sessionId] === visitId &&
                  !visit.entries[r.sessionId] &&
                  !!getGameById(r.gameId),
              )
              .map((r) => (
                <div key={r.sessionId} className={styles.activity}>
                  <strong>{gameName(r.gameId)}</strong>
                  <button
                    className={styles.button}
                    disabled={busy}
                    onClick={() => {
                      const now = Date.now();
                      void save({
                        ...visit,
                        entries: {
                          ...visit.entries,
                          [r.sessionId]: {
                            kind: "game",
                            sessionId: r.sessionId,
                            gameId: r.gameId as GameId,
                            linkedAt: now,
                            evaluation: blankEvaluation(auth.uid!, now),
                          },
                        },
                      });
                    }}
                  >
                    استعادة رابط النتيجة المحفوظة
                  </button>
                </div>
              ))}
          </section>
        )}
      <section className={styles.card}>
        <h2>الألعاب والتمارين</h2>
        {Object.entries(visit.entries).length === 0 ? (
          <p className={styles.muted}>لا توجد أنشطة مرتبطة بهذه الجلسة.</p>
        ) : (
          <div className={styles.list}>
            {Object.entries(visit.entries).map(([id, entry]) => {
              const result =
                entry.kind === "game"
                  ? records?.find(
                      (r) =>
                        r.sessionId === entry.sessionId &&
                        r.gameId === entry.gameId,
                    )
                  : null;
              return (
                <article key={id} className={styles.activity}>
                  <details>
                    <summary>
                      <div className={styles.top}>
                        <h3 className={styles.title}>
                          {entry.kind === "game"
                            ? gameName(entry.gameId)
                            : entry.title}
                        </h3>
                        <span className={styles.status}>
                          {completionName(entry.evaluation.completion)}
                        </span>
                      </div>
                      <div className={styles.meta}>
                        {entry.kind === "game" ? (
                          <>
                            <span>
                              المستوى:{" "}
                              {result && hasRecordedLevels(result)
                                ? difficultyName(result.endingDifficulty)
                                : missing}
                            </span>
                            <span>
                              المرحلة:{" "}
                              {result && hasRecordedLevels(result)
                                ? result.endingStage
                                : missing}
                            </span>
                            <span>
                              المدة:{" "}
                              {result?.durationMs === null ||
                              result?.durationMs === undefined
                                ? missing
                                : formatClock(result.durationMs)}
                            </span>
                          </>
                        ) : (
                          <span>
                            {entry.confirmed ? "مؤكد من الأخصائي" : "غير مؤكد"} ·
                            مدة التنفيذ: {missing}
                          </span>
                        )}
                        <span>
                          التقييم:{" "}
                          {entry.evaluation.rating === null
                            ? missing
                            : `${entry.evaluation.rating}/5`}
                        </span>
                        <span>عرض ملخص النشاط ↓</span>
                      </div>
                    </summary>
                    {entry.kind === "game" ? (
                      result ? (
                        <>
                          <dl className={styles.metrics}>
                            <Stat
                              label="المراحل المكتملة"
                              value={result.completedStageCount ?? missing}
                            />
                            <Stat
                              label="المراحل المتجاوزة"
                              value={result.skippedStageCount ?? missing}
                            />
                            {clinicalMetrics(result).map((m) => (
                              <Stat
                                key={m.key}
                                label={m.label}
                                value={m.value}
                              />
                            ))}
                          </dl>
                          <p className={styles.muted}>
                            إعداد الطرف المسجل: {recordedSide(result)}
                          </p>
                          <p className={styles.notes}>
                            ملاحظات النتيجة: {result.therapistNote || missing}
                          </p>
                          <Link
                            className={styles.button}
                            href={`/control/patients/${patientId}/sessions/${entry.sessionId}`}
                          >
                            تفاصيل النتيجة المسجلة ←
                          </Link>
                        </>
                      ) : (
                        <p className={styles.muted}>
                          {records === null
                            ? "جارٍ تحميل النتيجة…"
                            : "النتيجة غير متاحة؛ لا يمكن عرض مقاييس غير مؤكدة."}
                        </p>
                      )
                    ) : (
                      <dl className={styles.metrics}>
                        <Stat label="الهدف" value={entry.goal || missing} />
                        <Stat
                          label="التكرارات المسجلة"
                          value={entry.repetitions}
                        />
                        <Stat
                          label="الثبات المحدد لكل تكرار"
                          value={`${entry.holdSeconds} ثانية`}
                        />
                      </dl>
                    )}
                    <p className={styles.muted}>
                      المساعدة:{" "}
                      {ASSISTANCE_LABELS[entry.evaluation.assistance] ??
                        missing}
                    </p>
                    <p className={styles.notes}>
                      ملاحظات الأخصائي: {entry.evaluation.notes || missing}
                    </p>
                    {edit === id ? (
                      <ActivityEvaluation
                        key={id}
                        visit={visit}
                        entry={entry}
                        disabled={busy || !owner}
                        onSave={async (evaluation) => {
                          await save({
                            ...visit,
                            entries: {
                              ...visit.entries,
                              [id]: {
                                ...entry,
                                evaluation: {
                                  ...evaluation,
                                  updatedByUid: auth.uid!,
                                  updatedAt: Date.now(),
                                },
                              },
                            },
                          });
                        }}
                      />
                    ) : (
                      owner && (
                        <button
                          className={styles.button}
                          onClick={() => {
                            setEditBase(visit);
                            setEdit(id);
                          }}
                        >
                          تعديل تقييم النشاط
                        </button>
                      )
                    )}
                  </details>
                </article>
              );
            })}
          </div>
        )}
      </section>
      <section className={styles.card}>
        <h2>ملخص الجلسة</h2>
        <dl className={styles.stats}>
          <Stat
            label={
              visit.endedAt ? "المدة الفعلية" : "المدة الفعلية حتى آخر تحديث"
            }
            value={formatClock(summary.durationMs)}
          />
          <Stat
            label="ألعاب قيّمها الأخصائي كمكتملة"
            value={summary.gamesCompleted}
          />
          <Stat
            label="تمارين مؤكدة ومقيّمة كمكتملة"
            value={summary.exercisesCompleted}
          />
          <Stat label="أنشطة متوقفة" value={summary.interrupted} />
          <Stat label="أنشطة جزئية" value={summary.partial} />
          <Stat
            label="مراحل متجاوزة مسجلة"
            value={summary.skippedStages ?? missing}
          />
        </dl>
        <p className={styles.notes}>
          المساعدة: {summary.assistance.join("، ") || missing}
        </p>
        <p className={styles.notes}>
          مجالات الأنشطة: {summary.skills.join("، ") || missing}
        </p>
        <p className={styles.rating}>
          تقييم الأخصائي للجلسة:{" "}
          {visit.overallRating === null ? missing : `${visit.overallRating}/5`}
        </p>
        <div className={styles.separator}>
          <h3 className={styles.title}>
            مقارنة بالجلسة السابقة ذات أنشطة مشتركة
          </h3>
          <p className={styles.muted}>{ratingComparison(visit, previous)}</p>
          {objectiveComparison(visit, previous, records ?? []).map((line) => (
            <p key={line} className={styles.muted}>
              {line}
            </p>
          ))}
          {previous && (
            <Link
              className={styles.button}
              href={`/control/patients/${patientId}/visits/${previous.visitId}`}
            >
              الجلسة {numberFor(history.numbering, previous.visitId) ?? "—"} ·{" "}
              {new Date(previous.startedAt).toLocaleDateString("ar-SA", {
                calendar: "gregory",
              })}{" "}
              ←
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}
function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={styles.stat}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
function VisitEvaluation({
  visit,
  busy,
  onSave,
  onCancel,
}: {
  visit: Visit;
  busy: boolean;
  onSave: (v: Visit) => Promise<void>;
  onCancel: () => void;
}) {
  const [rating, setRating] = useState<string>(
      visit.overallRating === null ? "" : String(visit.overallRating),
    ),
    [notes, setNotes] = useState(visit.finalNotes),
    [initial, setInitial] = useState(visit.initialNotes);
  return (
    <form
      className={styles.fields}
      onSubmit={(e) => {
        e.preventDefault();
        void onSave({
          ...visit,
          overallRating: rating === "" ? null : Number(rating),
          finalNotes: notes.trim(),
          initialNotes: initial.trim(),
        });
      }}
    >
      <label>
        تقييم الجلسة من خمسة
        <select
          value={rating}
          disabled={busy}
          onChange={(e) => setRating(e.target.value)}
        >
          <option value="">غير مسجل</option>
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}/5
            </option>
          ))}
        </select>
      </label>
      <label>
        ملاحظات الأخصائي
        <textarea
          maxLength={2000}
          value={notes}
          disabled={busy}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <label>
        ملاحظات البداية
        <textarea
          maxLength={2000}
          value={initial}
          disabled={busy}
          onChange={(e) => setInitial(e.target.value)}
        />
      </label>
      <div className={styles.actions}>
        <button
          className={`${styles.button} ${styles.primary}`}
          disabled={busy}
        >
          {busy ? "جارٍ الحفظ…" : "حفظ التقييم"}
        </button>
        <button
          type="button"
          className={styles.button}
          disabled={busy}
          onClick={onCancel}
        >
          إلغاء
        </button>
      </div>
    </form>
  );
}

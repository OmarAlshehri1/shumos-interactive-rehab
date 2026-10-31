"use client";
import { ControlDialog } from "@/components/control/ui/ControlDialog";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { GAME_REGISTRY } from "@/lib/games/registry";
import { getSessionHistoryRecord } from "@/lib/sessions/sessionHistoryRepository";
import type { AnyStoredSession } from "@/lib/sessions/types";
import {
  ASSISTANCE_LABELS,
  finishVisit,
  formatClock,
  pauseVisit,
  resumeVisit,
  visitClock,
  type Evaluation,
  type ExerciseBlock,
  type GameReference,
  type Visit,
} from "@/lib/therapyVisits/model";
import { visitGamePaused } from "@/lib/therapyVisits/gameSafety";
import { useVisit } from "./VisitProvider";
import { useGameSafety } from "./GameSafetyProvider";
import styles from "./visit.module.css";


const gameTitle = (id: string) =>
  GAME_REGISTRY.find((g) => g.id === id)?.nameAr ?? id;
export function VisitWorkspace() {
  const context = useVisit(),
    { visit, now, change, busy, writable, error, acknowledgeActivityReview } = context,
    safety = useGameSafety();
  const [panel, setPanel] = useState<"details" | "end" | null>(null),
    [message, setMessage] = useState(""),
    [evaluation, setEvaluation] = useState<string | null>(null);
  const audio = useRef<AudioContext | null>(null),
    seen = useRef(new Set<string>());
  const clock = visit ? visitClock(visit, now) : null;
  useEffect(() => {
    if (!visit || visit.endedAt || !clock?.expired) return;
    const key = `shumos.visit.alert.${visit.ownerUid}.${visit.visitId}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    if (audio.current?.state === "running") {
      const c = audio.current,
        o = c.createOscillator(),
        gain = c.createGain();
      o.frequency.value = 660;
      gain.gain.setValueAtTime(0.035, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.55);
      o.connect(gain);
      gain.connect(c.destination);
      o.start();
      o.stop(c.currentTime + 0.55);
    }
  }, [visit, clock?.expired]);
  const acknowledgeReview = (id: string | null) => {
    if (!id) return;
    seen.current.add(id);
    acknowledgeActivityReview(id);
  };
  useEffect(() => {
    if (!visit || visit.endedAt) return;
    try {
      const raw = JSON.parse(
        sessionStorage.getItem(
          `shumos.visit.reviewed.${visit.ownerUid}.${visit.visitId}`,
        ) ?? "[]",
      );
      if (Array.isArray(raw))
        for (const id of raw)
          if (typeof id === "string" && id.length <= 150) seen.current.add(id);
    } catch {
      /* A missing or unavailable tab store does not affect clinical data. */
    }
    const next = Object.entries(visit.entries).find(
      ([id, e]) => e.kind === "game" && !seen.current.has(id),
    );
    if (next) {
      seen.current.add(next[0]);
      void Promise.resolve().then(() => setEvaluation(next[0]));
    }
  }, [visit]);
  const unlock = () => {
    try {
      audio.current ??= new AudioContext();
      void audio.current.resume().catch(() => {});
    } catch {
      /* visual timer is always available */
    }
  };
  const run = async (fn: () => Promise<void>) => {
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "تعذّر الحفظ. حاول مجددًا.");
    }
  };
  if (!visit || visit.endedAt) return null;
  const currentActivity = safety.live
    ? gameTitle(safety.live.gameId ?? "")
    : "اختيار نشاط";
  const toggleBreak = () =>
    void run(async () => {
      if (!visit.pausedAt && !visitGamePaused(safety.live))
        throw Error(
          "أوقف اللعبة مؤقتًا من أدواتها أولًا، ثم ابدأ الاستراحة. لن تُوقَف اللعبة أو تُستأنف تلقائيًا.",
        );
      await change((v) =>
        v.pausedAt === null ? pauseVisit(v, now) : resumeVisit(v, now),
      );
    });
  return (
    <>
      <aside
        data-visit-active="true"
        className={styles.bar}
        dir="rtl"
        lang="ar"
        aria-label="الجلسة العلاجية الحالية"
        onPointerDown={unlock}
      >
        <div className={styles.identity}>
          <strong>{visit.childName}</strong>
          <span className={styles.title}>
            {visit.title} · {currentActivity}
          </span>
          <span
            className={`${styles.time} ${clock!.expired ? styles.overtime : ""}`}
            dir="ltr"
            role="timer"
            aria-label={clock!.expired ? "وقت إضافي" : "الوقت المتبقي"}
          >
            {clock!.expired ? "+" : ""}
            {formatClock(clock!.expired ? clock!.overtime : clock!.remaining)}
          </span>
          {visit.pausedAt !== null && <span>استراحة</span>}
        </div>
        <div className={styles.options}>
          <button disabled={busy || !writable} onClick={toggleBreak}>
            {visit.pausedAt !== null ? "استئناف" : "استراحة"}
          </button>
          <button onClick={() => setPanel("details")}>تفاصيل</button>
          <button className={styles.danger} onClick={() => setPanel("end")}>
            إنهاء الجلسة
          </button>
        </div>
      </aside>
      {clock!.expired && (
        <div
          className="fixed bottom-3 right-3 z-[66] rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-800"
          role="status"
          dir="rtl"
        >
          انتهت المدة المخططة · النشاط مستمر. يمكنك تمديد الجلسة من التفاصيل.
        </div>
      )}
      {(panel || evaluation) && (
        <ControlDialog open title={
              evaluation
                ? "تقييم النشاط"
                : panel === "end"
                  ? "مراجعة إنهاء الجلسة"
                  : "تفاصيل الجلسة"
            } onClose={() => { setPanel(null); acknowledgeReview(evaluation); setEvaluation(null); }} role="dialog" busy={busy}>
            <header>
              <h2>
                {evaluation
                  ? "تقييم النشاط"
                  : panel === "end"
                    ? "مراجعة وإنهاء الجلسة"
                    : "تفاصيل الجلسة"}
              </h2>
              <button
                autoFocus
                className={styles.button}
                onClick={() => {
                  setPanel(null);
                  acknowledgeReview(evaluation);
                  setEvaluation(null);
                }}
              >
                إغلاق
              </button>
            </header>
            {!writable && (
              <p className={styles.error}>
                الجلسة للقراءة فقط: افتحها في تبويب الأخصائي الذي بدأها وتحقق من
                الاتصال.
              </p>
            )}
            {(message || error) && (
              <p role="alert" className={styles.error}>
                {message || error}
              </p>
            )}
            {evaluation && visit.entries[evaluation] ? (
              <ActivityEvaluation
                key={evaluation}
                visit={visit}
                entry={
                  visit.entries[evaluation] as GameReference | ExerciseBlock
                }
                disabled={!writable || busy}
                onSave={(e) =>
                  run(async () => {
                    await change((v) => ({
                      ...v,
                      entries: {
                        ...v.entries,
                        [evaluation]: {
                          ...v.entries[evaluation],
                          evaluation: e,
                        },
                      },
                    }));
                    acknowledgeReview(evaluation);
                    setEvaluation(null);
                  })
                }
              />
            ) : (
              <>
                <VisitSummary visit={visit} now={now} />
                {panel === "details" && (
                  <>
                    <div className={styles.options}>
                      <button
                        disabled={
                          !writable || busy || visit.plannedMs >= 480 * 60000
                        }
                        onClick={() =>
                          void run(() =>
                            change((v) => ({
                              ...v,
                              plannedMs: Math.min(
                                480 * 60000,
                                v.plannedMs + 5 * 60000,
                              ),
                            })),
                          )
                        }
                      >
                        تمديد ٥ دقائق
                      </button>
                      <button
                        disabled={!writable || busy}
                        onClick={toggleBreak}
                      >
                        {visit.pausedAt !== null
                          ? "استئناف التوقيت"
                          : "بدء استراحة"}
                      </button>
                    </div>
                    <p className={styles.muted}>
                      أوقف اللعبة مؤقتًا قبل الاستراحة. استئناف التوقيت لا يستأنف اللعبة.
                    </p>
                  </>
                )}
                <VisitTimeline visit={visit} onEvaluate={setEvaluation} />
                {panel === "end" && (
                  <>
                    <FinishForm
                      key={visit.visitId}
                      visit={visit}
                      disabled={!writable || busy || !safety.canLeave}
                      onFinish={(notes, rating) =>
                        run(async () => {
                          if (!safety.canLeave)
                            throw Error(
                              "أنهِ النشاط الحالي وأكمل حفظ نتيجته أولًا.",
                            );
                          await change((v) =>
                            finishVisit(
                              {
                                ...v,
                                finalNotes: notes,
                                overallRating: rating,
                              },
                              now,
                            ),
                          );
                          setPanel(null);
                          context.dismiss();
                        })
                      }
                    />
                    {!safety.canLeave && (
                      <p className={styles.error}>
                        يوجد نشاط غير منتهٍ أو حفظ لم يتأكد. ارجع إلى أدوات
                        النشاط لإنهائه؛ لن تُفقد نتيجته.
                      </p>
                    )}
                  </>
                )}
              </>
            )}
          </ControlDialog>
      )}
    </>
  );
}
export function VisitSummary({ visit, now }: { visit: Visit; now: number }) {
  const c = visitClock(visit, now),
    entries = Object.values(visit.entries);
  return (
    <>
      <p className={styles.note}>
        <strong>
          {visit.childName} · {visit.title}
        </strong>
        <br />
        الأخصائي: {visit.therapistName}
      </p>
      <div className={styles.stats}>
        <div>
          المدة المخططة<strong>{formatClock(visit.plannedMs)}</strong>
        </div>
        <div>
          الوقت الفعلي<strong>{formatClock(c.elapsed)}</strong>
        </div>
        <div>
          الوقت الإضافي<strong>{formatClock(c.overtime)}</strong>
        </div>
        <div>
          الأنشطة
          <strong>
            {entries.filter((e) => e.kind === "game").length} ألعاب ·{" "}
            {entries.filter((e) => e.kind === "exercise").length} تمارين
          </strong>
        </div>
      </div>
      {visit.initialNotes && (
        <p className={styles.note}>ملاحظات أولية: {visit.initialNotes}</p>
      )}
      {visit.finalNotes && (
        <p className={styles.note}>ملاحظات ختامية: {visit.finalNotes}</p>
      )}
      {visit.overallRating !== null && (
        <p className={styles.muted}>
          تقييم الأخصائي العام: {visit.overallRating}/5 · تقدير مهني غير مقنن.
        </p>
      )}
    </>
  );
}
export function VisitTimeline({
  visit,
  onEvaluate,
}: {
  visit: Visit;
  onEvaluate?: (id: string) => void;
}) {
  const activities = Object.entries(visit.entries).map(([id, e]) => ({
      id,
      time: e.kind === "game" ? e.linkedAt : e.recordedAt,
      entry: e,
    })),
    breaks = Object.entries(visit.breaks).map(([id, b]) => ({
      id,
      time: b.startedAt,
      entry: b,
    }));
  return (
    <div className="grid gap-3">
      <h3 className="font-bold">تسلسل الأنشطة والاستراحات</h3>
      {[...activities, ...breaks]
        .sort((a, b) => a.time - b.time)
        .map((row) => {
          const e = row.entry;
          if (!("kind" in e))
            return (
              <div className={styles.break} key={row.id}>
                استراحة ·{" "}
                {e.endedAt ? formatClock(e.endedAt - e.startedAt) : "جارية"}
              </div>
            );
          return (
            <article className={styles.entry} key={row.id}>
              <strong>
                {e.kind === "game" ? gameTitle(e.gameId) : e.title}
              </strong>
              {e.kind === "exercise" && (
                <p>
                  {e.goal} · {e.repetitions} تكرار · ثبات {e.holdSeconds} ثانية
                  · {e.confirmed ? "تأكيد الأخصائي" : "لم يُؤكّد"}
                </p>
              )}
              <p className={styles.muted}>
                التقييم:{" "}
                {e.evaluation.rating === null
                  ? "لم يُقيّم"
                  : `${e.evaluation.rating}/5`}{" "}
                · المساعدة: {ASSISTANCE_LABELS[e.evaluation.assistance]} ·{" "}
                {
                  { completed: "مكتمل", partial: "جزئي", interrupted: "متوقف" }[
                    e.evaluation.completion
                  ]
                }
              </p>
              {e.evaluation.notes && (
                <p className={styles.note}>{e.evaluation.notes}</p>
              )}
              <div className={styles.options}>
                {visit.patientId && e.kind === "game" && (
                  <Link
                    className={styles.link}
                    href={`/control/patients/${visit.patientId}/sessions/${e.sessionId}`}
                  >
                    النتيجة التفصيلية
                  </Link>
                )}
                {onEvaluate && (
                  <button onClick={() => onEvaluate(row.id)}>
                    تعديل التقييم والملاحظات
                  </button>
                )}
              </div>
            </article>
          );
        })}
      {!activities.length && (
        <p className={styles.muted}>
          ستُربط نتائج الألعاب هنا بعد انتهاء النشاط وتأكيد حفظه. يمكنك إضافة
          تمرين خلال الاستراحة.
        </p>
      )}
    </div>
  );
}
function Rating({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className={styles.rating} aria-label="تقييم الأخصائي من صفر إلى خمسة">
      <button
        type="button"
        aria-pressed={value === null}
        onClick={() => onChange(null)}
      >
        بلا تقييم
      </button>
      {[0, 1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-pressed={value === n}
          onClick={() => onChange(n)}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
function EvaluationFields({
  value,
  onChange,
}: {
  value: Evaluation;
  onChange: (e: Evaluation) => void;
}) {
  return (
    <>
      <p className={styles.muted}>
        تقييم الأخصائي: ٠ لم ينجز الهدف، ٥ أتقنه. منفصل عن نجوم اللعبة.
      </p>
      <Rating
        value={value.rating}
        onChange={(rating) => onChange({ ...value, rating })}
      />
      <div className={styles.fields}>
        <label className={styles.field}>
          مستوى المساعدة
          <select
            value={value.assistance}
            onChange={(e) =>
              onChange({
                ...value,
                assistance: e.target.value as Evaluation["assistance"],
              })
            }
          >
            {Object.entries(ASSISTANCE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          حالة الإنجاز
          <select
            value={value.completion}
            onChange={(e) =>
              onChange({
                ...value,
                completion: e.target.value as Evaluation["completion"],
              })
            }
          >
            <option value="completed">مكتمل</option>
            <option value="partial">جزئي</option>
            <option value="interrupted">متوقف</option>
          </select>
        </label>
        <label className={`${styles.field} ${styles.wide}`}>
          ملاحظات الأخصائي
          <textarea
            maxLength={2000}
            value={value.notes}
            onChange={(e) => onChange({ ...value, notes: e.target.value })}
          />
        </label>
      </div>
    </>
  );
}
export function ActivityEvaluation({
  visit,
  entry,
  disabled,
  onSave,
}: {
  visit: Visit;
  entry: GameReference | ExerciseBlock;
  disabled: boolean;
  onSave: (e: Evaluation) => Promise<void>;
}) {
  const [draft, setDraft] = useState(entry.evaluation),
    [result, setResult] = useState<AnyStoredSession | null>(null);
  const resultId = entry.kind === "game" ? entry.sessionId : null;
  useEffect(() => {
    if (!visit.patientId || !resultId) return;
    let cancelled = false;
    void getSessionHistoryRecord(visit.patientId, resultId)
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [visit.patientId, resultId]);
  return (
    <>
      <h3 className="font-bold">
        {entry.kind === "game" ? gameTitle(entry.gameId) : entry.title}
      </h3>
      {entry.kind === "exercise" ? (
        <p className={styles.note}>
          {entry.goal} · {entry.repetitions} تكرار · ثبات {entry.holdSeconds}{" "}
          ثانية · {entry.confirmed ? "مؤكد من الأخصائي" : "غير مؤكد"}
        </p>
      ) : result ? (
        <div className={styles.entry}>
          {(result.gameId === "achievement-city-3d" || result.gameId === "ocean-wonders-3d" || result.gameId === "achievement-forest-3d") ? (
            <p>
              المستوى {result.endingLevel} من 3 · إنجازات مؤكدة:{" "}
              {result.confirmedAchievements + result.assistedAchievements} من {result.targetAchievements}
            </p>
          ) : (
          <>
          <p>
            المرحلة: {result.endingStage} · الصعوبة:{" "}
            {(
              { EASY: "سهل", MEDIUM: "متوسط", ADVANCED: "متقدم" } as Record<
                string,
                string
              >
            )[result.endingDifficulty] ?? result.endingDifficulty}
          </p>
          <p>
            المراحل المكتملة: {result.completedStageCount ?? "غير متاح"} ·
            المتجاوزة: {result.skippedStageCount ?? "غير متاح"}
          </p>
          </>
          )}
          {"totalStars" in result && (
            <p>نجوم اللعبة: {String(result.totalStars ?? "غير متاح")}</p>
          )}
          <p className={styles.muted}>
            نتائج اللعبة محفوظة كما هي. التقييم أدناه لا يغيّر التسجيل أو
            النقاط.
          </p>
        </div>
      ) : (
        <p className={styles.muted}>
          {visit.patientId
            ? "جاري قراءة النتيجة المحفوظة…"
            : "نشاط ضيف مؤقت؛ لا تُحفظ مقاييسه في سجل مريض."}
        </p>
      )}
      {entry.kind === "game" && (
        <p className={styles.muted}>
          {GAME_REGISTRY.find((g) => g.id === entry.gameId)?.shortDescriptionAr}
        </p>
      )}
      <EvaluationFields value={draft} onChange={setDraft} />
      <button
        disabled={disabled}
        className={`${styles.button} ${styles.primary}`}
        onClick={() =>
          void onSave({
            ...draft,
            updatedAt: Date.now(),
            updatedByUid: visit.ownerUid,
          })
        }
      >
        حفظ التقييم والمتابعة
      </button>
    </>
  );
}
function FinishForm({
  visit,
  disabled,
  onFinish,
}: {
  visit: Visit;
  disabled: boolean;
  onFinish: (notes: string, rating: number | null) => Promise<void>;
}) {
  const [notes, setNotes] = useState(visit.finalNotes),
    [rating, setRating] = useState(visit.overallRating);
  return (
    <>
      <label className={styles.field}>
        الملاحظات الختامية
        <textarea
          maxLength={2000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <p className={styles.muted}>
        تقييم عام اختياري؛ تقدير الأخصائي غير المقنن.
      </p>
      <Rating value={rating} onChange={setRating} />
      <p className={styles.muted}>
        {visit.patientId
          ? "ستُحفظ الزيارة في سجل المريض، دون تكرار نتائج الألعاب."
          : "جلسة الضيف مؤقتة؛ إنهاؤها لا يُنشئ ملف مريض أو سجلًا دائمًا."}
      </p>
      <button
        className={`${styles.button} ${styles.primary}`}
        disabled={disabled}
        onClick={() => void onFinish(notes.trim(), rating)}
      >
        حفظ وإنهاء الجلسة
      </button>
    </>
  );
}

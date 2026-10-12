"use client";
import {
  ProgressiveStageSelect,
  AdditionalOptions,
} from "@/components/control/setup/ProgressiveStages";
import Link from "next/link";
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { useLibraryLaunchAdapter } from "@/components/control/library/launch/LibraryLaunchBoundary";
import { useCastleSession } from "@/lib/castlelegends3d/useSession";
import { GAME_ID } from "@/lib/castlelegends3d/live";
import {
  STAGES,
  EXERCISES,
  type Mode,
  type Side,
} from "@/lib/castlelegends3d/curriculum";
import { LIMBS, exercise, type Config } from "@/lib/castlelegends3d/engine";
import { CastleView, Crest } from "./CastleView";
import styles from "./castle.module.css";
const limbNames = {
  rightArm: "الذراع اليمنى",
  leftArm: "الذراع اليسرى",
  rightLeg: "الساق اليمنى",
  leftLeg: "الساق اليسرى",
};
export function CastleControl() {
  return isRealtimeEnabled() ? (
    <LiveCastleControl />
  ) : (
    <main className={styles.control} lang="ar">
      <h1>أسطورة قلعة شموس</h1>
      <p>يلزم إعداد اتصال شموس المشترك لبدء جلسة متزامنة.</p>
      <Link href="/control">مكتبة الأنشطة</Link>
    </main>
  );
}
function LiveCastleControl() {
  const session = useCastleSession(),
    { state: s, send } = session;
  useLibraryLaunchAdapter(GAME_ID, {
    modes: ["MANUAL"],
    sessionKey: s?.sessionId,
    apply: () => {
      if (
        !s ||
        !session.connected ||
        session.blocked ||
        !["ready", "paused"].includes(s.status)
      )
        return false;
      return true;
    },
  });
  if (!s)
    return (
      <main className={styles.control} lang="ar">
        <h1>أسطورة قلعة شموس</h1>
        <p role="status">
          {session.blocked
            ? "توجد جلسة نشطة في نافذة أخرى."
            : (session.error ?? "جارٍ تجهيز الرحلة…")}
        </p>
        {session.blocked && (
          <button
            className={styles.button}
            onClick={() => {
              if (
                window.confirm("نقل التحكم من النافذة الأخرى إلى هذه النافذة؟")
              )
                session.takeover();
            }}
          >
            نقل التحكم
          </button>
        )}
        <Link href="/control">مكتبة الأنشطة</Link>
      </main>
    );
  const editable = ["ready", "paused"].includes(s.status),
    enabled = session.connected && !session.blocked,
    combat = s.status === "running" && s.phase === "encounter",
    prompt = exercise(s),
    config = (patch: Partial<Config>) =>
      send({ type: "configure", config: patch });
  return (
    <main className={styles.control} lang="ar">
      <div className={styles.inner}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <Crest />
            <div>
              <span className={styles.eyebrow}>
                SHUMOS CARE · CASTLE LEGENDS
              </span>
              <h1 className={styles.title}>أسطورة قلعة شموس</h1>
              <p className={styles.subtitle}>
                كل حركة تضيء الطريق · مغامرة حركية بتوجيه المعالج
              </p>
            </div>
          </div>
          <nav className={styles.links}>
            <Link href="/control">مكتبة الأنشطة</Link>
            <a href="/display" target="_blank" rel="noopener">
              شاشة الطفل ↗
            </a>
          </nav>
        </header>
        <div className={styles.layout}>
          <div className={styles.main}>
            <CastleView state={s} connected={enabled} />
            <section className={styles.actionsPanel}>
              <div className={styles.actionHeader}>
                <div>
                  <h2>
                    {combat
                      ? prompt.name
                      : s.status === "ended"
                        ? "نتائج الرحلة"
                        : "قيادة الرحلة"}
                  </h2>
                  <p className={styles.subtitle}>
                    {combat
                      ? "راقب الحركة ثم أكد النجاح. لا توجد مهلة أو عقوبة."
                      : STAGES[s.stage].name}
                  </p>
                </div>
                <span className={styles.eyebrow}>THERAPIST CONTROL</span>
              </div>
              {session.error && (
                <p className={styles.alert} role="alert">
                  {session.error}
                </p>
              )}
              <div className={styles.actions}>
                {s.status === "ended" && (
                  <button
                    className={`${styles.button} ${styles.primary}`}
                    disabled={!enabled}
                    onClick={() =>
                      send({ type: "new", sessionId: crypto.randomUUID() })
                    }
                  >
                    جلسة جديدة بنفس الإعدادات
                  </button>
                )}
                {(s.status === "ready" || s.status === "paused") && (
                  <button
                    className={`${styles.button} ${styles.primary}`}
                    disabled={!enabled}
                    onClick={() =>
                      send({
                        type: s.status === "ready" ? "start" : "resume",
                        at: Date.now(),
                      })
                    }
                  >
                    {s.status === "ready" ? "ابدأ المغامرة" : "استئناف الرحلة"}
                  </button>
                )}
                {s.status === "running" && (
                  <>
                    <button
                      className={`${styles.button} ${styles.primary}`}
                      disabled={!enabled || !combat}
                      onClick={() => send({ type: "confirm" })}
                    >
                      ✓ تأكيد نجاح الحركة
                    </button>
                    <button
                      className={styles.button}
                      disabled={!enabled || !combat}
                      onClick={() => send({ type: "assist" })}
                    >
                      نجاح بمساعدة
                    </button>
                    <button
                      className={styles.button}
                      disabled={!enabled}
                      onClick={() => send({ type: "pause" })}
                    >
                      استراحة
                    </button>
                  </>
                )}
                <button
                  className={styles.button}
                  disabled={!enabled || !combat}
                  onClick={() => send({ type: "repeat" })}
                >
                  إعادة عرض الحركة
                </button>
                <button
                  className={styles.button}
                  disabled={!enabled || !combat}
                  onClick={() => send({ type: "skip" })}
                >
                  تجاوز الحركة
                </button>
                <button
                  className={styles.button}
                  disabled={!enabled || !combat}
                  onClick={() => {
                    if (
                      window.confirm(
                        "تجاوز هذه المواجهة؟ ستُسجّل كتجاوز، دون هزيمة العدو.",
                      )
                    )
                      send({ type: "advance" });
                  }}
                >
                  تجاوز المواجهة
                </button>
                {s.status === "stage-complete" && (
                  <button
                    className={`${styles.button} ${styles.primary}`}
                    disabled={!enabled}
                    onClick={() => send({ type: "next" })}
                  >
                    {s.stage === 8
                      ? "إنهاء المغامرة وحفظ النتائج"
                      : "المرحلة التالية"}
                  </button>
                )}
                <button
                  className={styles.button}
                  disabled={!enabled || s.status === "ended"}
                  onClick={() => {
                    if (
                      window.confirm(
                        "إعادة المرحلة من بدايتها؟ تُحفظ المحاولات السابقة في النتائج.",
                      )
                    )
                      send({ type: "restart" });
                  }}
                >
                  إعادة المرحلة
                </button>
                <button
                  className={`${styles.button} ${styles.danger}`}
                  disabled={!enabled || s.status === "ended"}
                  onClick={() => {
                    if (window.confirm("إنهاء الجلسة وحفظ ما أُنجز؟"))
                      send({ type: "end", at: Date.now() });
                  }}
                >
                  إنهاء الجلسة
                </button>
              </div>
              <div className={styles.stats}>
                <span>
                  <strong>
                    {s.attempts.filter((a) => a.result === "confirmed").length}
                  </strong>
                  تأكيد ناجح
                </span>
                <span>
                  <strong>
                    {s.attempts.filter((a) => a.result === "assisted").length}
                  </strong>
                  بمساعدة
                </span>
                <span>
                  <strong>
                    {s.attempts.filter((a) => a.result === "skipped").length}
                  </strong>
                  تجاوز حركة
                </span>
                <span>
                  <strong>{s.completed.length}/9</strong>مراحل مكتملة
                </span>
                <span>
                  {Math.floor(s.elapsedMs / 60000)}:
                  {String(Math.floor(s.elapsedMs / 1000) % 60).padStart(2, "0")}{" "}
                  وقت اللعب
                </span>
              </div>
            </section>
          </div>
          <aside className={styles.panel}>
            <h2>إعدادات المغامرة</h2>

            <div className={styles.field}>
              <label htmlFor="castle-stage">المرحلة</label>
              <ProgressiveStageSelect
                onSelect={(value) =>
                  send({ type: "stage", stage: Number(value) })
                }
              >
                <select
                  id="castle-stage"
                  value={s.stage}
                  disabled={
                    !enabled || (!editable && s.status !== "stage-complete")
                  }
                  onChange={(e) =>
                    send({ type: "stage", stage: Number(e.target.value) })
                  }
                >
                  {STAGES.map((stage, i) => (
                    <option value={i} key={i}>
                      {i + 1} · {stage.name}
                    </option>
                  ))}
                </select>
              </ProgressiveStageSelect>
            </div>
            <div className={styles.field}>
              <label htmlFor="castle-mode">نمط الحركة</label>
              <select
                id="castle-mode"
                value={s.config.mode}
                disabled={!editable || !enabled}
                onChange={(e) =>
                  config({
                    mode: e.target.value as Mode,
                    exercises: [],
                    limbs: [...LIMBS],
                  })
                }
              >
                <option value="hands">الذراعان فقط</option>
                <option value="legs">الساقان فقط</option>
                <option value="combined">حركات مشتركة</option>
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="castle-side">الجهة المشاركة</label>
              <select
                id="castle-side"
                value={s.config.side}
                disabled={!editable || !enabled}
                onChange={(e) =>
                  config({ side: e.target.value as Side, exercises: [] })
                }
              >
                <option value="bilateral">الجهتان حسب الحركة</option>
                <option value="right">اليمنى فقط</option>
                <option value="left">اليسرى فقط</option>
              </select>
            </div>
            <fieldset disabled={!editable || !enabled}>
              <legend>الأطراف المشاركة</legend>
              <div className={styles.checks}>
                {LIMBS.map((limb) => (
                  <label key={limb}>
                    <input
                      type="checkbox"
                      checked={s.config.limbs.includes(limb)}
                      onChange={(e) =>
                        config({
                          limbs: e.target.checked
                            ? [...s.config.limbs, limb]
                            : s.config.limbs.filter((l) => l !== limb),
                        })
                      }
                    />
                    {limbNames[limb]}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset disabled={!editable || !enabled}>
              <legend>اختيار الحركات · فارغ = تنويع تلقائي</legend>
              <div className={styles.exerciseChoices}>
                {EXERCISES.filter(
                  (e) => e.mode === s.config.mode && (!e.mat || s.config.mat),
                ).map((e) => (
                  <label key={e.id}>
                    <input
                      type="checkbox"
                      checked={s.config.exercises.includes(e.id)}
                      onChange={(v) =>
                        config({
                          exercises: v.target.checked
                            ? [...s.config.exercises, e.id]
                            : s.config.exercises.filter((id) => id !== e.id),
                        })
                      }
                    />{" "}
                    {e.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className={styles.field}>
              <label htmlFor="castle-presentation">عرض المدرب</label>
              <select
                id="castle-presentation"
                value={s.config.presentation}
                disabled={!editable || !enabled}
                onChange={(e) =>
                  config({
                    presentation: e.target.value as Config["presentation"],
                  })
                }
              >
                <option value="seated">جالس · مع بدائل مريحة</option>
                <option value="standing">واقف · بتوجيه المعالج</option>
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="castle-reps">التكرارات في كل جولة</label>
              <select
                id="castle-reps"
                value={s.config.repetitions}
                disabled={s.status !== "ready" || !enabled}
                onChange={(e) =>
                  config({ repetitions: Number(e.target.value) })
                }
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option value={n} key={n}>
                    {n} حركات
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="castle-range">حجم الحركة المعروضة</label>
              <select
                id="castle-range"
                value={s.config.movementScale}
                disabled={!editable || !enabled}
                onChange={(e) =>
                  config({ movementScale: Number(e.target.value) })
                }
              >
                <option value="0.35">صغيرة</option>
                <option value="0.65">مريحة</option>
                <option value="1">كاملة</option>
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="castle-hold">ثبات اختياري بإشراف المعالج</label>
              <select
                id="castle-hold"
                value={s.config.holdSeconds}
                disabled={!editable || !enabled}
                onChange={(e) =>
                  config({ holdSeconds: Number(e.target.value) })
                }
              >
                {[0, 2, 3, 5].map((n) => (
                  <option value={n} key={n}>
                    {n ? `${n} ثوانٍ` : "دون ثبات"}
                  </option>
                ))}
              </select>
            </div>
            <fieldset disabled={!editable || !enabled}>
              <legend>حصيرة البصمات</legend>
              <label className={styles.note}>
                <input
                  type="checkbox"
                  checked={s.config.mat}
                  onChange={(e) =>
                    config({ mat: e.target.checked, exercises: [] })
                  }
                />{" "}
                تمارين الحصيرة بتأكيد المعالج
              </label>
              <div className={styles.field}>
                <select
                  aria-label="هدف الحصيرة"
                  value={s.config.matTarget}
                  disabled={!s.config.mat}
                  onChange={(e) =>
                    config({ matTarget: e.target.value as Config["matTarget"] })
                  }
                >
                  <option value="blue">الدائرة الزرقاء</option>
                  <option value="orange">الدائرة البرتقالية</option>
                  <option value="green">الدائرة الخضراء</option>
                </select>
              </div>
            </fieldset>
            <AdditionalOptions>
              <div className={styles.field}>
                <label htmlFor="castle-quality">جودة الرسوم</label>
                <select
                  id="castle-quality"
                  value={s.config.quality}
                  disabled={!editable || !enabled}
                  onChange={(e) =>
                    config({ quality: e.target.value as Config["quality"] })
                  }
                >
                  <option value="high">عالية · ظلال وتفاصيل</option>
                  <option value="low">خفيفة · للأجهزة الأبطأ</option>
                </select>
              </div>
            </AdditionalOptions>
            <fieldset disabled={!editable || !enabled}>
              <div className={styles.checks}>
                <label>
                  <input
                    type="checkbox"
                    checked={s.config.reducedMotion}
                    onChange={(e) =>
                      config({ reducedMotion: e.target.checked })
                    }
                  />{" "}
                  تقليل الحركة
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={s.config.muted}
                    onChange={(e) => config({ muted: e.target.checked })}
                  />{" "}
                  كتم الصوت
                </label>
              </div>
              <label className={styles.field}>
                مستوى الصوت
                <input
                  aria-label="مستوى الصوت"
                  type="range"
                  min="0"
                  max="1"
                  step=".05"
                  value={s.config.volume}
                  onChange={(e) => config({ volume: Number(e.target.value) })}
                />
              </label>
            </fieldset>
            <p className={styles.note}>
              المدرب يوضح الحركة؛ المعالج يختار البديل المناسب ويؤكد المحاولة.
              الحساسات اختيار مستقبلي عبر منصة شموس. لا يوجد تتبع بالكاميرا أو
              قياس تلقائي لموقع القدم أو تحميل الوزن.
            </p>
            <div className={styles.status} role="status">
              {enabled ? "● التحكم متصل" : "○ التحكم متوقف أو غير متصل"}
              <br />
              {session.displayConnected
                ? "● شاشة الطفل متصلة"
                : "○ افتح شاشة الطفل"}
              <br />
              {
                {
                  saved: "✓ حُفظت النتائج في سجل المريض",
                  retry: "تعذّر حفظ النتائج؛ تجري إعادة المحاولة",
                  "walk-in": "جلسة زائر · دون سجل مريض",
                  saving: "جارٍ حفظ النتائج…",
                  "not-ended": "تُحفظ النتائج عند إنهاء الجلسة",
                }[session.history]
              }
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

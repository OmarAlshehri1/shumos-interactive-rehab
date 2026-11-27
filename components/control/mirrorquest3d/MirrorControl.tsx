"use client";
import { ControlSlot } from "@/components/control/ui/ControlWorkspace";
import { NativeSetupSections } from "@/components/control/setup/GameSetupLayout";
import {
  ProgressiveStageSelect,
  AdditionalOptions,
} from "@/components/control/setup/ProgressiveStages";
import { useLibraryLaunchAdapter } from "@/components/control/library/launch/LibraryLaunchBoundary";
import Link from "next/link";
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import {
  CHARACTERS,
  LIMBS,
  STAGES,
  randomCharacter,
  target,
  type Limb,
} from "@/lib/mirrorquest3d/engine";
import { useMirrorSession } from "@/lib/mirrorquest3d/useSession";
import { MirrorView } from "@/components/display/mirrorquest3d/MirrorView";
import styles from "@/components/display/mirrorquest3d/mirror.module.css";
import ui from "@/components/control/ui/therapist.module.css";
const animals = {
  lion: ["🦁", "الأسد"],
  rabbit: ["🐰", "الأرنب"],
  bear: ["🐻", "الدب"],
  fox: ["🦊", "الثعلب"],
};
const names: Record<Limb, string> = {
  RIGHT_HAND: "اليد اليمنى",
  LEFT_HAND: "اليد اليسرى",
  RIGHT_FOOT: "القدم اليمنى",
  LEFT_FOOT: "القدم اليسرى",
};
export function MirrorControl() {
  return isRealtimeEnabled() ? (
    <LiveMirrorControl />
  ) : (
    <main className={styles.control}>
      <h1>المرآة السحرية</h1>
      <p>يلزم إعداد اتصال المنصة المشتركة لفتح جلسة متزامنة.</p>
      <Link href="/control">مكتبة الأنشطة</Link>
    </main>
  );
}
function LiveMirrorControl() {
  const session = useMirrorSession(),
    { state: s, send } = session;
  useLibraryLaunchAdapter("mirror-quest-3d", {
    modes: ["MANUAL"],
    apply: () => {
      if (
        !s ||
        !session.connected ||
        session.blocked ||
        !["ready", "paused"].includes(s.status)
      )
        return false;
      send({ type: "configure", config: { input: "manual" } });
      return true;
    },
  });
  if (!s)
    return (
      <main className={styles.control}>
        <h1>المرآة السحرية</h1>
        <p role="status">
          {session.blocked
            ? "هذه الجلسة تعمل في نافذة أخرى. أغلقها ثم أعد المحاولة."
            : (session.error ?? "جاري تجهيز الجلسة المشتركة…")}
        </p>
        <Link href="/control">مكتبة الأنشطة</Link>
      </main>
    );
  const editable = ["ready", "paused"].includes(s.status),
    p = target(s);
  const setupStages = (
    <ProgressiveStageSelect
      onSelect={(value) => send({ type: "stage", stage: Number(value) })}
    >
      <select
        id="stage"
        value={s.stage}
        disabled={!editable && s.status !== "stage-complete"}
        onChange={(e) => send({ type: "stage", stage: Number(e.target.value) })}
      >
        {STAGES.map((stage, i) => (
          <option
            data-stage-description={`${stage.poses.length} حركات متتابعة`}
            key={i}
            value={i}
            disabled={s.accepted.some((p) => p.stage === i)}
          >
            المستوى {stage.level} · {s.config.limbs && s.config.limbs.length < 4 ? `حركات الأطراف المختارة ${i + 1}` : stage.name}
          </option>
        ))}
      </select>
    </ProgressiveStageSelect>
  );
  const setupSettings = (
    <aside className={styles.panel}>
      <h2>إعدادات الرحلة</h2>
      <ControlSlot slot="settings"><fieldset className={ui.group} disabled={!editable}><legend>الأطراف المشاركة</legend><div className={ui.choices}>{LIMBS.map(l => <label className={ui.choice} key={l}><input type="checkbox" checked={(s.config.limbs ?? LIMBS).includes(l)} disabled={s.config.limbs?.length === 1 && s.config.limbs.includes(l)} onChange={e => send({type:"configure", config:{limbs: e.target.checked ? [...(s.config.limbs ?? LIMBS), l] : (s.config.limbs ?? LIMBS).filter(v=>v!==l)}})} />{names[l]}</label>)}</div></fieldset></ControlSlot>
      {(s.status !== "ready" || !!s.startedAt) && setupStages}

      <div>
        <ControlSlot slot="settings"><label htmlFor="hold">مدة الثبات</label>
        <select
          id="hold"
          value={s.config.holdMs}
          disabled={!editable}
          onChange={(e) =>
            send({
              type: "configure",
              config: { holdMs: Number(e.target.value) },
            })
          }
        >
          {[500, 1200, 2000, 3000].map((n) => (
            <option value={n} key={n}>
              {n / 1000} ثانية
            </option>
          ))}
        </select></ControlSlot>
      </div>
      <AdditionalOptions>
        <div>
          <label htmlFor="tolerance">مرونة المطابقة</label>
          <select
            id="tolerance"
            value={s.config.tolerance}
            disabled={!editable}
            onChange={(e) =>
              send({
                type: "configure",
                config: { tolerance: Number(e.target.value) },
              })
            }
          >
            <option value={0.05}>دقيقة</option>
            <option value={0.09}>متوسطة</option>
            <option value={0.18}>واسعة</option>
          </select>
        </div>
        <div>
          <label htmlFor="quality">جودة العرض</label>
          <select
            id="quality"
            value={s.config.quality}
            disabled={!editable}
            onChange={(e) =>
              send({
                type: "configure",
                config: { quality: e.target.value as "low" | "high" },
              })
            }
          >
            <option value="high">عالية</option>
            <option value="low">خفيفة</option>
          </select>
        </div>
      </AdditionalOptions>
      <div>
        <label htmlFor="scale">حجم الحركة</label>
        <select
          id="scale"
          value={s.config.movementScale}
          disabled={!editable}
          onChange={(e) =>
            send({
              type: "configure",
              config: { movementScale: Number(e.target.value) },
            })
          }
        >
          <option value={0.5}>صغيرة</option>
          <option value={0.75}>متوسطة</option>
          <option value={1}>كاملة</option>
        </select>
      </div>
      <div>
        <ControlSlot slot="settings"><label htmlFor="presentation">عرض الشخصية</label>
        <select
          id="presentation"
          value={s.config.presentation}
          disabled={!editable}
          onChange={(e) =>
            send({
              type: "configure",
              config: {
                presentation: e.target.value as "seated" | "standing",
              },
            })
          }
        >
          <option value="seated">جالس</option>
          <option value="standing">واقف</option>
        </select></ControlSlot>
      </div>
      <div>
        <ControlSlot slot="settings"><label htmlFor="input">مصدر الحركة</label>
        <select
          id="input"
          value={s.config.input}
          disabled={!editable}
          onChange={(e) =>
            send({
              type: "configure",
              config: { input: e.target.value as "manual" | "simulated" },
            })
          }
        >
          <option value="manual">يدوي · بدون حساسات</option>
          <option value="simulated">حساسات محاكاة</option>
          <option disabled>حساسات فعلية · بانتظار التحقق</option>
        </select></ControlSlot>
      </div>

      <label>
        <input
          type="checkbox"
          checked={s.config.reducedMotion}
          disabled={!editable}
          onChange={(e) =>
            send({
              type: "configure",
              config: { reducedMotion: e.target.checked },
            })
          }
        />{" "}
        تقليل الحركة
      </label>
      <p className={styles.note}>
        وضع الشخصية مستقل عن وضع الطفل الفعلي ويختاره الأخصائي. الشخصية تمثّل
        الحركة بصريًا. لا تقيس زوايا المفاصل. الحركة يوجّهها الأخصائي، دون تصوير
        أو تتبّع بالكاميرا.
      </p>
      <div className={styles.status} role="status">
        {session.error ??
          (session.connected ? "● التحكم متصل" : "○ التحكم غير متصل")}
        <br />
        {session.displayConnected ? "● شاشة الطفل متصلة" : "○ افتح شاشة الطفل"}
        <br />
        {session.history === "saved"
          ? "✓ حُفظت الجلسة"
          : session.history === "walk-in"
            ? "جلسة زائر · دون سجل مريض"
            : session.history === "retry"
              ? "تعذّر الحفظ، تجري إعادة المحاولة"
              : ""}
      </div>
    </aside>
  );
  if (s.status === "ready" && !s.startedAt)
    return (
      <main
        className={styles.control}
        data-testid="mirror-control"
        data-status={s.status}
        data-stage={s.stage}
        dir="rtl"
      >
        <NativeSetupSections
          settings={setupSettings}
          stages={setupStages}
          start={
            <ControlSlot slot="session"><button
              type="button"
              disabled={!(session.connected && !session.blocked)}
              onClick={() => send({ type: "start", at: Date.now() })}
            >
              ابدأ النشاط
            </button></ControlSlot>
          }
        />
      </main>
    );
  return (
    <main className={styles.control} lang="ar">
      <div className={styles.inner}>
        <header data-native-game-header className={styles.header}>
          <div>
            <div className={styles.eyebrow}>SHUMOS CARE · MOTION STUDIO</div>
            <h1 className={styles.title}>المرآة السحرية</h1>
            <div className={styles.subtitle}>
              حركة صغيرة، إنجاز جميل · Mirror Quest 3D
            </div>
          </div>
          <div className={styles.links}>
            <Link href="/control">مكتبة الأنشطة</Link>
            <a href="/display" target="_blank" rel="noopener">
              فتح شاشة الطفل ↗
            </a>
          </div>
        </header>
        <div className={styles.grid}>
          <div className={styles.main}>
            <ControlSlot slot="preview"><MirrorView state={s} /></ControlSlot>
            <div className={styles.characters}>
              {CHARACTERS.map((character) => (
                <button
                  className={styles.character}
                  key={character}
                  disabled={!editable}
                  aria-pressed={s.config.character === character}
                  onClick={() =>
                    send({ type: "configure", config: { character } })
                  }
                >
                  <span aria-hidden="true" className={styles.animal}>
                    {animals[character][0]}
                  </span>
                  {animals[character][1]}
                </button>
              ))}
            </div>
            <div className={styles.controls}>
              <div className={styles.header}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 19 }}>تحكّم بالحركة</h2>
                  <p className={styles.subtitle}>
                    حرّك الشخصية لتطابق ظلّ صديقها، ثم اثبت بهدوء.
                  </p>
                </div>
                <button
                  className={styles.button}
                  disabled={!editable}
                  onClick={() =>
                    send({
                      type: "configure",
                      config: { character: randomCharacter(Math.random()) },
                    })
                  }
                >
                  اختيار عشوائي
                </button>
              </div>
              {LIMBS.filter(
                (l) => p.active.includes(l) || s.player[l] !== 0,
              ).map((l) => (
                <ControlSlot key={l} slot="assistance"><div className={styles.limb} data-control-limb key={l}>
                  <label htmlFor={l}>{names[l]}</label>
                  <input
                    id={l}
                    aria-label={names[l]}
                    type="range"
                    min="0"
                    max="1"
                    step=".01"
                    value={s.player[l]}
                    disabled={
                      s.status !== "running" ||
                      !session.connected ||
                      session.blocked
                    }
                    onChange={(e) =>
                      send({
                        type: "input",
                        limb: l,
                        value: Number(e.target.value),
                        sequence: 0,
                        at: 0,
                        source: "manual",
                      })
                    }
                  />
                  <button
                    className={styles.button}
                    disabled={s.status !== "running"}
                    onClick={() =>
                      send({
                        type: "input",
                        limb: l,
                        value: 0,
                        sequence: 0,
                        at: 0,
                        source: "manual",
                      })
                    }
                  >
                    راحة
                  </button>
                  <div
                    className={styles.directional}
                    role="group"
                    aria-label={`خطوات ${names[l]}`}
                  >
                    {[
                      [0, "راحة"],
                      [0.35, "↗ قليلًا"],
                      [0.65, "↑ أعلى"],
                      [1, "↑ كاملة"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        className={styles.button}
                        disabled={
                          s.status !== "running" ||
                          !session.connected ||
                          session.blocked
                        }
                        onClick={() =>
                          send({
                            type: "input",
                            limb: l,
                            value: Number(value) * s.config.movementScale,
                            sequence: 0,
                            at: 0,
                            source: "manual",
                          })
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div></ControlSlot>
              ))}
              {s.config.input === "simulated" && (
                <div>
                  <p className={styles.note}>
                    محاكاة الحركة · المعايرة المحايدة: 0. تبقى أشرطة التحكم
                    اليدوي أعلاه متاحة.
                  </p>
                  {p.active.map((l) => (
                    <ControlSlot key={l} slot="assistance"><div className={styles.limb} key={`sim-${l}`}>
                      <label htmlFor={`sim-${l}`}>محاكاة {names[l]}</label>
                      <input
                        id={`sim-${l}`}
                        type="range"
                        min="0"
                        max="1"
                        step=".01"
                        value={s.player[l]}
                        disabled={s.status !== "running"}
                        onChange={(e) =>
                          send({
                            type: "input",
                            limb: l,
                            value: Number(e.target.value),
                            sequence: 0,
                            at: 0,
                            source: "simulated",
                          })
                        }
                      />
                      <span>{Math.round(s.player[l] * 100)}%</span>
                    </div></ControlSlot>
                  ))}
                  <ControlSlot slot="session"><button
                    className={styles.button}
                    disabled={s.status !== "running"}
                    onClick={() => send({ type: "pause" })}
                  >
                    محاكاة فقد الحساس
                  </button></ControlSlot>
                </div>
              )}
              <div className={styles.actions}>
                {(s.status === "ready" || s.status === "paused") && (
                  <ControlSlot slot="session"><button
                    className={`${styles.button} ${styles.primary}`}
                    disabled={!session.connected || session.blocked}
                    onClick={() =>
                      send({
                        type: s.status === "ready" ? "start" : "resume",
                        at: Date.now(),
                      })
                    }
                  >
                    {s.status === "ready" ? "ابدأ الرحلة" : "متابعة"}
                  </button></ControlSlot>
                )}
                {s.status === "running" && (
                  <>
                    <ControlSlot slot="session"><button
                      className={`${styles.button} ${styles.primary}`}
                      onClick={() => send({ type: "pause" })}
                    >
                      إيقاف مؤقت
                    </button></ControlSlot>
                    <ControlSlot slot="assistance"><button
                      className={styles.button}
                      onClick={() => send({ type: "repeat" })}
                    >
                      أعد الحركة
                    </button></ControlSlot>
                    <ControlSlot slot="assistance"><button
                      className={styles.button}
                      onClick={() => send({ type: "assist" })}
                    >
                      قبول بمساعدة الأخصائي
                    </button></ControlSlot>
                    <ControlSlot slot="assistance"><button
                      className={styles.button}
                      onClick={() => send({ type: "skip" })}
                    >
                      تجاوز الحركة
                    </button></ControlSlot>
                  </>
                )}
                {s.status === "stage-complete" && (
                  <ControlSlot slot="settings"><button
                    className={`${styles.button} ${styles.primary}`}
                    onClick={() => send({ type: "next", at: Date.now() })}
                  >
                    {s.stage === 8 ? "إنهاء الرحلة" : "المرحلة التالية"}
                  </button></ControlSlot>
                )}
                <ControlSlot slot="navigation"><button
                  className={styles.button}
                  onClick={() => send({ type: "restart" })}
                >
                  إعادة البدء
                </button></ControlSlot>
                {s.status !== "ended" && (
                  <ControlSlot slot="session"><button
                    className={styles.button}
                    onClick={() => send({ type: "end", at: Date.now() })}
                  >
                    إنهاء الجلسة
                  </button></ControlSlot>
                )}
              </div>
              <div
                className={styles.progress}
                aria-label={`${s.completed.length} من 9 مراحل مكتملة`}
              >
                {STAGES.map((_, i) => (
                  <span
                    key={i}
                    className={`${styles.step} ${s.completed.includes(i) ? styles.done : ""}`}
                  />
                ))}
              </div>
              <div className={styles.stats}>
                {s.accepted.filter((a) => !a.skipped).length} حركة مقبولة ·{" "}
                {s.completed.length} / 9 مراحل
              </div>
            </div>
          </div>
          {setupSettings}
        </div>
      </div>
    </main>
  );
}

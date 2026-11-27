"use client";
import { ControlSlot } from "@/components/control/ui/ControlWorkspace";
import { NativeSetupSections } from "@/components/control/setup/GameSetupLayout";
import {
  AdditionalOptions,
  StagePicker,
} from "@/components/control/setup/ProgressiveStages";
import { useLibraryLaunchAdapter } from "@/components/control/library/launch/LibraryLaunchBoundary";
import Link from "next/link";
import { useCallback, useEffect, useRef } from "react";
import { STAGES, type Pointer } from "@/lib/buildquest3d/stages";
import {
  HELP,
  type Assistance,
  type InputMode,
} from "@/lib/buildquest3d/gameplay";
import { useBuildQuestSession } from "@/lib/buildquest3d/useSession";
import { useSimulation } from "@/lib/buildquest3d/useSimulation";
import { WorkshopCanvas } from "@/components/display/buildquest3d/WorkshopCanvas";
import styles from "@/components/display/buildquest3d/workshop.module.css";
import { usePatientContext } from "@/lib/patients/PatientSessionContext";
import { isRealtimeEnabled } from "@/lib/realtime/firebaseClient";
import { ManualWorkbench } from "./ManualWorkbench";
export function BuildQuestControl() {
  const { selectedPatient } = usePatientContext();
  const session = useBuildQuestSession(
      true,
      selectedPatient?.patientId ?? null,
    ),
    { state, connected } = session;
  const pointer = useRef<Pointer | null>(null);
  useLibraryLaunchAdapter("build-quest-3d", {
    modes: ["MANUAL", "RIGHT_HAND"],
    apply: (mode) => {
      if (
        !state ||
        !connected ||
        session.superseded ||
        !["ready", "paused"].includes(state.status)
      )
        return false;
      session.configure({ input: mode === "RIGHT_HAND" ? "sensor" : "mouse" });
      return true;
    },
  });
  const send = session.sendPointer;
  const sendPointer = useCallback(
    (p: Pointer, activate = false) => {
      pointer.current = p;
      send(p, activate);
    },
    [send],
  );
  useEffect(() => {
    pointer.current = null;
  }, [state?.run, state?.status, state?.config.input]);
  useSimulation(
    state,
    sendPointer,
    connected && state?.status === "running",
    pointer,
  );
  useEffect(() => {
    if (state?.status !== "running" || state?.config.input === "sensor") return;
    const timer = setInterval(() => {
      if (pointer.current) sendPointer(pointer.current);
    }, 60);
    return () => clearInterval(timer);
  }, [state?.status, state?.config.input, sendPointer]);
  if (session.superseded)
    return (
      <main className={styles.control}>
        <h1>عالم البناء</h1>
        <ControlSlot slot="dialogs"><p role="alert" data-testid="bq-superseded">
          تم نقل هذه الجلسة إلى نافذة تحكم أخرى. هذه النافذة لم تعد تتحكم
          باللعبة، أغلقها أو أعد تحميلها.
        </p></ControlSlot>
      </main>
    );
  if (!state && session.recoveryBlocked)
    return (
      <main className={styles.control}>
        <h1>عالم البناء</h1>
        <ControlSlot slot="dialogs"><p role="alert" data-testid="bq-recovery-blocked">
          توجد جلسة غير منتهية تعمل في نافذة تحكم أخرى.
          {session.takeoverAllowed
            ? " إذا كانت تلك النافذة مغلقة أو متوقفة يمكنك استعادة الجلسة هنا، وستعود متوقفة مؤقتًا بتقدّمها كما هو."
            : " تخص مريضًا آخر غير المختار هنا؛ أغلق النافذة الأخرى أو اختر المريض نفسه لاستعادتها."}
        </p></ControlSlot>
        {session.takeoverAllowed && (
          <button
            type="button"
            className={styles.link}
            data-testid="bq-take-over"
            onClick={session.takeOver}
          >
            استعادة الجلسة هنا
          </button>
        )}
      </main>
    );
  if (!state)
    return (
      <main className={styles.control}>
        <h1>عالم البناء</h1>
        <p>
          {session.error ??
            "جاري تجهيز الجلسة. أغلق أي شاشة تحكم أخرى للجلسة نفسها ثم أعد"}
          التحميل.
        </p>
      </main>
    );
  const editable =
      connected && (state.status === "ready" || state.status === "paused"),
    stage = STAGES[state.stage];
  const setupStages = (
    <StagePicker
      value={state.stage}
      disabled={!editable}
      items={STAGES.map((stage, index) => ({
        value: index,
        label: stage.title,
        description: `${stage.pieces.length} قطع لإكمال النموذج`,
      }))}
      onSelect={(value) => session.configure({}, Number(value))}
    />
  );
  const setupSettings = (
    <aside className={styles.panel}>
      {state.status !== "ready" && setupStages}<ControlSlot slot="settings"><p>تحريك القطع باللمس وأدوات الأخصائي متاح دائمًا، مع مساعدة التقاط مريحة.</p></ControlSlot>
      <label>
        طريقة التحكم
        <select
          aria-label="طريقة التحكم"
          value={state.config.input}
          disabled={!editable}
          onChange={(e) =>
            session.configure({ input: e.target.value as InputMode })
          }
        >
          <option value="mouse">يدوي · اللمس والفأرة ولوحة المفاتيح</option>
          <option value="sensor">حساس اليد اليمنى</option>
          <option value="controller">وحدة تحكم · تجريبية</option>
        </select>
      </label>
      <label>
        مساعدة الالتقاط
        <select
          aria-label="مساعدة الالتقاط"
          value={state.config.assistance}
          disabled={!editable}
          onChange={(e) => {
            const assistance = e.target.value as Assistance;
            session.configure({
              assistance,
              dwellMs: HELP[assistance].dwell,
            });
          }}
        >
          <option value="high">عالية</option>
          <option value="medium">متوسطة</option>
          <option value="low">منخفضة</option>
        </select>
      </label>
      <label>
        مدة الثبات (مللي ثانية)
        <input
          aria-label="مدة الثبات (مللي ثانية)"
          type="number"
          min="250"
          max="3000"
          step="50"
          disabled={!editable}
          value={state.config.dwellMs}
          onChange={(e) =>
            session.configure({ dwellMs: Number(e.target.value) })
          }
        />
      </label>
      <label>
        حجم منطقة الالتقاط
        <input
          aria-label="حجم منطقة الالتقاط"
          type="range"
          min=".65"
          max="1.5"
          step=".05"
          disabled={!editable}
          value={state.config.tolerance}
          onChange={(e) =>
            session.configure({ tolerance: Number(e.target.value) })
          }
        />
      </label>
      <AdditionalOptions>
        <label>
          جودة العرض
          <select
            aria-label="جودة العرض"
            disabled={!editable}
            value={state.config.quality}
            onChange={(e) =>
              session.configure({
                quality: e.target.value as "high" | "low",
              })
            }
          >
            <option value="high">عالية</option>
            <option value="low">خفيفة للأجهزة الأبطأ</option>
          </select>
        </label>
      </AdditionalOptions>
      <p className={styles.help}>
        الفأرة: انقر القطعة ثم حرّكها إلى الهدف.
        <br />
        الأسهم أو WASD للحركة، ومسافة للاختيار.
        <br />
        الحساس: ثبّت المؤشر على القطعة ثم حرّكه إلى الهدف.
      </p>
      {state.config.input === "sensor" && (
        <p
          className={styles.notice}
          data-testid="sensor-status"
          data-status={session.sensorStatus}
        >
          حالة اليد:{" "}
          {session.sensorStatus === "tracking"
            ? "متصل"
            : session.sensorStatus === "align"
              ? "قرّب مؤشر اليد من المؤشر الأبيض للمتابعة"
              : "بانتظار اليد"}
          . استخدم اتصال الحساس الموجود في المنصة.
        </p>
      )}
      {state.config.input === "controller" && (
        <p className={styles.notice}>
          يمكن تجربة الأسهم والفأرة أو Gamepad القياسي. توافق وحدات Joy-Con
          الفعلية لم يُختبر.
        </p>
      )}
    </aside>
  );
  if (
    state.status === "ready" &&
    !state.events.length &&
    !state.completed.length
  )
    return (
      <main className={styles.control} lang="ar">
        <NativeSetupSections
          settings={setupSettings}
          stages={setupStages}
          start={
            <ControlSlot slot="assistance"><button
              type="button"
              disabled={!connected}
              onClick={() => session.act("start")}
            >
              ابدأ النشاط
            </button></ControlSlot>
          }
        />
      </main>
    );
  return (
    <main className={styles.control} lang="ar">
      <div className={styles.controlInner}>
        <header data-native-game-header className={styles.controlHeader}>
          <div>
            <div className={styles.brand}>SHUMOS CARE · BUILD QUEST 3D</div>
            <h1 className={styles.title}>عالم البناء</h1>
            <div className={styles.subtle}>رحلة هادئة، قطعة بعد قطعة</div>
          </div>
          <div className={styles.buttons}>
            <Link href="/control/activities" className={styles.link}>
              مكتبة الأنشطة
            </Link>
            <a
              className={styles.link}
              href={
                isRealtimeEnabled()
                  ? "/display"
                  : `/display/build-quest-3d?session=${state.session}`
              }
              target="_blank"
              rel="noopener"
            >
              فتح شاشة الطفل
            </a>
          </div>
        </header>
        <div className={styles.panelGrid}>
          {setupSettings}

          <section className={styles.panel}>
            <p role="status" data-testid="sync-status">
              {!connected
                ? "الاتصال متوقف؛ التحكم معلّق بأمان"
                : session.pending
                  ? "جارٍ مزامنة التغيير…"
                  : session.cloud
                    ? "متصل · التغييرات مؤكدة"
                    : "جلسة محلية"}
            </p>
            {session.error && <ControlSlot slot="dialogs"><p role="alert">{session.error}</p></ControlSlot>}
            {session.recovered &&
              (state.status === "paused" || state.status === "ready") && (
                <p role="status" data-testid="bq-recovered">
                  تمت استعادة الجلسة بعد إعادة تحميل الصفحة، وتم الاحتفاظ
                  بالمرحلة والقطع الموضوعة. اللعبة متوقفة مؤقتًا حتى تضغط
                  «استئناف».
                </p>
              )}
            <div className={styles.preview}>
              <ControlSlot slot="preview"><WorkshopCanvas state={state} onPointer={sendPointer} /></ControlSlot>
            </div>
            <ControlSlot slot="assistance"><ManualWorkbench
              state={state}
              enabled={connected && state.status === "running"}
              select={(id) => {
                pointer.current = null;
                session.selectPiece(id);
              }}
              place={(id) => {
                pointer.current = null;
                session.placePiece(id);
              }}
              move={(p) => sendPointer(p)}
            /></ControlSlot>
            <div
              className={styles.stats}
              data-testid="build-state"
              data-status={state.status}
              data-stage={state.stage}
              data-run={state.run}
              data-events={state.events.length}
              data-placed={state.placed.length}
              data-selected={state.selected ?? ""}
              data-pointer-x={state.pointer.x}
              data-pointer-y={state.pointer.y}
            >
              <strong>{stage.title}</strong>
              <span>
                القطع: {state.placed.length} / {stage.pieces.length}
              </span>
              <span>المباني المكتملة: {state.completed.length}</span>
            </div>
            <div className={styles.buttons}>
              <ControlSlot slot="assistance"><button
                className={styles.primary}
                disabled={!connected || state.status !== "ready"}
                onClick={() => session.act("start")}
              >
                بدء الجلسة
              </button></ControlSlot>
              <ControlSlot slot="session"><button
                disabled={!connected || state.status !== "running"}
                onClick={() => session.act("pause")}
              >
                إيقاف مؤقت
              </button></ControlSlot>
              <ControlSlot slot="session"><button
                disabled={!connected || state.status !== "paused"}
                onClick={() => session.act("resume")}
              >
                متابعة
              </button></ControlSlot>
              <ControlSlot slot="navigation"><button
                disabled={!connected || state.status === "ended"}
                onClick={() => session.act("restart")}
              >
                إعادة المرحلة
              </button></ControlSlot>
              <ControlSlot slot="settings"><button
                disabled={!connected || state.status !== "complete"}
                className={styles.primary}
                onClick={() => session.act("next")}
              >
                {state.stage === 8 ? "عرض الملخص" : "المرحلة التالية"}
              </button></ControlSlot>
              <ControlSlot slot="assistance"><button
                disabled={!connected || state.status === "ended"}
                onClick={() => session.act("skip")}
              >
                تخطي المرحلة
              </button></ControlSlot>
              <ControlSlot slot="session"><button
                disabled={!connected || state.status === "ended"}
                onClick={() => session.act("end")}
              >
                إنهاء الجلسة
              </button></ControlSlot>
            </div>
            <p aria-live="polite">{state.feedback}</p>
            {state.status === "ended" && (
              <div className={styles.summary}>
                <span>✓ {state.completed.length} مبانٍ مكتملة</span>
                <span>{state.events.length} قطعة موضوعة</span>
                <span>{state.skipped.length} مراحل متخطاة</span>
              </div>
            )}
            <p className={styles.notice}>
              {session.cloud
                ? "يمكن فتح شاشة الطفل على جهاز آخر عبر الرابط أعلاه. تُحفظ النتيجة للمريض المحدد عند إنهاء الجلسة."
                : "جلسة محلية على المتصفح نفسه. لا تُحفظ في سجل المريض."}
              {state.status === "ended" && (
                <span
                  data-testid="history-status"
                  data-status={session.historyStatus}
                >
                  {session.historyStatus === "saved"
                    ? " النتيجة محفوظة."
                    : session.historyStatus === "walk-in"
                      ? " جلسة دون مريض؛ لا حفظ في السجل."
                      : session.historyStatus === "retry"
                        ? " تعذّر الحفظ؛ ستُعاد المحاولة عند الاتصال."
                        : session.historyStatus === "saving"
                          ? " جارٍ حفظ النتيجة…"
                          : ""}
                </span>
              )}
              اختبار الحساس الفعلي ووحدات التحكم والعرض على جهاز الإسقاط ما زال
              مطلوبًا.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}

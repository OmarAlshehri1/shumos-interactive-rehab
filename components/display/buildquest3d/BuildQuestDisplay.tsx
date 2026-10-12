"use client";
import { useCallback, useEffect, useRef } from "react";
import type { State } from "@/lib/buildquest3d/gameplay";
import { STAGES, type Pointer } from "@/lib/buildquest3d/stages";
import { useBuildQuestSession } from "@/lib/buildquest3d/useSession";
import { useSimulation } from "@/lib/buildquest3d/useSimulation";
import { WorkshopCanvas } from "./WorkshopCanvas";
import styles from "./workshop.module.css";
/** Local-computer mode (no Firebase): the Display window follows the Control window over a BroadcastChannel. */
export function BuildQuestDisplay({ sessionId }: { sessionId?: string }) {
  const session = useBuildQuestSession(false, null, sessionId);
  return <BuildQuestDisplayView state={session.state} connected={session.connected} send={session.sendPointer} />;
}

/** Pure presentation of an accepted Build Quest state. Used by the local Display and by the shared live-session Display module. */
export function BuildQuestDisplayView({ state, connected, send }: { state: State | null; connected: boolean; send: (p: Pointer, activate?: boolean) => void }) {
  const pointer = useRef<Pointer | null>(null);
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
    if (
      !connected ||
      state?.status !== "running" ||
      state?.config.input === "sensor"
    )
      return;
    const timer = setInterval(() => {
      if (pointer.current) sendPointer(pointer.current);
    }, 60);
    return () => clearInterval(timer);
  }, [state?.status, state?.config.input, connected, sendPointer]);
  if (!state)
    return (
      <main dir="rtl" className={styles.shell}>
        <div className={styles.overlay}>
          <h1>عالم البناء</h1>
          <p>بانتظار الأخصائي لبدء رحلة البناء</p>
        </div>
      </main>
    );
  const stage = STAGES[state.stage];
  return (
    <main
      dir="rtl"
      lang="ar"
      className={styles.shell}
      data-testid="build-state"
      data-status={state.status}
      data-stage={state.stage}
      data-run={state.run}
      data-events={state.events.length}
      data-placed={state.placed.length}
    >
      <header className={styles.header}>
        <div>
          <div className={styles.brand}>SHUMOS CARE · BUILD QUEST 3D</div>
          <h1 className={styles.title}>{stage.title}</h1>
        </div>
        <div className={styles.pill}>
          المستوى {stage.level} · المرحلة {(state.stage % 3) + 1} من ٣
        </div>
      </header>
      <section className={styles.stage}>
        <WorkshopCanvas state={state} onPointer={sendPointer} />
        <span className={styles.labelLeft}>مكان البناء</span>
        <span className={styles.labelRight}>قطعك</span>
        {(!connected ||
          state.status === "ready" ||
          state.status === "paused" ||
          state.status === "ended") && (
          <div className={styles.overlay}>
            <div className={styles.brand}>عالم البناء</div>
            <h2>
              {!connected
                ? "سنكمل مع الأخصائي"
                : state.status === "ended"
                  ? "أحسنت يا بطل!"
                  : state.status === "paused"
                    ? "وقت الاستراحة"
                    : "جاهز للبناء؟"}
            </h2>
            <p>
              {state.status === "ended"
                ? `أكملت ${state.completed.length} مبانٍ، ووضعت ${state.events.length} قطعة`
                : "اختر القطعة من اليمين، ثم حرّكها إلى مكانها على اليسار. خذ وقتك."}
            </p>
          </div>
        )}
      </section>
      <footer className={styles.footer}>
        <div className={styles.instruction} aria-live="polite">
          {state.status === "complete"
            ? "رائع! أكملت البناء"
            : state.feedback || stage.instruction}
        </div>
        <div
          className={styles.dots}
          aria-label={`وضعت ${state.placed.length} من ${stage.pieces.length} قطع`}
        >
          {stage.pieces.map((p) => (
            <span
              key={p.id}
              className={`${styles.dot} ${state.placed.includes(p.id) ? styles.done : ""}`}
            />
          ))}
        </div>
        <span className={styles.subtle}>
          {state.placed.length} / {stage.pieces.length}
        </span>
      </footer>
    </main>
  );
}

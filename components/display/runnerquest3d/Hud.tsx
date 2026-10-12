"use client";

import { useEffect, useRef, useState } from "react";
import { CHECKPOINT_AR, ENCOURAGE_AR, HINT_AR } from "@/lib/runnerquest3d/arabic";
import { DIFFICULTY_SHORT_AR, SUSPEND_AR } from "@/lib/runnerquest3d/arabic";
import type { DisplayState } from "@/lib/runnerquest3d/protocol";
import { STAGES } from "@/lib/runnerquest3d/stages";
import { planFor } from "./frame";
import styles from "./runner.module.css";

/** Western digits: Arabic-Indic zero renders as a dot, which is confusing for a star counter. */
export const ar = (n: number) => String(Math.round(n));

/** Short Arabic encouragement when a star is earned or a checkpoint is reached. Fades gently; never flashes. */
function Toast({ state }: { state: DisplayState }) {
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const prev = useRef({ stars: state.stars, cp: state.checkpointsPassed, stage: state.stageIndex, run: 0 });
  useEffect(() => {
    const p = prev.current;
    const same = p.stage === state.stageIndex;
    let text: string | null = null;
    if (same && state.checkpointsPassed > p.cp) text = CHECKPOINT_AR;
    else if (same && state.stars > p.stars) text = ENCOURAGE_AR[(state.stars + state.stageIndex) % ENCOURAGE_AR.length];
    prev.current = { stars: state.stars, cp: state.checkpointsPassed, stage: state.stageIndex, run: p.run + (text ? 1 : 0) };
    if (!text) return;
    const id = prev.current.run;
    queueMicrotask(() => setToast({ text: text!, id }));
    const t = window.setTimeout(() => setToast((cur) => (cur && cur.id === id ? null : cur)), 1700);
    return () => window.clearTimeout(t);
  }, [state.stars, state.checkpointsPassed, state.stageIndex]);
  if (!toast) return null;
  return <div key={toast.id} className={`${styles.toast} ${styles.pop}`} data-testid="toast">{toast.text}</div>;
}

function ProgressBar({ state, getDistance }: { state: DisplayState; getDistance: () => number }) {
  const plan = planFor(state);
  const fill = useRef<HTMLDivElement>(null);
  const runner = useRef<HTMLSpanElement>(null);
  const marks = useRef<(HTMLSpanElement | null)[]>([]);
  const cps = plan.encounters.filter((e) => e.kind === "checkpoint");
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const d = getDistance(), pct = Math.min(1, d / plan.length) * 100;
      if (fill.current) fill.current.style.width = `${pct}%`;
      if (runner.current) runner.current.style.insetInlineStart = `${pct}%`;
      cps.forEach((e, i) => marks.current[i]?.classList.toggle(styles.markDone, d >= e.z));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [plan, getDistance]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={styles.progress} aria-hidden>
      <div className={styles.fill} ref={fill} />
      {cps.map((e, i) => <span key={e.id} ref={(el) => { marks.current[i] = el; }} className={styles.mark} style={{ insetInlineStart: `${(e.z / plan.length) * 100}%` }} />)}
      <span className={styles.runner} ref={runner} style={{ marginLeft: 0, marginRight: "-2.4vh" }} />
    </div>
  );
}

export function Hud({ state, getDistance, silent }: { state: DisplayState; getDistance: () => number; silent: boolean }) {
  const spec = STAGES[state.stageIndex];
  const lc = state.lifecycle;
  const planned = state.plannedTo - state.plannedFrom + 1;
  return (
    <div className={styles.hud}>
      <div className={styles.top}>
        <div className={`${styles.card}`}>
          <div className={styles.stageTitle}>
            المرحلة {ar(state.stageIndex + 1)} من 9 — {spec.titleAr}
            <span className={styles.chip}>{DIFFICULTY_SHORT_AR[spec.difficulty]}</span>
          </div>
          <div className={styles.objective}>{spec.objectiveAr}</div>
        </div>
        <div className={`${styles.card} ${styles.stars}`} aria-label="النجوم">
          <span className={styles.star}>★</span>
          <span>{ar(state.stars)}</span>
        </div>
      </div>
      {lc === "playing" && <Toast state={state} />}
      {state.hint && lc === "playing" && <div className={styles.hint}>{HINT_AR[state.hint]}</div>}
      <ProgressBar state={state} getDistance={getDistance} />
      {lc === "ready" && (
        <div className={styles.overlay}>
          <div className={`${styles.big} ${styles.pop}`}>
            <div className={styles.bigTitle}>{spec.titleAr}</div>
            <div className={styles.bigText}>{spec.objectiveAr}</div>
            <div className={`${styles.bigText} ${styles.dim}`}>نحن جاهزون… سيبدأ المعالج اللعبة</div>
          </div>
        </div>
      )}
      {(lc === "paused" || lc === "suspended") && (
        <div className={styles.overlay}>
          <div className={`${styles.big} ${styles.pop}`}>
            <div className={styles.bigTitle}>توقّف قصير</div>
            <div className={styles.bigText}>{lc === "suspended" && state.suspendReason ? "نكمل بعد قليل" : "سنكمل بعد قليل"}</div>
            {lc === "suspended" && state.suspendReason && <div className={`${styles.bigText} ${styles.dim}`} hidden>{SUSPEND_AR[state.suspendReason]}</div>}
          </div>
        </div>
      )}
      {lc === "stage-complete" && (
        <div className={styles.overlay}>
          <div className={`${styles.big} ${styles.pop}`}>
            <div className={styles.bigTitle}>أحسنت! اكتملت المرحلة</div>
            <div className={styles.bigText}><span className={styles.star}>★</span> {ar(state.stars)}</div>
            <div className={`${styles.bigText} ${styles.dim}`}>المرحلة التالية عندما يكون المعالج جاهزًا</div>
          </div>
        </div>
      )}
      {(lc === "completed" || lc === "ended") && state.summary && (
        <div className={styles.overlay}>
          <div className={`${styles.big} ${styles.pop}`}>
            <div className={styles.bigTitle}>{lc === "completed" ? (planned > 1 ? "أتممتَ المغامرة!" : "أحسنت!") : "إلى اللقاء، أحسنت اليوم!"}</div>
            <div className={styles.bigText}><span className={styles.star}>★</span> {ar(state.summary.totalStars)} نجمة</div>
            <div className={styles.sumRow}>
              {state.summary.stages.map((s) => (
                <div key={s.index} className={styles.sum}>
                  <div className={styles.sumHead}>{STAGES[s.index].titleAr}</div>
                  <div>{s.status === "completed" ? `★ ${ar(s.stars)}` : "تم التجاوز"}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {silent && (
        <div className={styles.overlay}>
          <div className={`${styles.big} ${styles.pop}`}>
            <div className={styles.bigTitle}>بانتظار المعالج…</div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CHECKPOINT_AR, DIFFICULTY_SHORT_AR, ENCOURAGE_AR, floorCueAr, FLOOR_CUE_AR, SUSPEND_AR } from "@/lib/runnerquest3d/arabic";
import { generateFloorObjectives } from "@/lib/runnerquest3d/floor";
import type { DisplayState } from "@/lib/runnerquest3d/protocol";
import { STAGES } from "@/lib/runnerquest3d/stages";
import { ar } from "../Hud";
import styles from "../runner.module.css";
import floor from "./floor.module.css";

/** One short, gentle phrase when an objective is completed. Never flashes. */
function Toast({ state }: { state: DisplayState }) {
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const prev = useRef({ current: state.floor?.current ?? 0, stage: state.stageIndex, n: 0 });
  useEffect(() => {
    const cur = state.floor?.current ?? 0, p = prev.current;
    const advanced = p.stage === state.stageIndex && cur > p.current && cur < (state.floor?.total ?? 0);
    const skipped = advanced && state.floor!.outcomes[cur - 1] === "s";
    prev.current = { current: cur, stage: state.stageIndex, n: p.n + (advanced && !skipped ? 1 : 0) };
    if (!advanced || skipped) return;
    const id = prev.current.n;
    const text = cur % 5 === 0 ? CHECKPOINT_AR : ENCOURAGE_AR[(cur + state.stageIndex) % ENCOURAGE_AR.length];
    queueMicrotask(() => setToast({ text, id }));
    const t = window.setTimeout(() => setToast((c) => (c && c.id === id ? null : c)), 1600);
    return () => window.clearTimeout(t);
  }, [state.floor, state.stageIndex]);
  if (!toast) return null;
  return <div key={toast.id} className={`${styles.toast} ${styles.pop}`} style={{ top: "26vh" }} data-testid="toast">{toast.text}</div>;
}

export function FloorHud({ state }: { state: DisplayState }) {
  const spec = STAGES[state.stageIndex];
  const lc = state.lifecycle;
  const f = state.floor!;
  const contrast = f.cal.highContrast;
  const objectives = useMemo(() => generateFloorObjectives(state.stageIndex, state.seed), [state.stageIndex, state.seed]);
  const current = f.current < objectives.length ? objectives[f.current] : null;
  const planned = state.plannedTo - state.plannedFrom + 1;
  return (
    <div className={styles.hud} data-testid="rq3f-hud" data-current={f.current} data-total={f.total} data-region={f.region}>
      <div className={styles.top}>
        <div className={styles.card}>
          <div className={styles.stageTitle}>
            المرحلة {ar(state.stageIndex + 1)} من 9 — {spec.titleAr}
            <span className={styles.chip}>{DIFFICULTY_SHORT_AR[spec.difficulty]}</span>
          </div>
          <div className={styles.objective}>{ar(Math.min(f.current + 1, f.total))} من {ar(f.total)}</div>
        </div>
        <div className={`${styles.card} ${styles.stars}`} aria-label="النجوم">
          <span className={styles.star}>★</span>
          <span data-testid="rq3f-stars">{ar(state.stars)}</span>
        </div>
      </div>
      {lc === "playing" && current && <div className={`${floor.cue} ${contrast ? floor.cueContrast : ""}`} data-testid="rq3f-cue" key={`${state.stageIndex}-${f.current}-${f.cueSeq}`}>{floorCueAr(current)}</div>}
      {lc === "playing" && <Toast state={state} />}
      <div className={`${floor.dots} ${contrast ? floor.contrastDots : ""}`} aria-hidden data-testid="rq3f-dots">
        {Array.from({ length: f.total }, (_, i) => {
          const o = f.outcomes[i];
          const cls = i === f.current && f.current < f.total ? floor.dotNow : o === "c" ? floor.dotDone : o === "a" ? floor.dotAssist : o === "s" ? floor.dotSkip : o === "r" ? floor.dotRest : "";
          return <span key={i} className={`${floor.dot} ${cls}`} />;
        })}
      </div>
      {lc === "ready" && (
        <div className={styles.overlay}>
          <div className={`${styles.big} ${styles.pop}`}>
            <div className={styles.bigTitle}>{spec.titleAr}</div>
            <div className={styles.bigText}>رحلة على الأرض: اتبع المناطق المضيئة بهدوء.</div>
            <div className={`${styles.bigText} ${styles.dim}`}>نحن جاهزون… سيبدأ المعالج اللعبة</div>
          </div>
        </div>
      )}
      {(lc === "paused" || lc === "suspended") && (
        <div className={styles.overlay}>
          <div className={`${styles.big} ${styles.pop}`}>
            <div className={styles.bigTitle}>توقّف قصير</div>
            <div className={styles.bigText}>سنكمل بعد قليل</div>
            {lc === "suspended" && state.suspendReason && <div className={`${styles.bigText} ${styles.dim}`} hidden>{SUSPEND_AR[state.suspendReason]}</div>}
          </div>
        </div>
      )}
      {lc === "stage-complete" && (
        <div className={styles.overlay}>
          <div className={`${styles.big} ${styles.pop}`}>
            <div className={styles.bigTitle}>{FLOOR_CUE_AR.done}</div>
            <div className={styles.bigText}><span className={styles.star}>★</span> {ar(state.stars)}</div>
            <div className={`${styles.bigText} ${styles.dim}`}>المرحلة التالية عندما يكون المعالج جاهزًا</div>
          </div>
        </div>
      )}
      {(lc === "completed" || lc === "ended") && state.summary && (
        <div className={styles.overlay}>
          <div className={`${styles.big} ${styles.pop}`}>
            <div className={styles.bigTitle}>{lc === "completed" ? (planned > 1 ? "أتممتَ الرحلة!" : "أحسنت!") : "إلى اللقاء، أحسنت اليوم!"}</div>
            <div className={styles.bigText}><span className={styles.star}>★</span> {ar(state.summary.totalStars)} نجمة</div>
            <div className={styles.sumRow}>
              {state.summary.stages.map((s) => (
                <div key={`${s.index}-${s.status}`} className={styles.sum}>
                  <div className={styles.sumHead}>{STAGES[s.index].titleAr}</div>
                  <div>{s.status === "completed" ? `★ ${ar(s.stars)}` : "تم التجاوز"}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

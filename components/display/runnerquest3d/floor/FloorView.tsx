"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GAME_NAME_AR } from "@/lib/runnerquest3d/arabic";
import { generateFloorObjectives } from "@/lib/runnerquest3d/floor";
import type { DisplayState } from "@/lib/runnerquest3d/protocol";
import { STAGES } from "@/lib/runnerquest3d/stages";
import type { Quality } from "../scene/types";
import styles from "../runner.module.css";
import { FloorCanvas } from "./FloorCanvas";
import { FloorHud } from "./FloorHud";
import type { FloorStageInput } from "./FloorScene";

export interface FloorViewProps { state: DisplayState; silent: boolean; quality: Quality; autoQuality: boolean; diagnostics: boolean }

/**
 * Child-facing FLOOR renderer for ONE authoritative DisplayState (projection === "FLOOR"). Pure presentation: it never scores,
 * selects or writes. Rendered by RunnerQuest3DView, so the local-channel Display, the preview and the production Firebase Display share it.
 */
export function FloorView({ state, silent, quality: initialQuality, autoQuality, diagnostics }: FloorViewProps) {
  const [quality, setQuality] = useState<Quality>(initialQuality);
  const [fatal, setFatal] = useState<string | null>(null);
  const [diag, setDiag] = useState("");
  const stateRef = useRef<DisplayState>(state);
  useEffect(() => { stateRef.current = state; });
  const stage = useMemo<FloorStageInput>(() => ({ spec: STAGES[state.stageIndex], stageIndex: state.stageIndex, seed: state.seed, objectives: generateFloorObjectives(state.stageIndex, state.seed) }), [state.stageIndex, state.seed]);
  const getState = useCallback(() => stateRef.current, []);

  useEffect(() => {
    if (!diagnostics) return;
    const id = window.setInterval(() => {
      const st = window.__RQ3F?.stats();
      if (st) setDiag(`${st.fps.toFixed(0)} fps · ${st.frameMsAvg.toFixed(1)}ms (max ${st.frameMsMax.toFixed(0)}) · ${st.drawCalls} calls · ${(st.triangles / 1000).toFixed(0)}k tris · ${st.quality} · dpr ${st.pixelRatio}`);
    }, 500);
    return () => window.clearInterval(id);
  }, [diagnostics]);

  return (
    <div className={`${styles.root} ${state.reducedMotion ? styles.reduced : ""}`} dir="rtl" lang="ar" data-testid="rq3d-display" data-projection="FLOOR" data-lifecycle={state.lifecycle} data-stars={state.stars}
      data-current={state.floor?.current ?? 0} data-region={state.floor?.region ?? 0} data-stage={state.stageIndex} data-contrast={state.floor?.cal.highContrast ? "1" : "0"} data-quality={quality}
      data-range={state.floor?.cal.range} data-pad={state.floor?.cal.pad} data-grid={state.floor?.cal.grid ? "1" : "0"} data-margin={state.floor?.cal.margin} data-cue-seq={state.floor?.cueSeq ?? 0} data-skipped={(state.floor?.outcomes.match(/s/g) ?? []).length} data-assisted={(state.floor?.outcomes.match(/a/g) ?? []).length}>
      <FloorCanvas stage={stage} quality={quality} autoQuality={autoQuality} getState={getState}
        onStatus={(st, detail) => { if (st === "error") setFatal(detail ?? "WebGL"); if (st === "context-lost") setFatal("context-lost"); }} onQuality={setQuality} />
      <FloorHud state={state} />
      {silent && (
        <div className={styles.overlay}>
          <div className={`${styles.big} ${styles.pop}`}><div className={styles.bigTitle}>بانتظار المعالج…</div><div className={`${styles.bigText} ${styles.dim}`}>{GAME_NAME_AR}</div></div>
        </div>
      )}
      {fatal && <div className={styles.err}><div>تعذّر عرض المشهد ثلاثي الأبعاد.<br />يرجى إعادة تحميل الصفحة أو استخدام متصفح حديث.</div></div>}
      {diagnostics && <div className={styles.dev}>{diag}</div>}
    </div>
  );
}
